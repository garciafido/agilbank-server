/**
 * Forma del evento que publica el Redis bridge al canal `entity:mutations`.
 *
 * Es la versión cross-process del evento in-process del eventBus (que tiene
 * más campos: data, previousData, changedFields, context). Acá solo viajan
 * los campos mínimos necesarios para invalidación de cache y consumidores
 * cross-process en general — el payload pesado se queda in-process por
 * cuestiones de tamaño y privacidad.
 *
 * Versión congelada del schema: cualquier cambio implica considerar
 * compatibilidad con subscribers ya deployados.
 */

export const ENTITY_MUTATIONS_CHANNEL = "entity:mutations";

export type EntityMutationOperation =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "UPSERT_CREATE"
  | "UPSERT_UPDATE";

export interface EntityMutationEvent {
  entityType: string;
  operation: EntityMutationOperation;
  tenantId: string | null;
  ids: string[];
  /**
   * Cadena de ancestros para subentidades, ancestro inmediato primero,
   * root al final. Undefined si la entidad no es subentidad de nada.
   * Subscribers que invalidan por entidad raíz se fijan en esta lista
   * además de en `entityType`.
   */
  parentChain?: { entityType: string; ids: string[] }[];
  timestamp: number;
}
