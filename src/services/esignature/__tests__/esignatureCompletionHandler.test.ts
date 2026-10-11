import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PDFDocument } from 'pdf-lib';
import { ESignatureEventHandler } from '../EsignatureEventHandler';
import { registerCompletionHandler } from '../esignatureCompletionHandler';
import {
  ESignatureProviderCode,
  ESignatureEventType,
} from '../types';
import { MOCK_CREDENTIALS } from './agilsign.fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Mock providers module
// ─────────────────────────────────────────────────────────────────────────────

const mockDownloadDocument = jest.fn();
const mockDownloadAuditLog = jest.fn();
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
      update: jest.fn().mockResolvedValue({}),
    },
    esignatureRecipient: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createTestPdf(pageCount = 1): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdf.addPage();
  }
  return Buffer.from(await pdf.save());
}

const TENANT_ID = 'tenant-001';

function makeCompletedEvent() {
  return {
    type: ESignatureEventType.DOCUMENT_COMPLETED,
    documentId: '50',
    provider: ESignatureProviderCode.AGILSIGN,
    recipientEmail: 'autor@ejemplo.com',
    timestamp: new Date('2026-02-26T22:10:00Z'),
  };
}

// El flujo activo usa USE_PROVIDER_BUNDLE=true: el proveedor devuelve un único PDF
// bundle (firmado + audit + blockchain). La rama ZIP legacy quedó retirada y sus
// tests se eliminaron (testeaban código muerto).
describe('esignatureCompletionHandler (generic, provider bundle)', () => {
  let handler: ESignatureEventHandler;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    handler = new ESignatureEventHandler(prisma);

    mockResolveConfig.mockResolvedValue({
      providerCode: ESignatureProviderCode.AGILSIGN,
      credentials: MOCK_CREDENTIALS,
      sandboxMode: false,
      tenantId: TENANT_ID,
    });

    mockCreateProvider.mockReturnValue({
      providerCode: ESignatureProviderCode.AGILSIGN,
      downloadDocument: mockDownloadDocument,
      downloadAuditLog: mockDownloadAuditLog,
    });

    registerCompletionHandler(handler, prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should download signed PDF on DOCUMENT_COMPLETED', async () => {
    const signedPdf = await createTestPdf(1);
    mockDownloadDocument.mockResolvedValue({ buffer: signedPdf, includesAuditTrail: false });
    mockDownloadAuditLog.mockResolvedValue(null);

    const event = makeCompletedEvent();
    const callbacks = (handler as any).callbacks.get(ESignatureEventType.DOCUMENT_COMPLETED) || [];
    for (const cb of callbacks) {
      await cb(event, TENANT_ID);
    }

    expect(mockDownloadDocument).toHaveBeenCalledWith('50');
  });

  it('should store the provider bundle as the signed archive', async () => {
    const signedPdf = await createTestPdf(1);
    mockDownloadDocument.mockResolvedValue({ buffer: signedPdf, includesAuditTrail: true });

    const event = makeCompletedEvent();
    const callbacks = (handler as any).callbacks.get(ESignatureEventType.DOCUMENT_COMPLETED) || [];
    for (const cb of callbacks) {
      await cb(event, TENANT_ID);
    }

    const updateCall = prisma.esignatureDocument.updateMany.mock.calls.find(
      (call: any[]) => call[0]?.data?.metadata?.signedArchiveBase64
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].data.metadata.signedArchiveFormat).toBe('pdf');
  });

  it('should skip audit log download when bundle already includes it', async () => {
    const signedPdf = await createTestPdf(2);
    mockDownloadDocument.mockResolvedValue({ buffer: signedPdf, includesAuditTrail: true });

    const event = makeCompletedEvent();
    const callbacks = (handler as any).callbacks.get(ESignatureEventType.DOCUMENT_COMPLETED) || [];
    for (const cb of callbacks) {
      await cb(event, TENANT_ID);
    }

    expect(mockDownloadAuditLog).not.toHaveBeenCalled();
  });

  it('should handle download failure gracefully (logs error, no crash)', async () => {
    mockDownloadDocument.mockRejectedValue(new Error('Network error'));

    const event = makeCompletedEvent();
    const callbacks = (handler as any).callbacks.get(ESignatureEventType.DOCUMENT_COMPLETED) || [];

    for (const cb of callbacks) {
      await cb(event, TENANT_ID);
    }

    const metadataCall = prisma.esignatureDocument.updateMany.mock.calls.find(
      (call: any[]) => call[0]?.data?.metadata?.signedArchiveBase64
    );
    expect(metadataCall).toBeUndefined();
  });
});
