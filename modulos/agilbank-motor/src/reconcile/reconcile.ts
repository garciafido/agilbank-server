import type { StatementLine } from "../types";
import { confidenceOf, type Basis } from "./confidence";
import { daysBetween, inReferenceWindow, inWindow, isOwnAccount, lineNumber, MIN_NUMBER_DIGITS, numberMatches, ownAccountCbus, partyConflict, partyKey, partyMatch, partyOf, referenceDate, valueDates } from "./match";
import { exactSubsets } from "./sums";
import { DEFAULT_RECONCILE_OPTIONS, type Batch, type BatchTransfer, type Coincidence, type Mark, type Party, type PendingValue, type Proposal, type ReconcileContext, type ReconcileOptions, type Reconciliation } from "./types";

export interface ReconcileInput { lines: StatementLine[]; context: ReconcileContext; batches: Batch[]; readingWarning: boolean }

const NO_VALUE = "No hay un valor pendiente que coincida.";
// Un pendiente afirma que no hay valor: con varios en la ventana que ninguna pasada pudo separar, eso sería falso.
const SEVERAL_VALUES = "Hay más de un valor que coincide con el renglón.";
const DISPUTED = "Más de un renglón coincide con el mismo valor.";
const SEVERAL = "Hay más de una combinación de valores que suma el importe.";
const OVER_BUDGET = "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.";
const SPLIT_SEVERAL = "Hay más de una combinación de renglones que suma un valor.";
const OWN = "Transferencia entre cuentas propias sin valor cargado.";
// Lo que no se buscó va a revisar, nunca a pendiente: un pendiente afirma que no hay valor, y esto solo dice que no se miró.
const TIMED_OUT = "No se terminó de buscar: el apareo pasó el tiempo disponible. Hay que revisarlo a mano.";
const CROWDED = "No se pudo buscar un valor único: hay más de 50 del mismo importe que podrían ser de este renglón. Hay que revisarlo a mano.";
const SUM_POOL_TOO_BIG = "No se buscó una suma de valores: hay más de 200 en la ventana. Hay que revisarlo a mano.";
const SPLIT_POOL_TOO_BIG = "No se buscó una suma de renglones: el día tiene más de 40 del mismo grupo. Hay que revisarlo a mano.";
const SPLIT_CUT = "La búsqueda de una suma de renglones pasó el tiempo disponible: hay que revisarlo a mano.";
/** Solo un depósito o un pago masivo agrupa valores: buscar sumas para una comisión o un impuesto gastaría el techo y los mandaría a revisar por tiempo. */
const GROUPING_TYPES = new Set(["deposito-cheques", "pago-masivo"]);
const MAX_SUM_POOL = 200;
/** Con más candidatos, ninguno puede quedar único en las pasadas uno a uno: mirarlos en cada vuelta solo gasta el plazo. */
const MAX_UNIQUE_CANDIDATES = 50;
/** El reloj se mira cada 1.024 pasos, como en las sumas: mirarlo en cada uno costaría más que el paso. */
const CLOCK_EVERY = 1023;

/**
 * El plazo del pedido, uno para todo el apareo. Pasado, ninguna pasada registra un apareo nuevo: lo que queda sin
 * resolver va a revisar por tiempo.
 */
class Deadline {
  passed = false;
  private steps = 0;
  constructor(private readonly now: () => number, readonly at: number) {}
  /** Cuenta un paso de trabajo y dice si el plazo ya pasó. */
  step(): boolean {
    if (!this.passed && (++this.steps & CLOCK_EVERY) === 0 && this.now() > this.at) this.passed = true;
    return this.passed;
  }
}

const dayOf = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

const push = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const same = map.get(key);
  if (same) same.push(value);
  else map.set(key, [value]);
};

const pushIn = <K, V>(map: Map<number, Map<K, V[]>>, cents: number, key: K, value: V): void => {
  let inner = map.get(cents);
  if (!inner) map.set(cents, (inner = new Map()));
  push(inner, key, value);
};

