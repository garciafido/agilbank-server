/**
 * Auto-generado. NO editar a mano.
 * Configuración runtime del Redis bridge de mutaciones de entidades.
 */

/**
 * Entidades cuyas mutaciones se republican al canal Redis
 * `entity:mutations`. Derivado de las entidades con
 * `.publishesMutations` en el haiku.
 */
export const ENTITY_ALLOW_LIST: ReadonlySet<string> = new Set([]);

/**
 * Para cada subentidad, sus ancestros (más cercano primero, root al
 * final). El bridge adjunta esto al evento Redis como `parentChain`,
 * sin ids del padre (no podemos resolverlos sin una query extra y por
 * ahora no son necesarios para invalidación por entityType).
 */
export const PARENT_CHAIN_MAP: Readonly<Record<string, ReadonlyArray<string>>> =
  {};

export const isEventBusActive = (): boolean => ENTITY_ALLOW_LIST.size > 0;
