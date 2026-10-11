/**
 * E-Signature Event Handler
 *
 * Processes webhook events from e-signature providers and updates
 * local database records accordingly.
 */

import { PrismaClient } from '../../prisma/generated-client/client';
import { logger } from '../../utils/logger';
import {
  ESignatureEvent,
  ESignatureEventType,
  ESignatureProviderCode,
  ESignatureDocumentStatus,
  ESignatureRecipientStatus,
} from './types';
import {
  resolveESignatureConfig,
  createESignatureProvider,
  ESignatureError,
} from './providers';

export type EventCallback = (event: ESignatureEvent, tenantId: string) => Promise<void>;

export class ESignatureEventHandler {
  private prisma: PrismaClient;
  private callbacks: Map<ESignatureEventType, EventCallback[]> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  on(eventType: ESignatureEventType, callback: EventCallback): void {
    const existing = this.callbacks.get(eventType) || [];
    existing.push(callback);
    this.callbacks.set(eventType, existing);
  }

  async handleWebhook(
    providerCode: string,
    tenantId: string,
    payload: unknown,
    headers: Record<string, string>,
    rawBody?: string
  ): Promise<ESignatureEvent | null> {
    const event = await this.verifyAndNormalize(providerCode, tenantId, payload, headers, rawBody);
    if (!event) return null;

    await this.processNormalizedEvent(event, tenantId);

    return event;
  }

  /**
   * Fase barata del webhook (sin efectos): valida provider/config, verifica la
   * firma (throw 401 si es inválida) y normaliza el payload. Separada de
   * `processNormalizedEvent` para que el modo inbox (ESIGNATURE_WEBHOOK_INBOX)
   * pueda verificar en el receiver y procesar async en el worker.
   */
  async verifyAndNormalize(
    providerCode: string,
    tenantId: string,
    payload: unknown,
    headers: Record<string, string>,
    // Body crudo del request: verificar la firma HMAC sobre los bytes recibidos
    // (no sobre un re-stringify del JSON parseado, que depende de detalles de
    // serialización). Opcional por retrocompatibilidad.
    rawBody?: string
  ): Promise<ESignatureEvent | null> {
    const logContext = { providerCode, tenantId };

    logger.debug(logContext, 'Processing e-signature webhook');

    if (!Object.values(ESignatureProviderCode).includes(providerCode as ESignatureProviderCode)) {
      logger.warn({ ...logContext }, 'Unknown provider code in webhook');
      return null;
    }

    const config = await resolveESignatureConfig(this.prisma);
    if (!config) {
      logger.warn({ ...logContext }, 'No e-signature config configured');
      return null;
    }

    // Fail-closed: secret configurado pero indescifrable → rechazar SIEMPRE
    // (continuar sin secret sería deshabilitar la verificación en silencio).
    if (config.webhookSecretInvalid) {
      logger.error({ ...logContext }, 'Webhook secret configured but undecryptable — rejecting (fail-closed)');
      throw new ESignatureError('Webhook secret unavailable', providerCode, 401);
    }

    const provider = createESignatureProvider(config);

    if (!provider.verifyWebhook(payload, headers, config.webhookSecret, rawBody)) {
      logger.warn({ ...logContext }, 'Webhook signature verification failed');
      throw new ESignatureError('Invalid webhook signature', providerCode, 401);
    }

    const event = provider.normalizeWebhook(payload, headers);
    if (!event) {
      logger.debug({ ...logContext }, 'Webhook payload could not be normalized (might be unsupported event type)');
      return null;
    }

    logger.info(
      {
        ...logContext,
        eventType: event.type,
        documentId: event.documentId,
        recipientEmail: event.recipientEmail,
      },
      'E-signature event received'
    );

    return event;
  }

  /**
   * Fase de efectos: actualiza estados locales y ejecuta callbacks. Por default
   * los errores se loguean y se tragan (comportamiento histórico del path
   * inline). Con `rethrowErrors` los errores se propagan — lo usa el processor
   * del inbox para que el retry/DLQ del worker actúe.
   */
  async processNormalizedEvent(
    event: ESignatureEvent,
    tenantId: string,
    options?: { rethrowErrors?: boolean }
  ): Promise<void> {
    const rethrow = options?.rethrowErrors === true;
    await this.processEvent(event, tenantId, rethrow);
    await this.executeCallbacks(event, tenantId, rethrow);
  }