/** El estado de una conciliación en curso: qué renglones y valores siguen libres, y lo resuelto. */
class Ledger {
  readonly resolved = new Map<string, Proposal>();
  readonly usedValues = new Set<string>();
  readonly disputed = new Set<string>();
  /** Renglones de una búsqueda cortada por el techo: la combinación pudo no ser única, así que no aparean con nada. */
  readonly cutLines = new Set<string>();
  /** Por qué no se terminó de buscar un renglón: si queda sin resolver, va a revisar con este motivo. Gana el primero. */
  readonly unsearched = new Map<string, string>();
  /** Los valores por importe, armado una vez: con 20.000 valores, recorrerlos todos por renglón no termina a tiempo. */
  private readonly byAmount = new Map<number, PendingValue[]>();
  /** Por importe y día de la fecha de referencia, y de cualquier fecha: la ventana de un renglón mira unos pocos días. */
  private readonly byReferenceDay = new Map<number, Map<number, PendingValue[]>>();
  private readonly byAnyDay = new Map<number, Map<number, PendingValue[]>>();
  /** Por importe y los últimos dígitos del número: un número coincide solo si el del valor termina en el del renglón. */
  private readonly byNumberEnd = new Map<number, Map<string, PendingValue[]>>();
  private readonly disputedByAmount = new Map<number, PendingValue[]>();
  private readonly valueById = new Map<string, PendingValue>();
  private readonly position = new Map<PendingValue, number>();
  constructor(readonly lines: StatementLine[], readonly values: PendingValue[]) {
    values.forEach((v, i) => {
      push(this.byAmount, v.amountCents, v);
      this.valueById.set(v.id, v);
      this.position.set(v, i);
      const ref = referenceDate(v);
      if (ref) pushIn(this.byReferenceDay, v.amountCents, dayOf(ref), v);
      // Una vez por día aunque dos fechas coincidan.
      for (const day of new Set(valueDates(v).map(dayOf))) pushIn(this.byAnyDay, v.amountCents, day, v);
      if (v.number && v.number.length >= MIN_NUMBER_DIGITS) pushIn(this.byNumberEnd, v.amountCents, v.number.slice(-MIN_NUMBER_DIGITS), v);
    });
  }
  /** Sin apareo todavía: un valor en disputa sigue abierto, porque cualquiera de los renglones que lo ven puede ser el suyo. */
  isOpen(v: PendingValue): boolean { return !this.usedValues.has(v.id); }
  freeLines(): StatementLine[] { return this.lines.filter((l) => !this.resolved.has(l.id)); }
  /** Todos los valores del pedido con ese importe, en cualquier estado. */
  withAmount(cents: number): PendingValue[] { return this.byAmount.get(cents) ?? []; }
  openWithAmount(cents: number): PendingValue[] { return this.withAmount(cents).filter((v) => this.isOpen(v)); }
  freeWithAmount(cents: number): PendingValue[] { return this.openWithAmount(cents).filter((v) => !this.disputed.has(v.id)); }
  dispute(id: string): void {
    if (this.disputed.has(id)) return;
    this.disputed.add(id);
    const v = this.valueById.get(id) as PendingValue;
    push(this.disputedByAmount, v.amountCents, v);
  }
  disputedWithAmount(cents: number): PendingValue[] { return this.disputedByAmount.get(cents) ?? []; }
  notSearched(lineId: string, reason: string): void {
    if (!this.unsearched.has(lineId)) this.unsearched.set(lineId, reason);
  }
  /**
   * Los valores abiertos del importe con una fecha a `windowDays` del día, en el orden del pedido, que `keep` acepta;
   * o null si son más de MAX_UNIQUE_CANDIDATES.
   */
  inWindowOf(cents: number, day: number, windowDays: number, anyDate: boolean, keep: (v: PendingValue) => boolean, deadline: Deadline): PendingValue[] | null {
    const byDay = (anyDate ? this.byAnyDay : this.byReferenceDay).get(cents);
    const found = new Set<PendingValue>();
    for (let d = day - windowDays; byDay && d <= day + windowDays; d++) {
      for (const v of byDay.get(d) ?? []) {
        deadline.step();
        if (found.has(v) || !this.isOpen(v) || !keep(v)) continue;
        found.add(v);
        if (found.size > MAX_UNIQUE_CANDIDATES) return null;
      }
    }
    return this.inOrder(found);
  }
  /** Los valores abiertos del importe cuyo número termina en el del renglón, o null si son más de MAX_UNIQUE_CANDIDATES. */
  withNumber(cents: number, lineNum: string | null, deadline: Deadline): PendingValue[] | null {
    if (!lineNum) return [];
    const found = new Set<PendingValue>();
    for (const v of this.byNumberEnd.get(cents)?.get(lineNum.slice(-MIN_NUMBER_DIGITS)) ?? []) {
      deadline.step();
      if (!this.isOpen(v) || !numberMatches(lineNum, v.number)) continue;
      found.add(v);
      if (found.size > MAX_UNIQUE_CANDIDATES) return null;
    }
    return this.inOrder(found);
  }
  private inOrder(vs: Set<PendingValue>): PendingValue[] {
    return [...vs].sort((a, b) => (this.position.get(a) as number) - (this.position.get(b) as number));
  }
}

/**
 * Lo que una vuelta del punto fijo no puede cambiar. Un renglón que una pasada dejó sin reclamo da lo mismo en la vuelta
 * siguiente mientras ninguno de sus candidatos se use ni entre en disputa: solo se vuelven a mirar los renglones que ven
 * un valor que cambió. Sin esto, una cadena de renglones que se liberan de a uno cuesta una vuelta entera por renglón.
 */
class Settled {
  private readonly clean = new Map<Basis, Set<string>>();
  private readonly watchers = new Map<string, Set<string>>();
  /** Un renglón con demasiados candidatos depende de los valores en disputa de su importe. */
  private readonly crowded = new Map<number, Set<string>>();
  isClean(pass: Basis, lineId: string): boolean { return this.clean.get(pass)?.has(lineId) ?? false; }
  settle(pass: Basis, lineId: string): void {
    let lines = this.clean.get(pass);
    if (!lines) this.clean.set(pass, (lines = new Set()));
    lines.add(lineId);
  }
  watch(line: StatementLine, candidates: PendingValue[] | null): void {
    if (candidates) for (const v of candidates) addTo(this.watchers, v.id, line.id);
    else addTo(this.crowded, line.amountCents, line.id);
  }
  touch(v: PendingValue): void {
    for (const lines of [this.watchers.get(v.id), this.crowded.get(v.amountCents)]) {
      for (const id of lines ?? []) for (const clean of this.clean.values()) clean.delete(id);
    }
  }
}

const addTo = <K>(map: Map<K, Set<string>>, key: K, id: string): void => {
  let ids = map.get(key);
  if (!ids) map.set(key, (ids = new Set()));
  ids.add(id);
};

type Claim = { line: StatementLine; value: PendingValue; coincidence: Coincidence };
type Pair = (line: StatementLine, v: PendingValue) => boolean;
/** Los días si el valor cae en la ventana del renglón, o null: contra la fecha de referencia o contra cualquiera. */
type Near = (line: StatementLine, v: PendingValue) => number | null;

