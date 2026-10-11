import type { Counterparty } from "./types";
import type { Extra } from "./rows";

const CUIT_PREFIXES = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34", "50", "51", "55"]);

/**
 * Un CUIT lleva un prefijo que asigna AFIP y el dígito verificador (módulo 11). El módulo 11 solo lo
 * cumple uno de cada diez números: sin el prefijo, un número de operación, de cuenta o de comprobante
 * pasaría por CUIT. Los ceros de relleno tampoco: el prefijo 00 no existe.
 */
export const isValidCuit = (s: string): boolean => {
  if (!/^\d{11}$/.test(s) || !CUIT_PREFIXES.has(s.slice(0, 2))) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(s[i]), 0);
  const rest = 11 - (sum % 11);
  const check = rest === 11 ? 0 : rest === 10 ? 9 : rest;
  return check === Number(s[10]);
};

/** Los dos dígitos verificadores del CBU: el del bloque del banco y la sucursal, y el de la cuenta. El banco 000 no existe: ceros de relleno. */
export const isValidCbu = (s: string): boolean => {
  if (!/^\d{22}$/.test(s) || s.startsWith("000")) return false;
  const ok = (digits: string, weights: number[]) =>
    (10 - (weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0) % 10)) % 10 === Number(digits[weights.length]);
  return ok(s.slice(0, 8), [7, 1, 3, 9, 7, 1, 3]) && ok(s.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
};

export const CUIT_PATTERN = /(?<!\d)(\d{2})-?(\d{8})-?(\d)(?!\d)/g;
export const CBU_PATTERN = /(?<!\d)\d{22}(?!\d)/g;

const clean = (s: string | undefined): string | null => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length >= 2 ? t : null;
};

/**
 * El nombre impreso junto al CUIT: antes, con el CUIT entre paréntesis (Provincia), o después,
 * separado por un guion y un motivo de tres letras, o pegado (Credicoop).
 */
const nameAround = (text: string, index: number, length: number): string | null => {
  const before = text.slice(0, index);
  if (/\(\s*$/.test(before)) {
    const m = /(?:transf(?:erencia)?\s+(?:de|a)\s+|cr\.?\s*tran\.?\s*)?([^()]*?)\s*\(\s*$/i.exec(before);
    return clean(m?.[1]);
  }
  const after = text.slice(index + length);
  const m = /^\s*-?\s*(?:[A-Z]{3}-)?([A-Za-zÁÉÍÓÚÑáéíóúñ][^\d]*)/.exec(after);
  return clean(m?.[1]);
};

const isNumberLike = (s: string): boolean => /^[\d\s.\-/]+$/.test(s);

/** El nombre dentro de la celda que trae el CUIT: como en el concepto, y si no, lo que viene escrito antes. */
const nameInCell = (text: string, index: number, length: number): string | null => {
  const before = clean(text.slice(0, index));
  return nameAround(text, index, length) ?? (before !== null && !isNumberLike(before) ? before : null);
};

/** La columna de texto más cercana a la del CUIT: ahí ponen el nombre los bancos que separan las leyendas. */
const nearestName = (extras: Extra[], column: number): string | null =>
  extras
    .filter((e) => e.column !== column && !isNumberLike(e.text))
    .sort((a, b) => Math.abs(a.column - column) - Math.abs(b.column - column) || a.column - b.column)[0]?.text ?? null;

/** CUIT, nombre y CBU de la otra parte, del concepto o de las otras columnas. Sin CUIT ni CBU, null. */
export const counterpartyOf = (concept: string, extras: Extra[]): Counterparty | null => {
  let cuit: string | null = null;
  let name: string | null = null;
  let cbu: string | null = null;
  for (const m of concept.matchAll(CUIT_PATTERN)) {
    const c = m[1] + m[2] + m[3];
    if (isValidCuit(c)) {
      cuit = c;
      name = nameAround(concept, m.index ?? 0, m[0].length);
      break;
    }
  }
  for (const m of concept.matchAll(CBU_PATTERN)) {
    if (isValidCbu(m[0])) {
      cbu = m[0];
      break;
    }
  }
  for (const e of extras) {
    if (cuit === null) {
      for (const m of e.text.matchAll(CUIT_PATTERN)) {
        const c = m[1] + m[2] + m[3];
        if (isValidCuit(c)) {
          cuit = c;
          name = nameInCell(e.text, m.index ?? 0, m[0].length) ?? nearestName(extras, e.column);
          break;
        }
      }
    }
    if (cbu === null) {
      for (const m of e.text.matchAll(CBU_PATTERN)) {
        if (isValidCbu(m[0])) {
          cbu = m[0];
          break;
        }
      }
    }
  }
  if (cuit === null && cbu === null) return null;
  return { cuit, name, cbu };
};

/** «907213 - DEB. AUTOM. DE SERV.» trae el código de operación del banco adelante del texto. */
export const splitLeadingCode = (concept: string): { code: string | null; text: string } => {
  const m = /^(\d{3,6})\s+-\s+(.+)$/.exec(concept);
  return m ? { code: m[1], text: m[2] } : { code: null, text: concept };
};
