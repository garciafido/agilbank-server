/**
 * Bridge in-process → Redis pub/sub para mutaciones de entidades.
 *
 * Escucha el eventBus in-process (via `subscribeToAllEvents`), filtra
 * por `ENTITY_ALLOW_LIST` y republica al canal Redis configurado en
 * `ENTITY_MUTATIONS_CHANNEL`. Esto permite que procesos distintos
 * (worker, réplicas del api) consuman los eventos para invalidación de
 * cache, SSE, reindex, etc.
 *
 * Diseñado para ser inerte cuando no se usa:
 * - Si `isEventBusActive()` es false, `start()` retorna sin registrar
 *   listener ni tocar Redis.
 * - El listener registrado hace un check O(1) contra el Set; si el
 *   `modelName` no está en la allow-list, retorna inmediatamente.
 * - Errores de Redis se loguean pero no se propagan — una mutación
 *   nunca falla por una publicación rota.
 */

import {
  publishEvent,
  subscribeToAllEvents,
  unsubscribeFromAllEvents,
  type EventListener,
  type EventPayload,
  type PrismaAction,
} from "../../common/services/eventBus";
import { redis } from "../redis/redisClient";
import {
  ENTITY_ALLOW_LIST,
  PARENT_CHAIN_MAP,
  isEventBusActive,
} from "./entityMutationsConfig";
import {
  ENTITY_MUTATIONS_CHANNEL,
  type EntityMutationEvent,
  type EntityMutationOperation,
} from "./entityMutationsTypes";

// Reexports para tests/observabilidad
export { ENTITY_ALLOW_LIST, PARENT_CHAIN_MAP, ENTITY_MUTATIONS_CHANNEL };

let registeredListener: EventListener<any> | null = null;

/**
 * Inicia el bridge si la allow-list no está vacía. Idempotente.
 */
export function startEntityMutationsBridge(): void {
  if (registeredListener) {
    return;
  }
  if (!isEventBusActive()) {
    console.log(
      "[EntityMutationsBridge] inactive (allow-list empty) — no in-process subscription registered"
    );
    return;
  }

  registeredListener = bridgeListener;
  subscribeToAllEvents(registeredListener);
  console.log(
    `[EntityMutationsBridge] active — listening for ${ENTITY_ALLOW_LIST.size} entity types, republishing to "${ENTITY_MUTATIONS_CHANNEL}"`
  );
}

/**
 * Detiene el bridge (usado en graceful shutdown).
 */
export function stopEntityMutationsBridge(): void {
  if (!registeredListener) return;
  unsubscribeFromAllEvents(registeredListener);
  registeredListener = null;
  console.log("[EntityMutationsBridge] stopped");
}

const bridgeListener: EventListener<any> = async (payload: EventPayload) => {
  if (!ENTITY_ALLOW_LIST.has(payload.modelName)) {
    return;
  }

  const event = buildRedisEvent(payload);
  try {
    await redis.publish(ENTITY_MUTATIONS_CHANNEL, JSON.stringify(event));
  } catch (error) {
    // Fire-and-forget desde la perspectiva de la mutación. Loggear
    // pero NO propagar — una mutación nunca debe fallar porque Redis
    // pub/sub está caído.
    console.error(
      `[EntityMutationsBridge] failed to publish ${event.entityType}.${event.operation}:`,
      error
    );
  }
};

function buildRedisEvent(payload: EventPayload): EntityMutationEvent {
  const ancestorTypes = PARENT_CHAIN_MAP[payload.modelName] ?? [];
  const parentChain =
    ancestorTypes.length > 0
      ? ancestorTypes.map((entityType) => ({ entityType, ids: [] }))
      : undefined;

  return {
    entityType: payload.modelName,
    operation: mapAction(payload.action),
    tenantId: payload.tenantId ?? null,
    ids: [String(payload.entityId)],
    parentChain,
    timestamp: payload.timestamp.getTime(),
  };
}

function mapAction(action: PrismaAction): EntityMutationOperation {
  return action;
}

/**
 * Test-only helper: publica un evento sintético en el bus in-process
 * tal como lo haría SecurePrismaOps, para verificar que el bridge
 * reemite al canal Redis. No usar en código de producción.
 */
export async function _testPublishSynthetic(args: {
  modelName: string;
  action: PrismaAction;
  tenantId?: string | null;
  entityId: string | number;
}): Promise<void> {
  await publishEvent(args.modelName, args.action, {
    tenantId: args.tenantId ?? null,
    entityId: args.entityId,
  });
}
