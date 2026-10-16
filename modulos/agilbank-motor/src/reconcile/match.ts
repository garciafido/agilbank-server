import type { StatementLine } from "../types";
import type { OwnAccount, Party, PendingValue } from "./types";

/** La ventana cuando el pedido no dice otra. */
export const WINDOW_DAYS = 5;
export const MIN_NUMBER_DIGITS = 4;
const MAX_NUMBER_DIGITS = 10;

/** La fecha con que el banco ve el valor: un cheque emitido se debita desde su fecha valor; uno recibido, desde el depósito. */
export const referenceDate = (v: PendingValue): string | null =>
  v.amountCents < 0 ? v.valueDate ?? v.voucherDate : v.depositDate ?? v.valueDate ?? v.voucherDate;

export const daysBetween = (a: string, b: string): number => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Los días hasta la fecha de referencia, si cae en la ventana: el primer tramo de las pasadas de la ventana. */
export const inReferenceWindow = (line: StatementLine, v: PendingValue, windowDays: number): number | null => {
  const ref = referenceDate(v);
  if (!ref) return null;
  const days = daysBetween(line.date, ref);
  return days <= windowDays ? days : null;
};

/** Las fechas que trae el valor: el comprobante, la fecha valor y el depósito. */
export const valueDates = (v: PendingValue): string[] => [v.voucherDate, v.valueDate, v.depositDate].filter((d): d is string => d !== null);

/** Los días hasta la fecha más cercana del valor, si alguna cae en la ventana: el banco puede ver el valor por cualquiera. */
export const inWindow = (line: StatementLine, v: PendingValue, windowDays: number): number | null => {
  let best: number | null = null;
  for (const date of valueDates(v)) {
    const days = daysBetween(line.date, date);
    if (days <= windowDays && (best === null || days < best)) best = days;
  }
  return best;
};

const stripZeros = (d: string): string => d.replace(/^0+/, "");

/** Un grupo de dígitos entero y no pegado a otro por `/ - . ,`: así no se toma el año de una fecha, un tramo de un CUIT con guiones ni los miles de un importe. */
const STANDALONE_DIGITS = /(?<!\d[/.,-]|\d)\d+(?!\d|[/.,-]\d)/g;

const asNumber = (digits: string): string | null => {
  const n = stripZeros(digits);
  return n.length >= MIN_NUMBER_DIGITS && digits.length <= MAX_NUMBER_DIGITS ? n : null;
};

/** El número del renglón: su referencia, o el último número del concepto que no es un CUIT, un CBU, una fecha ni un importe. */
export const lineNumber = (line: StatementLine): string | null => {
  const fromReference = line.reference ? asNumber(line.reference.replace(/\D/g, "")) : null;
  if (fromReference) return fromReference;
  const runs = line.bank.text.match(STANDALONE_DIGITS) ?? [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const n = asNumber(runs[i]);
    if (n) return n;
  }
  return null;
};

export const numberMatches = (lineNum: string | null, valueNum: string | null): boolean =>
  !!lineNum && !!valueNum && lineNum.length >= MIN_NUMBER_DIGITS && valueNum.endsWith(lineNum);

export const partyKey = (p: Party): string => `${p.role}:${p.id}`;

export const partyOf = (v: PendingValue, parties: Map<string, Party>): { cuit: string | null; cbu: string | null } => {
  const p = (v.supplierId && parties.get(`supplier:${v.supplierId}`)) || (v.customerId && parties.get(`customer:${v.customerId}`)) || null;
  return { cuit: p?.cuit ?? v.drawerCuit, cbu: p?.cbu ?? null };
};

export const partyMatch = (line: StatementLine, v: PendingValue, parties: Map<string, Party>): { cuit?: string; cbu?: string } | null => {
  const cp = line.counterparty;
  if (!cp) return null;
  const p = partyOf(v, parties);
  if (cp.cuit && p.cuit && cp.cuit === p.cuit) return { cuit: cp.cuit };
  if (cp.cbu && p.cbu && cp.cbu === p.cbu) return { cbu: cp.cbu };
  return null;
};

/** Los dos traen CUIT y son distintos: es otro pagador u otro beneficiario, aunque el importe y la fecha coincidan. */
export const partyContradicts = (line: StatementLine, v: PendingValue, parties: Map<string, Party>): boolean => {
  const cuit = line.counterparty?.cuit;
  const other = partyOf(v, parties).cuit;
  return !!cuit && !!other && cuit !== other;
};

const plain = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Normalizar el tipo cuesta: con miles de valores en la ventana de cada renglón, se hace una vez por valor. */
const transferByValue = new WeakMap<PendingValue, boolean>();

/** Un valor de transferencia, por el tipo que trae de ProntoNet: el tipo del renglón no alcanza, un cheque de otro CUIT es otro pagador. */
export const isTransfer = (v: PendingValue): boolean => {
  let transfer = transferByValue.get(v);
  if (transfer === undefined) transferByValue.set(v, (transfer = plain(v.kind).includes("transferencia")));
  return transfer;
};

/**
 * Lo que dice un CUIT que contradice. En un valor de transferencia suele ser un tercero que paga por otro: el valor sigue
 * siendo candidato, y el apareo sale weak con la marca. En lo demás es otro pagador u otro beneficiario: queda afuera.
 */
export const partyConflict = (line: StatementLine, v: PendingValue, parties: Map<string, Party>): "third-party" | "excluded" | null =>
  partyContradicts(line, v, parties) ? (isTransfer(v) ? "third-party" : "excluded") : null;

/** Los CBU de las cuentas propias, armado una vez: con 16 MB de cuentas, recorrerlas por renglón no termina a tiempo. */
export const ownAccountCbus = (own: OwnAccount[]): Set<string> => new Set(own.flatMap((a) => (a.cbu ? [a.cbu] : [])));

export const isOwnAccount = (line: StatementLine, ownCbus: Set<string>): boolean => {
  const cbu = line.counterparty?.cbu;
  return !!cbu && ownCbus.has(cbu);
};
