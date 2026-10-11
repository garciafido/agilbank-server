// Qué clave foránea frenó un borrado en la base, para la red de seguridad de
// PrismaError: si la verificación previa (common/services/deletionBlockers.ts)
// no lo vio venir, el rechazo de la base se informa igual como ENTITY_IN_USE,
// con la entidad raíz de la relación y sin nombres ni cantidades.
//
// Funciones puras: la tabla (FK_CONSTRAINT_TO_RELATION, generada desde el
// schema.prisma de cada proyecto) llega por parámetro.
//
// Con driver adapters, Postgres llega así:
// - RESTRICT (23001): P2039, con el nombre de la restricción solo en el mensaje.
// - NO ACTION (23503): P2003, con el nombre en cause.constraint.index.

import type { DeletionBlockerRelation } from "../services/deletionBlockers.generated";
import type { DeletionBlockers } from "../services/deletionBlockers";

type ForeignKeyTable = Record<string, { target: string; relations: DeletionBlockerRelation[] }>;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

const causeOf = (meta: unknown) => asRecord(asRecord(asRecord(meta)?.driverAdapterError)?.cause) ?? {};

/** El SQLSTATE de Postgres que trae el error de Prisma, si lo trae. */
export function sqlState(meta: unknown): string | undefined {
  const cause = causeOf(meta);
  const code = cause.originalCode ?? cause.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * La violación de clave foránea de un P2003 o un P2039, como motivos de borrado.
 * Undefined si la restricción no está en la tabla: entonces no se inventa nada.
 * `deletion`: el servicio que falló es un borrado.
 */
export function deletionBlockersFromForeignKey(meta: unknown, table: ForeignKeyTable, deletion = false): DeletionBlockers | undefined {
  const cause = causeOf(meta);
  const message = typeof cause.originalMessage === "string" ? cause.originalMessage : typeof cause.message === "string" ? cause.message : "";
  // El nombre: el que da el adapter, o el primero entre comillas del mensaje que
  // sea una clave foránea conocida ("..." en inglés, «...» con la base en castellano).
  const quoted = Array.from(message.matchAll(/["«]([^"«»]+)["»]/g), (m) => m[1]);
  const candidates = [asRecord(cause.constraint)?.index, ...quoted];
  const name = candidates.find((c): c is string => typeof c === "string" && Object.prototype.hasOwnProperty.call(table, c));
  if (!name) return undefined;
  const { target, relations } = table[name];
  const modelName = asRecord(meta)?.modelName;
  // 23001 (RESTRICT) solo lo produce un borrado. 23503 (P2003) es también el alta
  // o el cambio que apunta a un registro que ya no existe, y meta.modelName es el
  // modelo de la operación de arriba, no el de la fila que chocó: no sirve para
  // distinguirlos. Se traduce solo si quien llama dice que la operación es un borrado.
  if (sqlState(meta) !== "23001" && !deletion) return undefined;
  return {
    entity: typeof modelName === "string" ? modelName : target,
    // La base no dice el id de forma confiable (depende del idioma del servidor).
    id: "",
    blocked: true,
    // La base no dice qué fila frenó el borrado: si la restricción llega a más
    // de una raíz (una subentidad con dos padres), se nombran todas, una vez cada una.
    reasons: relations
      .filter((relation, i) => relations.findIndex((other) => other.rootEntity === relation.rootEntity) === i)
      .map((relation) => ({
        kind: relation.kind,
        rootEntity: relation.rootEntity,
        relations: [`${relation.model}.${relation.field}`],
        visible: null,
        hiddenInTenant: null,
        otherTenants: null,
      })),
  };
}
