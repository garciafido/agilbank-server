import * as XLSX from "xlsx";
import type { Cell, Grid } from "../types";
import { decodeText } from "./text";

/** Una planilla que no es un extracto: celdas lejos de donde puede estar uno. El mensaje es para el usuario. */
export class SpreadsheetTooLarge extends Error {}

const MAX_ROWS = 50_000;
const MAX_COLUMNS = 256;
const MAX_CELLS = 5_000_000;

const count = new Intl.NumberFormat("es-AR");

/**
 * Por qué una planilla es demasiado grande para armar sus grillas, o null. Cada hoja tiene su tope de
 * filas y de columnas, y el libro entero un presupuesto de celdas: las grillas se arman densas, y unas
 * pocas celdas sueltas y lejanas en cada hoja, en un archivo de unos KB, pedirían gigas de memoria. El
 * área de las combinadas cuenta en el mismo presupuesto: vaciarlas cuesta lo que ocupan.
 */
export const spreadsheetSizeProblem = (sheets: Array<{ lastRow: number; lastCol: number; mergedCells?: number }>): string | null => {
  for (const { lastRow, lastCol } of sheets) {
    if (lastRow >= MAX_ROWS || lastCol >= MAX_COLUMNS) {
      return `La planilla es demasiado grande: tiene celdas hasta la fila ${lastRow + 1} y la columna ${XLSX.utils.encode_col(lastCol)}; un extracto entra en 50.000 filas y 256 columnas.`;
    }
  }
  const merged = sheets.reduce((sum, { mergedCells }) => sum + (mergedCells ?? 0), 0);
  const cells = sheets.reduce((sum, { lastRow, lastCol }) => sum + (lastRow + 1) * (lastCol + 1), merged);
  if (cells <= MAX_CELLS) return null;
  const counting = merged > 0 ? ", contando las combinadas" : "";
  return `La planilla es demasiado grande: sus hojas ocupan ${count.format(cells)} celdas${counting}, y un extracto entra en 5.000.000.`;
};

/** Las celdas que ocupan unas combinadas. */
export const mergedArea = (merges: XLSX.Range[]): number => merges.reduce((sum, { s, e }) => sum + (e.r - s.r + 1) * (e.c - s.c + 1), 0);

/** Las combinadas recortadas a la hoja, sin las que empiezan fuera de ella ni las que quedan repetidas. */
export const clipMerges = (merges: XLSX.Range[], lastRow: number, lastCol: number): XLSX.Range[] => {
  const seen = new Set<string>();
  const clipped: XLSX.Range[] = [];
  for (const { s, e } of merges) {
    const range = { s, e: { r: Math.min(e.r, lastRow), c: Math.min(e.c, lastCol) } };
    if (s.r < 0 || s.c < 0 || s.r > range.e.r || s.c > range.e.c) continue;
    const key = XLSX.utils.encode_range(range);
    if (seen.has(key)) continue;
    seen.add(key);
    clipped.push(range);
  }
  return clipped;
};

const MAX_MARKUP_BYTES = 20 * 1024 * 1024;
const MAX_MARKUP_MERGES = 2_000;
const MAX_MARKUP_CELLS = 100_000;
const MAX_MARKUP_WORK = 100_000_000;

