import { normalizeConcept } from "../values";
import type { AccountPair, Catalogs, DecisionRow, HistoryDbg } from "./types";

export const HALF_LIFE_DAYS = 180;
export const MIN_DECISIONS = 3;
export const MIN_SHARE = 0.8;
export const MAX_AGE_DAYS = 365;

/** El tipo de movimiento y la cuenta: lo que se vota y lo que se rechaza. */
export type MovementAndAccount = Pick<AccountPair, "movementTypeId" | "accountId">;

/**
 * Lo aprendido para una clave de concepto. `kind` es la preferencia dbg/pendiente, null si no alcanza. `rejected` es el
 * tipo y la cuenta que las rechazadas descartan, con la regla de 3 y 80 % contada sobre ellas: la historia y el catálogo no
 * lo vuelven a proponer.
 */
export interface Learned { pair: AccountPair | null; confidence: "grounded" | "weak"; kind: "dbg" | "pending" | null; rejected?: MovementAndAccount }

const days = (a: string, b: string): number => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const weightOf = (decidedAt: string, now: string): number => 0.5 ** (Math.max(0, days(now, decidedAt)) / HALF_LIFE_DAYS);
const pairKey = (p: MovementAndAccount): string => JSON.stringify([p.movementTypeId, p.accountId]);
const isRecent = (last: string, now: string): boolean => days(now, last) < MAX_AGE_DAYS;

/** Votos con peso y la fecha del más reciente: en un empate de peso gana lo más reciente. */
class Votes<T> {
  private readonly all = new Map<string, { value: T; weight: number; last: string }>();
  add(key: string, make: () => T, weight: number, decidedAt: string): T {
    const e = this.all.get(key) ?? { value: make(), weight: 0, last: "" };
    e.weight += weight;
    if (decidedAt > e.last) e.last = decidedAt;
    this.all.set(key, e);
    return e.value;
  }
  subtract(key: string, weight: number): void {
    const e = this.all.get(key);
    if (e) e.weight -= weight;
  }
  best(): { value: T; weight: number } | null {
    return [...this.all.values()].filter((e) => e.weight > 0).sort((a, b) => b.weight - a.weight || b.last.localeCompare(a.last))[0] ?? null;
  }
}

/** Lo elegido de un par (tipo, cuenta): su peso, y aparte las cuentas de IVA y de percepción de las decisiones que las informaron. */
interface Voted { pair: MovementAndAccount; vat: Votes<string>; perception: Votes<string> }

/**
 * Lo que las decisiones de la empresa enseñan por clave de concepto: el par y la preferencia dbg/pendiente.
 * Se vota por tipo y cuenta. Dentro del par ganador, la cuenta de IVA y la de percepción se eligen cada una por su
 * peso entre las decisiones que la informaron: una que no la informa no vota contra ninguna.
 */
export const learnFromDecisions = (all: DecisionRow[], now: string): Map<string, Learned> => {
  // Un renglón cuenta una vez: la decisión más reciente sobre él, aunque esté en varias conciliaciones.
  // `decidedAt` es solo el día: en un empate manda la primera, porque las decisiones llegan de la más reciente a la más vieja.
  const latest = new Map<string, DecisionRow>();
  for (const r of all) {
    const prev = latest.get(r.lineRef);
    if (!prev || r.decidedAt > prev.decidedAt) latest.set(r.lineRef, r);
  }
  const byKey = new Map<string, DecisionRow[]>();
  for (const r of latest.values()) {
    if (r.proposedKind === "match" || r.proposedKind === "review" || r.chosenKind === "match") continue;
    byKey.set(r.conceptKey, [...(byKey.get(r.conceptKey) ?? []), r]);
  }
  const out = new Map<string, Learned>();
  for (const [key, rs] of byKey) {
    const pairs = new Votes<Voted>();
    const kinds = { dbg: 0, pending: 0 };
    const refused = new Votes<MovementAndAccount>();
    let total = 0;
    let refusedTotal = 0;
    let refusedCount = 0;
    let last = "";
    let lastRefused = "";
    let lastAny = "";
    // Dos pasadas: la rechazada resta del par que se había propuesto, llegue antes o después que lo elegido.
    for (const r of rs) {
      const w = weightOf(r.decidedAt, now);
      total += w;
      if (r.decidedAt > lastAny) lastAny = r.decidedAt;
      // Lo que quedó en lugar de una rechazada también es una decisión entre dbg y pendiente.
      kinds[r.chosenKind === "dbg" ? "dbg" : "pending"] += w;
      if (r.result === "rejected") {
        if (r.proposedPair) {
          const { movementTypeId, accountId } = r.proposedPair;
          refused.add(pairKey(r.proposedPair), () => ({ movementTypeId, accountId }), w, r.decidedAt);
          refusedTotal += w;
          refusedCount += 1;
          if (r.decidedAt > lastRefused) lastRefused = r.decidedAt;
        }
        continue;
      }
      if (r.decidedAt > last) last = r.decidedAt;
      if (r.chosenKind === "dbg" && r.chosenPair) {
        const { movementTypeId, accountId, vatAccountId, perceptionAccountId } = r.chosenPair;
        const voted = pairs.add(pairKey(r.chosenPair), () => ({ pair: { movementTypeId, accountId }, vat: new Votes(), perception: new Votes() }), w, r.decidedAt);
        if (vatAccountId !== null) voted.vat.add(vatAccountId, () => vatAccountId, w, r.decidedAt);
        if (perceptionAccountId !== null) voted.perception.add(perceptionAccountId, () => perceptionAccountId, w, r.decidedAt);
      }
    }
    for (const r of rs) if (r.result === "rejected" && r.proposedPair) pairs.subtract(pairKey(r.proposedPair), weightOf(r.decidedAt, now));
    const best = pairs.best();
    const enough = rs.length >= MIN_DECISIONS && isRecent(last, now);
    const grounded = !!best && enough && best.weight / total >= MIN_SHARE;
    const kindEnough = rs.length >= MIN_DECISIONS && isRecent(lastAny, now);
    const kind = !kindEnough ? null : kinds.dbg / total >= MIN_SHARE ? "dbg" : kinds.pending / total >= MIN_SHARE ? "pending" : null;
    const pair: AccountPair | null = best
      ? { ...best.value.pair, vatAccountId: best.value.vat.best()?.value ?? null, perceptionAccountId: best.value.perception.best()?.value ?? null }
      : null;
    const worst = refused.best();
    const rejected = worst && refusedCount >= MIN_DECISIONS && isRecent(lastRefused, now) && worst.weight / refusedTotal >= MIN_SHARE ? worst.value : null;
    out.set(key, { pair, confidence: grounded ? "grounded" : "weak", kind, ...(rejected ? { rejected } : {}) });
  }
  return out;
};

