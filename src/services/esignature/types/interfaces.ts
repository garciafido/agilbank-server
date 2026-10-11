/**
 * E-Signature Interfaces
 *
 * Core data structures for e-signature operations.
 */

import {
  ESignatureDocumentStatus,
  ESignatureRecipientStatus,
  ESignatureRecipientRole,
  ESignatureEventType,
  ESignatureProviderCode,
} from './enums';

/**
 * Recipient definition for document creation
 */
export interface ESignatureRecipientInput {
  /** Recipient's email address */
  email: string;
  /** Recipient's display name */
  name: string;
  /** Role in the signing workflow */
  role: ESignatureRecipientRole;
  /** Signing order (1 = first, 2 = second, etc.) */
  order?: number;
  /** Optional client-side identifier for correlation */
  clientId?: string;
}

/**
 * Recipient state after document operations
 */
export interface ESignatureRecipient {
  /** Recipient's email address */
  email: string;
  /** Recipient's display name */
  name: string;
  /** Role in the signing workflow */
  role: ESignatureRecipientRole;
  /** Signing order */
  order: number;
  /** Current status */
  status: ESignatureRecipientStatus;
  /** When they signed (if applicable) */
  signedAt?: Date;
  /** Provider-specific recipient ID */
  externalId?: string;
}

/**
 * Document state
 */
export interface ESignatureDocument {
  /** Provider-specific document ID */
  externalId: string;
  /** Provider code (docusign, pandadoc, etc.) */
  provider: ESignatureProviderCode;
  /** Document name/title */
  name: string;
  /** Current status */
  status: ESignatureDocumentStatus;
  /** When the document was sent */
  sentAt?: Date;
  /** When all signatures were completed */
  completedAt?: Date;
  /** Recipients and their statuses */
  recipients: ESignatureRecipient[];
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * File to include in document
 */
export interface ESignatureFileInput {
  /** File name with extension */
  name: string;
  /** File content as Buffer or base64 string */
  content: Buffer | string;
  /** MIME type (defaults to application/pdf) */
  mimeType?: string;
  /** Order in the document (for multi-file documents) */
  order?: number;
}

/**
 * Supplemental attachment published to signers only while signing is pending
 * (e.g. audio files whose SHA-256 is printed in the document annex). The
 * provider must verify sha256 against the uploaded bytes; access dies when
 * the document completes/cancels/expires. Not all providers support this.
 */
export interface ESignatureAttachmentInput {
  /** File name with extension */
  filename: string;
  /** MIME type (audio/mpeg, audio/mp4, ...) */
  mimeType: string;
  /** SHA-256 hex of the file content — the same hash printed in the document */
  sha256: string;
  /** Local filesystem path; read lazily at upload time (files can be tens of MB) */
  localPath: string;
  /** Display label, e.g. "Work — Track" */
  label?: string;
  /** Grouping metadata for the signing page (workTitle, trackName, isrc, mainAudio) */
  meta?: Record<string, unknown>;
}

/**
 * Options for creating a document
 */
export interface CreateDocumentOptions {
  /** Document name/subject */
  name: string;
  /** Files to include */
  files: ESignatureFileInput[];
  /** Recipients */
  recipients: ESignatureRecipientInput[];
  /** Supplemental attachments for signers (providers that support them) */
  attachments?: ESignatureAttachmentInput[];
  /** Email subject for notifications. Supports placeholders {{signerName}}, {{signingUrl}}, {{documentTitle}} (provider-replaced per signer). */
  emailSubject?: string;
  /** Email body/message (plain text). Same placeholders supported. */
  emailMessage?: string;
  /** Email body/message (HTML). Same placeholders supported. Used by providers that send HTML mails. */
  emailMessageHtml?: string;
  /** From display name for signer emails (e.g. the tenant's publisher). Address stays the provider's. */
  emailFromName?: string;
  /** When the document should expire (optional) */
  expiresAt?: Date;
  /** Client-side identifier for correlation */
  clientId?: string;
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Options for getting a signing link
 */
export interface GetSigningLinkOptions {
  /** Provider-specific document ID */
  documentId: string;
  /** Recipient email to get link for */
  recipientEmail: string;
  /** URL to redirect after signing (optional) */
  returnUrl?: string;
  /** Authentication method override (optional) */
  authMethod?: 'email' | 'sms' | 'none';
}

/**
 * Result of signing link generation
 */
export interface SigningLinkResult {
  /** URL for the recipient to sign */
  url: string;
  /** When the link expires (if applicable) */
  expiresAt?: Date;
}

/**
 * Normalized webhook event from any provider
 */
export interface ESignatureEvent {
  /** Event type */
  type: ESignatureEventType;
  /** Provider-specific document ID */
  documentId: string;
  /** Provider code */
  provider: ESignatureProviderCode;
  /** Recipient email (for recipient-specific events) */
  recipientEmail?: string;
  /** When the event occurred */
  timestamp: Date;
  /**
   * Id lógico del evento en el provider, estable a través de reintentos y
   * re-entregas del webhook. Clave de dedupe del inbox durable.
   */
  externalEventId?: string;
  /** Raw payload from provider (for debugging/logging) */
  rawPayload?: unknown;
}

/**
 * Resolved configuration for a provider
 */
export interface ESignatureConfigResolved {
  /** Provider code */
  providerCode: ESignatureProviderCode;
  /** Decrypted credentials */
  credentials: Record<string, string>;
  /** Whether to use sandbox/test environment */
  sandboxMode: boolean;
  /** Webhook secret for validation (optional) */
  webhookSecret?: string;
  /**
   * Hay un secret configurado pero no se pudo desencriptar. Los webhooks se
   * rechazan (fail-closed) hasta que se arregle — nunca degradar a "sin firma".
   */
  webhookSecretInvalid?: boolean;
}

/**
 * Provider-specific credentials structure (examples)
 */
export interface DocuSignCredentials {
  integrationKey: string;
  secretKey: string;
  accountId: string;
  userId: string;
  rsaPrivateKey?: string;
}

export interface PandaDocCredentials {
  apiKey: string;
}

export interface SignNowCredentials {
  clientId: string;
  clientSecret: string;
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface AgilSignCredentials {
  apiKey: string;
  baseUrl: string;
  webhookCallbackUrl?: string;  // e.g. https://app.example.com/api/webhooks/esignature/agilsign
}
