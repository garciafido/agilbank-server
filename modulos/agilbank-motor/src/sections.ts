import type { Cell, Grid } from "./types";
import { roleOf } from "./columns";
import { isoDate, parseCents } from "./values";

/** Una fila de encabezado tiene al menos estos rótulos. */
const MIN_LABELS = 3;

const AMOUNT_ROLES = ["amount", "debit", "credit"];

/**
 * Un encabezado de sección lleva una fecha y un importe: un bloque de título («Fecha desde», «Cuenta»)
 * o una fila de totales («Débito», «Crédito») no abre sección. Un anexo siempre trae las dos cosas.
 */
const signatureOf = (row: Cell[]): string | null => {
  const roles = row.map((v) => (typeof v === "string" ? roleOf(v) : null)).filter((r) => r !== null);
  const isHeader = roles.length >= MIN_LABELS && roles.includes("date") && roles.some((r) => AMOUNT_ROLES.includes(r));
  return isHeader ? roles.join(",") : null;
};

const isDataRow = (row: Cell[]): boolean =>
  row.some((v) => typeof v === "string" && isoDate(v) !== null) &&
  row.some((v) => !(typeof v === "string" && isoDate(v) !== null) && v !== null && parseCents(v, "ar") !== null);

/**
 * La tabla de movimientos y los anexos. Una sección empieza en una fila de encabezado y sigue hasta el
 * próximo encabezado de otra forma. La tabla es la forma de encabezado con más filas de datos debajo;
 * las otras son anexos: el BBVA pone después de los movimientos «Transferencias RECIBIDAS», con fecha
 * e importe, y esas filas nunca son renglones.
 */
export const splitSections = (grid: Grid): { main: Grid; annexes: Grid[] } => {
  const headers = grid.rows
    .map((row, i) => ({ i, sig: signatureOf(row) }))
    .filter((h): h is { i: number; sig: string } => h.sig !== null);
  if (new Set(headers.map((h) => h.sig)).size < 2) return { main: grid, annexes: [] };

  const weight = new Map<string, number>();
  headers.forEach((h, k) => {
    const end = headers[k + 1]?.i ?? grid.rows.length;
    let n = 0;
    for (let r = h.i + 1; r < end; r++) if (isDataRow(grid.rows[r])) n++;
    weight.set(h.sig, (weight.get(h.sig) ?? 0) + n);
  });
  // Con las mismas filas de datos, la que tiene saldo: un anexo no lo trae.
  const mainSig = [...weight.entries()].sort((a, b) => b[1] - a[1] || Number(b[0].includes("balance")) - Number(a[0].includes("balance")))[0][0];

  const rows: Cell[][] = grid.rows.map((r) => r);
  const annexes: Grid[] = [];
  const headerAt = new Map(headers.map((h) => [h.i, h.sig]));
  let current: { sig: string; rows: Cell[][]; places: NonNullable<Grid["places"]> } | null = null;
  const close = (): void => {
    if (current) annexes.push({ origin: grid.origin, sheet: grid.sheet, rows: current.rows, ...(grid.places ? { places: current.places } : {}) });
    current = null;
  };
  grid.rows.forEach((row, i) => {
    const sig = headerAt.get(i);
    if (sig === mainSig) close();
    else if (sig !== undefined && sig !== current?.sig) {
      close();
      current = { sig, rows: [], places: [] };
    }
    if (current) {
      current.rows.push(row);
      if (grid.places) current.places.push(grid.places[i]);
      rows[i] = [];
    }
  });
  close();
  return { main: { ...grid, rows }, annexes };
};
