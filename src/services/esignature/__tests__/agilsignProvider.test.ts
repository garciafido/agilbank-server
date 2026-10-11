import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createHmac } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fsSync from 'fs';
import { AgilSignProvider } from '../providers/agilsignProvider';
import {
  ESignatureProviderCode,
  ESignatureDocumentStatus,
  ESignatureRecipientStatus,
  ESignatureRecipientRole,
  ESignatureEventType,
} from '../types';
import { ESignatureConfigurationError } from '../providers/types';
import {
  MOCK_CONFIG,
  MOCK_DOCUMENT_CREATED,
  MOCK_DOCUMENT_SENT,
  MOCK_DOCUMENT_COMPLETED,
  MOCK_DOCUMENT_MULTI,
  MOCK_SIGNING_LINK_RESPONSE,
  MOCK_WEBHOOK_REGISTRATION_RESPONSE,
  MOCK_CONFIG_WITH_CALLBACK,
  MOCK_CONFIG_WITH_EXISTING_SECRET,
  MOCK_CONFIG_WITHOUT_CALLBACK,
  WEBHOOK_SIGNER_SIGNED,
  WEBHOOK_SIGNER_VIEWED,
  WEBHOOK_SIGNER_DECLINED,
  WEBHOOK_DOCUMENT_SENT,
  WEBHOOK_DOCUMENT_COMPLETED,
  WEBHOOK_DOCUMENT_CANCELLED,
  createMockFetch,
  createWebhookHeaders,
  mockFetchResponse,
  mockBinaryFetchResponse,
} from './agilsign.fixtures';

