import type { Correction, LineType } from "./types";
import { resolveType, type Catalog, type SynonymType, type TextEnding, type TextSynonym } from "./catalog/catalog";
import { CBU_PATTERN, CUIT_PATTERN, isValidCbu, isValidCuit } from "./counterparty";
import { endsWithWords, normalizeConcept, startsWithWords } from "./values";

type Rule = { test: RegExp; type: SynonymType };

const OWN_ACCOUNTS: Rule = { test: /\b(ctas propias|cuentas propias|misma titularidad)\b/, type: "transferencia-cuenta-propia" };
const MASS_PAYMENT: Rule = { test: /\b(haberes|acreditamiento|pago a proveedores|pago masivo)\b/, type: "pago-masivo" };
const COURT_ORDER: Rule = { test: /\b(judic|judicial|embargo)\b/, type: "orden-judicial" };
const TRANSFER_VERBS = "transfs?|transferencias?|transfer|trfs?|trans|tran";
const TRANSFER: Rule = { test: new RegExp(`\\b(${TRANSFER_VERBS})\\b`), type: { "+": "transferencia-recibida", "-": "transferencia-enviada" } };

/**
 * Lo que sigue al verbo de una transferencia es el nombre de la otra parte, y un nombre puede decir
 * cualquier cosa: «Transferencia recibida de Mantenimiento SRL» no es una comisión, ni «…de Cheques del
 * Sur» un depósito. Con ese comienzo solo cuentan estas reglas, y si ninguna acierta, la transferencia
 * según el signo.
 */
const STARTS_WITH_TRANSFER = new RegExp(`^(${TRANSFER_VERBS}|cr tran)\\b`);
const TRANSFER_RULES: Rule[] = [OWN_ACCOUNTS, MASS_PAYMENT, COURT_ORDER, TRANSFER];

/**
 * Las reglas generales, en orden: la primera que acierta. Se aplican sobre el concepto normalizado
 * (sin números ni puntuación). Las de impuestos van antes que la de comisión porque «IVA … s/Comis»
 * es IVA, y la de cuentas propias antes que la de transferencias. «com» solo es comisión antes de las
 * palabras que lo siguen en un cargo: suelto es el «.com» de un dominio. El pago a ARCA va antes que el
 * débito automático porque «Debito Directo … AFIP» es de los dos.
 *
 * La primera es la abreviatura al principio: «Com. emision cheque» o «Com. Transf. interbanking» son
 * el cargo, y lo que sigue solo dice de qué.
 */
const RULES: Rule[] = [
  { test: /^(com|comis)\b/, type: "comision" },
  { test: /\bsircreb\b/, type: "sircreb" },
  { test: /\bpercep\w*\b.*\b(ing|ingresos|iibb|brutos)\b|\b(ing|ingresos) brutos\b.*\bpercep/, type: "percepcion-iibb" },
  { test: /\b(ing|ingresos) brutos\b|\biibb\b/, type: "recaudacion-iibb" },
  { test: /\biva\b.*\b(percep\w*|rg|adic)\b|\bpercep\w* iva\b/, type: "percepcion-iva" },
  { test: /\biva\b/, type: "iva" },
  { test: /\b(rev|dev|devol|devolucion|reversion)\b.*\b(imp|impuesto)\b/, type: "devolucion-impuesto" },
  { test: /\b(imp|impuesto)\b.*\b(d|deb|debito|debitos|db)\b/, type: "impuesto-debitos" },
  { test: /\b(imp|impuesto)\b.*\b(c|cre|cred|credito|creditos|cr)\b/, type: "impuesto-creditos" },
  { test: /\b(comision|comisiones|mantenimiento)\b|\bcom (mant|por|serv|servicio|gestion|uso)\b/, type: "comision" },
  { test: /\bsellos\b/, type: "sellos" },
  { test: /\bintere(s|ses)\b/, type: "intereses" },
  { test: /\becheq\b/, type: { "+": "deposito-cheques", "-": "echeq-pagado" } },
  { test: /\bcheques?\b/, type: { "+": "deposito-cheques", "-": "cheque-pagado" } },
  { test: /\bdeposito\b|\bacreditacion valores\b/, type: "deposito-cheques" },
  { test: /\bdebin\b/, type: "debin" },
  { test: /\b(arca|afip|vep)\b/, type: "pago-arca" },
  { test: /\b(deb|debito|db)\b.*\b(aut|autom|automatico|directo)\b/, type: "debito-automatico" },
  { test: /\b(fondo comun|fci|fima|rescate)\b/, type: { "+": "fci-rescate", "-": "fci-suscripcion" } },
  MASS_PAYMENT,
  { test: /\bleasing\b/, type: "leasing" },
  COURT_ORDER,
  OWN_ACCOUNTS,
  TRANSFER,
  { test: /\bpago\b.*\b(servicio|servicios|visa|tarjeta)\b|\bp serv\b/, type: "pago-servicio" },
];

