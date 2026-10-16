import { formatOf, type FileFormat } from "../sources/format";
import { gridsFromMarkup, gridsFromSpreadsheet } from "../sources/spreadsheet";
import { gridFromText } from "../sources/text";
import type { Grid } from "../types";
import { isoDate, normalizeConcept, numberFormatOf, parseCents, textOf } from "../values";
import { LIMITS, type BatchTransfer } from "./types";

export type BatchReading = { ok: true; transfers: BatchTransfer[] } | { ok: false; reason: string };

type Column = "cuit" | "number" | "amount" | "status" | "payDate";
/** Los rótulos de los archivos de pagos de los bancos, normalizados. Solo con monto y estado se lee el lote. */
const LABELS: Array<[Column, RegExp]> = [
  ["cuit", /^cuit( beneficiario)?$/],
  ["number", /^(numero|nro) de pago$/],
  ["amount", /^(monto|importe)$/],
  ["status", /^estado$/],
  ["payDate", /^fecha de pago$/],
];
/** «Error de forma» o «Rechazada por el banco» también: un estado que empieza así es una transferencia que el banco no pagó. */
const FAILED = /^(error|rechazad)/;
const UNREADABLE = "El archivo del lote no se puede leer: tiene que ser el CSV o la planilla que descarga el banco.";

const columnsOf = (header: string[]): Partial<Record<Column, number>> => {
  const out: Partial<Record<Column, number>> = {};
  header.forEach((h, i) => {
    const label = normalizeConcept(h);
    for (const [col, re] of LABELS) if (out[col] === undefined && re.test(label)) out[col] = i;
  });
  return out;
};

const READERS: Partial<Record<FileFormat, (file: Buffer) => Grid[]>> = {
  text: (file) => [gridFromText(file)],
  markup: gridsFromMarkup,
  xlsx: gridsFromSpreadsheet,
  xls: gridsFromSpreadsheet,
};

/** Las grillas del archivo, o null si no es un texto ni una planilla. Los lectores tiran con un archivo que no pueden leer. */
const gridsOf = (file: Buffer): Grid[] | null => {
  const read = READERS[formatOf(file)];
  if (!read) return null;
  try {
    return read(file);
  } catch {
    return null;
  }
};

export const readBatch = (file: Buffer): BatchReading => {
  const grids = gridsOf(file);
  if (grids === null) return { ok: false, reason: UNREADABLE };
  for (const grid of grids) {
    const headerAt = grid.rows.findIndex((r) => {
      const c = columnsOf(r.map(textOf));
      return c.amount !== undefined && c.status !== undefined;
    });
    if (headerAt < 0) continue;
    const cols = columnsOf(grid.rows[headerAt].map(textOf));
    const amountAt = cols.amount as number;
    const body = grid.rows.slice(headerAt + 1).filter((r) => r.some((c) => textOf(c) !== ""));
    if (body.length > LIMITS.transfers) return { ok: false, reason: "El lote trae más de 5.000 transferencias." };
    const format = numberFormatOf(body.map((r) => textOf(r[amountAt])));
    const transfers: BatchTransfer[] = [];
    for (const r of body) {
      const cents = parseCents(r[amountAt], format);
      if (cents === null) return { ok: false, reason: `Un monto del lote no se pudo leer: «${textOf(r[amountAt])}».` };
      const cuit = cols.cuit === undefined ? "" : textOf(r[cols.cuit]).replace(/\D/g, "");
      transfers.push({
        cuit: cuit === "" ? null : cuit,
        number: cols.number === undefined ? null : textOf(r[cols.number]) || null,
        amountCents: Math.abs(cents),
        failed: FAILED.test(normalizeConcept(textOf(r[cols.status as number]))),
        payDate: cols.payDate === undefined ? null : isoDate(r[cols.payDate]),
      });
    }
    return { ok: true, transfers };
  }
  return { ok: false, reason: "No se reconocen las columnas del lote: hacen falta al menos el monto y el estado." };
};
