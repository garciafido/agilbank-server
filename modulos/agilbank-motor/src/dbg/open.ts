import { catalog } from "../catalog/catalog";
import type { Confidence, Mark, Proposal } from "../reconcile/types";
import type { StatementLine } from "../types";
import { conceptKey } from "./conceptKey";
import { groupCharges, type ChargeGroup } from "./grouping";
import { catalogPairs, historyKey, learnFromDecisions, pairFromHistory, taxAccountsByName, type Learned } from "./learning";
import type { AccountPair, Catalogs, DecisionRow, HistoryDbg, Origin } from "./types";

export const PENDING_THIRD_PARTY = "Movimiento con un tercero sin valor en ProntoNet.";
export const PENDING_3B = "Leasing, préstamo o fondo común: la propuesta para crearlo llega en la próxima etapa.";
export const PENDING_UNCLASSIFIED = "No se pudo clasificar el concepto.";
export const PENDING_LEARNED = "La empresa lo registra como pendiente de contabilidad.";
const LATER = new Set(["leasing", "prestamo", "fci-suscripcion", "fci-rescate"]);
const FAMILY = new Map(catalog.types.map((t) => [t.code, t.family]));
const EMPTY_PAIR: AccountPair = { movementTypeId: null, accountId: null, vatAccountId: null, perceptionAccountId: null };

export interface OpenInput { lines: StatementLine[]; proposals: Proposal[]; bankCode: string | null; catalogs: Catalogs | null; history: HistoryDbg[]; decisions: DecisionRow[]; readingWarning: boolean; now: string }

/** Solo se abren los `pending` del apareo que no son de cuentas propias (los de una lectura con aviso no llegan acá). */
const openable = (p: Proposal): p is Extract<Proposal, { kind: "pending" }> => p.kind === "pending" && !p.marks.includes("own-accounts");

/** El coeficiente del tipo de movimiento que le corresponde al renglón: 1 para un débito. */
const coefficientOf = (l: StatementLine): 1 | -1 => (l.amountCents < 0 ? 1 : -1);

/**
 * Devuelve las propuestas con los `pending` abiertos en `dbg` o `pending` con motivo. No toca match ni review.
 * El par sale de las decisiones de la empresa, si no de la historia, si no del catálogo por nombre. Un par aprendido
 * se usa solo si el catálogo del pedido todavía tiene su tipo (con el coeficiente del renglón) y su cuenta: las
 * decisiones pueden ser de un catálogo que ya cambió.
 */
