/**
 * PandaDoc E-Signature Provider
 *
 * Implements IESignatureProvider for PandaDoc API.
 *
 * Required credentials:
 * - apiKey: PandaDoc API Key
 *
 * @see https://developers.pandadoc.com/reference/about
 */

import {
  IESignatureProvider,
  DownloadDocumentResult,
  ESignatureConfigurationError,
} from './types';
import {
  ESignatureDocument,
  ESignatureEvent,
  ESignatureConfigResolved,
  ESignatureProviderCode,
  ESignatureEventType,
  CreateDocumentOptions,
  GetSigningLinkOptions,
  SigningLinkResult,
  PandaDocCredentials,
} from '../types';
import { logger } from '../../../utils/logger';

export class PandaDocProvider implements IESignatureProvider {
  readonly providerCode = ESignatureProviderCode.PANDADOC;

  private credentials: PandaDocCredentials;

  constructor(config: ESignatureConfigResolved) {
    this.credentials = config.credentials as unknown as PandaDocCredentials;

    if (!this.credentials.apiKey) {
      throw new ESignatureConfigurationError('pandadoc', 'apiKey is required');
    }
  }

  isConfigured(): boolean {
    return !!this.credentials.apiKey;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations (Placeholder implementations)
  // ─────────────────────────────────────────────────────────────────────────────

  async createDocument(_options: CreateDocumentOptions): Promise<ESignatureDocument> {
    logger.warn('PandaDoc provider: createDocument not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async sendDocument(_documentId: string): Promise<ESignatureDocument> {
    logger.warn('PandaDoc provider: sendDocument not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async createAndSend(_options: CreateDocumentOptions): Promise<ESignatureDocument> {
    logger.warn('PandaDoc provider: createAndSend not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async getDocument(_documentId: string): Promise<ESignatureDocument> {
    logger.warn('PandaDoc provider: getDocument not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async downloadDocument(_documentId: string): Promise<DownloadDocumentResult> {
    logger.warn('PandaDoc provider: downloadDocument not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async cancelDocument(_documentId: string, _reason?: string): Promise<void> {
    logger.warn('PandaDoc provider: cancelDocument not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations (Placeholder implementations)
  // ─────────────────────────────────────────────────────────────────────────────

  async getSigningLink(_options: GetSigningLinkOptions): Promise<SigningLinkResult> {
    logger.warn('PandaDoc provider: getSigningLink not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  async resendToRecipient(_documentId: string, _recipientEmail: string): Promise<void> {
    logger.warn('PandaDoc provider: resendToRecipient not yet implemented');
    throw new Error('PandaDoc integration not yet implemented');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Webhook Operations
  // ─────────────────────────────────────────────────────────────────────────────

  normalizeWebhook(
    payload: unknown,
    _headers: Record<string, string>
  ): ESignatureEvent | null {
    try {
      const data = payload as {
        event?: string;
        data?: {
          id?: string;
          status?: string;
        };
      };

      if (!data.event || !data.data?.id) {
        return null;
      }

      const eventType = this.mapPandaDocEvent(data.event);
      if (!eventType) {
        return null;
      }

      return {
        type: eventType,
        documentId: data.data.id,
        provider: ESignatureProviderCode.PANDADOC,
        timestamp: new Date(),
        rawPayload: payload,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to normalize PandaDoc webhook');
      return null;
    }
  }

  verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string>,
    _secret?: string
  ): boolean {
    // PandaDoc webhook verification not yet implemented
    return true;
  }

  private mapPandaDocEvent(event: string): ESignatureEventType | null {
    const eventMap: Record<string, ESignatureEventType> = {
      document_state_changed: ESignatureEventType.DOCUMENT_SENT,
      document_completed: ESignatureEventType.DOCUMENT_COMPLETED,
      recipient_completed: ESignatureEventType.RECIPIENT_SIGNED,
    };
    return eventMap[event] || null;
  }
}
