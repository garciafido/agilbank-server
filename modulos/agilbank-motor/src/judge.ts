import type { Grid } from "./types";
import type { Interpretation, Table } from "./columns";
import { buildRows, type BuiltRows, type Checkpoint, type Movement } from "./rows";
import { normalizeConcept } from "./values";

export type Direction = "chronological" | "reverse";
export type BalanceIs = "after" | "before";

export const chronologicalOrder = (n: number, direction: Direction): number[] => {
  const order = Array.from({ length: n }, (_, i) => i);
  return direction === "chronological" ? order : order.reverse();
};

/**
 * El sentido del archivo, por sus fechas. Si no deciden (un extracto diario), los dos.
 *
 * Es lo que rompe la simetría del saldo: «estos importes, el más viejo arriba, saldo de antes» y
 * «los importes al revés, el más viejo abajo, saldo de después» encadenan exactamente igual. Solo las
 * fechas dicen cuál de las dos es el extracto.
 */
export const directionsFromDates = (movements: Movement[]): Direction[] => {
  let up = 0;
  let down = 0;
  for (let k = 1; k < movements.length; k++) {
    if (movements[k].date > movements[k - 1].date) up++;
    else if (movements[k].date < movements[k - 1].date) down++;
  }
  if (up > down) return ["chronological"];
  if (down > up) return ["reverse"];
  return ["chronological", "reverse"];
};

/**
 * Cuántos saldos encadenan, recorriendo el extracto en orden cronológico.
 *
 * Con saldo `after`, el de una fila es el que queda después de su movimiento; con `before`, el que
 * había antes (el saldo de apertura del día, que algunos bancos imprimen en la primera fila de cada
 * día). El primer saldo sin apertura conocida es el ancla: no se controla.
 */
export const chain = (
  movements: Movement[],
  direction: Direction,
  balanceIs: BalanceIs,
  openingCents: number | null,
): { checked: number; chained: number; chains: Array<boolean | null> } => {
  const chains: Array<boolean | null> = movements.map(() => null);
  let last: number | null = openingCents;
  let pending = 0;
  let checked = 0;
  let chained = 0;
  for (const k of chronologicalOrder(movements.length, direction)) {
    const m = movements[k];
    if (m.balanceCents === null) {
      pending += m.amountCents;
      continue;
    }
    if (balanceIs === "after") pending += m.amountCents;
    if (last !== null) {
      checked++;
      const ok = last + pending === m.balanceCents;
      chains[k] = ok;
      if (ok) chained++;
    }
    last = m.balanceCents;
    pending = balanceIs === "after" ? 0 : m.amountCents;
  }
  return { checked, chained, chains };
};

export interface Judgement {
  interpretation: Interpretation;
  rows: BuiltRows;
  direction: Direction;
  balanceIs: BalanceIs | null;
  checked: number;
  chained: number;
  chains: Array<boolean | null>;
  closesWithKnown: boolean | null;
  /** Los saldos de las puntas, resueltos para este sentido: ver `endBalances`. */
  openingCents: number | null;
  closingCents: number | null;
}

/**
 * El saldo inicial y el final según el sentido del archivo.
 *
 * Un saldo sin rótulo sobre el primer movimiento es el inicial si el más viejo está arriba y el final
 * si el más nuevo está arriba: su posición solo significa algo una vez que se conoce el sentido. Los
 * rotulados («saldo anterior», «saldo final») valen en cualquier sentido y mandan sobre la posición.
 */
const endBalances = (checkpoints: Checkpoint[], direction: Direction): { openingCents: number | null; closingCents: number | null } => {
  const [oldestEnd, newestEnd] = direction === "chronological" ? (["top", "bottom"] as const) : (["bottom", "top"] as const);
  const find = (...kinds: Checkpoint["kind"][]): number | null => {
    for (const kind of kinds) {
      const c = checkpoints.find((x) => x.kind === kind);
      if (c) return c.balanceCents;
    }
    return null;
  };
  return { openingCents: find("opening", oldestEnd), closingCents: find("closing", newestEnd) };
};