export const openPending = (input: OpenInput): Proposal[] => {
  if (input.readingWarning) return input.proposals;
  const { catalogs } = input;
  const byId = new Map(input.lines.map((l) => [l.id, l]));
  const lineOf = (id: string): StatementLine => byId.get(id) as StatementLine;
  const learned = learnFromDecisions(input.decisions, input.now);
  const learnedOf = (l: StatementLine): Learned | undefined => learned.get(conceptKey(input.bankCode, l));
  const fromHistory = catalogs ? pairFromHistory(input.history, catalogs, input.now) : new Map<string, AccountPair>();
  // Las cuentas por nombre se buscan una vez por conciliación, no por grupo.
  const tax = catalogs ? taxAccountsByName(catalogs) : { vatAccountId: null, perceptionAccountId: null };
  const fromCatalog = catalogs ? catalogPairs(catalogs) : null;
  const typeCoefficient = new Map<string | null, 1 | -1>(catalogs?.movementTypes.map((t) => [t.id, t.coefficient]));
  const accountIds = new Set<string | null>(catalogs?.accounts.map((a) => a.id));
  const taxIds = new Set<string | null>(catalogs?.taxAccounts.map((a) => a.id));

  // Qué sale como DBG: la familia banco salvo que la empresa lo decida pendiente, y lo de terceros si la empresa lo decide dbg.
  const asDbg = (l: StatementLine): boolean => {
    const kind = learnedOf(l)?.kind;
    return kind ? kind === "dbg" : FAMILY.get(l.type.code) === "banco";
  };
  const reasonOf = (l: StatementLine): string => {
    if (learnedOf(l)?.kind === "pending") return PENDING_LEARNED;
    if (LATER.has(l.type.code)) return PENDING_3B;
    if (l.type.code === "sin-clasificar") return PENDING_UNCLASSIFIED;
    return PENDING_THIRD_PARTY;
  };
  // Se agrupa antes de mirar lo aprendido: una decisión vale para el grupo y se guarda con la clave del cargo, así que
  // el IVA y la percepción siguen al cargo, sea a DBG o a pendiente.
  const openLines = input.proposals.filter(openable).map((p) => lineOf(p.lineId));
  const chargesOf = (g: ChargeGroup): string[] => [g.chargeId, ...(g.otherChargeIds ?? [])];
  const idsOf = (g: ChargeGroup): string[] => [...chargesOf(g), g.vatId, g.perceptionId].filter((x): x is string => x !== null);
  // Un grupo del total del día se deshace si lo aprendido no manda a todos sus cargos al mismo lado: el IVA queda suelto.
  const groups = groupCharges(openLines, catalog.rates).flatMap((g) =>
    chargesOf(g).every((id) => asDbg(lineOf(id)) === asDbg(lineOf(g.chargeId))) ? [g] : idsOf(g).map((id): ChargeGroup => ({ chargeId: id, vatId: null, perceptionId: null })));
  // groupCharges agrupa solo la familia banco: lo de terceros aprendido como dbg va como grupo propio.
  const grouped = new Set(groups.flatMap(idsOf));
  for (const l of openLines) if (!grouped.has(l.id) && asDbg(l)) groups.push({ chargeId: l.id, vatId: null, perceptionId: null });

  /** El par de las decisiones, si el catálogo lo admite, y si sus cuentas de IVA y de percepción también vienen de ahí. */
  const learnedPair = (k: Learned | undefined, coefficient: 1 | -1): { pair: AccountPair; vat: boolean; perception: boolean } | null => {
    const p = k?.pair;
    if (!p) return null;
    if (!catalogs) return { pair: p, vat: p.vatAccountId !== null, perception: p.perceptionAccountId !== null };
    if (typeCoefficient.get(p.movementTypeId) !== coefficient || !accountIds.has(p.accountId)) return null;
    const vat = taxIds.has(p.vatAccountId);
    const perception = taxIds.has(p.perceptionAccountId);
    return {
      pair: { ...p, vatAccountId: vat ? p.vatAccountId : tax.vatAccountId, perceptionAccountId: perception ? p.perceptionAccountId : tax.perceptionAccountId },
      vat,
      perception,
    };
  };
  /**
   * El par del grupo y su confianza. Kigo: un par de las decisiones no es más fuerte que la cuenta de IVA o de percepción
   * que el grupo necesita, si esa cuenta no salió de las mismas decisiones.
   */
  const pairOf = (charge: StatementLine, needs: { vat: boolean; perception: boolean }): { pair: AccountPair; confidence: Confidence; origin: Origin } => {
    const k = learnedOf(charge);
    const coefficient = coefficientOf(charge);
    const decided = learnedPair(k, coefficient);
    if (decided) {
      const borrowed = (needs.vat && !decided.vat) || (needs.perception && !decided.perception);
      return { pair: decided.pair, confidence: borrowed ? "weak" : (k as Learned).confidence, origin: "decision" };
    }
    if (!fromCatalog) return { pair: EMPTY_PAIR, confidence: "weak", origin: "none" };
    // Lo que la empresa rechazó sobre este concepto no se vuelve a proponer: se pasa a la fuente siguiente.
    const refused = (p: AccountPair): boolean => !!k?.rejected && p.movementTypeId === k.rejected.movementTypeId && p.accountId === k.rejected.accountId;
    const h = fromHistory.get(historyKey(charge.type.code, coefficient));
    if (h && !refused(h)) return { pair: { ...h, ...tax }, confidence: "weak", origin: "history" };
    const c = fromCatalog(charge.type.code, coefficient);
    if (c.accountId && !refused(c)) return { pair: { ...c, ...tax }, confidence: "weak", origin: "catalog" };
    return { pair: { ...c, accountId: null, ...tax }, confidence: "weak", origin: "none" };
  };

  const dbgByLine = new Map<string, Proposal>();
  const pendingReason = new Map<string, string>();
  for (const g of groups) {
    const ids = idsOf(g);
    const charge = lineOf(g.chargeId);
    if (!asDbg(charge)) {
      for (const id of ids) pendingReason.set(id, reasonOf(charge));
      continue;
    }
    const ls = ids.map(lineOf);
    // Un IVA o una percepción sueltos son todo IVA o todo percepción, como los registra la empresa.
    const centsOf = (code: string): number => ls.filter((l) => l.type.code === code).reduce((a, l) => a + l.amountCents, 0);
    const vatCents = centsOf("iva");
    const perceptionCents = centsOf("percepcion-iva");
    const { pair, confidence, origin } = pairOf(charge, { vat: vatCents !== 0, perception: perceptionCents !== 0 });
    // Kigo: el DBG no es más fuerte que el más débil de sus renglones, ni que otro cargo del día que aprendió otro par.
    const unchecked = ls.some((l) => l.chains === false);
    const contradicted = chargesOf(g).slice(1).some((id) => {
      const other = learnedPair(learnedOf(lineOf(id)), coefficientOf(lineOf(id)))?.pair;
      return !!other && (["movementTypeId", "accountId", "vatAccountId", "perceptionAccountId"] as const).some((k) => other[k] !== pair[k]);
    });
    const marks: Mark[] = unchecked ? ["unchecked-line"] : [];
    const p: Proposal = {
      kind: "dbg", lineId: g.chargeId, groupLineIds: ids, pair,
      amountCents: ls.reduce((a, l) => a + l.amountCents, 0), vatCents, perceptionCents,
      groupKey: `${pair.movementTypeId ?? ""}|${pair.accountId ?? ""}|${charge.date.slice(0, 7)}`,
      confidence: unchecked || contradicted || !pair.accountId ? "weak" : confidence, origin, marks,
    };
    for (const id of ids) dbgByLine.set(id, { ...p, lineId: id });
  }

  return input.proposals.map((p) => {
    if (!openable(p)) return p;
    return dbgByLine.get(p.lineId) ?? { ...p, reason: pendingReason.get(p.lineId) ?? reasonOf(lineOf(p.lineId)) };
  });
};