/**
 * Una pasada uno a uno: cada renglón libre mira sus candidatos, que incluyen los valores en disputa.
 * Con uno solo, lo reclama; si dos renglones reclaman el mismo valor, ninguno lo recibe: van a revisar y el
 * valor queda en disputa. Un renglón que ve un valor en disputa entre sus candidatos también va a revisar con todos
 * ellos: ese valor puede ser el suyo, así que su otro candidato no es único.
 * Lo resuelto se registra al final, así todos los renglones de la pasada miran el mismo estado. Por eso, una pasada que
 * cruza el plazo no registra nada: sus reclamos no llegaron a compararse con los de todos.
 * `candidatesOf` da null cuando el renglón tiene más candidatos de los que pueden darle un único: no reclama, y va a revisar
 * con los valores en disputa que `sees` le deja ver, si hay alguno. Un renglón que queda sin reclamo se anota en `settled`.
 */
const onePass = (
  ledger: Ledger,
  basis: Basis,
  candidatesOf: (line: StatementLine) => PendingValue[] | null,
  sees: Pair,
  coincidenceOf: (line: StatementLine, v: PendingValue) => Coincidence,
  thirdParty: Pair,
  readingWarning: boolean,
  deadline: Deadline,
  settled: Settled,
): void => {
  const claims = new Map<string, Claim[]>();
  const contested: Array<{ line: StatementLine; values: PendingValue[] }> = [];
  for (const line of ledger.freeLines()) {
    if (deadline.step()) return;
    if (settled.isClean(basis, line.id)) continue;
    const found = candidatesOf(line);
    const values = found ?? ledger.disputedWithAmount(line.amountCents).filter((v) => ledger.isOpen(v) && sees(line, v));
    if (values.some((v) => ledger.disputed.has(v.id))) {
      contested.push({ line, values });
      continue;
    }
    if (!found) {
      ledger.notSearched(line.id, CROWDED);
      settled.settle(basis, line.id);
      continue;
    }
    const value = only(values);
    if (!value) {
      settled.settle(basis, line.id);
      continue;
    }
    const claim = { line, value, coincidence: coincidenceOf(line, value) };
    const same = claims.get(value.id);
    if (same) same.push(claim);
    else claims.set(value.id, [claim]);
  }
  if (deadline.passed) return;
  for (const { line, values } of contested) {
    ledger.resolved.set(line.id, { kind: "review", lineId: line.id, reason: DISPUTED, candidates: values.map((v) => [v.id]) });
  }
  for (const [valueId, cs] of claims) {
    if (cs.length === 1) {
      const { line, value, coincidence } = cs[0];
      const { confidence, marks } = confidenceOf(basis, [line], readingWarning, thirdParty(line, value));
      ledger.resolved.set(line.id, { kind: "match", lineId: line.id, groupLineIds: [line.id], valueIds: [valueId], confidence, coincidence, marks });
      ledger.usedValues.add(valueId);
      settled.touch(value);
    } else {
      ledger.dispute(valueId);
      settled.touch(cs[0].value);
      for (const c of cs) ledger.resolved.set(c.line.id, { kind: "review", lineId: c.line.id, reason: DISPUTED, candidates: [[valueId]] });
    }
  }
};

const only = <T>(xs: T[]): T | null => (xs.length === 1 ? xs[0] : null);

/** La pasada del número no exige la ventana, pero informa la distancia en días cuando el valor tiene fecha. */
const daysOf = (line: StatementLine, v: PendingValue): { days?: number } => {
  const ref = referenceDate(v);
  return ref ? { days: daysBetween(line.date, ref) } : {};
};

/**
 * k renglones y k valores libres del mismo importe, con k de 2 o más: si emparejados por fecha (y después
 * por orden) cada par cae en la ventana y a ninguno lo deja afuera un CUIT que contradice, se emparejan. Cualquier emparejamiento concilia los mismos valores en el mes.
 */
const interchangeable = (ledger: Ledger, excluded: Pair, thirdParty: Pair, near: Near, readingWarning: boolean, deadline: Deadline): void => {
  const linesBy = new Map<number, StatementLine[]>();
  for (const l of ledger.freeLines()) push(linesBy, l.amountCents, l);
  for (const [amount, ls] of linesBy) {
    deadline.step();
    const vs = ledger.freeWithAmount(amount);
    if (ls.length < 2 || ls.length !== vs.length) continue;
    const sortedL = [...ls].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    const sortedV = [...vs].sort((a, b) => (referenceDate(a) ?? "").localeCompare(referenceDate(b) ?? "") || a.id.localeCompare(b.id));
    const days = sortedL.map((l, i) => {
      deadline.step();
      return excluded(l, sortedV[i]) ? null : near(l, sortedV[i]);
    });
    // Cada grupo se decide entero: el que cruza el plazo no se empareja.
    if (deadline.passed) return;
    if (days.some((d) => d === null)) continue;
    sortedL.forEach((l, i) => {
      const { confidence, marks } = confidenceOf("interchangeable", [l], readingWarning, thirdParty(l, sortedV[i]));
      ledger.resolved.set(l.id, { kind: "match", lineId: l.id, groupLineIds: [l.id], valueIds: [sortedV[i].id], confidence, coincidence: { amount: true, days: days[i] as number }, marks });
      ledger.usedValues.add(sortedV[i].id);
    });
  }
};

