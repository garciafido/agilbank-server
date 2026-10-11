/**
 * SignNow E-Signature Provider
 *
 * Implements IESignatureProvider for SignNow API.
 *
 * Required credentials:
 * - clientId: SignNow Application Client ID
 * - clientSecret: SignNow Application Client Secret
 * - username: SignNow account email (for password grant)
 * - password: SignNow account password (for password grant)
 *
 * @see https://docs.signnow.com/docs/signnow/welcome
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
  SignNowCredentials,
} from '../types';
import { logger } from '../../../utils/logger';

export class SignNowProvider implements IESignatureProvider {
  readonly providerCode = ESignatureProviderCode.SIGNNOW;

  private credentials: SignNowCredentials;

  constructor(config: ESignatureConfigResolved) {
    this.credentials = config.credentials as unknown as SignNowCredentials;

    if (!this.credentials.clientId || !this.credentials.clientSecret) {
      throw new ESignatureConfigurationError(
        'signnow',
        'clientId and clientSecret are required'
      );
    }
  }

  isConfigured(): boolean {
    return !!(this.credentials.clientId && this.credentials.clientSecret);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations (Placeholder implementations)
  // ─────────────────────────────────────────────────────────────────────────────

  async createDocument(_options: CreateDocumentOptions): Promise<ESignatureDocument> {
    logger.warn('SignNow provider: createDocument not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async sendDocument(_documentId: string): Promise<ESignatureDocument> {
    logger.warn('SignNow provider: sendDocument not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async createAndSend(_options: CreateDocumentOptions): Promise<ESignatureDocument> {
    logger.warn('SignNow provider: createAndSend not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async getDocument(_documentId: string): Promise<ESignatureDocument> {
    logger.warn('SignNow provider: getDocument not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async downloadDocument(_documentId: string): Promise<DownloadDocumentResult> {
    logger.warn('SignNow provider: downloadDocument not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async cancelDocument(_documentId: string, _reason?: string): Promise<void> {
    logger.warn('SignNow provider: cancelDocument not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations (Placeholder implementations)
  // ─────────────────────────────────────────────────────────────────────────────

  async getSigningLink(_options: GetSigningLinkOptions): Promise<SigningLinkResult> {
    logger.warn('SignNow provider: getSigningLink not yet implemented');
    throw new Error('SignNow integration not yet implemented');
  }

  async resendToRecipient(_documentId: string, _recipientEmail: string): Promise<void> {
    logger.warn('SignNow provider: resendToRecipient not yet implemented');
    throw new Error('SignNow integration not yet implemented');
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
        document_id?: string;
        meta?: {
          event?: string;
        };
      };

      const event = data.event || data.meta?.event;
      if (!event || !data.document_id) {
        return null;
      }

      const eventType = this.mapSignNowEvent(event);
      if (!eventType) {
        return null;
      }

      return {
        type: eventType,
        documentId: data.document_id,
        provider: ESignatureProviderCode.SIGNNOW,
        timestamp: new Date(),
        rawPayload: payload,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to normalize SignNow webhook');
      return null;
    }
  }

  verifyWebhook(
    _payload: unknown,
    _headers: Record<string, string>,
    _secret?: string
  ): boolean {
    // SignNow webhook verification not yet implemented
    return true;
  }

  private mapSignNowEvent(event: string): ESignatureEventType | null {
    const eventMap: Record<string, ESignatureEventType> = {
      document_complete: ESignatureEventType.DOCUMENT_COMPLETED,
      invite_sent: ESignatureEventType.DOCUMENT_SENT,
      document_signed: ESignatureEventType.RECIPIENT_SIGNED,
    };
    return eventMap[event] || null;
  }
}
