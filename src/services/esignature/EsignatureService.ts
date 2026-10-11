/**
 * E-Signature Service
 *
 * Main facade for e-signature operations. Automatically resolves tenant
 * configuration and creates the appropriate provider.
 */

import crypto from 'crypto';
import { PrismaClient } from '../../prisma/generated-client/client';
import { logger } from '../../utils/logger';
import {
  ESignatureDocument,
  ESignatureProviderCode,
  CreateDocumentOptions,
  GetSigningLinkOptions,
  SigningLinkResult,
} from './types';
import {
  IESignatureProvider,
  DownloadDocumentResult,
  ESignatureError,
  ESignatureConfigurationError,
  resolveESignatureConfig,
  createESignatureProvider,
  clearProviderCache,
} from './providers';
import { CredentialsEncryptionService } from '../encryption/CredentialsEncryptionService';

export class ESignatureService {
  private prisma: PrismaClient;
  private tenantId: string;
  private provider: IESignatureProvider | null = null;
  private initialized = false;

  constructor(prisma: PrismaClient, tenantId: string) {
    this.prisma = prisma;
    this.tenantId = tenantId;
  }

  /**
   * Initialize the service by loading tenant configuration.
   * Called automatically on first operation, but can be called explicitly.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = await resolveESignatureConfig(this.prisma);
    if (!config) {
      throw new ESignatureConfigurationError(
        'unknown',
        'No e-signature provider configured'
      );
    }

    this.provider = createESignatureProvider(config);

    // Auto-register webhook if provider supports it
    if (this.provider.init) {
      try {
        const result = await this.provider.init({ prisma: this.prisma });
        if (result.webhookSecret && result.webhookSecret !== config.webhookSecret) {
          await ESignatureService.persistWebhookSecret(
            this.prisma,
            config.providerCode,
            result.webhookSecret
          );
        }
      } catch (err) {
        logger.warn(
          { error: (err as Error).message, tenantId: this.tenantId },
          'Provider init failed, continuing without webhook auto-registration'
        );
      }
    }

    this.initialized = true;

    logger.debug(
      { tenantId: this.tenantId, provider: config.providerCode },
      'E-signature service initialized'
    );
  }

  async getProviderCode(): Promise<ESignatureProviderCode> {
    await this.ensureInitialized();
    return this.provider!.providerCode as ESignatureProviderCode;
  }

  async isConfigured(): Promise<boolean> {
    try {
      await this.initialize();
      return this.provider?.isConfigured() ?? false;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async createDocument(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    await this.ensureInitialized();

    logger.info(
      {
        tenantId: this.tenantId,
        documentName: options.name,
        recipientCount: options.recipients.length,
      },
      'Creating e-signature document'
    );

    const document = await this.provider!.createDocument(options);
    await this.persistDocument(document);
    return document;
  }

  async sendDocument(documentId: string): Promise<ESignatureDocument> {
    await this.ensureInitialized();

    logger.info(
      { tenantId: this.tenantId, documentId },
      'Sending e-signature document'
    );

    const document = await this.provider!.sendDocument(documentId);
    await this.updatePersistedDocument(document);
    return document;
  }

  async createAndSend(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    await this.ensureInitialized();

    logger.info(
      {
        tenantId: this.tenantId,
        documentName: options.name,
        recipientCount: options.recipients.length,
      },
      'Creating and sending e-signature document'
    );

    const document = await this.provider!.createAndSend(options);
    await this.persistDocument(document);
    return document;
  }

  async createAndSendFromPdf(
    pdfContent: Buffer | string,
    options: CreateDocumentOptions
  ): Promise<ESignatureDocument> {
    await this.ensureInitialized();

    if (!this.provider!.createAndSendFromPdf) {
      throw new ESignatureConfigurationError(
        this.provider!.providerCode,
        'Provider does not support createAndSendFromPdf'
      );
    }

    logger.info(
      {
        tenantId: this.tenantId,
        documentName: options.name,
        recipientCount: options.recipients.length,
      },
      'Creating and sending e-signature document from PDF'
    );

    const document = await this.provider!.createAndSendFromPdf(pdfContent, options);

    // Merge source entity info into metadata for traceability
    if (options.providerOptions?.sourceEntityType) {
      document.metadata = {
        ...(document.metadata || {}),
        sourceEntityType: options.providerOptions.sourceEntityType as string,
        sourceEntityId: options.providerOptions.sourceEntityId as string,
      };
    }

    // create-first send-intent: si el caller pre-creó la fila local (intent
    // con activeSourceKey, para el unique de idempotencia), actualizarla en
    // vez de crear una segunda fila.
    const localIntentRowId = options.providerOptions?.localIntentRowId as
      | string
      | undefined;
    await this.persistDocument(document, localIntentRowId);
    return document;
  }

  async getDocument(documentId: string): Promise<ESignatureDocument> {
    await this.ensureInitialized();
    return this.provider!.getDocument(documentId);
  }

  async downloadDocument(documentId: string): Promise<DownloadDocumentResult> {
    await this.ensureInitialized();

    logger.info(
      { tenantId: this.tenantId, documentId },
      'Downloading signed document'
    );

    return this.provider!.downloadDocument(documentId);
  }

  async cancelDocument(documentId: string, reason?: string): Promise<void> {
    await this.ensureInitialized();

    logger.info(
      { tenantId: this.tenantId, documentId, reason },
      'Cancelling e-signature document'
    );

    await this.provider!.cancelDocument(documentId, reason);

    try {
      await this.prisma.esignatureDocument.updateMany({
        where: {
          externalId: documentId,
          tenant_id_: this.tenantId,
        },
        data: {
          status: 'voided',
        },
      });
    } catch (error) {
      logger.warn({ error, documentId }, 'Failed to update local document record');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async getSigningLink(options: GetSigningLinkOptions): Promise<SigningLinkResult> {
    await this.ensureInitialized();

    logger.info(
      {
        tenantId: this.tenantId,
        documentId: options.documentId,
        recipientEmail: options.recipientEmail,
      },
      'Getting signing link'
    );

    return this.provider!.getSigningLink(options);
  }

  async resendToRecipient(documentId: string, recipientEmail: string): Promise<void> {
    await this.ensureInitialized();

    logger.info(
      { tenantId: this.tenantId, documentId, recipientEmail },
      'Resending to recipient'
    );

    await this.provider!.resendToRecipient(documentId, recipientEmail);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────────────────

  async refresh(): Promise<void> {
    clearProviderCache();
    this.provider = null;
    this.initialized = false;
    await this.initialize();
  }

  async getProvider(): Promise<IESignatureProvider> {
    await this.ensureInitialized();
    return this.provider!;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // TypeScript enum uses lowercase (agilsign, docusign) for URLs/webhooks;
  // Prisma enum uses camelCase (agilSign, docuSign). Map when persisting.
  private static readonly providerToPrisma: Record<string, string> = {
    agilsign: 'agilSign',
    docusign: 'docuSign',
    pandadoc: 'pandaDoc',
    signnow: 'signNow',
  };

  private async persistDocument(
    document: ESignatureDocument,
    reuseRowId?: string
  ): Promise<void> {
    try {
      const prismaProvider = ESignatureService.providerToPrisma[document.provider] || document.provider;
      const rowData = {
        externalId: document.externalId,
        provider: prismaProvider as any,
        name: document.name,
        status: (document.status as any) || 'draft',
        sentAt: document.sentAt,
        completedAt: document.completedAt,
        metadata: document.metadata as any,
        // Vínculo a la entidad de origen en COLUMNAS (no solo en el json):
        // el matching por nombre (CTTO-<n>) colisionaba cuando un número de
        // contrato se reusaba — las columnas permiten matching por ID real.
        sourceEntityType: (document.metadata as any)?.sourceEntityType ?? null,
        sourceEntityId: (document.metadata as any)?.sourceEntityId ?? null,
      };

      // Intent pre-creado por el caller (idempotencia de envíos): completar la
      // MISMA fila con los datos reales del proveedor — nunca una segunda fila.
      // El activeSourceKey del intent se conserva (el documento sigue activo).
      const dbDoc = reuseRowId
        ? await this.prisma.esignatureDocument.update({
            where: { id: reuseRowId },
            data: {
              ...rowData,
              version_: crypto.randomUUID(),
              lastUpdatedAt_: new Date(),
            },
          })
        : await this.prisma.esignatureDocument.create({
            data: {
              ...rowData,
              tenant_id_: this.tenantId,
              version_: crypto.randomUUID(),
              createdAt_: new Date(),
              createdBy_id_: 'SYSADMIN',
            },
          });

      for (const recipient of document.recipients) {
        await this.prisma.esignatureRecipient.create({
          data: {
            document_id: dbDoc.id,
            email: recipient.email,
            name: recipient.name,
            role: recipient.role as any,
            order: recipient.order,
            status: (recipient.status as any) || 'pending',
            signedAt: recipient.signedAt,
            tenant_id_: this.tenantId,
            version_: crypto.randomUUID(),
            createdAt_: new Date(),
            createdBy_id_: 'SYSADMIN',
          },
        });
      }

      logger.debug(
        { documentId: document.externalId, dbId: dbDoc.id },
        'Document persisted to database'
      );
    } catch (error) {
      logger.warn(
        { error, documentId: document.externalId },
        'Failed to persist document to database'
      );
    }
  }

  private async updatePersistedDocument(document: ESignatureDocument): Promise<void> {
    try {
      await this.prisma.esignatureDocument.updateMany({
        where: {
          externalId: document.externalId,
          tenant_id_: this.tenantId,
        },
        data: {
          status: document.status as any,
          sentAt: document.sentAt,
          completedAt: document.completedAt,
        },
      });

      for (const recipient of document.recipients) {
        await this.prisma.esignatureRecipient.updateMany({
          where: {
            document_id: document.externalId,
            email: recipient.email,
            tenant_id_: this.tenantId,
          },
          data: {
            status: recipient.status as any,
            signedAt: recipient.signedAt,
          },
        });
      }
    } catch (error) {
      logger.warn(
        { error, documentId: document.externalId },
        'Failed to update persisted document'
      );
    }
  }

  /**
   * Persist a new webhook secret by encrypting it and updating the global
   * config row for the given provider.
   */
  private static async persistWebhookSecret(
    prisma: PrismaClient,
    providerCode: ESignatureProviderCode,
    webhookSecret: string
  ): Promise<void> {
    try {
      const encryption = CredentialsEncryptionService.getInstance();
      const encrypted = encryption.encrypt(webhookSecret);

      await prisma.esignatureConfig.updateMany({
        where: {
          // La columna es el enum EsignatureProvider (camelCase: 'agilSign'),
          // no el providerCode ('agilsign'). Mapear como en updateDocumentStatus.
          provider: (ESignatureService.providerToPrisma[providerCode] || providerCode) as any,
          enabled: true,
        },
        data: {
          webhookSecret_encrypted: encrypted.encrypted,
          webhookSecret_iv: encrypted.iv,
          webhookSecret_tag: encrypted.tag,
        },
      });

      logger.info(
        { provider: providerCode },
        'Webhook secret persisted to database'
      );
    } catch (error) {
      logger.warn(
        { error, provider: providerCode },
        'Failed to persist webhook secret'
      );
    }
  }

  /**
   * Sync webhook registration for the configured (global) e-signature provider.
   * Intended to be called on server startup to keep webhook event subscriptions
   * in sync with the codebase.
   */
  static async syncWebhooks(prisma: PrismaClient): Promise<void> {
    const config = await resolveESignatureConfig(prisma);
    if (!config) return;

    try {
      const provider = createESignatureProvider(config);
      if (provider.init) {
        const result = await provider.init({ prisma });
        if (result.webhookSecret && result.webhookSecret !== config.webhookSecret) {
          await ESignatureService.persistWebhookSecret(
            prisma,
            config.providerCode,
            result.webhookSecret
          );
        }
      }
      logger.info({ provider: config.providerCode }, 'E-signature webhook synced on startup');
    } catch (err) {
      logger.warn(
        { provider: config.providerCode, error: (err as Error).message },
        'E-signature webhook sync failed on startup'
      );
    }
  }
}

export function createESignatureService(
  prisma: PrismaClient,
  tenantId: string
): ESignatureService {
  return new ESignatureService(prisma, tenantId);
}
