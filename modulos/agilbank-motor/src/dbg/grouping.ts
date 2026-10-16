import { catalog } from "../catalog/catalog";
import type { StatementLine } from "../types";

/** `otherChargeIds`: solo en un grupo por el IVA del total del día, los otros cargos del día, en el orden del extracto. */
export interface ChargeGroup { chargeId: string; vatId: string | null; perceptionId: string | null; otherChargeIds?: string[] }
export const STANDALONE = new Set(["percepcion-iibb", "sircreb", "recaudacion-iibb", "impuesto-debitos", "impuesto-creditos", "impuesto-25413", "devolucion-impuesto", "anulacion-debito"]);
export const MAX_DISTANCE = 3;
const TOLERANCE_CENTS = 1;
const FAMILY = new Map(catalog.types.map((t) => [t.code, t.family]));

const isBank = (l: StatementLine): boolean => FAMILY.get(l.type.code) === "banco";
/** Un cargo: de la familia banco, que no es IVA ni percepción ni uno de los que van siempre solos. */
const isCharge = (l: StatementLine): boolean => isBank(l) && l.type.code !== "iva" && l.type.code !== "percepcion-iva" && !STANDALONE.has(l.type.code);
const sameNumber = (a: StatementLine, b: StatementLine): boolean => !!a.reference && a.reference === b.reference;
const closes = (chargeCents: number, tax: StatementLine, rates: number[]): boolean =>
  rates.some((r) => Math.abs(Math.abs(tax.amountCents) - Math.round(Math.abs(chargeCents) * r)) <= TOLERANCE_CENTS);
const near = (a: StatementLine, b: StatementLine): boolean => a.date === b.date && Math.abs(a.order - b.order) <= MAX_DISTANCE;
const sameSign = (a: StatementLine, b: StatementLine): boolean => Math.sign(a.amountCents) === Math.sign(b.amountCents);

/**
 * Los grupos de los renglones dados (solo los de la familia banco): cada renglón aparece en un grupo a lo sumo;
 * un IVA o percepción sin cargo es un grupo propio. Un IVA o percepción de IVA se pega al cargo al que podría
 * pertenecer: los que comparten su número; si ninguno, los cercanos que cierran con la alícuota. La ambigüedad se mide
 * sobre todos los que podrían, sin mirar lo ya ocupado (si no, el resultado dependería del orden). Se pega solo con
 * exactamente uno y con el lugar libre; con dos o más, o con el lugar tomado, queda suelto (RF-25).
 *
 * Un IVA sin ningún cargo posible puede ser el del total del día: dos o más cargos del mismo día, signo y tipo, todos
 * los de ese tipo y ninguno que pueda llevar IVA o percepción propios, cuya suma cierra con la alícuota. Se pega solo si cierra con un
 * único tipo (contando los de un solo cargo) y ningún otro IVA cierra con el mismo total. La percepción no se suma: suele ser sobre una parte de los cargos.
 */
export const groupCharges = (lines: StatementLine[], rates: { vat: number[]; vatPerception: number[] }): ChargeGroup[] => {
  const bank = lines.filter(isBank);
  const charges = bank.filter(isCharge);
  const owner = new Map<string, string>(); // taxId → chargeId
  const taken = new Map<string, { vat?: true; perception?: true }>();
  const candidates = new Set<string>(); // los cargos que podrían llevar un IVA o una percepción, aunque sea ambiguo
  const withoutCandidate: StatementLine[] = [];
  for (const tax of bank.filter((l) => l.type.code === "iva" || l.type.code === "percepcion-iva")) {
    const slot = tax.type.code === "iva" ? "vat" : "perception";
    const rateList = tax.type.code === "iva" ? rates.vat : rates.vatPerception;
    const sameSide = charges.filter((c) => sameSign(c, tax));
    const byNumber = sameSide.filter((c) => sameNumber(c, tax));
    const possible = byNumber.length > 0 ? byNumber : sameSide.filter((c) => near(c, tax) && closes(c.amountCents, tax, rateList));
    for (const c of possible) candidates.add(c.id);
    if (possible.length === 1 && !taken.get(possible[0].id)?.[slot]) {
      owner.set(tax.id, possible[0].id);
      taken.set(possible[0].id, { ...taken.get(possible[0].id), [slot]: true });
    }
    if (possible.length === 0 && slot === "vat") withoutCandidate.push(tax);
  }
  // Cada IVA sin candidato reclama todas las claves (día, tipo, signo) cuya suma cierra, sin mirar el tamaño: la
  // ambigüedad se mide sobre todos los que podrían. Una clave vale con un único IVA que reclama solo esa clave, con dos
  // cargos o más y ninguno que pueda llevar su propio IVA o percepción, aunque sea uno ambiguo que quedó suelto: si no,
  // ese IVA se contaría dos veces.
  const daily = new Map<string, { taxIds: string[]; members: StatementLine[] }>();
  const claims = new Map<string, number>(); // taxId → cuántas claves reclama
  for (const tax of withoutCandidate) {
    const byType = new Map<string, StatementLine[]>();
    for (const c of charges) if (c.date === tax.date && sameSign(c, tax)) byType.set(c.type.code, [...(byType.get(c.type.code) ?? []), c]);
    for (const [type, members] of byType) {
      if (!closes(members.reduce((a, c) => a + c.amountCents, 0), tax, rates.vat)) continue;
      const key = `${tax.date}|${type}|${Math.sign(tax.amountCents)}`;
      daily.set(key, { taxIds: [...(daily.get(key)?.taxIds ?? []), tax.id], members });
      claims.set(tax.id, (claims.get(tax.id) ?? 0) + 1);
    }
  }
  const absorbed = new Map<string, string[]>(); // primer cargo → los otros cargos del día
  for (const { taxIds, members } of daily.values()) {
    if (taxIds.length !== 1 || claims.get(taxIds[0]) !== 1 || members.length < 2 || members.some((c) => candidates.has(c.id))) continue;
    owner.set(taxIds[0], members[0].id);
    absorbed.set(members[0].id, members.slice(1).map((c) => c.id));
  }
  const inDaily = new Set([...absorbed.values()].flat());
  const groups = new Map<string, ChargeGroup>();
  for (const l of bank) {
    if (owner.has(l.id) || inDaily.has(l.id)) continue;
    const others = absorbed.get(l.id);
    groups.set(l.id, { chargeId: l.id, vatId: null, perceptionId: null, ...(others ? { otherChargeIds: others } : {}) });
  }
  for (const [taxId, chargeId] of owner) {
    const g = groups.get(chargeId) as ChargeGroup;
    const tax = bank.find((l) => l.id === taxId) as StatementLine;
    if (tax.type.code === "iva") g.vatId = taxId; else g.perceptionId = taxId;
  }
  return bank.filter((l) => groups.has(l.id)).map((l) => groups.get(l.id) as ChargeGroup);
};
