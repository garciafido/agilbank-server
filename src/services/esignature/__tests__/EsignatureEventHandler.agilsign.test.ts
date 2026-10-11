import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ESignatureEventHandler } from '../EsignatureEventHandler';
import {
  ESignatureProviderCode,
  ESignatureEventType,
  ESignatureDocumentStatus,
  ESignatureRecipientStatus,
} from '../types';
import {
  MOCK_CREDENTIALS,
  WEBHOOK_SIGNER_SIGNED,
  WEBHOOK_SIGNER_VIEWED,
  WEBHOOK_SIGNER_DECLINED,
  WEBHOOK_DOCUMENT_COMPLETED,
  WEBHOOK_DOCUMENT_CANCELLED,
} from './agilsign.fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Mock the config resolver and provider factory
// ─────────────────────────────────────────────────────────────────────────────

const mockResolveConfig = jest.fn();
const mockCreateProvider = jest.fn();

jest.mock('../providers', () => ({
  ...jest.requireActual('../providers'),
  resolveESignatureConfig: (...args: unknown[]) => mockResolveConfig(...args),
  createESignatureProvider: (...args: unknown[]) => mockCreateProvider(...args),
  ESignatureError: jest.requireActual('../providers').ESignatureError,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma
// ─────────────────────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    esignatureDocument: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'doc-db-id-001' }),
    },
    esignatureRecipient: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock AgilSign provider (uses the real normalizeWebhook/verifyWebhook)
// ─────────────────────────────────────────────────────────────────────────────

function createMockAgilSignProvider() {
  const { AgilSignProvider } = jest.requireActual('../providers/agilsignProvider') as any;
  const realProvider = new AgilSignProvider({
    providerCode: ESignatureProviderCode.AGILSIGN,
    credentials: MOCK_CREDENTIALS as unknown as Record<string, string>,
    sandboxMode: false,
    tenantId: 'tenant-001',
  });

  return {
    providerCode: ESignatureProviderCode.AGILSIGN,
    normalizeWebhook: (payload: unknown, headers: Record<string, string>) =>
      realProvider.normalizeWebhook(payload, headers),
    verifyWebhook: () => true,
  };
}

// AgilSign envía el tipo de evento en el header `x-agilsign-event`. La firma HMAC
// no se valida acá (verifyWebhook del mock devuelve true), así que solo hace falta
// el header del evento.
const evt = (eventType: string): Record<string, string> => ({ 'x-agilsign-event': eventType });

// documentId de las fixtures (= externalId en la DB).
const DOC_ID = 'clx1abc2def3ghi4jkl';

describe('ESignatureEventHandler — AgilSign webhooks', () => {
  let handler: ESignatureEventHandler;
  let prisma: ReturnType<typeof createMockPrisma>;
  const TENANT_ID = 'tenant-001';

  beforeEach(() => {
    prisma = createMockPrisma();
    handler = new ESignatureEventHandler(prisma);

    mockResolveConfig.mockResolvedValue({
      providerCode: ESignatureProviderCode.AGILSIGN,
      credentials: MOCK_CREDENTIALS,
      sandboxMode: false,
      tenantId: TENANT_ID,
    });

    mockCreateProvider.mockReturnValue(createMockAgilSignProvider());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Webhook routing
  // ───────────────────────────────────────────────────────────────────────────

  describe('webhook routing', () => {
    it('should resolve config for the tenant', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(mockResolveConfig).toHaveBeenCalledWith(prisma, TENANT_ID);
    });

    it('should create provider from resolved config', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(mockCreateProvider).toHaveBeenCalled();
    });

    it('should return null for unknown provider code', async () => {
      const result = await handler.handleWebhook('unknownprovider', TENANT_ID, {}, {});

      expect(result).toBeNull();
      expect(mockResolveConfig).not.toHaveBeenCalled();
    });

    it('should return null if no config found for tenant', async () => {
      mockResolveConfig.mockResolvedValue(null);

      const result = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // signer.signed → RECIPIENT_SIGNED → update recipient in DB
  // ───────────────────────────────────────────────────────────────────────────

  describe('signer.signed (recipient signed)', () => {
    it('should normalize to RECIPIENT_SIGNED and return event', async () => {
      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_SIGNED);
      expect(event!.documentId).toBe(DOC_ID);
      expect(event!.recipientEmail).toBe('autor@ejemplo.com');
    });

    it('should find document in DB by externalId', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(prisma.esignatureDocument.findFirst).toHaveBeenCalledWith({
        where: {
          externalId: DOC_ID,
          tenant_id_: TENANT_ID,
        },
        select: { id: true },
      });
    });

    it('should update recipient status to SIGNED with signedAt', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(prisma.esignatureRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          document_id: 'doc-db-id-001',
          email: 'autor@ejemplo.com',
          tenant_id_: TENANT_ID,
        },
        data: {
          status: ESignatureRecipientStatus.SIGNED,
          signedAt: expect.any(Date),
        },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // signer.viewed → RECIPIENT_VIEWED → update recipient in DB
  // ───────────────────────────────────────────────────────────────────────────

  describe('signer.viewed (recipient viewed)', () => {
    it('should normalize to RECIPIENT_VIEWED', async () => {
      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_VIEWED, evt('signer.viewed'));

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_VIEWED);
    });

    it('should update recipient status to DELIVERED', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_VIEWED, evt('signer.viewed'));

      expect(prisma.esignatureRecipient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ESignatureRecipientStatus.DELIVERED },
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // signer.declined → RECIPIENT_DECLINED
  // ───────────────────────────────────────────────────────────────────────────

  describe('signer.declined (recipient declined)', () => {
    it('should normalize to RECIPIENT_DECLINED', async () => {
      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_DECLINED, evt('signer.declined'));

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.RECIPIENT_DECLINED);
    });

    it('should update recipient status to DECLINED', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_DECLINED, evt('signer.declined'));

      expect(prisma.esignatureRecipient.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ESignatureRecipientStatus.DECLINED },
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // document.completed → DOCUMENT_COMPLETED → update document in DB
  // ───────────────────────────────────────────────────────────────────────────

  describe('document.completed (all signed)', () => {
    it('should normalize to DOCUMENT_COMPLETED', async () => {
      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_COMPLETED, evt('document.completed'));

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.DOCUMENT_COMPLETED);
      expect(event!.documentId).toBe(DOC_ID);
    });

    it('should update document status to COMPLETED with completedAt', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_COMPLETED, evt('document.completed'));

      expect(prisma.esignatureDocument.updateMany).toHaveBeenCalledWith({
        where: {
          externalId: DOC_ID,
          tenant_id_: TENANT_ID,
        },
        data: {
          status: ESignatureDocumentStatus.COMPLETED as any,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // document.cancelled → DOCUMENT_VOIDED
  // ───────────────────────────────────────────────────────────────────────────

  describe('document.cancelled (voided)', () => {
    it('should normalize to DOCUMENT_VOIDED', async () => {
      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_CANCELLED, evt('document.cancelled'));

      expect(event).not.toBeNull();
      expect(event!.type).toBe(ESignatureEventType.DOCUMENT_VOIDED);
    });

    it('should update document status to VOIDED', async () => {
      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_CANCELLED, evt('document.cancelled'));

      expect(prisma.esignatureDocument.updateMany).toHaveBeenCalledWith({
        where: {
          externalId: DOC_ID,
          tenant_id_: TENANT_ID,
        },
        data: {
          status: ESignatureDocumentStatus.VOIDED as any,
        },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Callbacks
  // ───────────────────────────────────────────────────────────────────────────

  describe('event callbacks', () => {
    it('should execute registered callback on DOCUMENT_COMPLETED', async () => {
      const callback = jest.fn();
      handler.on(ESignatureEventType.DOCUMENT_COMPLETED, callback);

      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_COMPLETED, evt('document.completed'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ESignatureEventType.DOCUMENT_COMPLETED,
          documentId: DOC_ID,
        }),
        TENANT_ID
      );
    });

    it('should execute registered callback on RECIPIENT_SIGNED', async () => {
      const callback = jest.fn();
      handler.on(ESignatureEventType.RECIPIENT_SIGNED, callback);

      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ESignatureEventType.RECIPIENT_SIGNED,
          recipientEmail: 'autor@ejemplo.com',
        }),
        TENANT_ID
      );
    });

    it('should not execute callbacks for non-matching event types', async () => {
      const callback = jest.fn();
      handler.on(ESignatureEventType.DOCUMENT_EXPIRED, callback);

      await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(callback).not.toHaveBeenCalled();
    });

    it('should continue processing if a callback throws', async () => {
      const failingCallback = jest.fn().mockRejectedValue(new Error('callback error'));
      const successCallback = jest.fn();

      handler.on(ESignatureEventType.DOCUMENT_COMPLETED, failingCallback);
      handler.on(ESignatureEventType.DOCUMENT_COMPLETED, successCallback);

      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_COMPLETED, evt('document.completed'));

      expect(event).not.toBeNull();
      expect(failingCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ───────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle DB not finding the document gracefully', async () => {
      prisma.esignatureDocument.findFirst.mockResolvedValue(null);

      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_SIGNER_SIGNED, evt('signer.signed'));

      expect(event).not.toBeNull();
      expect(prisma.esignatureRecipient.updateMany).not.toHaveBeenCalled();
    });

    it('should handle document updateMany returning 0 matches gracefully', async () => {
      prisma.esignatureDocument.updateMany.mockResolvedValue({ count: 0 });

      const event = await handler.handleWebhook('agilsign', TENANT_ID, WEBHOOK_DOCUMENT_COMPLETED, evt('document.completed'));

      expect(event).not.toBeNull();
    });

    it('should handle unrecognized webhook event type', async () => {
      // Header de evento presente pero sin mapeo conocido → normaliza a null.
      const event = await handler.handleWebhook(
        'agilsign',
        TENANT_ID,
        { documentId: DOC_ID },
        evt('template.created')
      );

      expect(event).toBeNull();
    });
  });
});