/**
 * Importe único en el período, al final: el renglón y el valor que son los únicos con ese importe en todo el extracto
 * y en todo el pedido, en cualquier estado, aparean sin ventana, weak, si los dos siguen libres. Un renglón del mismo
 * importe que ya apareó, o un valor que ya usó una suma, cuentan: con ellos no hay único.
 */
const singleAmount = (ledger: Ledger, excluded: Pair, thirdParty: Pair, coincidenceOf: (line: StatementLine, v: PendingValue) => Coincidence, readingWarning: boolean, deadline: Deadline): void => {
  const linesBy = new Map<number, StatementLine[]>();
  for (const l of ledger.lines) push(linesBy, l.amountCents, l);
  for (const [amount, ls] of linesBy) {
    if (deadline.step()) return;
    const vs = ledger.withAmount(amount);
    if (ls.length !== 1 || vs.length !== 1) continue;
    const [line, value] = [ls[0], vs[0]];
    if (ledger.resolved.has(line.id) || ledger.cutLines.has(line.id) || !ledger.isOpen(value) || ledger.disputed.has(value.id) || excluded(line, value)) continue;
    const { confidence, marks } = confidenceOf("single", [line], readingWarning, thirdParty(line, value));
    ledger.resolved.set(line.id, { kind: "match", lineId: line.id, groupLineIds: [line.id], valueIds: [value.id], confidence, coincidence: coincidenceOf(line, value), marks });
    ledger.usedValues.add(value.id);
  }
};

type Group = { coincidence: { deposit: string } | { batch: string }; values: PendingValue[] };

/** Las boletas y los lotes de ProntoNet por lo que suman, cada uno partido por signo: un renglón suma solo valores de su signo. */
const groupsBySum = (values: PendingValue[]): Map<number, Group[]> => {
  const byKey = new Map<string, Group>();
  const add = (coincidence: Group["coincidence"], v: PendingValue): void => {
    const key = JSON.stringify([coincidence, Math.sign(v.amountCents)]);
    const group = byKey.get(key);
    if (group) group.values.push(v);
    else byKey.set(key, { coincidence, values: [v] });
  };
  for (const v of values) {
    if (v.depositId) add({ deposit: v.depositId }, v);
    if (v.batchId) add({ batch: v.batchId }, v);
  }
  const bySum = new Map<number, Group[]>();
  // Un grupo de un solo valor no es una suma: aparearlo elegiría entre valores del mismo importe que la pasada 2 no pudo separar.
  for (const g of byKey.values()) if (g.values.length > 1) push(bySum, g.values.reduce((a, v) => a + v.amountCents, 0), g);
  return bySum;
};

/**
 * Los valores de las transferencias de un lote subido, en el orden del lote, o null si no son únicos. Por importe,
 * las transferencias de un CUIT se llevan todos los valores de ese CUIT e importe si son tantos como ellas; las que no
 * traen CUIT, los valores de ese importe que quedan, con la misma regla. Así ningún valor se elige entre otros iguales.
 */
const batchValueIds = (transfers: BatchTransfer[], candidatesOf: (cents: number) => PendingValue[], parties: Map<string, Party>): string[] | null => {
  const byAmount = new Map<number, number[]>();
  transfers.forEach((t, i) => push(byAmount, Math.abs(t.amountCents), i));
  const picked: string[] = [];
  for (const [cents, at] of byAmount) {
    const left = new Set(candidatesOf(cents));
    const byCuit = new Map<string | null, number[]>();
    for (const i of at) push(byCuit, transfers[i].cuit, i);
    const assign = (group: number[], vs: PendingValue[]): boolean => {
      if (vs.length !== group.length) return false;
      group.forEach((i, k) => (picked[i] = vs[k].id));
      vs.forEach((v) => left.delete(v));
      return true;
    };
    for (const [cuit, group] of byCuit) {
      if (cuit !== null && !assign(group, [...left].filter((v) => partyOf(v, parties).cuit === cuit))) return null;
    }
    const anonymous = byCuit.get(null);
    if (anonymous && !assign(anonymous, [...left])) return null;
  }
  return picked;
};

/**
 * 5. Un renglón, varios valores: la boleta o el lote de ProntoNet que suma exacto el importe, o el lote subido cuyas
 * transferencias sin error suman exacto un pago, o si no una suma exacta de valores de la ventana. Una boleta y un lote
 * con valores distintos para el mismo renglón son dos combinaciones: va a revisar. Como en las pasadas uno a uno, todos
 * los renglones miran el mismo estado y lo resuelto se registra al final: si dos renglones reclaman un mismo valor, los
 * dos van a revisar y el valor queda en disputa. Un valor que ya estaba en disputa entra en las sumas, porque cuenta
 * para saber si la combinación es única, pero la combinación que lo lleva va a revisar. Una suma libre cortada por el techo
 * deja en disputa todo su pool, no solo las combinaciones que alcanzó a ver, y una con más de 200 valores no se busca. Un
 * valor con un CUIT que contradice al renglón no entra, salvo en una transferencia: ahí es un tercero y la combinación
 * sale weak. Con el plazo del pedido cruzado no se registra ningún apareo: los renglones que no se miraron pudieron
 * reclamar los mismos valores.
 */
