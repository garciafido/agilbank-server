/**
 * AgilSign E-Signature Provider v2
 *
 * Implements IESignatureProvider for the AgilSign v2 API (standalone PKI platform).
 *
 * AgilSign v2 is a self-hosted Next.js app with:
 * - PAdES B-LT digital signatures with PKI
 * - HMAC-signed webhooks
 * - Direct PDF upload (no templates)
 * - PGMQ-backed durable webhook delivery
 *
 * Required credentials:
 * - apiKey: API key for AgilSign API (Authorization: Bearer)
 * - baseUrl: AgilSign instance URL (e.g. http://agilsign-app:3100)
 */

import { createHmac, createHash } from 'crypto';
import { PrismaClient } from '../../../prisma/generated-client/client';
import {
  IESignatureProvider,
  DownloadDocumentResult,
  ESignatureError,
  ESignatureAuthenticationError,
  ESignatureDocumentNotFoundError,
  ESignatureRateLimitError,
  ESignatureInvalidOperationError,
  ESignatureConfigurationError,
} from './types';
import {
  ESignatureDocument,
  ESignatureRecipient,
  ESignatureEvent,
  ESignatureConfigResolved,
  ESignatureProviderCode,
  ESignatureDocumentStatus,
  ESignatureRecipientStatus,
  ESignatureRecipientRole,
  ESignatureEventType,
  CreateDocumentOptions,
  GetSigningLinkOptions,
  SigningLinkResult,
  AgilSignCredentials,
} from '../types';
import { logger } from '../../../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// AgilSign v2 API response types
// ─────────────────────────────────────────────────────────────────────────────

interface AgilSignSigner {
  id: string;
  documentId: string;
  name: string;
  email: string;
  slug: string;
  order: number;
  status: string; // pending | invited | viewed | signed | declined
  emailVerified: boolean;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fields?: AgilSignField[];
  signatures?: unknown[];
}

interface AgilSignField {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fieldType: string;
  label: string | null;
  required: boolean;
}

interface AgilSignDocument {
  id: string;
  status: string; // draft | sent | completed | cancelled | expired
  title: string;
  originalPdfPath: string;
  signedPdfPath: string | null;
  auditTrailPdfPath: string | null;
  // AgilSign expone estos booleanos en vez de las rutas internas; se leen con
  // preferencia y las rutas quedan como fallback para respuestas viejas.
  signedPdfAvailable?: boolean;
  auditTrailAvailable?: boolean;
  externalRef: string | null;
  metadata: Record<string, unknown> | null;
  signingWorkflow: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  signers: AgilSignSigner[];
}

interface AgilSignWebhookPayload {
  documentId: string;
  /** Id lógico del evento (estable a través de reintentos/re-drives de agilsign). */
  eventId?: string;
  title?: string;
  signerId?: string;
  signerName?: string;
  signerEmail?: string;
  reason?: string;
  signerCount?: number;
  signedAt?: string | null;
  signers?: Array<{ name: string; email: string; signedAt: string | null }>;
}

export class AgilSignProvider implements IESignatureProvider {
  readonly providerCode = ESignatureProviderCode.AGILSIGN;

  private credentials: AgilSignCredentials;
  private baseUrl: string;
  private webhookSecret?: string;
  private webhookCallbackUrl?: string;

  constructor(config: ESignatureConfigResolved) {
    this.credentials = config.credentials as unknown as AgilSignCredentials;
    this.baseUrl = (this.credentials.baseUrl || '').replace(/\/$/, '');
    this.webhookSecret = config.webhookSecret;
    this.webhookCallbackUrl = this.credentials.webhookCallbackUrl;

    if (!this.credentials.apiKey) {
      throw new ESignatureConfigurationError('agilsign', 'apiKey is required');
    }
    if (!this.baseUrl) {
      throw new ESignatureConfigurationError('agilsign', 'baseUrl is required');
    }
  }

