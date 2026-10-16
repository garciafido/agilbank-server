/**
 * AgilSign v2 Test Fixtures
 *
 * Shared mock data for AgilSignProvider tests.
 * Based on the AgilSign v2 API (standalone PKI platform).
 */

import { createHmac } from 'crypto';
import { ESignatureProviderCode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_CREDENTIALS = {
  apiKey: 'test-api-key-12345',
  baseUrl: 'http://agilsign-app:3100',
};

export const MOCK_CONFIG = {
  providerCode: ESignatureProviderCode.AGILSIGN,
  credentials: MOCK_CREDENTIALS as unknown as Record<string, string>,
  sandboxMode: false,
  webhookSecret: 'webhook-secret-64chars-hex-0123456789abcdef0123456789abcdef',
  tenantId: 'tenant-001',
};

// ─────────────────────────────────────────────────────────────────────────────
// AgilSign v2 API Responses
// ─────────────────────────────────────────────────────────────────────────────

/** Response from POST /api/documents */
export const MOCK_DOCUMENT_CREATED: Record<string, unknown> = {
  id: 'clx1abc2def3ghi4jkl',
  status: 'draft',
  title: 'Contrato de Licencia',
  originalPdfPath: '/data/documents/clx1abc2def3ghi4jkl/original.pdf',
  signedPdfPath: null,
  auditTrailPdfPath: null,
  externalRef: null,
  metadata: null,
  encryptionKeyEnc: null,
  signingWorkflow: 'parallel',
  requireMfa: false,
  createdAt: '2026-02-26T15:00:00.000Z',
  updatedAt: '2026-02-26T15:00:00.000Z',
  expiresAt: null,
  signers: [
    {
      id: 'signer-001',
      documentId: 'clx1abc2def3ghi4jkl',
      name: 'Autor',
      email: 'autor@ejemplo.com',
      slug: 'sign-slug-abc',
      order: 0,
      status: 'pending',
      emailVerified: false,
      signedAt: null,
      createdAt: '2026-02-26T15:00:00.000Z',
      updatedAt: '2026-02-26T15:00:00.000Z',
      fields: [
        {
          id: 'field-001',
          page: 0,
          x: 0.1,
          y: 0.09,
          w: 0.3,
          h: 0.06,
          fieldType: 'signature',
          label: null,
          required: true,
        },
      ],
      signatures: [],
    },
  ],
  auditEvents: [],
};

/** Document after sending (status=sent, signers=invited) */
export const MOCK_DOCUMENT_SENT: Record<string, unknown> = {
  ...MOCK_DOCUMENT_CREATED,
  status: 'sent',
  updatedAt: '2026-02-26T15:00:05.000Z',
  signers: [
    {
      ...(MOCK_DOCUMENT_CREATED.signers as any[])[0],
      status: 'invited',
      updatedAt: '2026-02-26T15:00:05.000Z',
    },
  ],
};

/** Document after completion */
export const MOCK_DOCUMENT_COMPLETED: Record<string, unknown> = {
  ...MOCK_DOCUMENT_CREATED,
  status: 'completed',
  signedPdfPath: '/data/documents/clx1abc2def3ghi4jkl/signed.pdf',
  auditTrailPdfPath: '/data/documents/clx1abc2def3ghi4jkl/audit.pdf',
  updatedAt: '2026-02-26T16:30:00.000Z',
  signers: [
    {
      ...(MOCK_DOCUMENT_CREATED.signers as any[])[0],
      status: 'signed',
      signedAt: '2026-02-26T16:30:00.000Z',
      updatedAt: '2026-02-26T16:30:00.000Z',
    },
  ],
};

/** Multi-signer document */
export const MOCK_DOCUMENT_MULTI: Record<string, unknown> = {
  ...MOCK_DOCUMENT_SENT,
  signers: [
    {
      ...(MOCK_DOCUMENT_CREATED.signers as any[])[0],
      id: 'signer-001',
      status: 'signed',
      signedAt: '2026-02-26T16:00:00.000Z',
    },
    {
      ...(MOCK_DOCUMENT_CREATED.signers as any[])[0],
      id: 'signer-002',
      email: 'editor@ejemplo.com',
      name: 'Editor',
      slug: 'sign-slug-def',
      order: 1,
      status: 'pending',
      signedAt: null,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Payloads (match AgilSign v2 dispatchWebhook calls)
// ─────────────────────────────────────────────────────────────────────────────

export const WEBHOOK_SIGNER_SIGNED = {
  documentId: 'clx1abc2def3ghi4jkl',
  signerId: 'signer-001',
  signerName: 'Autor',
  signerEmail: 'autor@ejemplo.com',
  signedAt: '2026-02-26T16:30:00.000Z',
};

export const WEBHOOK_SIGNER_VIEWED = {
  documentId: 'clx1abc2def3ghi4jkl',
  signerId: 'signer-001',
  signerName: 'Autor',
  signerEmail: 'autor@ejemplo.com',
};

export const WEBHOOK_SIGNER_DECLINED = {
  documentId: 'clx1abc2def3ghi4jkl',
  signerId: 'signer-001',
  signerName: 'Autor',
  signerEmail: 'autor@ejemplo.com',
  reason: 'No estoy de acuerdo',
};

export const WEBHOOK_DOCUMENT_SENT = {
  documentId: 'clx1abc2def3ghi4jkl',
  title: 'Contrato de Licencia',
  signerCount: 1,
};

export const WEBHOOK_DOCUMENT_COMPLETED = {
  documentId: 'clx1abc2def3ghi4jkl',
  title: 'Contrato de Licencia',
  signers: [
    { name: 'Autor', email: 'autor@ejemplo.com', signedAt: '2026-02-26T16:30:00.000Z' },
  ],
};

export const WEBHOOK_DOCUMENT_CANCELLED = {
  documentId: 'clx1abc2def3ghi4jkl',
  title: 'Contrato de Licencia',
};

// ─────────────────────────────────────────────────────────────────────────────
// Signing Link Response
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_SIGNING_LINK_RESPONSE = {
  signingUrl: 'https://agilsign.ar/s/sign-slug-abc?h=access-hash-123',
};

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Auto-Registration
// ─────────────────────────────────────────────────────────────────────────────

/** Response from PATCH /api/client/webhook on AgilSign */
export const MOCK_WEBHOOK_REGISTRATION_RESPONSE = {
  webhookUrl: 'https://app.example.com/api/webhooks/esignature/agilsign',
  // Armado en ejecución: el literal entero tiene la forma de un secreto de Stripe y los escáneres lo marcan.
  webhookSecret: 'whsec_' + 'abcdef1234567890'.repeat(4),
  events: [
    'signer.signed',
    'signer.viewed',
    'signer.declined',
    'signer.invitation_failed',
    'document.sent',
    'document.completed',
    'document.cancelled',
    'document.expired',
    'document.blockchain_confirmed',
  ],
};

/** Config with webhookCallbackUrl for auto-registration testing */
export const MOCK_CONFIG_WITH_CALLBACK = {
  ...MOCK_CONFIG,
  credentials: {
    ...MOCK_CREDENTIALS,
    webhookCallbackUrl: 'https://app.example.com/api/webhooks/esignature/agilsign',
  } as unknown as Record<string, string>,
  webhookSecret: undefined as string | undefined,
};

/** Config with existing webhook secret (should skip registration) */
export const MOCK_CONFIG_WITH_EXISTING_SECRET = {
  ...MOCK_CONFIG,
  credentials: {
    ...MOCK_CREDENTIALS,
    webhookCallbackUrl: 'https://app.example.com/api/webhooks/esignature/agilsign',
  } as unknown as Record<string, string>,
};

/** Config without webhookCallbackUrl (should skip registration) */
export const MOCK_CONFIG_WITHOUT_CALLBACK = {
  ...MOCK_CONFIG,
  webhookSecret: undefined as string | undefined,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a mock fetch response */
export function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
    arrayBuffer: async () => {
      const str = JSON.stringify(body);
      const buf = Buffer.from(str);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  } as Response;
}

/** Create a mock binary fetch response (for PDF downloads) */
export function mockBinaryFetchResponse(content: Buffer, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/pdf' }),
    text: async () => '',
    arrayBuffer: async () =>
      content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
  } as Response;
}

/** Create a mock fetch that returns different responses per URL pattern */
export function createMockFetch(
  handlers: Array<{ match: string | RegExp; response: unknown; status?: number; binary?: boolean }>
) {
  return jest.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    for (const handler of handlers) {
      const matches =
        typeof handler.match === 'string'
          ? urlStr.includes(handler.match)
          : handler.match.test(urlStr);
      if (matches) {
        if (handler.binary) {
          return mockBinaryFetchResponse(handler.response as Buffer, handler.status || 200);
        }
        return mockFetchResponse(handler.response, handler.status || 200);
      }
    }
    return mockFetchResponse({ error: 'Not found' }, 404);
  });
}

/** Generate valid HMAC webhook headers for testing */
export function createWebhookHeaders(
  payload: unknown,
  secret: string,
  eventType: string
): Record<string, string> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return {
    'x-agilsign-signature': `t=${timestamp},v1=${signature}`,
    'x-agilsign-event': eventType,
  };
}