const longestPrefix = (normalized: string, synonyms: TextSynonym[]): TextSynonym | null =>
  synonyms.filter((s) => startsWithWords(normalized, s.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null;

const longestEnding = (normalized: string, endings: TextEnding[]): TextEnding | null =>
  endings.filter((s) => endsWithWords(normalized, s.suffix)).sort((a, b) => b.suffix.length - a.suffix.length)[0] ?? null;

/**
 * Si un cargo es la alícuota de un vecino: el impuesto a los débitos y créditos, el IVA, la percepción.
 * El IVA y su percepción se cobran sobre otro cargo, nunca sobre un crédito: piden una base negativa.
 */
const byProportion = (amountCents: number, neighbors: { previous: number | null; next: number | null }, catalog: Catalog): string | null => {
  if (amountCents >= 0) return null;
  const amount = Math.abs(amountCents);
  for (const base of [neighbors.previous, neighbors.next]) {
    if (base === null || base === 0) continue;
    const near = (rate: number) => Math.abs(amount - Math.round(Math.abs(base) * rate)) <= 1;
    if (catalog.rates.debitsCreditsTax.some(near)) return base > 0 ? "impuesto-creditos" : "impuesto-debitos";
    if (base < 0 && catalog.rates.vat.some(near)) return "iva";
    if (base < 0 && catalog.rates.vatPerception.some(near)) return "percepcion-iva";
  }
  return null;
};

/** Un tipo con signo propio no le cabe a un importe del signo contrario; uno sin signo, o un importe en cero, caben siempre. */
const fits = (code: string, amountCents: number, catalog: Catalog): boolean => {
  const sign = catalog.types.find((t) => t.code === code)?.sign;
  return !sign || amountCents === 0 || (sign === "+") === (amountCents > 0);
};

const byRules = (normalized: string, amountCents: number, catalog: Catalog): string | null => {
  for (const r of STARTS_WITH_TRANSFER.test(normalized) ? TRANSFER_RULES : RULES) {
    if (!r.test.test(normalized)) continue;
    const code = resolveType(r.type, amountCents);
    if (fits(code, amountCents, catalog)) return code;
  }
  return null;
};

const hasCounterpartyId = (text: string): boolean =>
  [...text.matchAll(CUIT_PATTERN)].some((m) => isValidCuit(m[1] + m[2] + m[3])) ||
  [...text.matchAll(CBU_PATTERN)].some((m) => isValidCbu(m[0]));

type Weight = [number, number, number];

/** Cuánto pesa una corrección para un renglón, de menor a mayor: el alcance (un banco antes que todos), el código antes que el texto, el texto más largo. null si no aplica. */
const weigh = (k: Correction, code: string | null, normalized: string, bankCode: string | null): Weight | null => {
  if (k.bankCode !== null && k.bankCode !== bankCode) return null;
  const scope = k.bankCode === null ? 1 : 0;
  if (k.operationCode && code !== null && k.operationCode === code) return [scope, 0, 0];
  const text = normalizeConcept(k.text ?? "");
  return startsWithWords(normalized, text) ? [scope, 1, -text.length] : null;
};

const lighter = (a: Weight, b: Weight): boolean => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) < 0;

/**
 * El tipo canónico de un renglón, de más firme a más débil: la corrección de la empresa, la tabla
 * común (primero el código de operación, después el comienzo del texto o su final), las reglas generales, un CUIT
 * o un CBU en el concepto y la proporción con un vecino. Lo que no sale de la empresa ni de la tabla es
 * un concepto nuevo, y vuelve con su aviso aunque tenga tipo: todo renglón vuelve con algo.
 */
export const classify = (
  input: { text: string; code: string | null; amountCents: number },
  neighbors: { previous: number | null; next: number | null },
  bankCode: string | null,
  catalog: Catalog,
  corrections: Correction[],
): { type: LineType; isNew: boolean } => {
  const normalized = normalizeConcept(input.text);
  let chosen: { weight: Weight; type: string } | null = null;
  for (const k of corrections) {
    const weight = weigh(k, input.code, normalized, bankCode);
    if (weight && (chosen === null || lighter(weight, chosen.weight))) chosen = { weight, type: k.type };
  }
  if (chosen) return { type: { code: chosen.type, source: "company" }, isNew: false };

  const bank = bankCode !== null && Object.hasOwn(catalog.synonyms.banks, bankCode) ? catalog.synonyms.banks[bankCode] : undefined;
  if (bank && input.code !== null && Object.hasOwn(bank.codes, input.code)) {
    return { type: { code: resolveType(bank.codes[input.code], input.amountCents), source: "table" }, isNew: false };
  }
  // El final del texto solo cuando ningún comienzo del banco acierta: el comienzo es más firme, y el
  // final existe para el banco que escribe primero la otra parte.
  const text =
    (bank && (longestPrefix(normalized, bank.texts) ?? longestEnding(normalized, bank.endings ?? []))) ??
    longestPrefix(normalized, catalog.synonyms.general);
  if (text) return { type: { code: resolveType(text.type, input.amountCents), source: "table" }, isNew: false };

  const byRule = byRules(normalized, input.amountCents, catalog);
  if (byRule) return { type: { code: byRule, source: "rule" }, isNew: true };
  if (hasCounterpartyId(input.text)) return { type: { code: resolveType(TRANSFER.type, input.amountCents), source: "rule" }, isNew: true };
  const proportional = byProportion(input.amountCents, neighbors, catalog);
  if (proportional) return { type: { code: proportional, source: "rule" }, isNew: true };
  return { type: { code: "sin-clasificar", source: "none" }, isNew: true };
};
