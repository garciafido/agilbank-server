/**
 * "Snapshot efectivo": capa de correcciones persistentes (SnapshotOverride)
 * sobre el data_ congelado de una entidad snapshot, SIN modificarlo jamás.
 *
 * Uso (en los prepare de trámites externos):
 *   const data = await getEffectiveData(prisma, "SignedEdition", id, signedEdition.data_);
 *   // armar el payload del trámite desde `data` (no desde data_ crudo)
 *
 * Semántica:
 * - Cada override es {path, value} aplicado con set-by-path en orden createdAt_ asc.
 * - El set CREA claves inexistentes (incl. intermedias) y AGREGA elementos de
 *   array por índice — sirve tanto para corregir como para agregar datos.
 * - Solo overrides `active` (desactivar preserva el historial/auditoría).
 * - LÍMITE: un dato que el código del trámite jamás mapea (el prepare no lo lee)
 *   no es salvable por overlay — eso es cambio de código por definición.
 *
 * Cost-zero sin overrides: una consulta indexada que devuelve vacío.
 */

/** Token de path: clave de objeto o índice de array (`a.b[2].c`). */
function parsePath(path: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  for (const part of path.split('.')) {
    const m = /^([^\[\]]+)((\[\d+\])*)$/.exec(part.trim());
    if (!m) throw new Error(`Invalid override path segment: "${part}" in "${path}"`);
    tokens.push(m[1]);
    const indexes = m[2].match(/\d+/g) ?? [];
    for (const idx of indexes) tokens.push(parseInt(idx, 10));
  }
  return tokens;
}

/**
 * Setea `value` en `path` sobre `obj` (mutando), creando claves/contenedores
 * inexistentes: el siguiente token decide si el contenedor faltante es {} o [].
 */
export function setByPath(obj: any, path: string, value: unknown): void {
  const tokens = parsePath(path);
  let current = obj;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const nextIsIndex = typeof tokens[i + 1] === 'number';
    if (current[key] == null) {
      current[key] = nextIsIndex ? [] : {};
    }
    current = current[key];
  }
  current[tokens[tokens.length - 1]] = value;
}

export interface SnapshotOverrideEntry {
  path: string;
  value: unknown;
}

/** Aplica una lista ordenada de overrides sobre un clon profundo de `data`. */
export function applyOverrides<T>(data: T, overrides: SnapshotOverrideEntry[]): T {
  if (!overrides.length) return data;
  const effective = JSON.parse(JSON.stringify(data));
  for (const o of overrides) {
    setByPath(effective, o.path, o.value);
  }
  return effective;
}

/**
 * Lee los SnapshotOverride activos de la entidad y devuelve el data EFECTIVO
 * (clon corregido). `data_` nunca se modifica. Los paths inválidos se saltean
 * con warning (un override roto no debe frenar el trámite entero).
 */
export async function getEffectiveData<T>(
  prisma: any,
  relatedEntityType: string,
  relatedEntityId: string,
  data: T,
  logger?: { warn: (o: object, msg: string) => void }
): Promise<T> {
  const rows = await prisma.snapshotOverride.findMany({
    where: { relatedEntityType, relatedEntityId, active: true },
    orderBy: { createdAt_: 'asc' },
    select: { id: true, path: true, value: true },
  });
  if (rows.length === 0) return data;

  const effective = JSON.parse(JSON.stringify(data));
  for (const row of rows) {
    try {
      setByPath(effective, row.path, row.value);
    } catch (e) {
      logger?.warn(
        { overrideId: row.id, path: row.path, error: e instanceof Error ? e.message : e },
        'SnapshotOverride con path inválido — salteado'
      );
    }
  }
  return effective;
}
