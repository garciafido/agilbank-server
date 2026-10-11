/**
 * E-Signature Provider Interface
 *
 * Abstract interface that all e-signature providers must implement.
 * Follows the same pattern as LLM providers.
 */

import { PrismaClient } from '../../../prisma/generated-client/client';
import {
  ESignatureDocument,
  ESignatureEvent,
  CreateDocumentOptions,
  GetSigningLinkOptions,
  SigningLinkResult,
  ESignatureConfigResolved,
} from '../types';

/**
 * Result of downloadDocument — includes the PDF buffer and whether
 * the provider already merged the audit trail (preserving PKI signature).
 */
export interface DownloadDocumentResult {
  buffer: Buffer;
  includesAuditTrail: boolean;
}

/**
 * Core interface that all e-signature providers must implement
 */
export interface IESignatureProvider {
  /**
   * Provider identifier (docusign, pandadoc, etc.)
   */
  readonly providerCode: string;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Optional initialization hook called after provider creation.
   * Can be used for tasks like auto-registering webhooks.
   */
  init?(context: { prisma: PrismaClient }): Promise<{ webhookSecret?: string }>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Document Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a document (draft state, not yet sent)
   */
  createDocument(options: CreateDocumentOptions): Promise<ESignatureDocument>;

  /**
   * Send an existing document to recipients for signing
   */
  sendDocument(documentId: string): Promise<ESignatureDocument>;

  /**
   * Create and immediately send a document
   */
  createAndSend(options: CreateDocumentOptions): Promise<ESignatureDocument>;

  /**
   * Get current state of a document
   */
  getDocument(documentId: string): Promise<ESignatureDocument>;

  /**
   * Download the signed document
   */
  downloadDocument(documentId: string): Promise<DownloadDocumentResult>;

  /**
   * Cancel/void a document
   */
  cancelDocument(documentId: string, reason?: string): Promise<void>;

  /**
   * Create and send directly from a PDF file with text tags.
   * Not all providers support this — check before calling.
   */
  createAndSendFromPdf?(
    pdfContent: Buffer | string,
    options: CreateDocumentOptions
  ): Promise<ESignatureDocument>;

  /**
   * Download the audit log / signing certificate PDF.
   */
  downloadAuditLog?(documentId: string): Promise<Buffer | null>;

  /**
   * Download the blockchain certificate PDF (e.g., OpenTimestamps proof).
   */
  downloadBlockchainCert?(documentId: string): Promise<Buffer | null>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Recipient Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get a signing URL for a specific recipient
   */
  getSigningLink(options: GetSigningLinkOptions): Promise<SigningLinkResult>;

  /**
   * Resend signing notification to a recipient
   */
  resendToRecipient(documentId: string, recipientEmail: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────────────
  // Webhook Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Normalize a provider-specific webhook payload to standard event
   */
  normalizeWebhook(
    payload: unknown,
    headers: Record<string, string>
  ): ESignatureEvent | null;

  /**
   * Verify webhook signature/authenticity.
   * `rawBody` (bytes recibidos, como string) permite verificar la firma sobre
   * el body original en vez de un re-stringify del JSON parseado.
   */
  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
    secret?: string,
    rawBody?: string
  ): boolean;
}

/**
 * Provider factory function type
 */
export type ESignatureProviderFactory = (
  config: ESignatureConfigResolved
) => IESignatureProvider;

/**
 * Registry of available providers
 */
export interface ESignatureProviderRegistry {
  register(providerCode: string, factory: ESignatureProviderFactory): void;
  get(providerCode: string): ESignatureProviderFactory | undefined;
  list(): string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base error for e-signature operations
 */
export class ESignatureError extends Error {
  constructor(
    message: string,
    public readonly providerCode: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ESignatureError';
  }
}

/**
 * Provider not configured or credentials invalid
 */
export class ESignatureConfigurationError extends ESignatureError {
  constructor(providerCode: string, details?: string) {
    super(
      `Provider ${providerCode} is not properly configured${details ? `: ${details}` : ''}`,
      providerCode,
      500,
      false
    );
    this.name = 'ESignatureConfigurationError';
  }
}

/**
 * Authentication failed with provider
 */
export class ESignatureAuthenticationError extends ESignatureError {
  constructor(providerCode: string) {
    super(
      'Authentication failed with e-signature provider',
      providerCode,
      401,
      false
    );
    this.name = 'ESignatureAuthenticationError';
  }
}

/**
 * Rate limit exceeded
 */
export class ESignatureRateLimitError extends ESignatureError {
  constructor(
    providerCode: string,
    public readonly retryAfterMs?: number
  ) {
    super('Rate limit exceeded', providerCode, 429, true);
    this.name = 'ESignatureRateLimitError';
  }
}

/**
 * Document not found
 */
export class ESignatureDocumentNotFoundError extends ESignatureError {
  constructor(providerCode: string, documentId: string) {
    super(`Document ${documentId} not found`, providerCode, 404, false);
    this.name = 'ESignatureDocumentNotFoundError';
  }
}

/**
 * Invalid operation (e.g., trying to send an already sent document)
 */
export class ESignatureInvalidOperationError extends ESignatureError {
  constructor(providerCode: string, operation: string, reason: string) {
    super(`Cannot ${operation}: ${reason}`, providerCode, 400, false);
    this.name = 'ESignatureInvalidOperationError';
  }
}