const severalValues = (ledger: Ledger, parties: Map<string, Party>, excluded: Pair, thirdParty: Pair, windowDays: number, batches: Batch[], readingWarning: boolean, options: ReconcileOptions, deadline: Deadline): void => {
  const open = ledger.values.filter((v) => ledger.isOpen(v));
  const valueOf = new Map(open.map((v) => [v.id, v]));
  const groups = groupsBySum(open);
  const paid = batches.map((b) => {
    const transfers = b.transfers.filter((t) => !t.failed);
    return { id: b.id, transfers, total: transfers.reduce((a, t) => a + Math.abs(t.amountCents), 0) };
  });
  // La ventana de un renglón son unos pocos días: con 20.000 valores, recorrerlos todos por renglón no termina a tiempo.
  // Un valor va en el día de cada una de sus fechas, y una vez por día aunque dos fechas coincidan.
  const byDay = new Map<number, PendingValue[]>();
  for (const v of open) for (const day of new Set(valueDates(v).map(dayOf))) push(byDay, day, v);
  const review = (lineId: string, reason: string, candidates: string[][]): Proposal => ({ kind: "review", lineId, reason, candidates });
  const take = (line: StatementLine, basis: Basis, valueIds: string[], coincidence: Coincidence): Proposal => {
    if (valueIds.some((id) => ledger.disputed.has(id))) return review(line.id, DISPUTED, [valueIds]);
    const { confidence, marks } = confidenceOf(basis, [line], readingWarning, valueIds.some((id) => thirdParty(line, valueOf.get(id) as PendingValue)));
    return { kind: "match", lineId: line.id, groupLineIds: [line.id], valueIds, confidence, coincidence, marks };
  };
  const ids = (vs: PendingValue[]) => vs.map((v) => v.id);

  type Combo = { valueIds: string[]; coincidence: Group["coincidence"] };
  // 5a. La boleta o el lote de ProntoNet.
  const fromProntoNet = (line: StatementLine): Combo[] =>
    (groups.get(line.amountCents) ?? [])
      .filter((g) => g.values.some((v) => inWindow(line, v, windowDays) !== null) && !g.values.some((v) => excluded(line, v)))
      .map((g) => ({ valueIds: ids(g.values), coincidence: g.coincidence }));
  // 5b. Un lote subido: solo un renglón que sale plata es un pago masivo.
  const fromUploaded = (line: StatementLine): Combo[] => {
    if (line.amountCents >= 0) return [];
    const candidatesOf = (cents: number) => ledger.openWithAmount(-cents).filter((v) => !excluded(line, v));
    const combos: Combo[] = [];
    for (const b of paid) {
      const valueIds = b.total === -line.amountCents ? batchValueIds(b.transfers, candidatesOf, parties) : null;
      if (valueIds) combos.push({ valueIds, coincidence: { batch: b.id } });
    }
    return combos;
  };
  const fromGroups = (line: StatementLine): Proposal | null => {
    // El lote de ProntoNet y el subido suelen ser el mismo pago: con los mismos valores son una sola combinación.
    const seen = new Set<string>();
    const combos: Combo[] = [];
    for (const c of [...fromProntoNet(line), ...fromUploaded(line)]) {
      const key = JSON.stringify([...c.valueIds].sort());
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(c);
    }
    if (combos.length > 1) return review(line.id, SEVERAL, combos.map((c) => c.valueIds));
    return combos.length === 1 ? take(line, "group", combos[0].valueIds, { amount: true, ...combos[0].coincidence }) : null;
  };

  /** Los valores de una suma libre cortada por el techo: quedan en disputa cuando se registra lo resuelto. */
  const unsettled = new Set<string>();
  const fromSum = (line: StatementLine): Proposal | null => {
    if (!GROUPING_TYPES.has(line.type.code)) return null;
    const day = dayOf(line.date);
    // Un Set: el valor con dos fechas en la ventana entra una sola vez.
    const seen = new Set<PendingValue>();
    // Corta apenas pasa el tope: con una ventana de 31 días, recorrer todo el pool de cada renglón no termina a tiempo.
    for (let d = day - windowDays; d <= day + windowDays; d++) {
      for (const v of byDay.get(d) ?? []) {
        if (Math.sign(v.amountCents) === Math.sign(line.amountCents) && !excluded(line, v)) seen.add(v);
        if (seen.size > MAX_SUM_POOL) {
          ledger.notSearched(line.id, SUM_POOL_TOO_BIG);
          return null;
        }
      }
    }
    const pool = [...seen];
    const lineDeadline = Math.min(deadline.at, options.now() + options.budgetMsPerLine);
    // Un solo valor también cuenta como combinación: dos valores con el importe exacto que la pasada 2 no pudo
    // separar hacen que la suma no sea única.
    const search = exactSubsets(pool.map((v) => ({ id: v.id, cents: v.amountCents })), line.amountCents, { maxCombos: 2, minSize: 1, maxSize: pool.length, deadline: lineDeadline, now: options.now });
    if (search.exhausted) {
      if (lineDeadline === deadline.at) deadline.passed = true;
      // Cortada por el techo, la búsqueda pudo no ver la combinación del renglón: cualquier valor del pool puede ser suyo.
      pool.forEach((v) => unsettled.add(v.id));
      return review(line.id, OVER_BUDGET, search.combos);
    }
    if (search.combos.length > 1) return review(line.id, SEVERAL, search.combos);
    return search.combos.length === 1 ? take(line, "sum", search.combos[0], { amount: true }) : null;
  };

  const proposals: Proposal[] = [];
  for (const line of ledger.freeLines()) {
    if (deadline.step()) break;
    const p = fromGroups(line) ?? fromSum(line);
    if (p) proposals.push(p);
  }
  const claims = new Map<string, number>();
  for (const p of proposals) if (p.kind === "match") for (const id of p.valueIds) claims.set(id, (claims.get(id) ?? 0) + 1);
  const shared = (id: string) => (claims.get(id) as number) > 1;
  for (const p of proposals) {
    if (p.kind === "match" && p.valueIds.some(shared)) {
      ledger.resolved.set(p.lineId, review(p.lineId, DISPUTED, [p.valueIds]));
      // Toda la combinación queda en disputa, no solo el valor compartido: cualquiera de sus valores puede ser del renglón.
      p.valueIds.forEach((id) => ledger.dispute(id));
      continue;
    }
    if (p.kind === "match" && deadline.passed) continue;
    ledger.resolved.set(p.lineId, p);
    if (p.kind === "match") p.valueIds.forEach((id) => ledger.usedValues.add(id));
    // Un candidato de una revisión puede ser de ese renglón: queda en disputa y ninguna pasada posterior lo toma.
    else if (p.kind === "review") p.candidates.flat().forEach((id) => ledger.dispute(id));
  }
  unsettled.forEach((id) => ledger.dispute(id));
};

