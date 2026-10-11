/**
 * Token Reset Scheduler
 *
 * Checks if any tenants need their monthly token counters reset.
 * Called periodically by the worker's internal scheduler.
 *
 * Logic:
 * - Runs every hour (from worker)
 * - Checks if today's date matches any tenant's tokenLimitResetDay
 * - Resets currentMonthTokens to 0 for matching tenants
 * - Handles edge cases (reset day > days in month)
 * - Prevents double-reset by checking lastTokenResetDate
 */

import { Prisma, PrismaClient } from '../../prisma/generated-client/client';
import { randomUUID } from 'crypto';
import type { Logger } from 'pino';

interface ResetResult {
  tenantId: string;
  tenantName: string;
  previousTokens: number;
  resetDay: number;
}

/**
 * Run the token reset check
 * Called by the worker scheduler every hour
 */
export async function runTokenResetCheck(
  prisma: PrismaClient,
  logger: Logger
): Promise<ResetResult[]> {
  // Módulo opcional: los cupos de tokens existen solo si el Tenant del proyecto
  // declara sus campos. Sin ellos la consulta falla y corta el resto del tick.
  if (!('tokenLimitResetDay' in Prisma.TenantScalarFieldEnum)) return [];
  const today = new Date();
  const currentDay = today.getDate();
  const currentHour = today.getHours();

  // Only run the actual reset logic once per day (between 00:00 and 01:00)
  // Other hours just log that we're skipping
  if (currentHour !== 0) {
    logger.debug({ currentHour }, '[TokenReset] Skipping - not reset hour (runs at 00:xx)');
    return [];
  }

  logger.info({ currentDay }, '[TokenReset] Running token reset check');

  try {
    // Find all tenants whose reset day matches today
    // Also handle reset days > 28 on short months
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isLastDayOfMonth = currentDay === lastDayOfMonth;

    const whereConditions: any[] = [
      { tokenLimitResetDay: currentDay },
    ];

    // Handle reset days > last day of month (e.g., day 31 on Feb 28)
    if (isLastDayOfMonth) {
      whereConditions.push({ tokenLimitResetDay: { gt: lastDayOfMonth } });
    }

    const tenantsToReset = await prisma.tenant.findMany({
      where: {
        OR: whereConditions,
        // Only reset if there are tokens to reset
        currentMonthTokens: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        currentMonthTokens: true,
        tokenLimitResetDay: true,
        lastTokenResetDate: true,
      },
    });

    if (tenantsToReset.length === 0) {
      logger.debug('[TokenReset] No tenants need reset today');
      return [];
    }

    logger.info({ count: tenantsToReset.length }, '[TokenReset] Found tenants to reset');

    const results: ResetResult[] = [];

    for (const tenant of tenantsToReset) {
      // Check if already reset today (prevent double reset)
      if (tenant.lastTokenResetDate) {
        const lastReset = new Date(tenant.lastTokenResetDate);
        if (
          lastReset.getFullYear() === today.getFullYear() &&
          lastReset.getMonth() === today.getMonth() &&
          lastReset.getDate() === today.getDate()
        ) {
          logger.debug(
            { tenantId: tenant.id, tenantName: tenant.name },
            '[TokenReset] Tenant already reset today, skipping'
          );
          continue;
        }
      }

      // Reset the token counter
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          currentMonthTokens: 0,
          lastTokenResetDate: today,
          version_: randomUUID(),
          lastUpdatedAt_: today,
        },
      });

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        previousTokens: tenant.currentMonthTokens,
        resetDay: tenant.tokenLimitResetDay,
      });

      logger.info(
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          previousTokens: tenant.currentMonthTokens,
          resetDay: tenant.tokenLimitResetDay,
        },
        '[TokenReset] Reset tenant token counter'
      );
    }

    if (results.length > 0) {
      logger.info(
        { resetCount: results.length },
        '[TokenReset] Completed token reset'
      );
    }

    return results;
  } catch (error) {
    logger.error({ error }, '[TokenReset] Error during token reset check');
    throw error;
  }
}
