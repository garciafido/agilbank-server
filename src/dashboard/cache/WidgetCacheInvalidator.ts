/**
 * Subscriber del canal Redis `entity:mutations`. Para cada evento,
 * invalida las cache keys de los widgets cuyos `sourceEntities`
 * intersectan con la entidad mutada o sus ancestros (parentChain).
 *
 * Diseño:
 * - Subscribe se hace con la conexión dedicada `redisSubscriber` de
 *   `redisClient`. Los DELs van por la conexión `redis` (publisher) —
 *   las conexiones subscribed no permiten otros comandos.
 * - Para cada widget afectado, hace `SCAN MATCH dashboard:<tenant>:
 *   <widgetKey>:*` y DEL en batch. El bucket es chico (cuestión de
 *   pocas decenas de keys por widget+tenant), así que SCAN es
 *   barato.
 * - Errores de Redis se loguean y se siguen — preferimos perder una
 *   invalidación (cae al TTL backstop) antes que crashear el server.
 */

import { redis, redisSubscriber } from "../../services/redis/redisClient";
import { ENTITY_MUTATIONS_CHANNEL } from "../../services/eventBus/entityMutationsTypes";
import type { EntityMutationEvent } from "../../services/eventBus/entityMutationsTypes";
import { fetcherRegistry } from "../widgets/registry";
import type { FetcherDefinition } from "../types";

let started = false;
let messageHandler: ((channel: string, message: string) => void) | null = null;

/**
 * Snapshot de widgets cacheados, computado al start. Si el registro
 * cambiase en runtime (no es el caso hoy, los fetchers se registran al
 * boot), se podría regenerar invalidando este cache local.
 */
let cachedWidgets: FetcherDefinition[] = [];

export async function startWidgetCacheInvalidator(): Promise<void> {
  if (started) return;

  cachedWidgets = fetcherRegistry
    .list()
    .filter((def) => def.cacheMode === "invalidated");

  if (cachedWidgets.length === 0) {
    console.log(
      "[WidgetCacheInvalidator] no cached widgets registered — invalidator not started"
    );
    return;
  }

  messageHandler = (channel: string, message: string) => {
    if (channel !== ENTITY_MUTATIONS_CHANNEL) return;
    handleEvent(message).catch((error) => {
      console.error(
        "[WidgetCacheInvalidator] error handling mutation event:",
        error
      );
    });
  };

  redisSubscriber.on("message", messageHandler);
  await redisSubscriber.subscribe(ENTITY_MUTATIONS_CHANNEL);
  started = true;

  console.log(
    `[WidgetCacheInvalidator] active — watching ${cachedWidgets.length} cached widget(s) for "${ENTITY_MUTATIONS_CHANNEL}" events`
  );
}

export async function stopWidgetCacheInvalidator(): Promise<void> {
  if (!started) return;
  try {
    await redisSubscriber.unsubscribe(ENTITY_MUTATIONS_CHANNEL);
  } catch {
    // ignore — el cleanup global de Redis cierra la conexión igual
  }
  if (messageHandler) {
    redisSubscriber.off("message", messageHandler);
    messageHandler = null;
  }
  started = false;
  console.log("[WidgetCacheInvalidator] stopped");
}

async function handleEvent(rawMessage: string): Promise<void> {
  let event: EntityMutationEvent;
  try {
    event = JSON.parse(rawMessage);
  } catch {
    console.warn("[WidgetCacheInvalidator] failed to parse event:", rawMessage);
    return;
  }

  const affectedTypes = new Set<string>([event.entityType]);
  for (const parent of event.parentChain ?? []) {
    affectedTypes.add(parent.entityType);
  }

  const affectedWidgets = cachedWidgets.filter((w) =>
    (w.sourceEntities ?? []).some((src) => affectedTypes.has(src))
  );

  if (affectedWidgets.length === 0) return;

  let totalDeleted = 0;
  for (const widget of affectedWidgets) {
    totalDeleted += await invalidateWidgetKeys(widget.key, event.tenantId);
  }

  if (totalDeleted > 0) {
    console.log(
      `[WidgetCacheInvalidator] invalidated ${totalDeleted} key(s) for ${affectedWidgets.length} widget(s) on ${event.entityType}.${event.operation}`
    );
  }
}

async function invalidateWidgetKeys(
  widgetKey: string,
  tenantId: string | null
): Promise<number> {
  // Si el evento trae tenantId, scope la invalidación a ese tenant. Si
  // no (mutación system-level, rara), invalidamos cross-tenant.
  const pattern =
    tenantId === null
      ? `dashboard:*:${widgetKey}:*`
      : `dashboard:${tenantId}:${widgetKey}:*`;

  const keys = await scanKeys(pattern);
  if (keys.length === 0) return 0;

  try {
    return await redis.del(...keys);
  } catch (error) {
    console.error(
      `[WidgetCacheInvalidator] DEL failed for widget ${widgetKey}:`,
      error
    );
    return 0;
  }
}

async function scanKeys(pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = "0";
  // Loop SCAN. ioredis devuelve [nextCursor, keys].
  do {
    try {
      const [next, batch] = (await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        500
      )) as [string, string[]];
      cursor = next;
      for (const k of batch) found.push(k);
    } catch (error) {
      console.error(
        `[WidgetCacheInvalidator] SCAN failed for pattern ${pattern}:`,
        error
      );
      return found;
    }
  } while (cursor !== "0");
  return found;
}