const MAX_SPLIT_LINES = 6;
/** Un grupo del día con más renglones no se suma: la búsqueda gastaría el techo y la casualidad abunda. */
const MAX_SPLIT_POOL = 40;
const INSTALMENT = new Set(["leasing", "prestamo"]);
const INSTALMENT_PARTS = new Set([...INSTALMENT, "intereses", "iva", "percepcion-iva", "debito-automatico", "comision", "sellos"]);
const FCI_TYPES = ["fci-suscripcion", "fci-rescate"];

/** `instalment`: las partes de una cuota, que solo suman en una combinación que lleva la cuota. */
type SplitPool = { lines: StatementLine[]; instalment: boolean };
/** `reason` nulo: la combinación es única y su valor está libre. */
type SplitClaim = { value: PendingValue; lineIds: string[]; reason: string | null };

/**
 * Los grupos de un día que pueden ser un solo valor: los renglones de un mismo tipo de FCI, o una cuota de leasing o
 * préstamo con sus intereses, IVA, percepción y gastos. Las transferencias no se agrupan, y los gastos de un día sin
 * cuota tampoco: una comisión y su IVA que suman un valor por casualidad no son un pago. `dropped`: los que pasan el tope.
 */
const splitPools = (ls: StatementLine[]): { kept: SplitPool[]; dropped: SplitPool[] } => {
  const pools = FCI_TYPES.map((code) => ({ lines: ls.filter((l) => l.type.code === code), instalment: false }));
  if (ls.some((l) => INSTALMENT.has(l.type.code))) pools.push({ lines: ls.filter((l) => INSTALMENT_PARTS.has(l.type.code)), instalment: true });
  return { kept: pools.filter((p) => p.lines.length <= MAX_SPLIT_POOL), dropped: pools.filter((p) => p.lines.length > MAX_SPLIT_POOL) };
};

/**
 * 6. Varios renglones del mismo día, un valor: hasta 6 renglones libres de un grupo de un día de la ventana cuya suma
 * da exacto el valor, con una sola combinación en todo el extracto. Un renglón con un CUIT que contradice al valor no
 * entra, salvo en una transferencia, que sale weak. Una búsqueda cortada por el techo no aparea: sus renglones van a
 * revisar por tiempo y su valor queda en disputa, porque la combinación pudo no ser única. Los renglones de un grupo que
 * pasa el tope tampoco se buscan y van a revisar. Como en la pasada 5, todos los valores miran el mismo estado y lo
 * resuelto se registra al final: un renglón que entra en las combinaciones de dos valores va a revisar con todos los
 * renglones de las dos. Con el plazo del pedido cruzado, no se registra ningún apareo.
 */
