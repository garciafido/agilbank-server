/**
 * E-Signature Enums
 *
 * Status codes and event types for e-signature workflows.
 * Provider-agnostic - each provider maps their statuses to these.
 */

/**
 * Document lifecycle status
 */
export enum ESignatureDocumentStatus {
  /** Document created but not yet sent for signing */
  DRAFT = 'draft',
  /** Document sent to recipients, awaiting signatures */
  SENT = 'sent',
  /** Document delivered to recipients */
  DELIVERED = 'delivered',
  /** All recipients have signed */
  COMPLETED = 'completed',
  /** Document was declined by a recipient */
  DECLINED = 'declined',
  /** Document was voided/cancelled by sender */
  VOIDED = 'voided',
  /** Document expired before completion */
  EXPIRED = 'expired',
  /** Error occurred during processing */
  ERROR = 'error',
}

/**
 * Individual recipient status
 */
export enum ESignatureRecipientStatus {
  /** Awaiting their turn (based on routing order) */
  PENDING = 'pending',
  /** Document sent to recipient */
  SENT = 'sent',
  /** Recipient has opened the document */
  DELIVERED = 'delivered',
  /** Recipient has signed */
  SIGNED = 'signed',
  /** Recipient declined to sign */
  DECLINED = 'declined',
  /** Authentication failed */
  AUTH_FAILED = 'auth_failed',
}

/**
 * Recipient role in signing workflow
 */
export enum ESignatureRecipientRole {
  /** Must sign the document */
  SIGNER = 'signer',
  /** Receives a copy but doesn't sign */
  CC = 'cc',
  /** Views document during workflow */
  VIEWER = 'viewer',
  /** Must approve before others can sign */
  APPROVER = 'approver',
}

/**
 * Webhook event types (normalized across providers)
 */
export enum ESignatureEventType {
  /** Document was sent to recipients */
  DOCUMENT_SENT = 'document.sent',
  /** All recipients received the document */
  DOCUMENT_DELIVERED = 'document.delivered',
  /** All recipients have signed */
  DOCUMENT_COMPLETED = 'document.completed',
  /** Document was declined */
  DOCUMENT_DECLINED = 'document.declined',
  /** Document was voided */
  DOCUMENT_VOIDED = 'document.voided',
  /** Document expired */
  DOCUMENT_EXPIRED = 'document.expired',
  /** Blockchain anchor confirmed (signed PDF integrity verified on Bitcoin) */
  DOCUMENT_BLOCKCHAIN_CONFIRMED = 'document.blockchain_confirmed',
  /** Individual recipient signed */
  RECIPIENT_SIGNED = 'recipient.signed',
  /** Recipient viewed the document */
  RECIPIENT_VIEWED = 'recipient.viewed',
  /** Recipient declined */
  RECIPIENT_DECLINED = 'recipient.declined',
  /** Recipient authentication failed */
  RECIPIENT_AUTH_FAILED = 'recipient.auth_failed',
  /** Email bounced — recipient never received it */
  RECIPIENT_BOUNCED = 'recipient.bounced',
}

/**
 * Supported e-signature providers
 */
export enum ESignatureProviderCode {
  DOCUSIGN = 'docusign',
  PANDADOC = 'pandadoc',
  SIGNNOW = 'signnow',
  AGILSIGN = 'agilsign',
}