  isConfigured(): boolean {
    return !!(this.credentials.apiKey && this.baseUrl);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Re-register the webhook with AgilSign whenever a webhookCallbackUrl is
   * configured — even if a webhookSecret already exists — to keep the subscribed
   * event types in sync. No-op (returns the current secret) when no callbackUrl.
   */
  async init(_context: { prisma: PrismaClient }): Promise<{ webhookSecret?: string }> {
    // Always re-register to keep subscribed event types in sync
    if (!this.webhookCallbackUrl) {
      return { webhookSecret: this.webhookSecret };
    }

    try {
      // Validate connection first
      const healthRes = await fetch(`${this.baseUrl}/api/health`, {
        headers: { Authorization: `Bearer ${this.credentials.apiKey}` },
      });
      if (!healthRes.ok) {
        logger.warn({ status: healthRes.status }, 'AgilSign health check failed, skipping webhook registration');
        return {};
      }

      const secret = await this.registerWebhook(this.webhookCallbackUrl);
      if (secret) {
        this.webhookSecret = secret;
        return { webhookSecret: secret };
      }
    } catch (err) {
      // Non-fatal: log warning and continue without webhook
      logger.warn(
        { error: (err as Error).message, callbackUrl: this.webhookCallbackUrl },
        'Failed to auto-register AgilSign webhook, continuing without it'
      );
    }
    return {};
  }

  /**
   * Register webhook with AgilSign's PATCH /api/client/webhook endpoint.
   * AgilSign will challenge-verify the URL before accepting it.
   */
  private async registerWebhook(callbackUrl: string): Promise<string | undefined> {
    const events = [
      'signer.signed',
      'signer.viewed',
      'signer.declined',
      'signer.invitation_failed',
      'document.sent',
      'document.completed',
      'document.cancelled',
      'document.expired',
      'document.blockchain_confirmed',
    ];

    const res = await fetch(`${this.baseUrl}/api/client/webhook`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.credentials.apiKey}`,
      },
      body: JSON.stringify({ url: callbackUrl, events }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, body: text },
        'AgilSign webhook registration failed'
      );
      return undefined;
    }

    const data = await res.json() as { webhookSecret?: string };
    logger.info(
      { callbackUrl },
      'AgilSign webhook registered successfully'
    );
    return data.webhookSecret;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async createDocument(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    return this.createAgilSignDocument(options, false);
  }

  async sendDocument(documentId: string): Promise<ESignatureDocument> {
    // AgilSign doesn't have a separate "send" — resend invitations to all pending signers
    const document = await this.fetchDocument(documentId);

    for (const signer of document.signers) {
      if (signer.status !== 'signed') {
        try {
          await this.apiRequest(
            `/api/documents/${documentId}/signers/${signer.id}/resend`,
            { method: 'PUT' }
          );
        } catch (error) {
          logger.warn(
            { signerId: signer.id, error },
            'Failed to resend to signer'
          );
        }
      }
    }

    const updated = await this.fetchDocument(documentId);
    return this.mapDocumentToESignature(updated);
  }

  async createAndSend(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    return this.createAgilSignDocument(options, true);
  }

  async getDocument(documentId: string): Promise<ESignatureDocument> {
    const document = await this.fetchDocument(documentId);
    return this.mapDocumentToESignature(document);
  }

  async downloadDocument(documentId: string): Promise<DownloadDocumentResult> {
    const response = await this.apiRequest<ArrayBuffer>(
      `/api/documents/${documentId}/download?type=bundle`,
      { responseType: 'arraybuffer' }
    );

    return {
      buffer: Buffer.from(response),
      includesAuditTrail: true,
    };
  }

  /**
   * Busca un documento por externalRef (la clave de idempotencia del
   * integrador). Usado por la reconciliación: resolver el destino de un
   * send-intent local cuyo POST pudo o no haber llegado al proveedor.
   */
  async findDocumentByExternalRef(externalRef: string): Promise<ESignatureDocument | null> {
    const result = await this.apiRequest<{ documents: AgilSignDocument[] }>(
      `/api/documents?externalRef=${encodeURIComponent(externalRef)}&limit=1`
    );
    const doc = result?.documents?.[0];
    if (!doc) return null;
    return this.getDocument(doc.id);
  }

  async cancelDocument(documentId: string, _reason?: string): Promise<void> {
    try {
      await this.apiRequest(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      // Cancel idempotente/terminal-tolerante: un documento ya completado no
      // puede cancelarse (409 already_completed; 400 en versiones previas) —
      // para el caller es un estado final, no un fallo. El re-cancel de un
      // documento ya cancelado devuelve 200 y no llega acá.
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already_completed') || msg.includes('Cannot cancel a completed')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Create and send directly from a PDF with positioned signature fields.
   */
  async createAndSendFromPdf(
    pdfContent: Buffer | string,
    options: CreateDocumentOptions
  ): Promise<ESignatureDocument> {
    return this.createAgilSignDocument(options, true, pdfContent);
  }

  async downloadAuditLog(documentId: string): Promise<Buffer | null> {
    try {
      const response = await this.apiRequest<ArrayBuffer>(
        `/api/documents/${documentId}/download?type=audit`,
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(response);
    } catch (error) {
      if (error instanceof ESignatureDocumentNotFoundError) {
        logger.debug({ documentId }, 'Audit log not available yet');
        return null;
      }
      throw error;
    }
  }

  async downloadBlockchainCert(documentId: string): Promise<Buffer | null> {
    try {
      const response = await this.apiRequest<ArrayBuffer>(
        `/api/documents/${documentId}/download?type=blockchain`,
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(response);
    } catch (error) {
      if (error instanceof ESignatureDocumentNotFoundError) {
        logger.debug({ documentId }, 'Blockchain certificate not available yet');
        return null;
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async getSigningLink(options: GetSigningLinkOptions): Promise<SigningLinkResult> {
    const document = await this.fetchDocument(options.documentId);

    const signer = document.signers.find(
      (s) => s.email.toLowerCase() === options.recipientEmail.toLowerCase()
    );

    if (!signer) {
      throw new ESignatureError(
        `Recipient ${options.recipientEmail} not found in document`,
        'agilsign',
        404
      );
    }

    const result = await this.apiRequest<{ signingUrl: string }>(
      `/api/documents/${options.documentId}/signers/${signer.id}/signing-link`
    );

    return { url: result.signingUrl };
  }

  async resendToRecipient(documentId: string, recipientEmail: string): Promise<void> {
    const document = await this.fetchDocument(documentId);

    const signer = document.signers.find(
      (s) => s.email.toLowerCase() === recipientEmail.toLowerCase()
    );

    if (!signer) {
      throw new ESignatureError(
        `Recipient ${recipientEmail} not found in document`,
        'agilsign',
        404
      );
    }

    await this.apiRequest(
      `/api/documents/${documentId}/signers/${signer.id}/resend`,
      { method: 'PUT' }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Webhook Operations
  // ─────────────────────────────────────────────────────────────────────────────

  normalizeWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): ESignatureEvent | null {
    try {
      const webhook = payload as AgilSignWebhookPayload;
      const eventType = headers['x-agilsign-event'];

      if (!eventType || !webhook.documentId) {
        return null;
      }

      const mappedType = this.mapAgilSignEvent(eventType);
      if (!mappedType) {
        logger.debug({ eventType }, 'Unmapped AgilSign webhook event');
        return null;
      }

      // Dedupe key: eventId del provider si viene (agilsign lo embebe en el
      // payload); fallback hash de (eventType + body) — estable porque
      // reintentos y re-drives entregan el payload idéntico. El eventType (que
      // viaja en el header, no en el body) evita colisionar eventos DISTINTOS
      // con payload idéntico (ej. signer.viewed vs signer.declined sin reason).
      const externalEventId =
        typeof webhook.eventId === 'string' && webhook.eventId
          ? webhook.eventId
          : createHash('sha256')
              .update(`${eventType}:${JSON.stringify(payload)}`)
              .digest('hex');

      return {
        type: mappedType,
        documentId: webhook.documentId,
        provider: ESignatureProviderCode.AGILSIGN,
        recipientEmail: webhook.signerEmail,
        timestamp: new Date(),
        externalEventId,
        rawPayload: payload,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to normalize AgilSign webhook');
      return null;
    }
  }

  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
    secret?: string,
    rawBody?: string
  ): boolean {
    // Sin secreto NO se puede verificar la firma, así que NO se confía. El
    // endpoint del webhook es público; la firma HMAC es su única defensa, y
    // devolver true acá la desactivaba: cualquiera podía POSTear un evento
    // —anular un documento, marcar una firma— sin credencial alguna.
    //
    // Fail-closed a propósito: si el secreto no está configurado (p.ej. el
    // registro contra el proveedor falló), se rechazan los webhooks en vez de
    // aceptarlos a ciegas. La contraparte del emisor tampoco envía sin secreto,
    // así que la asimetría anterior —él no manda, pero nosotros aceptábamos—
    // era el agujero.
    if (!secret) return false;

    const signatureHeader = headers['x-agilsign-signature'];
    if (!signatureHeader) return false;

    // Format: t={timestamp},v1={signature}
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const [key, value] = part.split('=', 2);
      if (key && value) parts[key] = value;
    }

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // Replay protection: reject if timestamp is older than 5 minutes
    const timestampSec = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampSec) > 300) return false;

    // Firma sobre los bytes recibidos cuando están disponibles: el fallback
    // re-stringify solo es correcto mientras el emisor use JSON.stringify y el
    // parseo preserve el orden de keys — el rawBody elimina esa fragilidad.
    const body = rawBody ?? JSON.stringify(payload);
    const message = `${timestamp}.${body}`;
    const expected = createHmac('sha256', secret).update(message).digest('hex');

    // Constant-time comparison
    if (signature.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return mismatch === 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private: Core workflow
  // ─────────────────────────────────────────────────────────────────────────────

  private async createAgilSignDocument(
    options: CreateDocumentOptions,
    send: boolean,
    pdfOverride?: Buffer | string
  ): Promise<ESignatureDocument> {
    // Resolve PDF content: explicit override > files array
    let pdfBase64: string;
    if (pdfOverride) {
      pdfBase64 = pdfOverride instanceof Buffer
        ? pdfOverride.toString('base64')
        : pdfOverride;
    } else if (options.files.length > 0) {
      const file = options.files[0];
      pdfBase64 = file.content instanceof Buffer
        ? file.content.toString('base64')
        : file.content;
    } else {
      throw new ESignatureInvalidOperationError(
        'agilsign',
        'createDocument',
        'No PDF content provided — pass files or use createAndSendFromPdf'
      );
    }

    // Build signers with fields from providerOptions
    const rawFields = options.providerOptions?.fields as
      | Array<{ page: number; x: number; y: number; w: number; h: number; signerIndex: number; fieldType?: string }>
      | undefined;

    if (!rawFields?.length) {
      logger.warn('No signature field positions provided — using default fallback. Regenerate documents with e-signature enabled.');
    }

    const signers = options.recipients
      .filter((r) => r.role === ESignatureRecipientRole.SIGNER)
      .map((r, index) => {
        const signerFields = rawFields
          ?.filter((f) => f.signerIndex === index)
          .map((f) => ({
            page: f.page,
            x: f.x,
            y: 1 - f.y - f.h, // Convert top-down (htmlToPdf) → bottom-up (AgilSign)
            w: f.w,
            h: f.h,
            ...(f.fieldType ? { fieldType: f.fieldType } : {}),
          })) || [];

        // Fallback: bottom of page 0 (AgilSign uses bottom-left origin, y=0.09 ≈ near bottom)
        if (signerFields.length === 0) {
          signerFields.push({
            page: 0,
            x: 0.1,
            y: 0.09,
            w: 0.3,
            h: 0.06,
          });
        }

        return {
          name: r.name,
          email: r.email,
          order: r.order ?? index,
          fields: signerFields,
        };
      });

    // Con attachments el envío es en dos fases: create(send=false) →
    // attach×N → POST /send. Los attachments solo se aceptan en draft.
    const attachments = options.attachments ?? [];
    const payload: Record<string, unknown> = {
      title: options.name,
      pdf: pdfBase64,
      signers,
      send: attachments.length > 0 ? false : send,
    };

    if (options.expiresAt) {
      payload.expiresAt = options.expiresAt.toISOString();
    }
    if (options.providerOptions?.externalRef) {
      payload.externalRef = options.providerOptions.externalRef as string;
    }
    // Forward custom invitation email (subject/text/html). AgilSign replaces
    // {{signerName}}, {{signingUrl}}, {{documentTitle}} per signer at send time.
    if (options.emailSubject) {
      payload.emailSubject = options.emailSubject;
    }
    if (options.emailMessage) {
      payload.emailMessage = options.emailMessage;
    }
    if (options.emailMessageHtml) {
      payload.emailMessageHtml = options.emailMessageHtml;
    }
    if (options.emailFromName) {
      payload.emailFromName = options.emailFromName;
    }
    if (options.providerOptions?.metadata) {
      payload.metadata = options.providerOptions.metadata;
    }
    if (options.providerOptions?.signingWorkflow) {
      payload.signingWorkflow = options.providerOptions.signingWorkflow as string;
    }

    const document = await this.apiRequest<AgilSignDocument>(
      '/api/documents',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    if (attachments.length > 0) {
      // Retry idempotente: el replay del create (por externalRef) puede
      // devolver un documento ya 'sent' — corrida anterior completa, nada que
      // hacer. Solo en 'draft' se (re)suben attachments (upload idempotente
      // por sha256 en AgilSign) y se dispara el send.
      if (document.status === 'draft') {
        for (const attachment of attachments) {
          await this.uploadAttachment(document.id, attachment);
        }
        if (send) {
          await this.apiRequest(`/api/documents/${document.id}/send`, { method: 'POST' });
          document.status = 'sent';
        }
      }
    }

    return this.mapDocumentToESignature(document);
  }

  /**
   * Sube un attachment como binario. Los metadatos viajan en headers
   * percent-encoded (los headers HTTP solo aceptan ISO-8859-1 y los títulos
   * de obras traen UTF-8). AgilSign re-verifica el sha256 sobre los bytes
   * recibidos y rechaza con 422 si no coincide.
   */
  private async uploadAttachment(
    documentId: string,
    attachment: NonNullable<CreateDocumentOptions['attachments']>[number]
  ): Promise<void> {
    const fs = await import('fs');
    const bytes = await fs.promises.readFile(attachment.localPath);

    const headers: Record<string, string> = {
      'Content-Type': attachment.mimeType,
      'X-Filename': encodeURIComponent(attachment.filename),
      'X-Sha256': attachment.sha256,
    };
    if (attachment.label) {
      headers['X-Label'] = encodeURIComponent(attachment.label);
    }
    if (attachment.meta) {
      headers['X-Meta'] = encodeURIComponent(JSON.stringify(attachment.meta));
    }

    await this.apiRequest(`/api/documents/${documentId}/attachments`, {
      method: 'POST',
      headers,
      body: new Uint8Array(bytes),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private: API helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async fetchDocument(documentId: string): Promise<AgilSignDocument> {
    return this.apiRequest<AgilSignDocument>(
      `/api/documents/${documentId}`
    );
  }

  private async apiRequest<T = unknown>(
    path: string,
    init?: RequestInit & { responseType?: 'arraybuffer' }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const { responseType, ...fetchInit } = init || {};

    const response = await fetch(url, {
      ...fetchInit,
      headers: {
        'Authorization': `Bearer ${this.credentials.apiKey}`,
        'Content-Type': 'application/json',
        ...(fetchInit?.headers || {}),
      },
    });

    if (!response.ok) {
      await this.handleApiError(response, path);
    }

    if (responseType === 'arraybuffer') {
      return (await response.arrayBuffer()) as T;
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async handleApiError(response: Response, operation: string): Promise<never> {
    const status = response.status;
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = 'Unknown error';
    }

    logger.error(
      { status, operation, error: errorBody },
      'AgilSign API error'
    );

    if (status === 401 || status === 403) {
      throw new ESignatureAuthenticationError('agilsign');
    }

    if (status === 404) {
      throw new ESignatureDocumentNotFoundError('agilsign', operation);
    }

    if (status === 429) {
      throw new ESignatureRateLimitError('agilsign');
    }

    if (status === 422 || status === 400) {
      throw new ESignatureInvalidOperationError(
        'agilsign',
        operation,
        errorBody
      );
    }

    throw new ESignatureError(
      `AgilSign API error: ${errorBody}`,
      'agilsign',
      status,
      status >= 500
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private: Mapping helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private mapDocumentToESignature(document: AgilSignDocument): ESignatureDocument {
    const recipients: ESignatureRecipient[] = (document.signers || []).map(
      (s) => ({
        email: s.email,
        name: s.name,
        role: ESignatureRecipientRole.SIGNER,
        order: s.order,
        status: this.mapSignerStatus(s.status),
        signedAt: s.signedAt ? new Date(s.signedAt) : undefined,
        externalId: s.id,
      })
    );

    return {
      externalId: document.id,
      provider: ESignatureProviderCode.AGILSIGN,
      name: document.title,
      status: this.mapDocumentStatus(document.status),
      sentAt: document.createdAt ? new Date(document.createdAt) : undefined,
      completedAt: document.status === 'completed' && document.updatedAt
        ? new Date(document.updatedAt)
        : undefined,
      recipients,
      metadata: {
        externalRef: document.externalRef,
        signingWorkflow: document.signingWorkflow,
        signedPdfAvailable: document.signedPdfAvailable ?? !!document.signedPdfPath,
        auditTrailAvailable: document.auditTrailAvailable ?? !!document.auditTrailPdfPath,
      },
    };
  }

  private mapDocumentStatus(status: string): ESignatureDocumentStatus {
    const statusMap: Record<string, ESignatureDocumentStatus> = {
      draft: ESignatureDocumentStatus.DRAFT,
      sent: ESignatureDocumentStatus.SENT,
      completed: ESignatureDocumentStatus.COMPLETED,
      cancelled: ESignatureDocumentStatus.VOIDED,
      expired: ESignatureDocumentStatus.EXPIRED,
    };
    return statusMap[status?.toLowerCase()] || ESignatureDocumentStatus.SENT;
  }

  private mapSignerStatus(status: string): ESignatureRecipientStatus {
    const statusMap: Record<string, ESignatureRecipientStatus> = {
      pending: ESignatureRecipientStatus.PENDING,
      invited: ESignatureRecipientStatus.SENT,
      viewed: ESignatureRecipientStatus.DELIVERED,
      signed: ESignatureRecipientStatus.SIGNED,
      declined: ESignatureRecipientStatus.DECLINED,
    };
    return statusMap[status?.toLowerCase()] || ESignatureRecipientStatus.PENDING;
  }

  private mapAgilSignEvent(eventType: string): ESignatureEventType | null {
    const eventMap: Record<string, ESignatureEventType> = {
      'signer.signed': ESignatureEventType.RECIPIENT_SIGNED,
      'signer.declined': ESignatureEventType.RECIPIENT_DECLINED,
      'signer.viewed': ESignatureEventType.RECIPIENT_VIEWED,
      'signer.invitation_failed': ESignatureEventType.RECIPIENT_BOUNCED,
      'document.sent': ESignatureEventType.DOCUMENT_SENT,
      'document.completed': ESignatureEventType.DOCUMENT_COMPLETED,
      'document.cancelled': ESignatureEventType.DOCUMENT_VOIDED,
      'document.expired': ESignatureEventType.DOCUMENT_EXPIRED,
      'document.blockchain_confirmed': ESignatureEventType.DOCUMENT_BLOCKCHAIN_CONFIRMED,
    };
    return eventMap[eventType] || null;
  }
}
