/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Normalización del export de Matu (Tokens Studio) al dialecto canónico.
 *
 * El export apunta a una versión vieja del W3C Design Tokens y arrastra defectos
 * concretos. Acá cada defecto es UNA regla pura y nombrada — así el test puede
 * afirmar dos cosas por regla: que corrige el caso, y que no toca lo que no debe.
 * Son las funciones que entran a la lista de mutación de Stryker.
 *
 * Estas reglas operan a nivel de VALOR (una hoja por vez). El ensamblado de las
 * hojas en un `MatuThemeDoc` —que sabe de qué grupo viene cada token y por eso
 * puede retipar `dimension`→`number` donde corresponde— vive junto a `import.ts`,
 * que es quien conoce la estructura de colecciones.
 */

/** Una dimensión ya en forma DTCG 2025.10: objeto `{value, unit}`, no el string `"2px"`. */
export interface Dim {
  value: number;
  unit: "px" | "rem";
}

const DIM_RE = /^(-?\d*\.?\d+)(px|rem)$/;

/**
 * `"2px"` → `{value: 2, unit: "px"}`. El dialecto viejo de Matu escribe la
 * dimensión como string; DTCG 2025.10 la quiere como objeto. Un objeto que ya
 * viene en forma canónica pasa igual (idempotente).
 */
export function parseDimension(raw: string | Dim): Dim {
  if (typeof raw !== "string") {
    if (raw.unit !== "px" && raw.unit !== "rem") {
      throw new Error(
        `Unidad de dimensión inválida: "${raw.unit}". Se espera px o rem.`
      );
    }
    return { value: raw.value, unit: raw.unit };
  }
  const m = DIM_RE.exec(raw.trim());
  if (!m)
    throw new Error(
      `Dimensión inválida: "${raw}". Se espera un número seguido de px o rem.`
    );
  return { value: parseFloat(m[1]), unit: m[2] as "px" | "rem" };
}

/**
 * Opacidad de Matu en forma de porcentaje entero (`"25"`, `"80"`) → fracción
 * `0..1`. Matu la mistipa como `dimension`; DTCG la quiere `number` unitless.
 *
 * Heurística idempotente: un valor > 1 es porcentaje (se divide por 100); un
 * valor ≤ 1 ya es fracción y pasa igual. Así re-normalizar no vuelve a dividir.
 */
export function opacityToFraction(raw: string | number): number {
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (Number.isNaN(n)) throw new Error(`Opacidad inválida: "${raw}".`);
  const frac = n > 1 ? n / 100 : n;
  return frac < 0 ? 0 : frac > 1 ? 1 : frac;
}

/**
 * Line-height de Matu exportado en px (`"90px"`) → ratio unitless (`0.9`). Son
 * porcentajes disfrazados de px: `90px` significa 90 %. Un valor ya en ratio
 * (`1.4`, o el string `"1.4"`) pasa igual.
 */
export function lineHeightToRatio(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const trimmed = raw.trim();
  if (trimmed.endsWith("px")) return parseFloat(trimmed) / 100;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n)) throw new Error(`Line-height inválido: "${raw}".`);
  return n;
}

/**
 * Los `1_level`, `2__level`… son booleanos de andamiaje de Figma, no tokens.
 * Se detectan por nombre: dígitos, uno o más guiones bajos, y `level`.
 */
export function isNLevelKey(key: string): boolean {
  return /^\d+_+level$/i.test(key);
}

/**
 * Devuelve una copia del objeto sin las claves de andamiaje `N_level`. Shallow
 * a propósito: esas claves aparecen como hermanas de los roles dentro de una
 * capa de contraste, no anidadas más profundo.
 */
export function stripNLevels<T extends Record<string, unknown>>(
  tree: T
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(tree)) {
    if (!isNLevelKey(key)) out[key as keyof T] = tree[key as keyof T];
  }
  return out;
}

/**
 * El alias de sombra del export apunta a `{Relation Colors.Shadow}` (con
 * espacio), pero el grupo real se llama `Relation_Colors` (con guión bajo): el
 * alias está roto y no resuelve. Se corrige el nombre del grupo, dejando intacto
 * cualquier otro alias.
 */
export function fixShadowRef(ref: string): string {
  return ref.replace(/\{Relation Colors\./g, "{Relation_Colors.");
}

/**
 * El export escribe los hex en minúsculas y el resto del sistema los produce en
 * mayúsculas (`toHex`). Mezclados, el mismo color aparece escrito de dos formas
 * dentro de un solo tema —los roles como vienen, los estados horneados como
 * salen del compositor—, y cualquier comparación por igualdad de string miente.
 *
 * Solo toca lo que ES un hex: un alias `{...}` o un color con otra sintaxis pasa
 * intacto, porque acá todavía no se sabe cuál va a resolver a qué.
 */
export function canonicalHex(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value.toUpperCase() : value;
}

/**
 * `s-320` viene como `"0px"` en el export (bug); su valor correcto es 320px,
 * que restaura la progresión 256→320. Se identifica por NOMBRE, no por valor:
 * así un token legítimamente cero con otro nombre queda intacto.
 */
export function fixSpacing320(name: string, dim: Dim): Dim {
  if (name === "s-320") return { value: 320, unit: "px" };
  return dim;
}
