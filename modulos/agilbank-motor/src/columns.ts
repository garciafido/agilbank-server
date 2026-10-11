import type { Cell, Grid } from "./types";
import { isoDate, numberFormatOf, parseCents, textOf, type NumberFormat } from "./values";

export type Role =
  | "date" | "valueDate" | "concept" | "description" | "account" | "debit" | "credit"
  | "balance" | "amount" | "reference" | "auxiliary" | "code" | "party";

/**
 * Lo que dice un rótulo del encabezado. Son palabras genéricas, no plantillas de un banco: ayudan a
 * elegir y a desempatar, pero la lectura no depende de que estén.
 */
const HEADER_ROLES: Array<[RegExp, Role]> = [
  [/^(fecha|f\.?)\s*valor/, "valueDate"],
  [/^fecha|^fec\b/, "date"],
  [/^concepto/, "concept"],
  [/descripcion|detalle|leyenda/, "description"],
  [/^(cuenta|cbu|nro\.? de cuenta|numero de cuenta)/, "account"],
  [/debito|^debe$/, "debit"],
  [/credito|^haber$/, "credit"],
  [/saldo/, "balance"],
  [/importe|monto/, "amount"],
  [/terminal|sucursal/, "auxiliary"],
  [/comprob|cpbte|numero|^nro|referencia|secuencia/, "reference"],
  [/^cod/, "code"],
  [/cuit|denominacion|razon social|beneficiario|ordenante|^nombre/, "party"],
];

const NOT_AMOUNT: Array<Role | null> = ["reference", "auxiliary", "code", "party", "account", "concept", "description", "date", "valueDate"];

const AMOUNT_ROLES: Array<Role | null> = ["debit", "credit", "amount", "balance"];

/** Con más columnas numéricas que esto las combinaciones crecen con el cubo y ya no informan. */
const MAX_NUMERIC_COLUMNS = 6;

export const roleOf = (header: string): Role | null => {
  const h = header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return HEADER_ROLES.find(([re]) => re.test(h))?.[1] ?? null;
};

export type AmountShape = { shape: "signed"; column: number } | { shape: "debit-credit"; debit: number; credit: number };

export interface Interpretation {
  date: number;
  valueDate: number | null;
  concept: number;
  reference: number | null;
  code: number | null;
  account: number | null;
  extras: number[];
  amount: AmountShape;
  balance: number | null;
  formats: Record<number, NumberFormat>;
  /** A favor menos en contra del encabezado: desempata cuando el saldo no decide. */
  headerSupport: number;
}

export interface Table {
  headerRow: number | null;
  firstRow: number;
  interpretations: Interpretation[];
}

/**
 * La tabla de movimientos de una grilla y todas las maneras razonables de leerla.
 *
 * No elige: propone. La fecha y el texto se reconocen por su contenido; el importe puede ser una
 * columna con signo o un par débito y crédito en cualquiera de los dos órdenes, con o sin saldo.
 * Elegir es del juez del saldo (`judge.ts`), que es quien puede saber cuál encadena. Sin
 * interpretaciones es que no hay cómo saber el signo de los importes.
 */