describe('AgilSignProvider', () => {
  let provider: AgilSignProvider;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    provider = new AgilSignProvider(MOCK_CONFIG);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Construction & Configuration
  // ───────────────────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create provider with valid config', () => {
      expect(provider.providerCode).toBe(ESignatureProviderCode.AGILSIGN);
    });

    it('should throw if apiKey is missing', () => {
      const config = {
        ...MOCK_CONFIG,
        credentials: { baseUrl: 'http://test:3100' } as unknown as Record<string, string>,
      };
      expect(() => new AgilSignProvider(config)).toThrow(ESignatureConfigurationError);
    });

    it('should throw if baseUrl is missing', () => {
      const config = {
        ...MOCK_CONFIG,
        credentials: { apiKey: 'key' } as unknown as Record<string, string>,
      };
      expect(() => new AgilSignProvider(config)).toThrow(ESignatureConfigurationError);
    });

    it('should strip trailing slash from baseUrl', () => {
      const config = {
        ...MOCK_CONFIG,
        credentials: {
          apiKey: 'key',
          baseUrl: 'http://agilsign-app:3100/',
        } as unknown as Record<string, string>,
      };
      const p = new AgilSignProvider(config);
      expect(p.isConfigured()).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return true when apiKey and baseUrl are set', () => {
      expect(provider.isConfigured()).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createAndSend — POST /api/documents with send=true
  // ───────────────────────────────────────────────────────────────────────────

  describe('createAndSend', () => {
    it('should POST to /api/documents with send=true', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({ error: 'unexpected' }, 500);
      }) as typeof global.fetch;

      const doc = await provider.createAndSend({
        name: 'Contrato de Licencia',
        files: [{ name: 'contrato.pdf', content: Buffer.from('fake-pdf') }],
        recipients: [
          { email: 'autor@ejemplo.com', name: 'Autor', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      expect(capturedBody?.send).toBe(true);
      expect(capturedBody?.title).toBe('Contrato de Licencia');
      expect(capturedBody?.pdf).toBe(Buffer.from('fake-pdf').toString('base64'));
      expect(doc.externalId).toBe('clx1abc2def3ghi4jkl');
      expect(doc.provider).toBe(ESignatureProviderCode.AGILSIGN);
      expect(doc.recipients).toHaveLength(1);
      expect(doc.recipients[0].email).toBe('autor@ejemplo.com');
    });

    it('should build signers with fields from providerOptions', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSend({
        name: 'Test',
        files: [{ name: 'test.pdf', content: Buffer.from('pdf') }],
        recipients: [
          { email: 'a@b.com', name: 'Signer', role: ESignatureRecipientRole.SIGNER, order: 0 },
        ],
        providerOptions: {
          fields: [
            { page: 0, x: 0.5, y: 0.8, w: 0.3, h: 0.06, signerIndex: 0 },
          ],
        },
      });

      const signers = capturedBody!.signers as Array<Record<string, unknown>>;
      expect(signers).toHaveLength(1);
      expect(signers[0].name).toBe('Signer');
      expect(signers[0].email).toBe('a@b.com');
      expect(signers[0].order).toBe(0);
      const fields = signers[0].fields as Array<Record<string, unknown>>;
      expect(fields).toHaveLength(1);
      // El código convierte top-down (htmlToPdf) → bottom-up (AgilSign): y = 1 - 0.8 - 0.06.
      expect(fields[0]).toMatchObject({ page: 0, x: 0.5, y: 1 - 0.8 - 0.06, w: 0.3, h: 0.06 });
    });

    it('should add default signature field when no fields provided', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSend({
        name: 'Test',
        files: [{ name: 'test.pdf', content: 'b64' }],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      const signers = capturedBody!.signers as Array<Record<string, unknown>>;
      const fields = signers[0].fields as Array<Record<string, unknown>>;
      expect(fields).toHaveLength(1);
      expect(fields[0].page).toBe(0);
    });

    it('should only include SIGNER recipients, not VIEWER', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSend({
        name: 'Test',
        files: [{ name: 'test.pdf', content: 'b64' }],
        recipients: [
          { email: 'signer@b.com', name: 'Signer', role: ESignatureRecipientRole.SIGNER },
          { email: 'viewer@b.com', name: 'Viewer', role: ESignatureRecipientRole.VIEWER },
        ],
      });

      const signers = capturedBody!.signers as Array<Record<string, unknown>>;
      expect(signers).toHaveLength(1);
      expect(signers[0].email).toBe('signer@b.com');
    });

    it('should pass expiresAt when provided', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const expiresAt = new Date('2026-04-01T00:00:00Z');

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSend({
        name: 'Test',
        files: [{ name: 'test.pdf', content: 'b64' }],
        recipients: [{ email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER }],
        expiresAt,
      });

      expect(capturedBody?.expiresAt).toBe(expiresAt.toISOString());
    });

    it('should throw when no PDF provided', async () => {
      await expect(
        provider.createAndSend({
          name: 'Test',
          files: [],
          recipients: [{ email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER }],
        })
      ).rejects.toThrow('No PDF content provided');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createDocument — Draft (send=false)
  // ───────────────────────────────────────────────────────────────────────────

  describe('createDocument', () => {
    it('should POST with send=false', async () => {
      let capturedBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createDocument({
        name: 'Draft Doc',
        files: [{ name: 'draft.pdf', content: 'b64' }],
        recipients: [{ email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER }],
      });

      expect(capturedBody?.send).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // sendDocument — Resend invitations
  // ───────────────────────────────────────────────────────────────────────────

  describe('sendDocument', () => {
    it('should resend to pending signers', async () => {
      const resendCalls: string[] = [];

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/documents/clx1abc2def3ghi4jkl') && !urlStr.includes('/signers/') && method === 'GET') {
          return mockFetchResponse(MOCK_DOCUMENT_SENT);
        }
        if (urlStr.includes('/signers/') && urlStr.includes('/resend') && method === 'PUT') {
          resendCalls.push(urlStr);
          return mockFetchResponse({ status: 'resent' });
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      const doc = await provider.sendDocument('clx1abc2def3ghi4jkl');

      expect(resendCalls).toHaveLength(1);
      expect(resendCalls[0]).toContain('/signers/signer-001/resend');
      expect(doc.externalId).toBe('clx1abc2def3ghi4jkl');
    });

    it('should skip already signed signers', async () => {
      const resendCalls: string[] = [];

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/documents/clx1abc2def3ghi4jkl') && !urlStr.includes('/signers/') && method === 'GET') {
          return mockFetchResponse(MOCK_DOCUMENT_COMPLETED);
        }
        if (urlStr.includes('/resend') && method === 'PUT') {
          resendCalls.push(urlStr);
          return mockFetchResponse({ status: 'resent' });
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      await provider.sendDocument('clx1abc2def3ghi4jkl');

      expect(resendCalls).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getDocument
  // ───────────────────────────────────────────────────────────────────────────

  describe('getDocument', () => {
    it('should fetch and map document to ESignatureDocument', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/clx1abc2def3ghi4jkl', response: MOCK_DOCUMENT_SENT },
      ]) as typeof global.fetch;

      const doc = await provider.getDocument('clx1abc2def3ghi4jkl');

      expect(doc.externalId).toBe('clx1abc2def3ghi4jkl');
      expect(doc.provider).toBe(ESignatureProviderCode.AGILSIGN);
      expect(doc.name).toBe('Contrato de Licencia');
      expect(doc.status).toBe(ESignatureDocumentStatus.SENT);
      expect(doc.recipients).toHaveLength(1);
      expect(doc.recipients[0]).toMatchObject({
        email: 'autor@ejemplo.com',
        name: 'Autor',
        role: ESignatureRecipientRole.SIGNER,
        status: ESignatureRecipientStatus.SENT,
        externalId: 'signer-001',
      });
    });

    it('should map completed document correctly', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/clx1abc2def3ghi4jkl', response: MOCK_DOCUMENT_COMPLETED },
      ]) as typeof global.fetch;

      const doc = await provider.getDocument('clx1abc2def3ghi4jkl');

      expect(doc.status).toBe(ESignatureDocumentStatus.COMPLETED);
      expect(doc.completedAt).toBeDefined();
      expect(doc.recipients[0].status).toBe(ESignatureRecipientStatus.SIGNED);
      expect(doc.recipients[0].signedAt).toBeDefined();
    });

    it('should handle multi-signer documents', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/clx1abc2def3ghi4jkl', response: MOCK_DOCUMENT_MULTI },
      ]) as typeof global.fetch;

      const doc = await provider.getDocument('clx1abc2def3ghi4jkl');

      expect(doc.recipients).toHaveLength(2);
      expect(doc.recipients[0].status).toBe(ESignatureRecipientStatus.SIGNED);
      expect(doc.recipients[1].status).toBe(ESignatureRecipientStatus.PENDING);
      expect(doc.recipients[1].email).toBe('editor@ejemplo.com');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // downloadDocument
  // ───────────────────────────────────────────────────────────────────────────

  describe('downloadDocument', () => {
    it('should download bundle PDF (signed + audit) from /api/documents/{id}/download?type=bundle', async () => {
      const pdfContent = Buffer.from('%PDF-1.0 fake signed bundle');

      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('/download?type=bundle')) {
          return mockBinaryFetchResponse(pdfContent);
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      const result = await provider.downloadDocument('clx1abc2def3ghi4jkl');

      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(0);
      // El bundle de AgilSign ya incluye el audit trail.
      expect(result.includesAuditTrail).toBe(true);
    });

    it('should throw on 404 (not yet available)', async () => {
      global.fetch = createMockFetch([
        { match: '/download?type=bundle', response: { error: 'Not available' }, status: 404 },
      ]) as typeof global.fetch;

      await expect(provider.downloadDocument('clx1abc2def3ghi4jkl')).rejects.toThrow('not found');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // cancelDocument
  // ───────────────────────────────────────────────────────────────────────────

  describe('cancelDocument', () => {
    it('should DELETE the document', async () => {
      let deletedUrl = '';

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (init?.method === 'DELETE') {
          deletedUrl = urlStr;
          return mockFetchResponse({ status: 'cancelled' });
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      await provider.cancelDocument('clx1abc2def3ghi4jkl');

      expect(deletedUrl).toContain('/api/documents/clx1abc2def3ghi4jkl');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createAndSendFromPdf
  // ───────────────────────────────────────────────────────────────────────────

  describe('createAndSendFromPdf', () => {
    it('should POST to /api/documents with PDF content', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const pdfBuffer = Buffer.from('pdf-binary-content');

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      const doc = await provider.createAndSendFromPdf(pdfBuffer, {
        name: 'Contrato PDF Directo',
        files: [],
        recipients: [
          { email: 'autor@ejemplo.com', name: 'Autor', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      expect(capturedBody?.pdf).toBe(pdfBuffer.toString('base64'));
      expect(capturedBody?.title).toBe('Contrato PDF Directo');
      expect(capturedBody?.send).toBe(true);
      expect(doc.externalId).toBe('clx1abc2def3ghi4jkl');
    });

    it('should accept pre-encoded base64 string', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const base64String = 'cHJlLWVuY29kZWQ=';

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSendFromPdf(base64String, {
        name: 'Test',
        files: [],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      expect(capturedBody?.pdf).toBe(base64String);
    });

    it('should use pdfOverride over files array', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const pdfOverride = Buffer.from('override-pdf');

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await provider.createAndSendFromPdf(pdfOverride, {
        name: 'Test',
        files: [{ name: 'other.pdf', content: Buffer.from('other') }],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      expect(capturedBody?.pdf).toBe(pdfOverride.toString('base64'));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // attachments (flujo dos fases: create(send=false) → attach×N → send)
  // ───────────────────────────────────────────────────────────────────────────

  describe('attachments', () => {
    let audioPath: string;
    const audioBytes = Buffer.from('fake-audio-bytes');

    beforeEach(() => {
      audioPath = join(tmpdir(), `agilsign-test-audio-${Date.now()}.mp3`);
      fsSync.writeFileSync(audioPath, audioBytes);
    });

    afterEach(() => {
      fsSync.rmSync(audioPath, { force: true });
    });

    const attachmentInput = (overrides: Record<string, unknown> = {}) => ({
      filename: 'canción.mp3',
      mimeType: 'audio/mpeg',
      sha256: 'a'.repeat(64),
      localPath: audioPath,
      label: 'Obra — Track 1',
      meta: { workTitle: 'Obra Ñandú', trackName: 'Track 1', mainAudio: true },
      ...overrides,
    });

    function captureCalls() {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        calls.push({ url: urlStr, init });
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        if (/\/attachments$/.test(urlStr) && init?.method === 'POST') {
          return mockFetchResponse({ id: 'att-1', sha256: 'a'.repeat(64) }, 201);
        }
        if (urlStr.endsWith('/send') && init?.method === 'POST') {
          return mockFetchResponse({ status: 'sent' }, 200);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;
      return calls;
    }

    it('runs the two-phase flow: create(send=false) → upload → send', async () => {
      const calls = captureCalls();

      const doc = await provider.createAndSendFromPdf(Buffer.from('pdf'), {
        name: 'Contrato con Audios',
        files: [],
        recipients: [
          { email: 'autor@ejemplo.com', name: 'Autor', role: ESignatureRecipientRole.SIGNER },
        ],
        attachments: [attachmentInput()],
      });

      expect(calls).toHaveLength(3);
      const createBody = JSON.parse(calls[0].init?.body as string);
      expect(createBody.send).toBe(false);
      expect(calls[1].url).toContain('/api/documents/clx1abc2def3ghi4jkl/attachments');
      expect(calls[2].url).toContain('/api/documents/clx1abc2def3ghi4jkl/send');
      expect(doc.status).toBe(ESignatureDocumentStatus.SENT);
    });

    it('sends metadata percent-encoded in headers and the file as binary body', async () => {
      const calls = captureCalls();

      await provider.createAndSendFromPdf(Buffer.from('pdf'), {
        name: 'Test',
        files: [],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
        attachments: [attachmentInput()],
      });

      const upload = calls[1];
      const headers = upload.init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('audio/mpeg');
      expect(decodeURIComponent(headers['X-Filename'])).toBe('canción.mp3');
      expect(headers['X-Sha256']).toBe('a'.repeat(64));
      expect(decodeURIComponent(headers['X-Label'])).toBe('Obra — Track 1');
      expect(JSON.parse(decodeURIComponent(headers['X-Meta'])).workTitle).toBe('Obra Ñandú');
      expect(Buffer.from(upload.init?.body as Uint8Array).equals(audioBytes)).toBe(true);
    });

    it('skips upload and send on idempotent replay of an already-sent document', async () => {
      const calls: string[] = [];
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        calls.push(urlStr);
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          return mockFetchResponse(MOCK_DOCUMENT_SENT, 200);
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      const doc = await provider.createAndSendFromPdf(Buffer.from('pdf'), {
        name: 'Retry',
        files: [],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
        attachments: [attachmentInput()],
      });

      expect(calls).toHaveLength(1);
      expect(doc.status).toBe(ESignatureDocumentStatus.SENT);
    });

    it('propagates a 422 hash mismatch from the upload', async () => {
      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.endsWith('/api/documents') && init?.method === 'POST') {
          return mockFetchResponse(MOCK_DOCUMENT_CREATED, 201);
        }
        if (/\/attachments$/.test(urlStr)) {
          return mockFetchResponse(
            { error: 'Attachment content does not match declared SHA-256', code: 'SHA256_MISMATCH' },
            422
          );
        }
        return mockFetchResponse({}, 500);
      }) as typeof global.fetch;

      await expect(
        provider.createAndSendFromPdf(Buffer.from('pdf'), {
          name: 'Bad Hash',
          files: [],
          recipients: [
            { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
          ],
          attachments: [attachmentInput({ sha256: 'f'.repeat(64) })],
        })
      ).rejects.toThrow();
    });

    it('keeps the single-call flow when there are no attachments', async () => {
      const calls = captureCalls();

      await provider.createAndSendFromPdf(Buffer.from('pdf'), {
        name: 'Sin Audios',
        files: [],
        recipients: [
          { email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER },
        ],
      });

      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0].init?.body as string).send).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // downloadAuditLog
  // ───────────────────────────────────────────────────────────────────────────

  describe('downloadAuditLog', () => {
    it('should download from /api/documents/{id}/download?type=audit', async () => {
      const auditContent = Buffer.from('%PDF-1.0 audit log');

      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('/download?type=audit')) {
          return mockBinaryFetchResponse(auditContent);
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      const buffer = await provider.downloadAuditLog('clx1abc2def3ghi4jkl');

      expect(buffer).not.toBeNull();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer!.length).toBeGreaterThan(0);
    });

    it('should return null when audit not available (404)', async () => {
      global.fetch = createMockFetch([
        { match: '/download?type=audit', response: { error: 'Not available' }, status: 404 },
      ]) as typeof global.fetch;

      const buffer = await provider.downloadAuditLog('clx1abc2def3ghi4jkl');

      expect(buffer).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getSigningLink
  // ───────────────────────────────────────────────────────────────────────────

  describe('getSigningLink', () => {
    it('should call signing-link API and return URL', async () => {
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('/api/documents/') && !urlStr.includes('/signers/')) {
          return mockFetchResponse(MOCK_DOCUMENT_SENT);
        }
        if (urlStr.includes('/signing-link')) {
          return mockFetchResponse(MOCK_SIGNING_LINK_RESPONSE);
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      const result = await provider.getSigningLink({
        documentId: 'clx1abc2def3ghi4jkl',
        recipientEmail: 'autor@ejemplo.com',
      });

      expect(result.url).toBe('https://agilsign.ar/s/sign-slug-abc?h=access-hash-123');
    });

    it('should be case-insensitive for email matching', async () => {
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('/api/documents/') && !urlStr.includes('/signers/')) {
          return mockFetchResponse(MOCK_DOCUMENT_SENT);
        }
        if (urlStr.includes('/signing-link')) {
          return mockFetchResponse(MOCK_SIGNING_LINK_RESPONSE);
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      const result = await provider.getSigningLink({
        documentId: 'clx1abc2def3ghi4jkl',
        recipientEmail: 'AUTOR@EJEMPLO.COM',
      });

      expect(result.url).toBeDefined();
    });

    it('should throw if recipient not found', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/clx1abc2def3ghi4jkl', response: MOCK_DOCUMENT_SENT },
      ]) as typeof global.fetch;

      await expect(
        provider.getSigningLink({
          documentId: 'clx1abc2def3ghi4jkl',
          recipientEmail: 'noexiste@ejemplo.com',
        })
      ).rejects.toThrow('not found in document');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // resendToRecipient
  // ───────────────────────────────────────────────────────────────────────────

  describe('resendToRecipient', () => {
    it('should PUT to resend endpoint', async () => {
      let resendUrl = '';

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/documents/clx1abc2def3ghi4jkl') && !urlStr.includes('/signers/')) {
          return mockFetchResponse(MOCK_DOCUMENT_SENT);
        }
        if (urlStr.includes('/resend') && method === 'PUT') {
          resendUrl = urlStr;
          return mockFetchResponse({ status: 'resent' });
        }
        return mockFetchResponse({}, 404);
      }) as typeof global.fetch;

      await provider.resendToRecipient('clx1abc2def3ghi4jkl', 'autor@ejemplo.com');

      expect(resendUrl).toContain('/documents/clx1abc2def3ghi4jkl/signers/signer-001/resend');
    });

    it('should throw if recipient not found', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/clx1abc2def3ghi4jkl', response: MOCK_DOCUMENT_SENT },
      ]) as typeof global.fetch;

      await expect(
        provider.resendToRecipient('clx1abc2def3ghi4jkl', 'noexiste@ejemplo.com')
      ).rejects.toThrow('not found in document');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // normalizeWebhook — Event mapping
  // ───────────────────────────────────────────────────────────────────────────

  describe('normalizeWebhook', () => {
    it('should map signer.signed → RECIPIENT_SIGNED', () => {
      const headers = { 'x-agilsign-event': 'signer.signed' };
      const event = provider.normalizeWebhook(WEBHOOK_SIGNER_SIGNED, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_SIGNED);
      expect(event!.documentId).toBe('clx1abc2def3ghi4jkl');
      expect(event!.recipientEmail).toBe('autor@ejemplo.com');
      expect(event!.provider).toBe(ESignatureProviderCode.AGILSIGN);
    });

    it('should map signer.viewed → RECIPIENT_VIEWED', () => {
      const headers = { 'x-agilsign-event': 'signer.viewed' };
      const event = provider.normalizeWebhook(WEBHOOK_SIGNER_VIEWED, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_VIEWED);
    });

    it('should map signer.declined → RECIPIENT_DECLINED', () => {
      const headers = { 'x-agilsign-event': 'signer.declined' };
      const event = provider.normalizeWebhook(WEBHOOK_SIGNER_DECLINED, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_DECLINED);
    });

    it('should map document.sent → DOCUMENT_SENT', () => {
      const headers = { 'x-agilsign-event': 'document.sent' };
      const event = provider.normalizeWebhook(WEBHOOK_DOCUMENT_SENT, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.DOCUMENT_SENT);
      expect(event!.documentId).toBe('clx1abc2def3ghi4jkl');
    });

    it('should map document.completed → DOCUMENT_COMPLETED', () => {
      const headers = { 'x-agilsign-event': 'document.completed' };
      const event = provider.normalizeWebhook(WEBHOOK_DOCUMENT_COMPLETED, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.DOCUMENT_COMPLETED);
    });

    it('should map document.cancelled → DOCUMENT_VOIDED', () => {
      const headers = { 'x-agilsign-event': 'document.cancelled' };
      const event = provider.normalizeWebhook(WEBHOOK_DOCUMENT_CANCELLED, headers);

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.DOCUMENT_VOIDED);
    });

    it('should include rawPayload', () => {
      const headers = { 'x-agilsign-event': 'signer.signed' };
      const event = provider.normalizeWebhook(WEBHOOK_SIGNER_SIGNED, headers);

      expect(event!.rawPayload).toBe(WEBHOOK_SIGNER_SIGNED);
    });

    it('should return null for unknown event types', () => {
      const headers = { 'x-agilsign-event': 'some.unknown.event' };
      const event = provider.normalizeWebhook({ documentId: 'x' }, headers);

      expect(event).toBeNull();
    });

    it('should return null for missing event header', () => {
      const event = provider.normalizeWebhook(WEBHOOK_SIGNER_SIGNED, {});

      expect(event).toBeNull();
    });

    it('should return null for missing documentId', () => {
      const headers = { 'x-agilsign-event': 'signer.signed' };
      const event = provider.normalizeWebhook({ signerEmail: 'a@b.com' }, headers);

      expect(event).toBeNull();
    });

    it('should return null for completely invalid payload', () => {
      const event = provider.normalizeWebhook('not-json', { 'x-agilsign-event': 'signer.signed' });

      expect(event).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // verifyWebhook — HMAC-SHA256 verification
  // ───────────────────────────────────────────────────────────────────────────

  describe('verifyWebhook', () => {
    const secret = 'test-webhook-secret';

    it('should REJECT when no secret configured (fail-closed)', () => {
      // Sin secreto no se puede verificar la firma; aceptar dejaba el endpoint
      // publico abierto a eventos falsificados sin credencial.
      expect(provider.verifyWebhook({}, {}, undefined)).toBe(false);
    });

    it('should verify valid HMAC signature', () => {
      const payload = { documentId: 'test', signerEmail: 'a@b.com' };
      const headers = createWebhookHeaders(payload, secret, 'signer.signed');

      expect(provider.verifyWebhook(payload, headers, secret)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = { documentId: 'test' };
      const headers = {
        'x-agilsign-signature': 't=9999999999,v1=invalidsignature',
        'x-agilsign-event': 'signer.signed',
      };

      expect(provider.verifyWebhook(payload, headers, secret)).toBe(false);
    });

    it('should reject missing signature header', () => {
      expect(provider.verifyWebhook({}, {}, secret)).toBe(false);
    });

    it('should reject malformed signature header', () => {
      const headers = { 'x-agilsign-signature': 'garbage' };

      expect(provider.verifyWebhook({}, headers, secret)).toBe(false);
    });

    it('should reject expired timestamps (>5 min old)', () => {
      const payload = { documentId: 'test' };
      const body = JSON.stringify(payload);
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const signature = createHmac('sha256', secret).update(`${oldTimestamp}.${body}`).digest('hex');
      const headers = {
        'x-agilsign-signature': `t=${oldTimestamp},v1=${signature}`,
        'x-agilsign-event': 'signer.signed',
      };

      expect(provider.verifyWebhook(payload, headers, secret)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // API Error Handling
  // ───────────────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should throw ESignatureAuthenticationError on 401', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/', response: { error: 'Unauthorized' }, status: 401 },
      ]) as typeof global.fetch;

      await expect(provider.getDocument('x')).rejects.toThrow('Authentication failed');
    });

    it('should throw ESignatureAuthenticationError on 403', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/', response: { error: 'Forbidden' }, status: 403 },
      ]) as typeof global.fetch;

      await expect(provider.getDocument('x')).rejects.toThrow('Authentication failed');
    });

    it('should throw ESignatureDocumentNotFoundError on 404', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/notexist', response: { error: 'Not found' }, status: 404 },
      ]) as typeof global.fetch;

      await expect(provider.getDocument('notexist')).rejects.toThrow('not found');
    });

    it('should throw ESignatureRateLimitError on 429', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/', response: { error: 'Too many' }, status: 429 },
      ]) as typeof global.fetch;

      await expect(provider.getDocument('x')).rejects.toThrow('Rate limit');
    });

    it('should throw ESignatureInvalidOperationError on 422', async () => {
      global.fetch = jest.fn(async () =>
        mockFetchResponse({ error: 'encrypted_pdf' }, 422)
      ) as typeof global.fetch;

      await expect(
        provider.createAndSend({
          name: 'Test',
          files: [{ name: 'test.pdf', content: 'b64' }],
          recipients: [{ email: 'a@b.com', name: 'A', role: ESignatureRecipientRole.SIGNER }],
        })
      ).rejects.toThrow('Cannot');
    });

    it('should throw retryable error on 500+', async () => {
      global.fetch = createMockFetch([
        { match: '/api/documents/', response: { error: 'Internal' }, status: 500 },
      ]) as typeof global.fetch;

      try {
        await provider.getDocument('x');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.retryable).toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // API Request Headers
  // ───────────────────────────────────────────────────────────────────────────

  describe('API headers', () => {
    it('should send Authorization: Bearer header', async () => {
      let capturedHeaders: Record<string, string> | undefined;

      global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string> | undefined;
        return mockFetchResponse(MOCK_DOCUMENT_SENT);
      }) as typeof global.fetch;

      await provider.getDocument('clx1abc2def3ghi4jkl');

      expect(capturedHeaders).toMatchObject({
        'Authorization': 'Bearer test-api-key-12345',
        'Content-Type': 'application/json',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // init / webhook auto-registration
  // ───────────────────────────────────────────────────────────────────────────

  describe('init / webhook auto-registration', () => {
    it('auto-registers webhook when callbackUrl configured and no secret', async () => {
      const initProvider = new AgilSignProvider(MOCK_CONFIG_WITH_CALLBACK);
      let patchCalled = false;
      let patchBody: Record<string, unknown> | undefined;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/health') && method === 'GET') {
          return mockFetchResponse({ status: 'ok' });
        }
        if (urlStr.includes('/api/client/webhook') && method === 'PATCH') {
          patchCalled = true;
          patchBody = JSON.parse(init!.body as string);
          return mockFetchResponse(MOCK_WEBHOOK_REGISTRATION_RESPONSE);
        }
        return mockFetchResponse({ error: 'unexpected' }, 500);
      }) as typeof global.fetch;

      const result = await initProvider.init({ prisma: {} as any, tenantId: 'tenant-001' });

      expect(result.webhookSecret).toBe(MOCK_WEBHOOK_REGISTRATION_RESPONSE.webhookSecret);
      expect(patchCalled).toBe(true);
      expect(patchBody?.url).toBe('https://app.example.com/api/webhooks/esignature/agilsign');
      expect(patchBody?.events).toEqual(MOCK_WEBHOOK_REGISTRATION_RESPONSE.events);
    });

    it('skips registration when webhookCallbackUrl is not configured', async () => {
      const initProvider = new AgilSignProvider(MOCK_CONFIG_WITHOUT_CALLBACK);

      global.fetch = jest.fn(async () => {
        return mockFetchResponse({ error: 'should not be called' }, 500);
      }) as typeof global.fetch;

      const result = await initProvider.init({ prisma: {} as any, tenantId: 'tenant-001' });

      expect(result.webhookSecret).toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('re-registers even when a secret already exists (keeps event types in sync)', async () => {
      // El código siempre re-registra si hay callbackUrl (para sincronizar la lista
      // de eventos suscriptos), aunque ya exista un webhookSecret.
      const initProvider = new AgilSignProvider(MOCK_CONFIG_WITH_EXISTING_SECRET);
      let patchCalled = false;

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';
        if (urlStr.includes('/api/health') && method === 'GET') {
          return mockFetchResponse({ status: 'ok' });
        }
        if (urlStr.includes('/api/client/webhook') && method === 'PATCH') {
          patchCalled = true;
          return mockFetchResponse(MOCK_WEBHOOK_REGISTRATION_RESPONSE);
        }
        return mockFetchResponse({ error: 'unexpected' }, 500);
      }) as typeof global.fetch;

      const result = await initProvider.init({ prisma: {} as any, tenantId: 'tenant-001' });

      expect(patchCalled).toBe(true);
      expect(result.webhookSecret).toBe(MOCK_WEBHOOK_REGISTRATION_RESPONSE.webhookSecret);
    });

    it('returns empty object when health check fails', async () => {
      const initProvider = new AgilSignProvider(MOCK_CONFIG_WITH_CALLBACK);

      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes('/api/health')) {
          return mockFetchResponse({ error: 'Service unavailable' }, 500);
        }
        return mockFetchResponse({ error: 'unexpected' }, 500);
      }) as typeof global.fetch;

      const result = await initProvider.init({ prisma: {} as any, tenantId: 'tenant-001' });

      expect(result).toEqual({});
      // PATCH should NOT have been called
      const fetchMock = global.fetch as jest.Mock;
      const patchCalls = fetchMock.mock.calls.filter(
        (call: any[]) => call[1]?.method === 'PATCH'
      );
      expect(patchCalls).toHaveLength(0);
    });

    it('returns empty object when webhook registration fails (non-fatal)', async () => {
      const initProvider = new AgilSignProvider(MOCK_CONFIG_WITH_CALLBACK);

      global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        const method = init?.method || 'GET';

        if (urlStr.includes('/api/health') && method === 'GET') {
          return mockFetchResponse({ status: 'ok' });
        }
        if (urlStr.includes('/api/client/webhook') && method === 'PATCH') {
          return mockFetchResponse({ error: 'Unprocessable Entity' }, 422);
        }
        return mockFetchResponse({ error: 'unexpected' }, 500);
      }) as typeof global.fetch;

      const result = await initProvider.init({ prisma: {} as any, tenantId: 'tenant-001' });

      expect(result).toEqual({});
    });
  });
});
