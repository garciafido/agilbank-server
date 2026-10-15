import type { Cell, Grid } from "./types";
import { roleOf, type Interpretation, type Table } from "./columns";
import { isoDate, normalizeConcept, parseCents, startsWithWords, textOf } from "./values";

export interface Extra {
  column: number;
  text: string;
}

export interface Movement {
  fromRow: number;
  toRow: number;
  date: string;
  valueDate: string | null;
  amountCents: number;
  balanceCents: number | null;
  concept: string;
  reference: string | null;
  code: string | null;
  account: string | null;
  extras: Extra[];
}

/**
 * Un saldo suelto del extracto. Los rotulados («saldo anterior», «saldo final») dicen cuál son; los
 * que no tienen rótulo solo dicen dónde están: `top` sobre el primer movimiento, `bottom` debajo del
 * último, `loose` en el medio. Si arriba está el inicial o el final depende del sentido del archivo,
 * que acá todavía no se conoce.
 *
 * «Saldo al 31/07» no dice cuál es: hay bancos que lo imprimen arriba como saldo anterior y otros
 * después de cada día. Vale por su posición, como uno sin rótulo.
 */
export interface Checkpoint {
  row: number;
  balanceCents: number;
  kind: "opening" | "closing" | "top" | "bottom" | "loose";
}

export interface BuiltRows {
  movements: Movement[];
  checkpoints: Checkpoint[];
  excludedRows: number;
}

const OPENING = /^(saldo anterior|saldo inicial)/;
const CLOSING = /^(saldo final|saldo actual)/;

const amountOf = (row: Cell[], i: Interpretation): number | null => {
  const at = (c: number) => parseCents(row[c] ?? null, i.formats[c] ?? "ar");
  if (i.amount.shape === "signed") {
    const v = at(i.amount.column);
    return v === 0 ? null : v;
  }
  const d = at(i.amount.debit) ?? 0;
  const c = at(i.amount.credit) ?? 0;
  if (d === 0 && c === 0) return null;
  return Math.abs(c) - Math.abs(d);
};

/** Dos rótulos de encabezado o más: el encabezado que cada página repite, no el concepto que sigue. */
const isHeaderRow = (row: Cell[]): boolean => row.filter((v) => typeof v === "string" && roleOf(v) !== null).length >= 2;

/** En una fuente visual, una fila de otra página no sigue a la anterior aunque quede pegada en la grilla. */
const samePage = (grid: Grid, a: number, b: number): boolean => grid.places === undefined || grid.places[a]?.page === grid.places[b]?.page;

const optional = (v: Cell): string | null => {
  const t = textOf(v);
  return t === "" || /^0+$/.test(t) ? null : t;
};

/**
 * Los movimientos de una grilla leída con una interpretación.
 *
 * Un movimiento empieza en una fila con fecha e importe. Una fila siguiente sin fecha ni importe, y
 * pegada a la anterior, completa su concepto: ahí ponen algunos bancos el CUIT y el nombre de la
 * contraparte, salvo que sea un encabezado o que, en una fuente visual, esté en otra página. Una fila
 * con importe y sin fecha es un total: queda afuera. Las filas que la tabla de
 * sinónimos nombra como no-movimientos (saldo anterior, transporte, totales) tampoco son renglones,
 * pero el saldo que traen sirve de control.
 */
export const buildRows = (grid: Grid, table: Table, i: Interpretation, nonMovements: string[]): BuiltRows => {
  const movements: Movement[] = [];
  const loose: Array<{ row: number; cents: number; kind: Checkpoint["kind"] | null }> = [];
  let excludedRows = 0;
  let lastAttached = -2;
  const start = table.headerRow === null ? 0 : table.headerRow + 1;

  for (let r = start; r < grid.rows.length; r++) {
    const row = grid.rows[r] ?? [];
    const date = isoDate(row[i.date] ?? null);
    const amount = amountOf(row, i);
    const balance = i.balance === null ? null : parseCents(row[i.balance] ?? null, i.formats[i.balance] ?? "ar");
    const concept = textOf(row[i.concept] ?? null);
    const firstText = row.map((v) => (typeof v === "string" ? normalizeConcept(v) : "")).find((t) => t !== "") ?? "";
    const normalized = normalizeConcept(concept);
    const nonMovement = nonMovements.find((p) => startsWithWords(normalized, p) || startsWithWords(firstText, p));

    // Con fecha, solo un saldo es un no-movimiento: un débito a «TOTAL AUSTRAL» empieza con «total» y
    // es un movimiento. Los totales y los transportes no llevan fecha.
    if (nonMovement !== undefined && (date === null || /^saldo /.test(nonMovement))) {
      const cents = balance ?? amount;
      if (cents === null) continue;
      if (OPENING.test(nonMovement)) loose.push({ row: r, cents, kind: "opening" });
      else if (CLOSING.test(nonMovement)) loose.push({ row: r, cents, kind: "closing" });
      else if (/^saldo /.test(nonMovement)) loose.push({ row: r, cents, kind: null });
      else excludedRows++;
      continue;
    }
    if (date !== null && amount !== null) {
      movements.push({
        fromRow: r,
        toRow: r,
        date,
        valueDate: i.valueDate === null ? null : isoDate(row[i.valueDate] ?? null),
        amountCents: amount,
        balanceCents: balance,
        concept,
        reference: i.reference === null ? null : optional(row[i.reference] ?? null),
        code: i.code === null ? null : optional(row[i.code] ?? null),
        account: i.account === null ? null : optional(row[i.account] ?? null),
        extras: i.extras.map((c) => ({ column: c, text: textOf(row[c] ?? null) })).filter((e) => e.text !== ""),
      });
      lastAttached = r;
      continue;
    }
    if (date === null && amount === null && balance !== null) {
      loose.push({ row: r, cents: balance, kind: null });
      continue;
    }
    const m = movements[movements.length - 1];
    if (date === null && amount === null && concept !== "" && m !== undefined && r === lastAttached + 1 && !isHeaderRow(row) && samePage(grid, m.fromRow, r)) {
      m.concept = `${m.concept} ${concept}`.trim();
      m.toRow = r;
      for (const c of i.extras) {
        const t = textOf(row[c] ?? null);
        if (t !== "") m.extras.push({ column: c, text: t });
      }
      lastAttached = r;
      continue;
    }
    if (date === null && amount !== null) excludedRows++;
  }

  const first = movements[0]?.fromRow ?? Infinity;
  const last = movements[movements.length - 1]?.toRow ?? -Infinity;
  const checkpoints: Checkpoint[] = loose.map((l) => ({
    row: l.row,
    balanceCents: l.cents,
    kind: l.kind ?? (l.row < first ? "top" : l.row > last ? "bottom" : "loose"),
  }));
  return { movements, checkpoints, excludedRows };
};
