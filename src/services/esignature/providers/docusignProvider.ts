/**
 * DocuSign E-Signature Provider
 *
 * Implements IESignatureProvider for DocuSign eSignature API.
 * Uses JWT Grant authentication flow.
 *
 * Required credentials:
 * - integrationKey: Application's Integration Key (Client ID)
 * - userId: User ID (GUID) for impersonation
 * - accountId: DocuSign Account ID
 * - rsaPrivateKey: RSA private key for JWT signing
 *
 * @see https://developers.docusign.com/docs/esign-rest-api/
 */

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
  DocuSignCredentials,
} from '../types';
import { logger } from '../../../utils/logger';
import * as crypto from 'crypto';

// DocuSign API base URLs
const DOCUSIGN_AUTH_URL = 'https://account.docusign.com';
const DOCUSIGN_AUTH_URL_DEMO = 'https://account-d.docusign.com';
const DOCUSIGN_API_BASE = 'https://na4.docusign.net/restapi'; // Production varies by region
const DOCUSIGN_API_BASE_DEMO = 'https://demo.docusign.net/restapi';

interface DocuSignTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  sentDateTime?: string;
  completedDateTime?: string;
  recipients?: {
    signers?: DocuSignRecipient[];
    carbonCopies?: DocuSignRecipient[];
  };
}

interface DocuSignRecipient {
  recipientId: string;
  email: string;
  name: string;
  routingOrder: string;
  status: string;
  signedDateTime?: string;
}

export class DocuSignProvider implements IESignatureProvider {
  readonly providerCode = ESignatureProviderCode.DOCUSIGN;

  private credentials: DocuSignCredentials;
  private sandboxMode: boolean;
  private webhookSecret?: string;

  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor(config: ESignatureConfigResolved) {
    this.credentials = config.credentials as unknown as DocuSignCredentials;
    this.sandboxMode = config.sandboxMode;
    this.webhookSecret = config.webhookSecret;

    if (!this.credentials.integrationKey) {
      throw new ESignatureConfigurationError('docusign', 'integrationKey is required');
    }
    if (!this.credentials.userId) {
      throw new ESignatureConfigurationError('docusign', 'userId is required');
    }
    if (!this.credentials.accountId) {
      throw new ESignatureConfigurationError('docusign', 'accountId is required');
    }
  }