/**
 * El tipo canónico de un DBG de la historia, por el nombre de su cuenta y su tipo, y por si trae IVA.
 * El impuesto 25.413 e IIBB se buscan solo en el nombre de la cuenta: el tipo de gasto suele decir «Débito»,
 * y con él cualquier «impuesto» pasaría por el de débitos; una cuenta de comisiones sigue siendo de comisiones
 * aunque el tipo de gasto nombre a IIBB.
 */
export const inferHistoryType = (h: HistoryDbg): string | null => {
  const account = normalizeConcept(h.accountName);
  const name = `${account} ${normalizeConcept(h.movementType)}`;
  if (/\bsircreb\b/.test(name)) return "sircreb";
  if (/\bsellos?\b/.test(name)) return "sellos";
  if (/\bley\b/.test(name)) return "impuesto-25413";
  if (/\b(iibb|ingresos brutos)\b/.test(account)) return "recaudacion-iibb";
  if (/\bimp.*\b(deb|cred|[dc]\b)/.test(account)) return h.coefficient === -1 ? "devolucion-impuesto" : "impuesto-debitos";
  if (/\bintere(s|ses)\b/.test(name)) return "intereses";
  if (/\bcomision/.test(name)) return "comision";
  if (h.vatCents > 0) return "comision";
  return null;
};

const GROUPS: Record<string, string> = { "impuesto-debitos": "impuesto", "impuesto-creditos": "impuesto", "impuesto-25413": "impuesto", "devolucion-impuesto": "impuesto", sircreb: "iibb", "recaudacion-iibb": "iibb", "percepcion-iibb": "iibb" };
/** La historia no distingue débitos de créditos del impuesto ni SIRCREB de las recaudaciones: el par se guarda y se busca por grupo (y por coeficiente, en `historyKey`). */
export const historyGroup = (canonicalType: string): string => GROUPS[canonicalType] ?? canonicalType;
/** La clave con que se guarda y se busca el par de la historia: el grupo y el coeficiente (1 = débito). */
export const historyKey = (canonicalType: string, coefficient: 1 | -1): string => `${historyGroup(canonicalType)}|${coefficient}`;

/**
 * Por `historyKey` (grupo y coeficiente), el par (tipo de gasto, cuenta) de más importe acumulado en la historia, en ids
 * del catálogo. Cada DBG pesa su importe con la misma vida media que las decisiones, contada hasta `now`: si la empresa
 * cambió de cuenta, lo reciente le gana a lo viejo. El tipo de gasto se busca por nombre y con el coeficiente del DBG:
 * uno del signo contrario no cuenta. Bajo las claves de `iva` y `percepcion-iva` queda dónde pone la empresa el IVA y la
 * percepción: el par de los DBG que los llevan, pesado por el IVA o la percepción que llevan. La empresa no registra un
 * DBG que sea solo IVA: lo registra dentro del DBG de su cargo.
 */