const severalLines = (ledger: Ledger, excluded: Pair, thirdParty: Pair, windowDays: number, readingWarning: boolean, options: ReconcileOptions, deadline: Deadline): void => {
  const byDay = new Map<number, StatementLine[]>();
  for (const l of ledger.freeLines()) push(byDay, dayOf(l.date), l);
  const poolsByDay = new Map([...byDay].map(([day, ls]) => [day, splitPools(ls)]));
  const position = new Map(ledger.lines.map((l, i) => [l.id, i]));
  const lineOf = new Map(ledger.lines.map((l) => [l.id, l]));
  const withInstalment = (ids: string[]) => ids.some((id) => INSTALMENT.has((lineOf.get(id) as StatementLine).type.code));
  const cut = ledger.cutLines;
  /** Un grupo que pasa el tope, una vez por signo: ningún valor de ese signo que lo mire lo busca. */
  const unsearchedPools = new Set<string>();
  const markDropped = (day: number, sign: number): void => {
    poolsByDay.get(day)?.dropped.forEach((pool, i) => {
      const key = `${day}:${i}:${sign}`;
      if (unsearchedPools.has(key)) return;
      unsearchedPools.add(key);
      const ls = pool.lines.filter((l) => Math.sign(l.amountCents) === sign);
      if (ls.length > 1) ls.forEach((l) => ledger.notSearched(l.id, SPLIT_POOL_TOO_BIG));
    });
  };

  /** Lo que reclama un valor: su combinación única, o las dos que lo dejan sin unicidad. */
  const claimOf = (value: PendingValue, days: Set<number>): SplitClaim | null => {
    const pools: SplitPool[] = [];
    for (const d of days) {
      markDropped(d, Math.sign(value.amountCents));
      for (const pool of poolsByDay.get(d)?.kept ?? []) {
        const ls = pool.lines.filter((l) => Math.sign(l.amountCents) === Math.sign(value.amountCents) && !excluded(l, value));
        if (ls.length > 1) pools.push({ lines: ls, instalment: pool.instalment });
      }
    }
    const found: string[][] = [];
    for (const pool of pools) {
      const searchDeadline = Math.min(deadline.at, options.now() + options.budgetMsPerLine);
      const items = pool.lines.map((l) => ({ id: l.id, cents: l.amountCents }));
      const search = exactSubsets(items, value.amountCents, { maxCombos: 2, minSize: 2, maxSize: MAX_SPLIT_LINES, deadline: searchDeadline, now: options.now, accept: pool.instalment ? withInstalment : undefined });
      if (search.exhausted) {
        if (searchDeadline === deadline.at) deadline.passed = true;
        for (const p of pools) for (const l of p.lines) {
          cut.add(l.id);
          ledger.notSearched(l.id, SPLIT_CUT);
        }
        ledger.dispute(value.id);
        return null;
      }
      found.push(...search.combos);
      if (found.length > 1) return { value, lineIds: [...new Set(found.flat())], reason: SPLIT_SEVERAL };
    }
    return found.length === 1 ? { value, lineIds: found[0], reason: ledger.disputed.has(value.id) ? DISPUTED : null } : null;
  };
  const claims: SplitClaim[] = [];
  /** Los días de los renglones que el valor ve: los de la ventana de cada una de sus fechas, sin repetir. */
  const daysSeenBy = (value: PendingValue): Set<number> => {
    const days = new Set<number>();
    for (const date of valueDates(value)) for (let d = dayOf(date) - windowDays; d <= dayOf(date) + windowDays; d++) days.add(d);
    return days;
  };
  for (const value of ledger.values) {
    if (deadline.step()) break;
    const claim = ledger.isOpen(value) ? claimOf(value, daysSeenBy(value)) : null;
    if (claim) claims.push(claim);
  }

  const byLine = new Map<string, SplitClaim[]>();
  for (const c of claims) for (const id of c.lineIds) push(byLine, id, c);
  const reviewed = new Set<string>();
  for (const c of claims) {
    if (c.reason !== null || c.lineIds.some((id) => (byLine.get(id) as SplitClaim[]).length > 1)) {
      c.lineIds.forEach((id) => reviewed.add(id));
      // El valor de todo reclamo que va a revisar queda en disputa, aunque no figure entre los dos candidatos que se muestran.
      ledger.dispute(c.value.id);
      continue;
    }
    if (deadline.passed) continue;
    // Un renglón de la combinación quedó en una búsqueda cortada: la combinación pudo no ser única, y no se terminó de buscar.
    if (c.lineIds.some((id) => cut.has(id))) {
      c.lineIds.forEach((id) => ledger.notSearched(id, SPLIT_CUT));
      continue;
    }
    const group = c.lineIds.map((id) => lineOf.get(id) as StatementLine).sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number));
    const groupLineIds = group.map((l) => l.id);
    const { confidence, marks } = confidenceOf("split", group, readingWarning, group.some((l) => thirdParty(l, c.value)));
    for (const l of group) {
      ledger.resolved.set(l.id, { kind: "match", lineId: l.id, groupLineIds, valueIds: [c.value.id], confidence, coincidence: { amount: true, days: inWindow(l, c.value, windowDays) as number }, marks: [...marks] });
    }
    ledger.usedValues.add(c.value.id);
  }
  for (const lineId of reviewed) {
    const cs = byLine.get(lineId) as SplitClaim[];
    const reason = cs.length === 1 && cs[0].reason === DISPUTED ? DISPUTED : SPLIT_SEVERAL;
    // Dos combinaciones bastan para que no sea única: con más, la respuesta crece sin decir nada nuevo.
    ledger.resolved.set(lineId, { kind: "review", lineId, reason, candidates: cs.slice(0, 2).map((c) => [c.value.id]) });
  }
};