  isConfigured(): boolean {
    return !!(
      this.credentials.integrationKey &&
      this.credentials.userId &&
      this.credentials.accountId &&
      this.credentials.rsaPrivateKey
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async createDocument(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    const envelope = await this.createEnvelope(options, 'created');
    return this.mapEnvelopeToDocument(envelope);
  }

  async sendDocument(documentId: string): Promise<ESignatureDocument> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${documentId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'sent' }),
    });

    await this.handleApiError(response, 'send document');
    return this.getDocument(documentId);
  }

  async createAndSend(options: CreateDocumentOptions): Promise<ESignatureDocument> {
    const envelope = await this.createEnvelope(options, 'sent');
    return this.mapEnvelopeToDocument(envelope);
  }

  async getDocument(documentId: string): Promise<ESignatureDocument> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${documentId}?include=recipients`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await this.handleApiError(response, 'get document');
    const envelope = (await response.json()) as DocuSignEnvelope;
    return this.mapEnvelopeToDocument(envelope);
  }

  async downloadDocument(documentId: string): Promise<DownloadDocumentResult> {
    const token = await this.getAccessToken();
    // 'combined' gets all documents in envelope merged as single PDF
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${documentId}/documents/combined`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await this.handleApiError(response, 'download document');
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), includesAuditTrail: false };
  }

  async cancelDocument(documentId: string, reason?: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${documentId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'voided',
        voidedReason: reason || 'Cancelled by sender',
      }),
    });

    await this.handleApiError(response, 'cancel document');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations
  // ─────────────────────────────────────────────────────────────────────────────

  async getSigningLink(options: GetSigningLinkOptions): Promise<SigningLinkResult> {
    const token = await this.getAccessToken();

    // First, get recipient info to find recipientId
    const doc = await this.getDocument(options.documentId);
    const recipient = doc.recipients.find(
      (r) => r.email.toLowerCase() === options.recipientEmail.toLowerCase()
    );

    if (!recipient || !recipient.externalId) {
      throw new ESignatureError(
        `Recipient ${options.recipientEmail} not found in document`,
        'docusign',
        404
      );
    }

    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${options.documentId}/views/recipient`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientId: recipient.externalId,
        returnUrl: options.returnUrl || 'https://example.com/signing-complete',
        authenticationMethod: 'none',
        email: options.recipientEmail,
        userName: recipient.name,
      }),
    });

    await this.handleApiError(response, 'get signing link');
    const data = (await response.json()) as { url: string };

    return {
      url: data.url,
      // DocuSign embedded signing URLs typically expire in 5 minutes
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async resendToRecipient(documentId: string, recipientEmail: string): Promise<void> {
    const token = await this.getAccessToken();
    const doc = await this.getDocument(documentId);
    const recipient = doc.recipients.find(
      (r) => r.email.toLowerCase() === recipientEmail.toLowerCase()
    );

    if (!recipient || !recipient.externalId) {
      throw new ESignatureError(
        `Recipient ${recipientEmail} not found in document`,
        'docusign',
        404
      );
    }

    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${documentId}/recipients?resend_envelope=true`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signers: [
          {
            recipientId: recipient.externalId,
            email: recipientEmail,
            name: recipient.name,
          },
        ],
      }),
    });

    await this.handleApiError(response, 'resend to recipient');
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
        apiVersion?: string;
        data?: {
          envelopeId?: string;
          envelopeSummary?: {
            status?: string;
            recipients?: {
              signers?: Array<{
                email?: string;
                status?: string;
              }>;
            };
          };
        };
      };

      // DocuSign Connect webhook format
      if (!data.event || !data.data?.envelopeId) {
        return null;
      }

      const eventType = this.mapDocuSignEvent(
        data.event,
        data.data.envelopeSummary?.status
      );
      if (!eventType) {
        return null;
      }

      // For recipient events, find the affected recipient
      let recipientEmail: string | undefined;
      if (eventType.startsWith('recipient.')) {
        const signers = data.data.envelopeSummary?.recipients?.signers || [];
        const affectedSigner = signers.find((s) =>
          this.isRecipientEventMatch(s.status, eventType)
        );
        recipientEmail = affectedSigner?.email;
      }

      return {
        type: eventType,
        documentId: data.data.envelopeId,
        provider: ESignatureProviderCode.DOCUSIGN,
        recipientEmail,
        timestamp: new Date(),
        rawPayload: payload,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to normalize DocuSign webhook');
      return null;
    }
  }

  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
    secret?: string
  ): boolean {
    const webhookSecret = secret || this.webhookSecret;
    if (!webhookSecret) {
      // No secret configured, skip verification
      return true;
    }

    // DocuSign HMAC verification
    const signature = headers['x-docusign-signature-1'];
    if (!signature) {
      return false;
    }

    const payloadString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computed = crypto
      .createHmac('sha256', webhookSecret)
      .update(payloadString)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computed)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  private async createEnvelope(
    options: CreateDocumentOptions,
    status: 'created' | 'sent'
  ): Promise<DocuSignEnvelope> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes`;

    // Build documents array
    const documents = options.files.map((file, index) => ({
      documentId: String(index + 1),
      name: file.name,
      documentBase64:
        file.content instanceof Buffer
          ? file.content.toString('base64')
          : file.content,
      fileExtension: file.name.split('.').pop() || 'pdf',
    }));

    // Build recipients
    const signers = options.recipients
      .filter((r) => r.role === ESignatureRecipientRole.SIGNER)
      .map((r, index) => ({
        recipientId: String(index + 1),
        email: r.email,
        name: r.name,
        routingOrder: String(r.order || index + 1),
        clientUserId: r.clientId, // For embedded signing
        tabs: {
          signHereTabs: [
            {
              documentId: '1',
              pageNumber: '1',
              xPosition: '100',
              yPosition: '100',
              anchorString: '/sig/', // Auto-place on /sig/ anchor
              anchorUnits: 'pixels',
            },
          ],
        },
      }));

    const carbonCopies = options.recipients
      .filter((r) => r.role === ESignatureRecipientRole.CC)
      .map((r, index) => ({
        recipientId: String(signers.length + index + 1),
        email: r.email,
        name: r.name,
        routingOrder: String(r.order || signers.length + index + 1),
      }));

    const envelopeDefinition = {
      emailSubject: options.emailSubject || options.name,
      emailBlurb: options.emailMessage,
      documents,
      recipients: {
        signers,
        carbonCopies,
      },
      status,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelopeDefinition),
    });

    await this.handleApiError(response, 'create envelope');
    const result = (await response.json()) as { envelopeId: string };

    // Fetch full envelope details
    return this.fetchEnvelope(result.envelopeId);
  }

  private async fetchEnvelope(envelopeId: string): Promise<DocuSignEnvelope> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}/v2.1/accounts/${this.credentials.accountId}/envelopes/${envelopeId}?include=recipients`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    await this.handleApiError(response, 'fetch envelope');
    return (await response.json()) as DocuSignEnvelope;
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    // Use JWT Grant flow
    const authUrl = this.sandboxMode ? DOCUSIGN_AUTH_URL_DEMO : DOCUSIGN_AUTH_URL;
    const now = Math.floor(Date.now() / 1000);

    const jwtPayload = {
      iss: this.credentials.integrationKey,
      sub: this.credentials.userId,
      aud: this.sandboxMode ? 'account-d.docusign.com' : 'account.docusign.com',
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    };

    // Sign JWT
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
    const signatureInput = `${header}.${payload}`;

    if (!this.credentials.rsaPrivateKey) {
      throw new ESignatureConfigurationError('docusign', 'rsaPrivateKey is required for JWT auth');
    }

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(this.credentials.rsaPrivateKey, 'base64url');

    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch(`${authUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ status: response.status, error }, 'DocuSign auth failed');
      throw new ESignatureAuthenticationError('docusign');
    }

    const tokenData = (await response.json()) as DocuSignTokenResponse;
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in - 60) * 1000);

    return this.accessToken;
  }

  private getApiBase(): string {
    return this.sandboxMode ? DOCUSIGN_API_BASE_DEMO : DOCUSIGN_API_BASE;
  }

  private async handleApiError(response: Response, operation: string): Promise<void> {
    if (response.ok) return;

    const status = response.status;
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = 'Unknown error';
    }

    logger.error(
      { status, operation, error: errorBody },
      'DocuSign API error'
    );

    if (status === 401) {
      // Clear cached token
      this.accessToken = undefined;
      this.tokenExpiresAt = undefined;
      throw new ESignatureAuthenticationError('docusign');
    }

    if (status === 404) {
      throw new ESignatureDocumentNotFoundError('docusign', operation);
    }

    if (status === 429) {
      throw new ESignatureRateLimitError('docusign');
    }

    if (status === 400) {
      throw new ESignatureInvalidOperationError(
        'docusign',
        operation,
        errorBody
      );
    }

    throw new ESignatureError(
      `DocuSign API error: ${errorBody}`,
      'docusign',
      status,
      status >= 500
    );
  }

  private mapEnvelopeToDocument(envelope: DocuSignEnvelope): ESignatureDocument {
    const recipients: ESignatureRecipient[] = [];

    // Map signers
    for (const signer of envelope.recipients?.signers || []) {
      recipients.push({
        email: signer.email,
        name: signer.name,
        role: ESignatureRecipientRole.SIGNER,
        order: parseInt(signer.routingOrder, 10) || 1,
        status: this.mapRecipientStatus(signer.status),
        signedAt: signer.signedDateTime ? new Date(signer.signedDateTime) : undefined,
        externalId: signer.recipientId,
      });
    }

    // Map carbon copies
    for (const cc of envelope.recipients?.carbonCopies || []) {
      recipients.push({
        email: cc.email,
        name: cc.name,
        role: ESignatureRecipientRole.CC,
        order: parseInt(cc.routingOrder, 10) || 1,
        status: this.mapRecipientStatus(cc.status),
        externalId: cc.recipientId,
      });
    }

    return {
      externalId: envelope.envelopeId,
      provider: ESignatureProviderCode.DOCUSIGN,
      name: '', // DocuSign doesn't return envelope name in this response
      status: this.mapDocumentStatus(envelope.status),
      sentAt: envelope.sentDateTime ? new Date(envelope.sentDateTime) : undefined,
      completedAt: envelope.completedDateTime
        ? new Date(envelope.completedDateTime)
        : undefined,
      recipients,
    };
  }

  private mapDocumentStatus(status: string): ESignatureDocumentStatus {
    const statusMap: Record<string, ESignatureDocumentStatus> = {
      created: ESignatureDocumentStatus.DRAFT,
      sent: ESignatureDocumentStatus.SENT,
      delivered: ESignatureDocumentStatus.DELIVERED,
      completed: ESignatureDocumentStatus.COMPLETED,
      declined: ESignatureDocumentStatus.DECLINED,
      voided: ESignatureDocumentStatus.VOIDED,
    };
    return statusMap[status?.toLowerCase()] || ESignatureDocumentStatus.DRAFT;
  }

  private mapRecipientStatus(status: string): ESignatureRecipientStatus {
    const statusMap: Record<string, ESignatureRecipientStatus> = {
      created: ESignatureRecipientStatus.PENDING,
      sent: ESignatureRecipientStatus.SENT,
      delivered: ESignatureRecipientStatus.DELIVERED,
      completed: ESignatureRecipientStatus.SIGNED,
      signed: ESignatureRecipientStatus.SIGNED,
      declined: ESignatureRecipientStatus.DECLINED,
      authenticationfailed: ESignatureRecipientStatus.AUTH_FAILED,
    };
    return statusMap[status?.toLowerCase()] || ESignatureRecipientStatus.PENDING;
  }

  private mapDocuSignEvent(
    event: string,
    _envelopeStatus?: string
  ): ESignatureEventType | null {
    // DocuSign Connect events
    const eventMap: Record<string, ESignatureEventType> = {
      'envelope-sent': ESignatureEventType.DOCUMENT_SENT,
      'envelope-delivered': ESignatureEventType.DOCUMENT_DELIVERED,
      'envelope-completed': ESignatureEventType.DOCUMENT_COMPLETED,
      'envelope-declined': ESignatureEventType.DOCUMENT_DECLINED,
      'envelope-voided': ESignatureEventType.DOCUMENT_VOIDED,
      'recipient-completed': ESignatureEventType.RECIPIENT_SIGNED,
      'recipient-declined': ESignatureEventType.RECIPIENT_DECLINED,
      'recipient-delivered': ESignatureEventType.RECIPIENT_VIEWED,
      'recipient-authenticationfailed': ESignatureEventType.RECIPIENT_AUTH_FAILED,
    };

    return eventMap[event?.toLowerCase()] || null;
  }

  private isRecipientEventMatch(status: string | undefined, eventType: ESignatureEventType): boolean {
    if (!status) return false;
    const statusLower = status.toLowerCase();

    switch (eventType) {
      case ESignatureEventType.RECIPIENT_SIGNED:
        return statusLower === 'completed' || statusLower === 'signed';
      case ESignatureEventType.RECIPIENT_DECLINED:
        return statusLower === 'declined';
      case ESignatureEventType.RECIPIENT_VIEWED:
        return statusLower === 'delivered';
      case ESignatureEventType.RECIPIENT_AUTH_FAILED:
        return statusLower === 'authenticationfailed';
      default:
        return false;
    }
  }
}
