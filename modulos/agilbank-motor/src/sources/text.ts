import type { Cell, Grid } from "../types";

export class NotText extends Error {}

/** Un texto que no puede ser un extracto por su tamaño. El mensaje es para el usuario. */
export class TextTooLarge extends Error {}

const MAX_BYTES = 60 * 1024 * 1024;
const MAX_LINES = 200_000;

/** Por qué un texto es demasiado grande para leerlo, o null: más de 60 MB o más de 200.000 líneas. */
export const textSizeProblem = (bytes: number, lines: number): string | null => {
  if (bytes > MAX_BYTES) return "El archivo es demasiado grande: pesa más de 60 MB, y un extracto entra en 60 MB.";
  if (lines > MAX_LINES) return "El archivo es demasiado grande: tiene más de 200.000 líneas.";
  return null;
};

/**
 * Las líneas del archivo contadas en sus bytes, sin decodificarlo ni partirlo, hasta pasar `limit`:
 * cortan \r\n, \n y \r, también los de las líneas en blanco, y un final sin salto cuenta una más.
 * Los saltos son los mismos bytes en UTF-8 y en Windows-1252. Cada vuelta busca el salto siguiente
 * con indexOf: el recorrido es por línea, no por byte, y se corta apenas pasa el tope.
 */
export const lineCount = (file: Buffer, limit: number): number => {
  let breaks = 0;
  for (let i = file.indexOf(0x0a); i !== -1 && breaks <= limit; i = file.indexOf(0x0a, i + 1)) breaks++;
  for (let i = file.indexOf(0x0d); i !== -1 && breaks <= limit; i = file.indexOf(0x0d, i + 1)) if (file[i + 1] !== 0x0a) breaks++;
  const last = file[file.length - 1];
  return last === undefined || last === 0x0a || last === 0x0d ? breaks : breaks + 1;
};

/**
 * UTF-8 si el archivo lo es de punta a punta; si no, Windows-1252, que es lo que exportan los home
 * banking. El decodificador de UTF-8 ya saca la marca de orden de bytes.
 */
export const decodeText = (file: Buffer): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file);
  } catch {
    return new TextDecoder("windows-1252").decode(file);
  }
};

/** Binario: más del 1 % de caracteres de control en los primeros 4.096. */
const looksBinary = (text: string): boolean => {
  const sample = text.slice(0, 4096);
  const control = sample.match(/[\u0000-\u0008\u000E-\u001F]/g)?.length ?? 0;
  return control > sample.length * 0.01;
};

const SEPARATORS = [";", "\t", "|", ","];
const DATE_IN_LINE = /(?<!\d)(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})(?!\d)/;
const ARGENTINE_DECIMAL = /\d,\d{2}(?!\d)/;

/**
 * El texto partido en registros y campos de una vez, para que un salto de línea entre comillas quede
 * dentro del campo y no parta el registro. Las comillas solo abren al principio de un campo.
 */
const splitRecords = (text: string, separator: string): string[][] => {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"' && current.trim() === "") {
      quoted = true;
      current = "";
    } else if (ch === separator) {
      fields.push(current);
      current = "";
    } else if (ch === "\n") {
      fields.push(current);
      records.push(fields);
      fields = [];
      current = "";
    } else current += ch;
  }
  fields.push(current);
  records.push(fields);
  return records;
};

/** El valor más repetido; entre los empatados, el mayor. Sin valores, 0. */
export const mode = (values: number[]): number => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
};

/**
 * El separador que parte más líneas en la misma cantidad de campos.
 *
 * La coma se descarta si las líneas traen la coma decimal argentina sin comillas: en un CSV de verdad
 * con importes argentinos, esos importes van entre comillas.
 */
export const chooseSeparator = (lines: string[]): string | null => {
  const sample = lines.filter((l) => l.trim() !== "").slice(0, 200);
  let best: { separator: string; score: number } | null = null;
  for (const separator of SEPARATORS) {
    if (separator === ",") {
      const unquoted = sample.filter((l) => ARGENTINE_DECIMAL.test(l.replace(/"[^"]*"/g, ""))).length;
      if (unquoted >= sample.length / 2) continue;
    }
    const counts = sample.map((l) => splitRecords(l, separator)[0].length);
    const m = mode(counts);
    if (m < 2) continue;
    const score = counts.filter((n) => n === m).length;
    if (!best || score > best.score) best = { separator, score };
  }
  return best?.separator ?? null;
};

/**
 * Un TXT de ancho fijo. Las columnas salen de donde todas las filas con fecha tienen un espacio; cada
 * renglón se arma con palabras enteras, cada una en la columna que más pisa (o la más cercana si
 * no pisa ninguna): un encabezado alineado a la izquierda sobre importes alineados a la derecha, o un
 * «Saldo anterior» más ancho que su columna, no pierden ni cortan nada.
 *
 * Partir por espacios dobles perdería la posición: una columna de débito vacía desaparecería y el
 * crédito quedaría en su lugar.
 */
const splitByWidth = (lines: string[]): string[][] => {
  const data = lines.filter((l) => DATE_IN_LINE.test(l));
  if (data.length === 0) return lines.map((l) => l.trim().split(/\s{2,}/));
  // Las columnas salen solo de las filas con fecha: más allá de la más ancha todo es separación.
  let width = 0;
  for (const l of data) if (l.length > width) width = l.length;
  const occupied = new Uint8Array(width);
  for (const l of data) for (let i = 0; i < l.length; i++) if (l[i] !== " ") occupied[i] = 1;
  const spans: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= width; i++) {
    const isGap = i === width || occupied[i] === 0;
    if (!isGap && start < 0) start = i;
    if (isGap && start >= 0) {
      spans.push([start, i]);
      start = -1;
    }
  }
  return lines.map((line) => {
    const cells: string[][] = spans.map(() => []);
    // Las palabras y las columnas vienen ordenadas por posición: cada palabra solo puede caer en la
    // última columna que quedó a su izquierda, en las que pisa o en la primera a su derecha. Con un
    // solo recorrido de las dos listas la línea se arma en tiempo lineal.
    let first = 0;
    for (const word of line.matchAll(/\S+/g)) {
      const from = word.index;
      const to = from + word[0].length;
      while (first < spans.length && spans[first][1] <= from) first++;
      let best = Math.max(first - 1, 0);
      let bestOverlap = -Infinity;
      for (let i = best; i < spans.length; i++) {
        const [a, b] = spans[i];
        const overlap = Math.min(to, b) - Math.max(from, a);
        if (overlap > bestOverlap) {
          best = i;
          bestOverlap = overlap;
        }
        if (a >= to) break;
      }
      cells[best].push(word[0]);
    }
    return cells.map((words) => words.join(" "));
  });
};

/** Un CSV o un TXT llevado a una grilla de texto: los importes se interpretan después, por columna. */
export const gridFromText = (file: Buffer): Grid => {
  // El tamaño se mira antes de decodificar y de partir: un archivo demasiado grande no se lee, sea lo que sea.
  const tooLarge = textSizeProblem(file.length, lineCount(file, MAX_LINES));
  if (tooLarge !== null) throw new TextTooLarge(tooLarge);
  const text = decodeText(file);
  if (looksBinary(text)) throw new NotText("El archivo no es una planilla ni un texto.");
  const lines = text.split(/\r\n|\n|\r/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  const separator = chooseSeparator(lines);
  const raw = separator === null ? splitByWidth(lines) : splitRecords(lines.join("\n"), separator);
  const rows = raw.map((r) => r.map((c): Cell => (c.trim() === "" ? null : c.trim())));
  return { origin: "text", sheet: null, rows };
};