  private async processEvent(event: ESignatureEvent, tenantId: string, rethrow = false): Promise<void> {
    try {
      switch (event.type) {
        case ESignatureEventType.DOCUMENT_SENT:
          await this.handleDocumentSent(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_DELIVERED:
          await this.handleDocumentDelivered(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_COMPLETED:
          await this.handleDocumentCompleted(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_DECLINED:
          await this.handleDocumentDeclined(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_VOIDED:
          await this.handleDocumentVoided(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_EXPIRED:
          await this.handleDocumentExpired(event, tenantId);
          break;
        case ESignatureEventType.RECIPIENT_SIGNED:
          await this.handleRecipientSigned(event, tenantId);
          break;
        case ESignatureEventType.RECIPIENT_VIEWED:
          await this.handleRecipientViewed(event, tenantId);
          break;
        case ESignatureEventType.RECIPIENT_DECLINED:
          await this.handleRecipientDeclined(event, tenantId);
          break;
        case ESignatureEventType.RECIPIENT_AUTH_FAILED:
          await this.handleRecipientAuthFailed(event, tenantId);
          break;
        case ESignatureEventType.RECIPIENT_BOUNCED:
          await this.handleRecipientBounced(event, tenantId);
          break;
        case ESignatureEventType.DOCUMENT_BLOCKCHAIN_CONFIRMED:
          // No status change — document is already COMPLETED.
          // Callbacks handle the blockchain cert download + merge.
          logger.info(
            { documentId: event.documentId },
            'Blockchain confirmation received'
          );
          break;
        default:
          logger.debug({ eventType: event.type }, 'Unhandled event type');
      }
    } catch (error) {
      logger.error(
        { error, eventType: event.type, documentId: event.documentId },
        'Failed to process e-signature event'
      );
      if (rethrow) throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleDocumentSent(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.SENT, { sentAt: event.timestamp });
  }

  private async handleDocumentDelivered(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.DELIVERED);
  }

  private async handleDocumentCompleted(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.COMPLETED, { completedAt: event.timestamp });
  }

  private async handleDocumentDeclined(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.DECLINED);
  }

  private async handleDocumentVoided(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.VOIDED);
  }

  private async handleDocumentExpired(event: ESignatureEvent, tenantId: string): Promise<void> {
    await this.updateDocumentStatus(event.documentId, tenantId, ESignatureDocumentStatus.EXPIRED);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  private async handleRecipientSigned(event: ESignatureEvent, tenantId: string): Promise<void> {
    if (!event.recipientEmail) return;
    await this.updateRecipientStatus(event.documentId, event.recipientEmail, tenantId, ESignatureRecipientStatus.SIGNED, { signedAt: event.timestamp });
  }

  private async handleRecipientViewed(event: ESignatureEvent, tenantId: string): Promise<void> {
    if (!event.recipientEmail) return;
    await this.updateRecipientStatus(event.documentId, event.recipientEmail, tenantId, ESignatureRecipientStatus.DELIVERED);
  }

  private async handleRecipientDeclined(event: ESignatureEvent, tenantId: string): Promise<void> {
    if (!event.recipientEmail) return;
    await this.updateRecipientStatus(event.documentId, event.recipientEmail, tenantId, ESignatureRecipientStatus.DECLINED);
  }

  private async handleRecipientAuthFailed(event: ESignatureEvent, tenantId: string): Promise<void> {
    if (!event.recipientEmail) return;
    await this.updateRecipientStatus(event.documentId, event.recipientEmail, tenantId, ESignatureRecipientStatus.AUTH_FAILED);
  }

  private async handleRecipientBounced(event: ESignatureEvent, tenantId: string): Promise<void> {
    if (!event.recipientEmail) return;
    await this.updateRecipientStatus(event.documentId, event.recipientEmail, tenantId, 'bounced' as any);
    logger.info({ email: event.recipientEmail, documentId: event.documentId }, 'Recipient email bounced');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Database Operations
  // ─────────────────────────────────────────────────────────────────────────────

  private async updateDocumentStatus(
    externalId: string,
    tenantId: string,
    status: ESignatureDocumentStatus,
    additionalData?: { sentAt?: Date; completedAt?: Date }
  ): Promise<void> {
    // Estados terminales de FALLA liberan la clave de idempotencia: la entidad
    // de origen puede volver a enviarse a firma. 'completed' la retiene (un
    // documento firmado bloquea reenvíos, igual que antes).
    const releasesKey = ['voided', 'declined', 'expired', 'error'].includes(
      String(status)
    );
    const result = await this.prisma.esignatureDocument.updateMany({
      where: {
        externalId,
        tenant_id_: tenantId,
      },
      data: {
        status: status as any,
        ...(releasesKey ? { activeSourceKey: null } : {}),
        ...additionalData,
      },
    });

    if (result.count === 0) {
      logger.debug(
        { externalId, tenantId },
        'No local document found to update (might not be tracked locally)'
      );
    }
  }

  // El enum de servicio usa snake_case ('auth_failed'); el enum Prisma del DSL
  // usa camelCase ('authFailed'). Sin este mapeo, un RECIPIENT_AUTH_FAILED
  // rompería el update con un valor de enum inválido.
  private static readonly RECIPIENT_STATUS_TO_PRISMA: Partial<Record<string, string>> = {
    auth_failed: 'authFailed',
  };

  private async updateRecipientStatus(
    documentExternalId: string,
    email: string,
    tenantId: string,
    status: ESignatureRecipientStatus,
    additionalData?: { signedAt?: Date }
  ): Promise<void> {
    const document = await this.prisma.esignatureDocument.findFirst({
      where: {
        externalId: documentExternalId,
        tenant_id_: tenantId,
      },
      select: { id: true },
    });

    if (!document) {
      logger.debug(
        { documentExternalId, tenantId },
        'No local document found for recipient update'
      );
      return;
    }

    await this.prisma.esignatureRecipient.updateMany({
      where: {
        document_id: document.id,
        email: email.toLowerCase(),
        tenant_id_: tenantId,
      },
      data: {
        status: (ESignatureEventHandler.RECIPIENT_STATUS_TO_PRISMA[status] ?? status) as any,
        ...additionalData,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Callback Execution
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeCallbacks(event: ESignatureEvent, tenantId: string, rethrow = false): Promise<void> {
    const callbacks = this.callbacks.get(event.type) || [];

    for (const callback of callbacks) {
      try {
        await callback(event, tenantId);
      } catch (error) {
        logger.error(
          { error, eventType: event.type },
          'E-signature event callback failed'
        );
        if (rethrow) throw error;
      }
    }
  }
}

// Singleton instance
let eventHandlerInstance: ESignatureEventHandler | null = null;

export function getESignatureEventHandler(prisma: PrismaClient): ESignatureEventHandler {
  if (!eventHandlerInstance) {
    eventHandlerInstance = new ESignatureEventHandler(prisma);
  }
  return eventHandlerInstance;
}