export const readTable = (grid: Grid): Table | null => {
  let width = 0;
  for (const row of grid.rows) if (row.length > width) width = row.length;
  const cell = (r: number, c: number): Cell => grid.rows[r]?.[c] ?? null;

  const datedCells = grid.rows.map((row) => row.map((v) => isoDate(v) !== null));
  const isDated = (r: number, c: number): boolean => datedCells[r]?.[c] === true;

  const dateCounts = Array.from({ length: width }, (_, c) => datedCells.filter((row) => row[c] === true).length);
  let most = 0;
  for (const n of dateCounts) if (n > most) most = n;
  if (most === 0) return null;
  const date = dateCounts.indexOf(most);

  const labelsIn = (r: number): number => (grid.rows[r] ?? []).filter((v) => typeof v === "string" && roleOf(v) !== null).length;
  const dated = grid.rows.map((_, r) => r).filter((r) => isDated(r, date));
  // La tabla empieza después del primer encabezado que tiene fechas debajo: las fechas de un título
  // («Fecha desde», «Fecha hasta») quedan arriba, y un encabezado repetido en otra página no esconde
  // el primer movimiento. Sin encabezado, en la primera fecha. La distancia entre fechas no cuenta:
  // un movimiento puede tener varias líneas de continuación. Una fila con fecha nunca es encabezado,
  // aunque su texto use dos palabras de rótulo («Debito automatico», «Cuenta 191-001»).
  const lastDated = dated[dated.length - 1];
  let headerAbove = -1;
  for (let r = 0; r < lastDated && headerAbove === -1; r++) if (!isDated(r, date) && labelsIn(r) >= 2) headerAbove = r;
  const dataRows = dated.filter((r) => r > headerAbove);
  const firstRow = dataRows[0];

  // El encabezado es la primera fila con texto hacia arriba: si no tiene al menos dos rótulos, no hay
  // encabezado, y no se sigue buscando en un título más lejano. Las filas con importes (el saldo
  // inicial) no son ni encabezado ni título.
  const isAmount = (v: Cell): boolean => typeof v === "number" || (typeof v === "string" && (parseCents(v, "ar") !== null || parseCents(v, "us") !== null));
  let headerRow: number | null = null;
  for (let r = firstRow - 1; r >= 0; r--) {
    const row = grid.rows[r] ?? [];
    if (!row.some((v) => textOf(v) !== "") || row.some(isAmount) || isDated(r, date)) continue;
    if (labelsIn(r) >= 2) headerRow = r;
    break;
  }
  const roles: Array<Role | null> = Array.from({ length: width }, (_, c) => {
    const v = headerRow === null ? null : cell(headerRow, c);
    return typeof v === "string" ? roleOf(v) : null;
  });

  const valueDate =
    Array.from({ length: width }, (_, c) => c).find(
      (c) => c !== date && dataRows.filter((r) => isDated(r, c)).length >= dataRows.length / 2,
    ) ?? null;

  const formats: Record<number, NumberFormat> = {};
  const numeric: number[] = [];
  const textual: number[] = [];
  const averageLength: Record<number, number> = {};
  const filled: Record<number, number> = {};
  for (let c = 0; c < width; c++) {
    if (c === date || c === valueDate) continue;
    const values = dataRows.map((r) => cell(r, c)).filter((v): v is string | number => v !== null);
    if (values.length === 0) {
      // Un extracto con solo créditos trae la columna de débitos vacía: sigue siendo la de débitos.
      if (roles[c] === "debit" || roles[c] === "credit") {
        formats[c] = "ar";
        filled[c] = 0;
        numeric.push(c);
      }
      continue;
    }
    filled[c] = values.length;
    formats[c] = numberFormatOf(values.filter((v): v is string => typeof v === "string"));
    const amounts = values.filter((v) => parseCents(v, formats[c]) !== null).length;
    if (amounts / values.length >= 0.5 && !NOT_AMOUNT.includes(roles[c])) numeric.push(c);
    else textual.push(c);
    averageLength[c] = values.reduce<number>((s, v) => s + String(v).length, 0) / values.length;
  }

  // Con demasiadas columnas numéricas se miran solo las rotuladas como importe y, si ninguna lo está,
  // las más llenas: el resto no distingue nada y multiplica las combinaciones.
  const labeled = numeric.filter((c) => AMOUNT_ROLES.includes(roles[c]));
  const candidates =
    numeric.length <= MAX_NUMERIC_COLUMNS
      ? numeric
      : [...(labeled.length > 0 ? labeled : numeric)]
          .sort((a, b) => filled[b] - filled[a])
          .slice(0, MAX_NUMERIC_COLUMNS)
          .sort((a, b) => a - b);

  const byRole = (role: Role): number | null => textual.find((c) => roles[c] === role) ?? null;
  const longest =
    textual.filter((c) => roles[c] === null || roles[c] === "party").sort((a, b) => averageLength[b] - averageLength[a])[0] ?? null;
  const concept = byRole("concept") ?? byRole("description") ?? longest;
  if (concept === null) return null;
  const distinctValues = (c: number): number => new Set(dataRows.map((r) => textOf(cell(r, c))).filter((v) => v !== "")).size;
  const reference = textual
    .filter((c) => roles[c] === "reference")
    .reduce<number | null>((best, c) => (best === null || distinctValues(c) > distinctValues(best) ? c : best), null);
  const code = byRole("code");
  const account = byRole("account");
  const extras = textual.filter((c) => c !== concept && c !== reference && c !== code && c !== account);

  const amountCache = new Map<number, Array<number | null>>();
  const amountsOf = (c: number): Array<number | null> => {
    const cached = amountCache.get(c);
    if (cached) return cached;
    const amounts = dataRows.map((r) => parseCents(cell(r, c), formats[c]));
    amountCache.set(c, amounts);
    return amounts;
  };
  // Sin negativos no hay cómo saber el signo, salvo que haya otra columna que pueda ser el saldo y
  // decida: un lote de pagos (una columna, todos positivos, sin saldo) no tiene con qué.
  const signedOk = (c: number): boolean => {
    const a = amountsOf(c).filter((v): v is number => v !== null);
    return a.length > 0 && (a.some((v) => v < 0) || candidates.some((o) => o !== c));
  };
  const oneSigned = (values: Array<number | null>): boolean => {
    const nonZero = values.filter((v): v is number => v !== null && v !== 0);
    const positives = nonZero.filter((v) => v > 0).length;
    return positives <= nonZero.length * 0.05 || nonZero.length - positives <= nonZero.length * 0.05;
  };
  const debitCreditOk = (d: number, k: number): boolean => {
    const ad = amountsOf(d);
    const ak = amountsOf(k);
    let either = 0;
    let both = 0;
    for (let i = 0; i < ad.length; i++) {
      const x = ad[i] ?? 0;
      const y = ak[i] ?? 0;
      if (x !== 0 || y !== 0) either++;
      if (x !== 0 && y !== 0) both++;
    }
    return either > 0 && both <= either * 0.1 && oneSigned(ad) && oneSigned(ak);
  };

  const support = (amount: AmountShape, balance: number | null): number => {
    let s = 0;
    const vote = (c: number, wanted: Role) => {
      if (roles[c] === wanted) s++;
      else if (roles[c] !== null) s--;
    };
    if (amount.shape === "signed") vote(amount.column, "amount");
    else {
      vote(amount.debit, "debit");
      vote(amount.credit, "credit");
    }
    if (balance !== null) vote(balance, "balance");
    return s;
  };

  const shapes: AmountShape[] = [];
  for (const c of candidates) if (signedOk(c)) shapes.push({ shape: "signed", column: c });
  for (const d of candidates) for (const k of candidates) if (d !== k && debitCreditOk(d, k)) shapes.push({ shape: "debit-credit", debit: d, credit: k });

  const interpretations: Interpretation[] = [];
  for (const amount of shapes) {
    const used = amount.shape === "signed" ? [amount.column] : [amount.debit, amount.credit];
    for (const balance of [null, ...candidates.filter((c) => !used.includes(c))]) {
      interpretations.push({
        date, valueDate, concept, reference, code, account, extras, amount, balance, formats,
        headerSupport: support(amount, balance),
      });
    }
  }
  return { headerRow, firstRow, interpretations };
};
