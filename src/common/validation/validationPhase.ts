/**
 * Control de fase para los validators exportados por `customValidations.ts`.
 *
 * El loop de validators corre en create, update y delete. Por default un
 * validator corre en las TRES fases. Estos wrappers lo marcan para SALTEAR una
 * fase, de forma explícita en el punto de declaración:
 *
 *   export const validateX = skipOnCreate(async (args, ctx, tx) => { ... });
 *   export const validateY = skipOnDelete(async (args, ctx, tx) => { ... });
 *
 * El skip de create lo aplica el create-service generado; el de delete, el
 * delete-service generado (chequean la flag antes de invocar al validator).
 * El update siempre corre — si un validator no aplica al update, guardar dentro.
 */
export type CustomValidator = (
  args: any,
  context: any,
  txPrisma: any,
) => Promise<void>;

/** El validator NO corre en CREATE (solo update/delete). */
export function skipOnCreate<T extends CustomValidator>(fn: T): T {
  (fn as any).__skipOnCreate = true;
  return fn;
}

/** El validator NO corre en DELETE (solo create/update). */
export function skipOnDelete<T extends CustomValidator>(fn: T): T {
  (fn as any).__skipOnDelete = true;
  return fn;
}