export const reconcile = (input: ReconcileInput, options: ReconcileOptions = DEFAULT_RECONCILE_OPTIONS): Reconciliation => {
  const { context, readingWarning } = input;
  // Un solo plazo por pedido para todo el apareo: las pasadas de la ventana también pueden tardar.
  const deadline = new Deadline(options.now, options.now() + options.budgetMsTotal);
  // Compiten todos los renglones del extracto aunque se pidan algunos: si no, pedir uno solo escondería la ambigüedad.
  const ledger = new Ledger(input.lines, context.values);
  const parties = new Map<string, Party>(context.parties.map((p) => [partyKey(p), p]));
  const excluded: Pair = (line, v) => partyConflict(line, v, parties) === "excluded";
  const thirdParty: Pair = (line, v) => partyConflict(line, v, parties) === "third-party";
  // Los candidatos por número no dependen de la ventana: se buscan una vez por renglón y en cada vuelta se miran los que siguen abiertos.
  const byNumber = new Map<string, PendingValue[] | null>();
  const numberOf = new Map(input.lines.map((l) => [l.id, lineNumber(l)]));
  const open = (vs: PendingValue[] | null): PendingValue[] | null => vs && vs.filter((v) => ledger.isOpen(v));

  /**
   * Las pasadas 1 a 4 con una ventana. 1 a 3 hasta que una vuelta no resuelve nada: lo que se resuelve puede dejar a
   * otro renglón con un solo candidato. Al terminar, ningún renglón libre ve un valor en disputa: la última vuelta los
   * habría mandado a revisar. Los candidatos de cada renglón se buscan una vez por tramo: una vuelta solo puede cerrar valores.
   * Devuelve los candidatos de la ventana de cada renglón que miró, o null si eran demasiados.
   */
  const windowPasses = (near: Near, anyDate: boolean): Map<string, PendingValue[] | null> => {
    const sees: Pair = (line, v) => near(line, v) !== null && !excluded(line, v);
    const settled = new Settled();
    const inWindowCache = new Map<string, PendingValue[] | null>();
    const inWindowOf = (line: StatementLine): PendingValue[] | null => {
      if (!inWindowCache.has(line.id)) {
        const found = ledger.inWindowOf(line.amountCents, dayOf(line.date), context.windowDays, anyDate, (v) => !excluded(line, v), deadline);
        inWindowCache.set(line.id, found);
        settled.watch(line, found);
      }
      return open(inWindowCache.get(line.id) as PendingValue[] | null);
    };
    const inWindowCoincidence = (line: StatementLine, v: PendingValue): Coincidence => ({ amount: true, days: near(line, v) as number, ...partyMatch(line, v, parties) });
    const numberWatched = new Set<string>();
    const numberCandidates = (line: StatementLine): PendingValue[] | null => {
      if (!byNumber.has(line.id)) byNumber.set(line.id, ledger.withNumber(line.amountCents, numberOf.get(line.id) as string | null, deadline));
      const found = byNumber.get(line.id) as PendingValue[] | null;
      if (!numberWatched.has(line.id)) {
        numberWatched.add(line.id);
        settled.watch(line, found);
      }
      return open(found);
    };
    const numberSeen: Pair = (line, v) => numberMatches(numberOf.get(line.id) as string | null, v.number);
    let resolved: number;
    do {
      resolved = ledger.resolved.size;

      // 1. Número e importe, sin ventana.
      onePass(
        ledger,
        "number",
        numberCandidates,
        numberSeen,
        (line, v) => ({ amount: true, number: numberOf.get(line.id) as string, ...daysOf(line, v) }),
        // El número lo confirma el banco: un CUIT distinto no lo debilita.
        () => false,
        readingWarning,
        deadline,
        settled,
      );

      // 2. Importe único en la ventana.
      onePass(ledger, "unique", inWindowOf, sees, inWindowCoincidence, thirdParty, readingWarning, deadline, settled);

      // 3. Importe y contraparte en la ventana.
      const withParty = (line: StatementLine, v: PendingValue) => !!partyMatch(line, v, parties);
      onePass(ledger, "party", (line) => inWindowOf(line)?.filter((v) => withParty(line, v)) ?? null, (line, v) => sees(line, v) && withParty(line, v), inWindowCoincidence, thirdParty, readingWarning, deadline, settled);
    } while (!deadline.passed && ledger.resolved.size > resolved);

    // 4. Intercambiables.
    interchangeable(ledger, excluded, thirdParty, near, readingWarning, deadline);
    return inWindowCache;
  };

  // Primero contra la fecha de referencia, después contra cualquier fecha del valor: si no, un renglón que ve el valor
  // solo por una fecha secundaria le disputa el valor al que lo ve por la fecha con que lo ve el banco.
  windowPasses((line, v) => inReferenceWindow(line, v, context.windowDays), false);
  // La ventana contra cualquier fecha contiene a la de la fecha de referencia, y la miran todos los renglones que quedaron libres.
  const inAnyWindow = windowPasses((line, v) => inWindow(line, v, context.windowDays), true);

  // 5. Un renglón, varios valores.
  const batchIds = new Set(context.batchIds);
  severalValues(ledger, parties, excluded, thirdParty, context.windowDays, input.batches.filter((b) => batchIds.has(b.id)), readingWarning, options, deadline);

  // 6. Varios renglones, un valor.
  severalLines(ledger, excluded, thirdParty, context.windowDays, readingWarning, options, deadline);

  // Importe único en el período, sin ventana: al final, para que la evidencia más débil no desarme una más fuerte.
  singleAmount(ledger, excluded, thirdParty, (line, v) => ({ amount: true, ...daysOf(line, v), ...partyMatch(line, v, parties) }), readingWarning, deadline);

  // Cuentas propias (RF-20): la marca en lo apareado, y el motivo en lo que queda sin valor.
  const wanted = context.lineIds ? new Set(context.lineIds) : null;
  const ownCbus = ownAccountCbus(context.ownAccounts);
  const warning = (): Mark[] => (readingWarning ? ["reading-warning"] : []);
  const proposalOf = (l: StatementLine): Proposal => {
    const own = isOwnAccount(l, ownCbus);
    const p = ledger.resolved.get(l.id);
    if (p) return own && p.kind === "match" ? { ...p, marks: [...p.marks, "own-accounts"] } : p;
    // Lo que no se terminó de buscar va a revisar: «no hay valor» sería una conclusión sobre algo que no se miró.
    const unsearched = ledger.unsearched.get(l.id) ?? (deadline.passed ? TIMED_OUT : null);
    if (unsearched) return { kind: "review", lineId: l.id, reason: unsearched, candidates: [] };
    const candidates = (inAnyWindow.get(l.id) ?? []).filter((v) => ledger.isOpen(v));
    if (candidates.length > 0) return { kind: "review", lineId: l.id, reason: SEVERAL_VALUES, candidates: candidates.map((v) => [v.id]) };
    return own ? { kind: "pending", lineId: l.id, reason: OWN, marks: ["own-accounts", ...warning()] } : { kind: "pending", lineId: l.id, reason: NO_VALUE, marks: warning() };
  };
  return { proposals: input.lines.filter((l) => !wanted || wanted.has(l.id)).map(proposalOf) };
};