const MARKUP_TAG = /<(?:\w+:)?(tr|td|th|row|cell)\b([^>]*)>/gi;
const MARKUP_SPAN = /\s(?:\w+:)?(rowspan|colspan|mergedown|mergeacross)\s*=\s*["']?\s*([^"'\s>]*)/gi;

/**
 * Las filas, las celdas y las combinadas de una tabla HTML o una planilla XML 2003, contadas en el
 * texto crudo. De cada combinada, cuántas filas tapa debajo de la suya.
 */
const markupShape = (text: string): { rows: number; cells: number; spans: number[] } => {
  let rows = 0;
  let cells = 0;
  const spans: number[] = [];
  for (const [, name, attributes] of text.matchAll(MARKUP_TAG)) {
    const tag = name.toLowerCase();
    if (tag === "tr" || tag === "row") {
      rows++;
      continue;
    }
    cells++;
    let merged = false;
    let down = 0;
    for (const [, key, value] of attributes.matchAll(MARKUP_SPAN)) {
      const attribute = key.toLowerCase();
      // Como los lee SheetJS: el HTML con `+valor` y combina desde 2; la planilla XML con parseInt y combina desde 1.
      const extent = attribute === "rowspan" || attribute === "colspan" ? Number(value) - 1 : parseInt(value, 10) | 0;
      if (extent > 0) merged = true;
      if (extent > 0 && (attribute === "rowspan" || attribute === "mergedown")) down = extent;
    }
    if (merged) spans.push(down);
  }
  return { rows, cells, spans };
};

/**
 * Por qué una tabla HTML o una planilla XML 2003 es demasiado grande para dársela a SheetJS, o null.
 * Se mira en el texto crudo, antes de leerla: el lector de HTML compara cada celda con todas las
 * combinadas anteriores, y vuelve a empezar cada vez que una combinada de más arriba tapa la celda, así
 * que unos KB de combinadas bloquean el proceso. Su trabajo es las combinadas por las celdas más las
 * filas tapadas.
 */
export const markupSizeProblem = (file: Buffer): string | null => {
  if (file.length > MAX_MARKUP_BYTES) return "La planilla es demasiado grande: pesa más de 20 MB, y un extracto entra en 20 MB.";
  const { rows, cells, spans } = markupShape(file.toString("latin1"));
  if (spans.length > MAX_MARKUP_MERGES) return "La planilla es demasiado grande: tiene más de 2.000 celdas combinadas.";
  if (cells > MAX_MARKUP_CELLS) return "La planilla es demasiado grande: tiene más de 100.000 celdas.";
  const covered = spans.reduce((sum, down) => sum + Math.min(down, rows), 0);
  return spans.length * (cells + covered) > MAX_MARKUP_WORK ? "La planilla es demasiado grande: tiene demasiadas celdas combinadas para leerla." : null;
};

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Una planilla (XLSX, XLS u ODS) llevada a una grilla por hoja, con las coordenadas de la hoja: la
 * fila 0 de la grilla es la fila 1 aunque esté vacía, para que la procedencia nombre la celda real.
 *
 * Las fechas se arman con el código de fecha de la planilla, nunca con un Date: un Date lleva zona
 * horaria y corre el día. Así se leen igual el número de serie con formato de fecha y la fecha ISO
 * (t="d") que escribe Galicia.
 *
 * El tamaño sale de las celdas que existen y no del rango declarado: hay planillas que declaran un
 * millón de filas. Pero una sola celda suelta y lejana igual estira la grilla hasta ella, así que
 * pasados los topes (`spreadsheetSizeProblem`) no se arma ninguna y se lanza SpreadsheetTooLarge.
 *
 * Una celda combinada vale en la de arriba a la izquierda; el resto del rango queda vacío aunque el
 * programa que escribió el archivo haya dejado valores en él.
 */
export const gridsFromSpreadsheet = (file: Buffer): Grid[] => gridsFromBook(XLSX.read(file, { type: "buffer", cellNF: true, cellDates: false }));

/**
 * Una tabla HTML o una planilla XML 2003 llevada a grillas, como una planilla. El texto lo decodifica
 * el motor (UTF-8 o Windows-1252) y SheetJS lo lee con `raw`: sin esa opción interpreta «01/07/2026»
 * como 7 de enero y «1.100,00» como 1,1. Las fechas y los importes escritos como texto quedan como
 * texto y los interpreta el motor, por columna. Las celdas con tipo de la planilla XML conservan el suyo.
 */
export const gridsFromMarkup = (file: Buffer): Grid[] => {
  const problem = markupSizeProblem(file);
  if (problem !== null) throw new SpreadsheetTooLarge(problem);
  return gridsFromBook(XLSX.read(decodeText(file), { type: "string", raw: true, cellNF: true, cellDates: false }));
};

const gridsFromBook = (book: XLSX.WorkBook): Grid[] => {
  const date1904 = Boolean(book.Workbook?.WBProps?.date1904);
  const sheets = book.SheetNames.map((sheet) => {
    const ws = book.Sheets[sheet];
    let lastRow = -1;
    let lastCol = -1;
    for (const address of Object.keys(ws)) {
      if (address.startsWith("!")) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      if (r > lastRow) lastRow = r;
      if (c > lastCol) lastCol = c;
    }
    const merges = clipMerges(ws["!merges"] ?? [], lastRow, lastCol);
    return { sheet, ws, lastRow, lastCol, merges, mergedCells: mergedArea(merges) };
  });
  const problem = spreadsheetSizeProblem(sheets);
  if (problem !== null) throw new SpreadsheetTooLarge(problem);
  return sheets.map(({ sheet, ws, lastRow, lastCol, merges }): Grid => {
    const rows: Cell[][] = [];
    for (let r = 0; r <= lastRow; r++) {
      const row: Cell[] = [];
      for (let c = 0; c <= lastCol; c++) {
        row.push(cellValue(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined, date1904));
      }
      rows.push(row);
    }
    for (const { s, e } of merges) {
      for (let r = s.r; r <= e.r; r++) {
        for (let c = s.c; c <= e.c; c++) {
          if (r !== s.r || c !== s.c) rows[r][c] = null;
        }
      }
    }
    return { origin: "cell", sheet, rows };
  });
};

export const cellValue = (cell: XLSX.CellObject | undefined, date1904: boolean): Cell => {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z !== undefined && XLSX.SSF.is_date(cell.z)) {
      if (cell.v < 0) return null;
      if (cell.v < 1) return XLSX.SSF.format(cell.z, cell.v).trim() || null;
      const d = XLSX.SSF.parse_date_code(cell.v, { date1904 });
      return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null;
    }
    return cell.v;
  }
  if (cell.t === "d" && cell.v instanceof Date) {
    return `${cell.v.getUTCFullYear()}-${pad(cell.v.getUTCMonth() + 1)}-${pad(cell.v.getUTCDate())}`;
  }
  if (cell.t === "s") {
    const text = String(cell.v).trim();
    return text === "" ? null : text;
  }
  return null;
};
