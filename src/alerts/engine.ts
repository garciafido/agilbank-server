/**
 * Motor de alertas: barrido programado. Recorre las AlertRule habilitadas de TODOS
 * los tenants (basePrisma, sin filtro de tenant), resuelve el evaluador del registry,
 * respeta la cadencia, evalúa, y por cada (trigger × suscriptor) crea una notificación
 * deduplicada. Lo invoca workers/schedulers/alertSweepScheduler.ts cada ~1h.
 *
 * Inerte si no hay reglas o no hay evaluadores registrados (opt-in, cost-zero).
 */

import { PrismaClient } from "../prisma/generated-client/client";
import type Redis from "ioredis";
import type { Logger } from "pino";
import { alertRegistry } from "./registry";
import { validateAlertParams } from "./validateParams";
import { createAlertNotification } from "./createAlertNotification";

const CADENCE_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

export async function runAlertSweep(
  prisma: PrismaClient,
  logger: Logger,
  redis: Redis
): Promise<number> {
  if (alertRegistry.ids().length === 0) return 0; // ningún tipo registrado → no-op

  const rules = await prisma.alertRule.findMany({
    where: { enabled: true },
    select: { id: true, tenant_id_: true, alertType: true, params: true, lastEvaluatedAt: true },
  });
  if (rules.length === 0) return 0;

  const now = new Date();
  let createdCount = 0;

  for (const rule of rules) {
    try {
      const def = alertRegistry.get(rule.alertType);
      if (!def) {
        logger.warn({ alertType: rule.alertType, ruleId: rule.id }, "[alerts] Tipo no registrado, regla ignorada");
        continue;
      }

      // Cadencia: saltear si no pasó el intervalo desde la última evaluación.
      const intervalMs = CADENCE_MS[def.cadence] ?? CADENCE_MS.daily;
      if (rule.lastEvaluatedAt && now.getTime() - new Date(rule.lastEvaluatedAt).getTime() < intervalMs) {
        continue;
      }

      const validation = validateAlertParams(def.params, rule.params);
      if (!validation.ok) {
        logger.warn({ ruleId: rule.id, errors: validation.errors }, "[alerts] Params inválidos, regla ignorada");
        continue;
      }

      const tenantId = rule.tenant_id_;
      if (!tenantId) continue;

      const triggers = await def.evaluate({ prisma, tenantId, logger }, validation.value);

      // Marcar evaluada aunque no dispare (respeta cadencia en la próxima corrida).
      await prisma.alertRule.update({ where: { id: rule.id }, data: { lastEvaluatedAt: now } });

      if (triggers.length === 0) continue;

      const subs = await prisma.alertSubscription.findMany({
        where: { alertRule_id: rule.id, tenant_id_: tenantId, enabled: true },
        select: { createdBy_id_: true },
      });
      const userIds = Array.from(new Set(subs.map((s) => s.createdBy_id_).filter(Boolean))) as string[];
      if (userIds.length === 0) continue;

      for (const trigger of triggers) {
        for (const userId of userIds) {
          const dedupKey = `${rule.alertType}:${trigger.dedupKey}:${userId}`;
          const existing = await prisma.userNotification.findFirst({
            where: {
              createdBy_id_: userId,
              tenant_id_: tenantId,
              type: "alert",
              archivedAt: null,
              metadata: { path: ["alertDedupKey"], equals: dedupKey } as any,
            },
            select: { id: true },
          });
          if (existing) continue;

          await createAlertNotification(
            prisma,
            redis,
            {
              userId,
              tenantId,
              title: trigger.title,
              body: trigger.body,
              priority: trigger.priority,
              objectType: trigger.objectType,
              objectId: trigger.objectId,
              actionUrl: trigger.actionUrl,
              dedupKey,
              metadata: trigger.metadata,
            },
            logger
          );
          createdCount++;
        }
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, "[alerts] Error evaluando regla (continúa con las demás)");
    }
  }

  if (createdCount > 0) logger.info({ createdCount }, "[alerts] Notificaciones de alerta creadas");
  return createdCount;
}
