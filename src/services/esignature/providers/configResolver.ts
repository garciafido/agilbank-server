/**
 * E-Signature Config Resolver
 *
 * Resolves and decrypts the e-signature provider configuration. The config is
 * global (shared across tenants, SysAdmin-administered): there is a single row
 * per provider, not one per tenant.
 */

import { PrismaClient } from '../../../prisma/generated-client/client';
import { CredentialsEncryptionService } from '../../encryption/CredentialsEncryptionService';
import { ESignatureConfigResolved, ESignatureProviderCode } from '../types';
import { logger } from '../../../utils/logger';

/**
 * Resolve the global e-signature configuration.
 * Decrypts credentials using the CredentialsEncryptionService.
 */
export async function resolveESignatureConfig(
  prisma: PrismaClient
): Promise<ESignatureConfigResolved | null> {
  const config = await prisma.esignatureConfig.findFirst({
    where: {
      enabled: true,
    },
  });

  if (!config) {
    logger.debug('No e-signature config found');
    return null;
  }

  // Validate provider code
  const providerCode = config.provider as ESignatureProviderCode;
  if (!Object.values(ESignatureProviderCode).includes(providerCode)) {
    logger.warn(
      { provider: config.provider },
      'Unknown e-signature provider configured'
    );
    return null;
  }

  // Decrypt credentials
  let credentials: Record<string, string>;
  try {
    const encryption = CredentialsEncryptionService.getInstance();

    if (
      !config.credentials_encrypted ||
      !config.credentials_iv ||
      !config.credentials_tag
    ) {
      logger.warn('E-signature credentials not properly encrypted');
      return null;
    }

    credentials = encryption.decryptJson<Record<string, string>>(
      config.credentials_encrypted,
      config.credentials_iv,
      config.credentials_tag
    );
  } catch (error) {
    logger.error(
      { error },
      'Failed to decrypt e-signature credentials'
    );
    return null;
  }

  // Decrypt webhook secret if present
  let webhookSecret: string | undefined;
  let webhookSecretInvalid = false;
  try {
    if (
      config.webhookSecret_encrypted &&
      config.webhookSecret_iv &&
      config.webhookSecret_tag
    ) {
      const encryption = CredentialsEncryptionService.getInstance();
      webhookSecret = encryption.decrypt(
        config.webhookSecret_encrypted,
        config.webhookSecret_iv,
        config.webhookSecret_tag
      );
    }
  } catch (error) {
    // FAIL-CLOSED: hay un secret configurado pero no se puede desencriptar
    // (ej. rotación de la master key). Continuar "sin secret" degradaría a
    // verificación de firma DESHABILITADA en silencio — bypass de auth del
    // webhook. El flag hace que el handler rechace con 401 hasta arreglarlo.
    webhookSecretInvalid = true;
    logger.error(
      { error },
      'Failed to decrypt webhook secret — webhook verification will REJECT (fail-closed) until fixed'
    );
  }

  return {
    providerCode,
    credentials,
    sandboxMode: config.sandboxMode,
    webhookSecret,
    webhookSecretInvalid,
  };
}

/**
 * Get all configured (global) e-signature providers.
 */
export async function getConfiguredProviders(
  prisma: PrismaClient
): Promise<ESignatureProviderCode[]> {
  const configs = await prisma.esignatureConfig.findMany({
    where: {
      enabled: true,
    },
    select: {
      provider: true,
    },
  });

  return configs
    .map((c) => c.provider as ESignatureProviderCode)
    .filter((p) => Object.values(ESignatureProviderCode).includes(p));
}
