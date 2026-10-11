import typesJson from "./types.json";
import banksJson from "./banks.json";
import synonymsJson from "./synonyms.json";
import ratesJson from "./rates.json";
import { normalizeConcept } from "../values";

export interface CanonicalType {
  code: string;
  name: string;
  family: "terceros" | "banco" | "sin-tipo";
  sign: "+" | "-" | null;
}

export interface BankEntry {
  code: string;
  name: string;
  cuit: string | null;
  /** Cómo puede venir escrito el nombre, ya normalizado. */
  aliases: string[];
}

/** Un tipo fijo, o uno que depende del signo del importe. */
export type SynonymType = string | { "+": string; "-": string };

export interface TextSynonym {
  prefix: string;
  type: SynonymType;
}

/**
 * El final del texto, para el banco que escribe primero la otra parte y después su fórmula
 * («ACME SA 30… BCO.015 REF.»): la tabla nunca lleva nombres, y lo que es del banco queda al final.
 */
export interface TextEnding {
  suffix: string;
  type: SynonymType;
}

export interface BankSynonyms {
  codes: Record<string, SynonymType>;
  texts: TextSynonym[];
  endings?: TextEnding[];
}

export interface Synonyms {
  nonMovements: string[];
  banks: Record<string, BankSynonyms>;
  general: TextSynonym[];
}

export interface Rates {
  debitsCreditsTax: number[];
  vat: number[];
  vatPerception: number[];
}

export interface Catalog {
  types: CanonicalType[];
  banks: BankEntry[];
  synonyms: Synonyms;
  rates: Rates;
}

export const catalog: Catalog = {
  types: typesJson as CanonicalType[],
  banks: banksJson as BankEntry[],
  synonyms: synonymsJson as Synonyms,
  rates: ratesJson as Rates,
};

export const resolveType = (t: SynonymType, amountCents: number): string =>
  typeof t === "string" ? t : amountCents >= 0 ? t["+"] : t["-"];

const typesOf = (t: SynonymType): string[] => (typeof t === "string" ? [t] : [t["+"], t["-"]]);

/**
 * Lo que está mal en las tablas, en castellano. Vacío es que están bien.
 *
 * Corre en los tests: una tabla rota es un tipo que no existe en la respuesta, o el mismo concepto
 * clasificado de dos maneras según el orden en que se lea.
 */
export const catalogProblems = (c: Catalog): string[] => {
  const problems: string[] = [];
  const codes = new Set(c.types.map((t) => t.code));
  const checkNormal = (text: string, what = "prefijo") => {
    const normal = normalizeConcept(text);
    if (normal !== text) problems.push(`El ${what} «${text}» no está normalizado: debería ser «${normal}».`);
  };
  for (const b of c.banks) {
    if (!/^\d{3}$/.test(b.code)) problems.push(`El banco «${b.name}» tiene el código «${b.code}», que no es de tres dígitos.`);
  }
  for (const [bank, s] of Object.entries(c.synonyms.banks)) {
    for (const [code, t] of Object.entries(s.codes)) {
      for (const type of typesOf(t)) {
        if (!codes.has(type)) problems.push(`El código ${code} del banco ${bank} apunta al tipo «${type}», que no está en el catálogo.`);
      }
    }
    const seen = new Map<string, string>();
    for (const { prefix, type } of s.texts) {
      checkNormal(prefix);
      for (const t of typesOf(type)) {
        if (!codes.has(t)) problems.push(`El prefijo «${prefix}» del banco ${bank} apunta al tipo «${t}», que no está en el catálogo.`);
      }
      const key = JSON.stringify(type);
      if (seen.has(prefix) && seen.get(prefix) !== key) problems.push(`El banco ${bank} tiene el prefijo «${prefix}» con dos tipos.`);
      seen.set(prefix, key);
    }
    const seenEndings = new Map<string, string>();
    for (const { suffix, type } of s.endings ?? []) {
      checkNormal(suffix, "final");
      for (const t of typesOf(type)) {
        if (!codes.has(t)) problems.push(`El final «${suffix}» del banco ${bank} apunta al tipo «${t}», que no está en el catálogo.`);
      }
      const key = JSON.stringify(type);
      if (seenEndings.has(suffix) && seenEndings.get(suffix) !== key) problems.push(`El banco ${bank} tiene el final «${suffix}» con dos tipos.`);
      seenEndings.set(suffix, key);
    }
  }
  for (const { prefix, type } of c.synonyms.general) {
    checkNormal(prefix);
    for (const t of typesOf(type)) {
      if (!codes.has(t)) problems.push(`El sinónimo general «${prefix}» apunta al tipo «${t}», que no está en el catálogo.`);
    }
  }
  for (const p of c.synonyms.nonMovements) checkNormal(p);
  return problems;
};
