#!/usr/bin/env npx ts-node
/**
 * Token Reset Cron Script (OPTIONAL)
 *
 * NOTE: If the worker is running, this is NOT needed.
 * The worker has a built-in scheduler that handles token resets automatically.
 *
 * This script is provided as an alternative for environments where:
 * - The worker is not running
 * - You prefer external cron scheduling
 *
 * Recommended cron entry (runs at 00:05 every day):
 *   5 0 * * * cd /path/to/project && npx ts-node scripts/token-reset-cron.ts
 *
 * Or via npm script:
 *   5 0 * * * cd /path/to/project && npm run cron:token-reset
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/prisma/generated-client/client';
import { randomUUID } from 'crypto';

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface ResetResult {
  tenantId: string;
  tenantName: string;
  previousTokens: number;
  resetDay: number;
}

async function resetTokenCounters(): Promise<void> {
  const today = new Date();
  const currentDay = today.getDate();

  console.log(`[Token Reset] Starting token reset check for day ${currentDay}`);
  console.log(`[Token Reset] Current date: ${today.toISOString()}`);

  try {
    // Find all tenants whose reset day matches today
    // Also include tenants with reset day > 28 on last days of short months
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isLastDayOfMonth = currentDay === lastDayOfMonth;

    const tenantsToReset = await prisma.tenant.findMany({
      where: {
        OR: [
          // Exact match on reset day
          { tokenLimitResetDay: currentDay },
          // Handle reset days > 28 on short months (e.g., reset day 31 should trigger on Feb 28)
          ...(isLastDayOfMonth
            ? [{ tokenLimitResetDay: { gt: lastDayOfMonth } }]
            : []),
        ],
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
      console.log(`[Token Reset] No tenants need token reset today`);
      return;
    }

    console.log(`[Token Reset] Found ${tenantsToReset.length} tenant(s) to reset`);

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
          console.log(
            `[Token Reset] Tenant "${tenant.name}" (${tenant.id}) already reset today, skipping`
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

      console.log(
        `[Token Reset] Reset tenant "${tenant.name}" (${tenant.id}): ${tenant.currentMonthTokens.toLocaleString()} tokens -> 0`
      );
    }

    // Summary
    console.log(`[Token Reset] Completed. Reset ${results.length} tenant(s)`);

    if (results.length > 0) {
      console.log(`[Token Reset] Summary:`);
      for (const r of results) {
        console.log(
          `  - ${r.tenantName}: ${r.previousTokens.toLocaleString()} tokens reset (day ${r.resetDay})`
        );
      }
    }
  } catch (error) {
    console.error(`[Token Reset] Error:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  resetTokenCounters()
    .then(() => {
      console.log(`[Token Reset] Script completed successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[Token Reset] Script failed:`, error);
      process.exit(1);
    });
}

export { resetTokenCounters };
