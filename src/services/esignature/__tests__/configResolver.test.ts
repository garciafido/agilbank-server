import { describe, it, expect, beforeEach } from '@jest/globals';
import { resolveESignatureConfig, getConfiguredProviders } from '../providers/configResolver';
import { ESignatureProviderCode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock CredentialsEncryptionService
// ─────────────────────────────────────────────────────────────────────────────

const mockDecryptJson = jest.fn();
const mockDecrypt = jest.fn();

jest.mock('../../../services/encryption/CredentialsEncryptionService', () => ({
  CredentialsEncryptionService: {
    getInstance: () => ({
      decryptJson: mockDecryptJson,
      decrypt: mockDecrypt,
    }),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock logger
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock Prisma
// ─────────────────────────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    esignatureConfig: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

function makeDbConfig(overrides: Record<string, any> = {}) {
  return {
    id: 'config-001',
    provider: 'agilsign',
    sandboxMode: false,
    enabled: true,
    credentials_encrypted: 'enc-creds-base64',
    credentials_iv: 'iv-base64',
    credentials_tag: 'tag-base64',
    webhookSecret_encrypted: null,
    webhookSecret_iv: null,
    webhookSecret_tag: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveESignatureConfig', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    mockDecryptJson.mockReset();
    mockDecrypt.mockReset();
  });

  // ── Happy path ──

  it('should resolve config with decrypted credentials', async () => {
    const decryptedCreds = { apiKey: 'real-key', baseUrl: 'https://agilsign.example.com' };
    prisma.esignatureConfig.findFirst.mockResolvedValue(makeDbConfig());
    mockDecryptJson.mockReturnValue(decryptedCreds);

    const result = await resolveESignatureConfig(prisma);

    expect(result).toEqual({
      providerCode: ESignatureProviderCode.AGILSIGN,
      credentials: decryptedCreds,
      sandboxMode: false,
      webhookSecret: undefined,
    });
  });

  it('should query by enabled: true (global, no tenant filter)', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(null);

    await resolveESignatureConfig(prisma);

    expect(prisma.esignatureConfig.findFirst).toHaveBeenCalledWith({
      where: {
        enabled: true,
      },
    });
  });

  it('should pass encrypted fields to decryptJson', async () => {
    const dbConfig = makeDbConfig({
      credentials_encrypted: 'my-enc',
      credentials_iv: 'my-iv',
      credentials_tag: 'my-tag',
    });
    prisma.esignatureConfig.findFirst.mockResolvedValue(dbConfig);
    mockDecryptJson.mockReturnValue({ apiKey: 'k' });

    await resolveESignatureConfig(prisma);

    expect(mockDecryptJson).toHaveBeenCalledWith('my-enc', 'my-iv', 'my-tag');
  });

  it('should decrypt webhook secret when present', async () => {
    const dbConfig = makeDbConfig({
      webhookSecret_encrypted: 'ws-enc',
      webhookSecret_iv: 'ws-iv',
      webhookSecret_tag: 'ws-tag',
    });
    prisma.esignatureConfig.findFirst.mockResolvedValue(dbConfig);
    mockDecryptJson.mockReturnValue({ apiKey: 'k' });
    mockDecrypt.mockReturnValue('my-webhook-secret');

    const result = await resolveESignatureConfig(prisma);

    expect(mockDecrypt).toHaveBeenCalledWith('ws-enc', 'ws-iv', 'ws-tag');
    expect(result!.webhookSecret).toBe('my-webhook-secret');
  });

  it('should pass sandboxMode through', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(makeDbConfig({ sandboxMode: true }));
    mockDecryptJson.mockReturnValue({ apiKey: 'k' });

    const result = await resolveESignatureConfig(prisma);

    expect(result!.sandboxMode).toBe(true);
  });

  // ── No config found ──

  it('should return null when no config exists for tenant', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(null);

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
  });

  // ── Invalid provider ──

  it('should return null for unknown provider code', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(makeDbConfig({ provider: 'unknown_provider' }));

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
    expect(mockDecryptJson).not.toHaveBeenCalled();
  });

  // ── Missing encrypted fields ──

  it('should return null when credentials_encrypted is missing', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(
      makeDbConfig({ credentials_encrypted: null })
    );

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
    expect(mockDecryptJson).not.toHaveBeenCalled();
  });

  it('should return null when credentials_iv is missing', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(
      makeDbConfig({ credentials_iv: null })
    );

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
  });

  it('should return null when credentials_tag is missing', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(
      makeDbConfig({ credentials_tag: null })
    );

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
  });

  // ── Decryption failures ──

  it('should return null when credential decryption fails', async () => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(makeDbConfig());
    mockDecryptJson.mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    const result = await resolveESignatureConfig(prisma);

    expect(result).toBeNull();
  });

  it('should still return config when webhook secret decryption fails', async () => {
    const dbConfig = makeDbConfig({
      webhookSecret_encrypted: 'ws-enc',
      webhookSecret_iv: 'ws-iv',
      webhookSecret_tag: 'ws-tag',
    });
    prisma.esignatureConfig.findFirst.mockResolvedValue(dbConfig);
    mockDecryptJson.mockReturnValue({ apiKey: 'k' });
    mockDecrypt.mockImplementation(() => {
      throw new Error('Webhook decrypt failed');
    });

    const result = await resolveESignatureConfig(prisma);

    expect(result).not.toBeNull();
    expect(result!.webhookSecret).toBeUndefined();
    expect(result!.credentials).toEqual({ apiKey: 'k' });
  });

  // ── All valid providers ──

  it.each([
    ['agilsign', ESignatureProviderCode.AGILSIGN],
    ['docusign', ESignatureProviderCode.DOCUSIGN],
    ['pandadoc', ESignatureProviderCode.PANDADOC],
    ['signnow', ESignatureProviderCode.SIGNNOW],
  ])('should accept provider "%s"', async (providerValue, expectedCode) => {
    prisma.esignatureConfig.findFirst.mockResolvedValue(makeDbConfig({ provider: providerValue }));
    mockDecryptJson.mockReturnValue({ apiKey: 'k' });

    const result = await resolveESignatureConfig(prisma);

    expect(result!.providerCode).toBe(expectedCode);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getConfiguredProviders
// ─────────────────────────────────────────────────────────────────────────────

describe('getConfiguredProviders', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('should return provider codes for enabled configs', async () => {
    prisma.esignatureConfig.findMany.mockResolvedValue([
      { provider: 'agilsign' },
      { provider: 'docusign' },
    ]);

    const result = await getConfiguredProviders(prisma);

    expect(result).toEqual([ESignatureProviderCode.AGILSIGN, ESignatureProviderCode.DOCUSIGN]);
  });

  it('should query by enabled: true (global, no tenant filter)', async () => {
    prisma.esignatureConfig.findMany.mockResolvedValue([]);

    await getConfiguredProviders(prisma);

    expect(prisma.esignatureConfig.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
      },
      select: {
        provider: true,
      },
    });
  });

  it('should filter out unknown provider codes', async () => {
    prisma.esignatureConfig.findMany.mockResolvedValue([
      { provider: 'agilsign' },
      { provider: 'unknown_provider' },
      { provider: 'pandadoc' },
    ]);

    const result = await getConfiguredProviders(prisma);

    expect(result).toEqual([ESignatureProviderCode.AGILSIGN, ESignatureProviderCode.PANDADOC]);
  });

  it('should return empty array when no configs exist', async () => {
    prisma.esignatureConfig.findMany.mockResolvedValue([]);

    const result = await getConfiguredProviders(prisma);

    expect(result).toEqual([]);
  });
});
