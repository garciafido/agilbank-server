/**
 * Email Verification Expiration Scheduler
 *
 * Finds PENDING email verifications past their expiresAt and marks them EXPIRED.
 * Publishes SSE events to notify tenant users.
 * Called periodically by the worker's internal scheduler.
 */

import { PrismaClient } from '../../prisma/generated-client/client';
import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import type Redis from 'ioredis';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 3))}@${domain}`;
}

/**
 * Check for expired email verifications and mark them.
 * Returns the number of records expired.
 */
export async function runEmailVerificationExpirationCheck(
  prisma: PrismaClient,
  logger: Logger,
  redis: Redis
): Promise<number> {
  // Módulo opcional: si el proyecto no declara la entidad, el modelo no
  // existe en el cliente prisma y este tick es un no-op.
  if (!(prisma as any).emailVerification) return 0;
  try {
    const now = new Date();

    const expired = await prisma.emailVerification.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        email: true,
        tenant_id_: true,
      },
    });

    if (expired.length === 0) {
      logger.debug('[EmailVerificationExpiration] No expired records found');
      return 0;
    }

    logger.info({ count: expired.length }, '[EmailVerificationExpiration] Found expired verifications');

    for (const record of expired) {
      await prisma.emailVerification.update({
        where: { id: record.id },
        data: {
          status: 'expired',
          version_: randomUUID(),
          lastUpdatedAt_: now,
        },
      });

      try {
        await redis.publish('sse:events', JSON.stringify({
          type: 'emailVerification.expired',
          tenantId: record.tenant_id_,
          payload: {
            email: maskEmail(record.email),
            expiredAt: now.toISOString(),
          },
        }));
      } catch (sseError) {
        logger.warn({ err: sseError, verificationId: record.id }, '[EmailVerificationExpiration] Failed to publish SSE');
      }
    }

    logger.info({ count: expired.length }, '[EmailVerificationExpiration] Completed expiration check');
    return expired.length;
  } catch (error) {
    logger.error({ error }, '[EmailVerificationExpiration] Error during expiration check');
    throw error;
  }
}
