import type { Cell } from "./types";

/**
 * El concepto del banco llevado a una forma comparable: minúsculas, sin acentos, sin números ni
 * puntuación. Los números se sacan y no se corta en ellos: «Impuesto Ley 25.413 Ali Gral s/Debitos»
 * tiene que seguir diciendo «debitos» después del número.
 */
export const normalizeConcept = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Si el texto empieza con esas palabras enteras: «transf de» empieza «transf de acme», no «transferencia». */
export const startsWithWords = (text: string, prefix: string): boolean =>
  prefix !== "" && (text === prefix || text.startsWith(prefix + " "));

/** Si el texto termina con esas palabras enteras: «acme sa bco ref» termina «bco ref», no «xbco ref». */
export const endsWithWords = (text: string, suffix: string): boolean =>
  suffix !== "" && (text === suffix || text.endsWith(" " + suffix));

const pad = (n: number): string => String(n).padStart(2, "0");

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

const build = (year: number, month: number, day: number): string | null => {
  if (year < 1990 || year > 2100) return null;
  // Un mes o un día que no existen corren el mes del Date: el 31/02 es el 3 de marzo, el mes 13 es enero.
  if (new Date(Date.UTC(year, month - 1, day)).getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

/**
 * La fecha de una celda como "AAAA-MM-DD", o null.
 *
 * Un número suelto nunca es una fecha: las planillas convierten las suyas al leerlas, y un número
 * que llega hasta acá es un importe o una referencia.
 */
export const isoDate = (v: Cell): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const iso = ISO.exec(t);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = DMY.exec(t);
  if (!dmy) return null;
  const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  return build(year, Number(dmy[2]), Number(dmy[1]));
};

export type NumberFormat = "ar" | "us";

/**
 * Qué separador decimal usa una columna escrita como texto, mirándola entera.
 *
 * Un valor solo no alcanza: «1.234» es mil doscientos treinta y cuatro en una planilla argentina y
 * uno coma dos en una inglesa. La columna lo decide por mayoría, y sin evidencia es argentina.
 */
export const numberFormatOf = (values: string[]): NumberFormat => {
  let ar = 0;
  let us = 0;
  for (const v of values) {
    const t = v.replace(/[\s$]/g, "");
    if (/,\d{1,2}-?\)?$/.test(t)) ar++;
    else if (/\.\d{1,2}-?\)?$/.test(t)) us++;
    else if (/\.\d{3}-?$/.test(t) && !t.includes(",")) ar++;
    else if (/,\d{3}-?$/.test(t) && !t.includes(".")) us++;
  }
  return us > ar ? "us" : "ar";
};

/**
 * El importe de una celda en centavos, con signo, o null si no es un importe.
 *
 * El centavo se redondea sobre el valor absoluto y el signo se aplica después: la mitad se aleja
 * del cero, como en contabilidad. Y nunca devuelve -0, que `toEqual` distingue de 0.
 *
 * Un texto con dos marcas de signo (paréntesis, menos al principio, menos al final) no es un importe:
 * no hay forma de saber cuál manda. Y los decimales son uno o dos: «1,234» con formato argentino es
 * un formato mal detectado, no 1,23.
 */
export const parseCents = (v: Cell, format: NumberFormat): number | null => {
  if (v === null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const cents = Math.sign(v) * Math.round(Math.abs(v) * 100);
    return cents === 0 ? 0 : cents;
  }
  let t = v.replace(/\s|\$|ARS|U\$S|USD/gi, "");
  let marks = 0;
  if (t.startsWith("(") && t.endsWith(")")) {
    marks++;
    t = t.slice(1, -1);
  }
  if (t.endsWith("-")) {
    marks++;
    t = t.slice(0, -1);
  }
  if (t.startsWith("-")) {
    marks++;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (marks > 1) return null;
  const [thousands, decimal] = format === "ar" ? [".", ","] : [",", "."];
  const grouped = new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+(\\${decimal}\\d{1,2})?$`);
  const plain = new RegExp(`^\\d+(\\${decimal}\\d{1,2})?$`);
  if (!grouped.test(t) && !plain.test(t)) return null;
  const n = Number(t.split(thousands).join("").replace(decimal, "."));
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return marks === 1 && cents !== 0 ? -cents : cents;
};

/** Una celda como texto, sin espacios de más. */
export const textOf = (v: Cell): string => (v === null ? "" : String(v).replace(/\s+/g, " ").trim());