export const pairFromHistory = (history: HistoryDbg[], catalogs: Catalogs, now: string): Map<string, AccountPair> => {
  const accountByCode = new Map<string | null, string>(catalogs.accounts.map((a) => [a.code, a.id]));
  const typeByName = new Map(catalogs.movementTypes.map((t) => [`${normalizeConcept(t.description)}|${t.coefficient}`, t.id]));
  const sums = new Map<string, Map<string, { pair: AccountPair; weight: number }>>();
  for (const h of history) {
    const inferred = inferHistoryType(h);
    const accountId = accountByCode.get(h.accountCode);
    const movementTypeId = typeByName.get(`${normalizeConcept(h.movementType)}|${h.coefficient}`);
    if (!accountId || !movementTypeId) continue;
    const pair: AccountPair = { movementTypeId, accountId, vatAccountId: null, perceptionAccountId: null };
    const add = (canonicalType: string, cents: number): void => {
      const key = historyKey(canonicalType, h.coefficient);
      const perKey = sums.get(key) ?? new Map<string, { pair: AccountPair; weight: number }>();
      const e = perKey.get(pairKey(pair)) ?? { pair, weight: 0 };
      e.weight += cents * weightOf(h.date, now);
      perKey.set(pairKey(pair), e);
      sums.set(key, perKey);
    };
    if (inferred) add(inferred, h.amountCents);
    if (h.vatCents > 0) add("iva", h.vatCents);
    if (h.perceptionCents > 0) add("percepcion-iva", h.perceptionCents);
  }
  return new Map([...sums].map(([key, perKey]) => [key, [...perKey.values()].sort((a, b) => b.weight - a.weight)[0].pair]));
};

const TAX_DEBITS_CREDITS = [/\bimp/, /\b(deb|cred)/];
/** Las palabras que una cuenta del catálogo tiene que contener para ser la de un tipo canónico. */
const WORDS: Record<string, RegExp[]> = {
  comision: [/\bcomision/], intereses: [/\bintere/], sellos: [/\bsellos?\b/],
  "impuesto-debitos": TAX_DEBITS_CREDITS, "impuesto-creditos": TAX_DEBITS_CREDITS, "devolucion-impuesto": TAX_DEBITS_CREDITS, "impuesto-25413": [/\bimp/, /\b(deb|cred|ley)/],
  sircreb: [/\bsircreb\b/], "recaudacion-iibb": [/\b(iibb|ingresos brutos|sircreb)\b/], "percepcion-iibb": [/\b(iibb|ingresos brutos)\b/],
};

const onlyOne = <T>(xs: T[]): T | null => (xs.length === 1 ? xs[0] : null);

/**
 * El par por nombre en el catálogo, para un tipo canónico y un coeficiente (1 = débito): la única cuenta con las palabras
 * del tipo y el único tipo de movimiento con ese coeficiente. Los nombres se normalizan una vez y cada par se busca una
 * vez: con 10.000 cuentas, buscarlo por grupo bloqueaba el server.
 */
export const catalogPairs = (catalogs: Catalogs): ((canonicalType: string, coefficient: 1 | -1) => AccountPair) => {
  const accounts = catalogs.accounts.map((a) => ({ id: a.id, name: normalizeConcept(a.description) }));
  const found = new Map<string, AccountPair>();
  return (canonicalType, coefficient) => {
    const key = `${canonicalType}|${coefficient}`;
    const known = found.get(key);
    if (known) return known;
    const words = WORDS[canonicalType] ?? [];
    const account = words.length === 0 ? null : onlyOne(accounts.filter((a) => words.every((w) => w.test(a.name))));
    const type = onlyOne(catalogs.movementTypes.filter((t) => t.coefficient === coefficient));
    const pair: AccountPair = { movementTypeId: type?.id ?? null, accountId: account?.id ?? null, vatAccountId: null, perceptionAccountId: null };
    found.set(key, pair);
    return pair;
  };
};

/** El par por nombre en el catálogo para un solo tipo canónico (ver `catalogPairs`). */
export const pairFromCatalog = (catalogs: Catalogs, canonicalType: string, coefficient: 1 | -1): AccountPair => catalogPairs(catalogs)(canonicalType, coefficient);

/** La cuenta de IVA (dice «iva» y no «percep») y la de percepción de IVA (dice las dos), si hay una sola de cada una. */
export const taxAccountsByName = (catalogs: Catalogs): { vatAccountId: string | null; perceptionAccountId: string | null } => {
  const named = catalogs.taxAccounts.map((a) => ({ id: a.id, n: normalizeConcept(a.description) }));
  return {
    vatAccountId: onlyOne(named.filter((a) => /\biva\b/.test(a.n) && !/\bpercep/.test(a.n)))?.id ?? null,
    perceptionAccountId: onlyOne(named.filter((a) => /\bpercep/.test(a.n) && /\biva\b/.test(a.n)))?.id ?? null,
  };
};