const BANK_FEE = /\b(impuesto|imp|iva|comision|com|sircreb|percep|percepcion|sellos|brutos|mantenimiento)\b/;

/** Los cargos del banco salen: cuántos tienen signo negativo menos cuántos positivo. */
const feeSign = (movements: Movement[]): number =>
  movements.reduce((s, m) => (BANK_FEE.test(normalizeConcept(m.concept)) ? s + (m.amountCents < 0 ? 1 : -1) : s), 0);

/** Lo que encadena menos lo que rompe. */
export const netChained = (j: Judgement): number => j.chained - (j.checked - j.chained);

/**
 * Mayor es mejor, en este orden.
 *
 * Lo primero es lo que encadena menos lo que rompe, no lo que encadena a secas: una columna que casi
 * nunca es el saldo pero a veces coincide (el importe de las entradas, en un extracto donde las
 * entradas siguen a las salidas) suma encadenados y suma más roturas, y tiene que perder contra leer
 * sin saldo.
 */
const score = (j: Judgement): number[] => [
  netChained(j),
  j.closesWithKnown === true ? 1 : 0,
  j.interpretation.headerSupport,
  j.rows.movements.length,
  feeSign(j.rows.movements),
  j.balanceIs === "after" ? 1 : 0,
  j.direction === "chronological" ? 1 : 0,
];

const better = (a: Judgement, b: Judgement): boolean => {
  const sa = score(a);
  const sb = score(b);
  for (let k = 0; k < sa.length; k++) if (sa[k] !== sb[k]) return sa[k] > sb[k];
  return false;
};

/**
 * La interpretación que mejor explica el extracto.
 *
 * Gana la que más saldos encadena menos los que rompe; sin saldos, la que cierra con los que manda
 * ProntoNet; después, la que el encabezado avala. Una columna que no es el saldo rompe en la mayoría
 * de las filas, así que pierde contra leer sin saldo.
 */
export const judge = (
  grid: Grid,
  table: Table,
  nonMovements: string[],
  known: { openingCents: number; closingCents: number } | null,
): Judgement | null => {
  let best: Judgement | null = null;
  for (const interpretation of table.interpretations) {
    const rows = buildRows(grid, table, interpretation, nonMovements);
    if (rows.movements.length === 0) continue;
    const total = rows.movements.reduce((s, m) => s + m.amountCents, 0);
    const closesWithKnown = known === null ? null : known.openingCents + total === known.closingCents;
    const directions = directionsFromDates(rows.movements);
    const labeledOpening = rows.checkpoints.find((c) => c.kind === "opening")?.balanceCents ?? null;
    for (const direction of directions) {
      const { openingCents, closingCents } = endBalances(rows.checkpoints, direction);
      // Si las fechas no deciden el sentido, la lectura espejo (importes negados, sentido y «antes o
      // después» al revés) encadena igual que la verdadera, y un saldo sin rótulo es el inicial de una
      // y el final de la otra: arrancar de él le regala un chequeo de más al espejo. Solo un saldo
      // rotulado «anterior» o «inicial» arranca la cadena; los de las puntas se informan igual.
      const startCents = directions.length > 1 ? labeledOpening : openingCents;
      const options: Array<BalanceIs | null> = interpretation.balance === null ? [null] : ["after", "before"];
      for (const balanceIs of options) {
        const r =
          balanceIs === null
            ? { checked: 0, chained: 0, chains: rows.movements.map(() => null) }
            : chain(rows.movements, direction, balanceIs, startCents);
        const candidate: Judgement = { interpretation, rows, direction, balanceIs, closesWithKnown, openingCents, closingCents, ...r };
        if (best === null || better(candidate, best)) best = candidate;
      }
    }
  }
  return best;
};
