// Dónde están de verdad las palabras de una caja del OCR. El módulo reparte el ancho de una caja entre
// sus palabras por la cantidad de caracteres: adentro, la posición es inventada, y un débito y un
// crédito con el mismo texto dan la misma caja. Los huecos entre palabras sí están en los píxeles:
// las columnas sin tinta. Esto es medición, no inferencia: nada de acá mira el valor de un importe ni
// un saldo, solo si una palabra tiene forma de importe.
import { AMOUNT, splitGluedAmount } from "./words";

/** Una imagen en grises: un byte por píxel, fila por fila, de 0 (negro) a 255 (blanco). */
export interface Gray {
  ancho: number;
  alto: number;
  datos: Uint8Array;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Más oscuro que esto es tinta. Es la mitad de la escala: el render de poppler es texto negro sobre
 * blanco, con el antialias en el medio. Un borde gris claro no cuenta, uno gris oscuro sí; correrlo
 * mueve el borde de una letra en un píxel, no el hueco entre dos palabras.
 */
export const INK_THRESHOLD = 128;

/**
 * Un hueco de columna mide esto en caracteres, o más. Entre dos palabras de un texto hay uno, y entre
 * dos letras menos: lo que separa un concepto de un importe, o un débito del saldo, son varios. Si con
 * el primero no hay reparto (un texto con un hueco ancho adentro queda partido en dos tramos), se
 * prueba con el siguiente.
 */
const COLUMN_GAPS = [2, 3, 4];

/**
 * Un tramo que queda con un ancho por carácter más de esto veces lejos de la mediana de la caja no es
 * el de sus palabras: el corte encontró otro hueco (un importe que el OCR pegó a otro, por ejemplo).
 */
const CHAR_SPREAD = 3;

/**
 * Un tramo se ubica si no mide más que sus caracteres por esta parte: si mide más, tiene tinta de una
 * palabra vecina que quedó a menos de un hueco de columna, y el rango no es el de sus palabras. Puede
 * medir menos, porque en una letra proporcional los puntos y las comas de un importe son angostos,
 * pero no menos que `NARROWEST` de sus caracteres: eso es una mancha.
 */
const ALONE_TOLERANCE = 0.25;
const NARROWEST = 0.5;

/**
 * Una caja con una fila de píxeles oscura en más de esta parte de su ancho no se mide: el texto nunca
 * llena una fila (hay huecos entre las letras y las palabras), una línea que la cruza o un fondo oscuro sí.
 */
const DARK_ROW = 0.5;

/** Una palabra ubicada por la tinta: `measured` si su borde derecho, el que alinea un importe, se midió. */
export interface Placed {
  x: number;
  w: number;
  measured: boolean;
}

/** Un hueco de un espacio, en caracteres: entre las cifras de un importe el aire es menor. */
const SPACE = 0.6;

/**
 * Una línea fina (un subrayado, un pedazo de regla en el hueco) no es tinta de una palabra y no puede
 * recibir un importe: un trazo (columnas de tinta seguidas) cuyo oscuro no llega a `INK_HEIGHT` del
 * alto de la caja en ninguna columna y que es `LINE_ASPECT` veces más ancho que alto. Las dos
 * condiciones hacen falta: en el render a 150 dpi, la mitad de los trazos de las cifras y las letras
 * quedan por debajo del cuarto del alto (medido en los PDF de la etapa), pero ninguno es tan ancho
 * para su alto; el punto de un importe es bajo y angosto, y se queda.
 */
const INK_HEIGHT = 0.25;
const LINE_ASPECT = 8;

/**
 * Cuántos píxeles de tinta hay en cada columna de la caja, desde `floor(x)` hasta `ceil(x + w)`,
 * recortada a la imagen; 0 en los trazos de una línea fina.
 */
export const inkColumns = (gray: Gray, box: Box, threshold = INK_THRESHOLD): number[] => {
  const left = Math.floor(box.x);
  const right = Math.ceil(box.x + box.w);
  const top = Math.max(0, Math.floor(box.y));
  const bottom = Math.min(gray.alto, Math.ceil(box.y + box.h));
  const out: number[] = [];
  for (let x = Math.max(0, left); x < Math.min(gray.ancho, right); x++) {
    let n = 0;
    for (let y = top; y < bottom; y++) if (gray.datos[y * gray.ancho + x] < threshold) n++;
    out.push(n);
  }
  const tall = INK_HEIGHT * (bottom - top);
  for (let i = 0; i < out.length; ) {
    let end = i;
    while (end < out.length && out[end] > 0) end++;
    const high = end > i ? Math.max(...out.slice(i, end)) : 0;
    if (end > i && high < tall && end - i >= LINE_ASPECT * high) out.fill(0, i, end);
    i = end + 1;
  }
  return out;
};

/**
 * Las palabras de la caja que quedan solas en un tramo de tinta, con su rango real; `null` para las
 * demás, o en lugar de todo si el corte no cierra. Un tramo hecho solo de importes (`isAmount`) es de
 * importes impresos pegados: se reparte por sus caracteres.
 *
 * Solo se corta en los huecos de columna (`COLUMN_GAPS` caracteres o más): los espacios entre las
 * palabras de un texto se confunden con los de adentro de una palabra, pero el de una columna no. El
 * ancho de un carácter sale de la tinta de los tramos: se arranca con el de la caja entera y se
 * recalcula sin los huecos de columna hasta que el corte no cambia. Las palabras se reparten en orden
 * entre los tramos, con el reparto en que cada tramo mide lo más parecido a sus caracteres; con más
 * tramos que palabras, o con un tramo de un ancho por carácter lejos del resto, no hay corte. El
 * perfil empieza en la columna `floor(box.x)`.
 */
export const placeByInk = (
  tokens: string[],
  box: Box,
  ink: number[],
  isAmount: (text: string) => boolean = () => false,
): Array<Placed | null> | null => {
  const strips: Array<{ start: number; end: number }> = [];
  ink.forEach((n, i) => {
    if (n === 0) return;
    const last = strips[strips.length - 1];
    if (last && last.end === i) last.end = i + 1;
    else strips.push({ start: i, end: i + 1 });
  });
  if (tokens.length === 0 || strips.length === 0) return null;
  for (const gap of COLUMN_GAPS) {
    const placed = placeWithGap(tokens, box, strips, gap, isAmount);
    if (placed !== null) return placed;
  }
  return null;
};

const placeWithGap = (
  tokens: string[],
  box: Box,
  strips: Array<{ start: number; end: number }>,
  columnGap: number,
  isAmount: (text: string) => boolean,
): Array<Placed | null> | null => {
  const n = tokens.length;
  const sums = tokens.reduce((acc, t) => [...acc, acc[acc.length - 1] + t.length], [0]);
  const chars = (a: number, b: number): number => sums[b] - sums[a] + b - a - 1;
  const segmentsAt = (charWidth: number): Array<{ start: number; end: number }> => {
    const out = [{ ...strips[0] }];
    for (let k = 1; k < strips.length; k++) {
      if (strips[k].start - strips[k - 1].end >= columnGap * charWidth) out.push({ ...strips[k] });
      else out[out.length - 1].end = strips[k].end;
    }
    return out;
  };
  let charWidth = (strips[strips.length - 1].end - strips[0].start) / chars(0, n);
  let segs = segmentsAt(charWidth);
  for (let round = 0; round < 3 && segs.length <= n; round++) {
    charWidth = segs.reduce((s, g) => s + g.end - g.start, 0) / (chars(0, n) - (segs.length - 1));
    const next = segmentsAt(charWidth);
    if (next.length === segs.length) break;
    segs = next;
  }
  const S = segs.length;
  if (S > n) return null;

  // cost[i][s]: el menor desvío repartiendo las primeras i palabras en los primeros s tramos.
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(S + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Array<number>(S + 1).fill(0));
  cost[0][0] = 0;
  for (let s = 1; s <= S; s++) {
    for (let i = s; i <= n - (S - s); i++) {
      for (let j = s - 1; j < i; j++) {
        const c = cost[j][s - 1] + Math.abs(segs[s - 1].end - segs[s - 1].start - chars(j, i) * charWidth);
        if (c < cost[i][s]) {
          cost[i][s] = c;
          from[i][s] = j;
        }
      }
    }
  }
  const bounds = [n];
  for (let s = S, i = n; s > 0; s--) {
    i = from[i][s];
    bounds.unshift(i);
  }
  const perChar = segs.map((g, s) => (g.end - g.start) / chars(bounds[s], bounds[s + 1]));
  const typical = [...perChar].sort((a, b) => a - b)[Math.floor(perChar.length / 2)];
  if (perChar.some((c) => c > typical * CHAR_SPREAD || c < typical / CHAR_SPREAD)) return null;

  const origin = Math.floor(box.x);
  const out: Array<Placed | null> = new Array(n).fill(null);
  segs.forEach((g, s) => {
    const [a, b] = [bounds[s], bounds[s + 1]];
    const width = g.end - g.start;
    const expected = chars(a, b) * charWidth;
    if (width - expected > ALONE_TOLERANCE * expected || width < NARROWEST * expected) return;
    if (b - a === 1) out[a] = { x: origin + g.start, w: width, measured: true };
    else if (columnGap === COLUMN_GAPS[0] && tokens.slice(a, b).every(isAmount)) {
      // Un tramo de puros importes, solo con el hueco de columna más angosto (con uno más ancho puede
      // juntar dos columnas). Si sus huecos de un espacio son tantos como los cortes, se corta en ellos;
      // si no tiene ninguno, son importes impresos pegados y se reparten por sus caracteres.
      const inside = strips.filter((t) => t.start >= g.start && t.end <= g.end);
      const cuts = inside.slice(1).filter((t, k) => t.start - inside[k].end >= SPACE * charWidth);
      if (cuts.length === b - a - 1) {
        const starts = [g.start, ...cuts.map((t) => t.start)];
        const ends = [...cuts.map((t) => inside[inside.indexOf(t) - 1].end), g.end];
        // Cada pedazo tiene que medir lo que sus caracteres, como un tramo: si uno no, ninguno se mide.
        const fits = (k: number): boolean => {
          const piece = ends[k - a] - starts[k - a];
          const own = tokens[k].length * charWidth;
          return piece <= (1 + ALONE_TOLERANCE) * own && piece >= NARROWEST * own;
        };
        if (!Array.from({ length: b - a }, (_, i) => a + i).every(fits)) return;
        for (let k = a; k < b; k++) out[k] = { x: origin + starts[k - a], w: ends[k - a] - starts[k - a], measured: true };
      } else if (cuts.length === 0) {
        // Repartir por caracteres no es medir: solo el borde derecho del último es tinta propia.
        const share = width / (sums[b] - sums[a]);
        let at = g.start;
        for (let k = a; k < b; k++) {
          out[k] = { x: origin + at, w: tokens[k].length * share, measured: k === b - 1 };
          at += tokens[k].length * share;
        }
      }
    }
  });
  return out;
};

/**
 * Las cajas del OCR, como índices de las palabras: el módulo da las palabras de una caja seguidas, con
 * la misma altura y el mismo alto, de izquierda a derecha.
 */
export const boxesOf = (words: Box[]): number[][] => {
  const out: number[][] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const current = out[out.length - 1];
    if (current && prev.y === w.y && prev.h === w.h && w.x >= prev.x) current.push(i);
    else out.push([i]);
  });
  return out;
};

/**
 * Las palabras de una página del OCR con la posición medida de los importes que quedan solos en su
 * tramo de tinta (también dos importes que el OCR pegó: se separan después, por sus caracteres, dentro
 * del rango medido). El texto y los importes que comparten su tramo quedan como estaban.
 */
export const measureAmounts = <W extends Box & { text: string; measured?: boolean; ocr?: { x: number; w: number } }>(
  words: W[],
  gray: Gray,
  isAmount: (text: string) => boolean = amountOrGlued,
): W[] => {
  const out = [...words];
  for (const box of boxesOf(words)) {
    if (box.length < 2) continue;
    const first = words[box[0]];
    const last = words[box[box.length - 1]];
    const area = { x: first.x, y: first.y, w: last.x + last.w - first.x, h: first.h };
    if (darkestRow(gray, area) > DARK_ROW) continue;
    const placed = placeByInk(box.map((i) => words[i].text), area, inkColumns(gray, area), isAmount);
    box.forEach((i, k) => {
      const at = placed?.[k];
      // La caja del OCR queda guardada: el enderezado la necesita para saber qué está antes de qué.
      if (at?.measured && isAmount(words[i].text)) out[i] = { ...words[i], x: at.x, w: at.w, measured: true, ocr: { x: words[i].x, w: words[i].w } };
    });
  }
  return out;
};

/** La parte del ancho de la caja que ocupa la fila de píxeles más oscura. */
export const darkestRow = (gray: Gray, box: Box, threshold = INK_THRESHOLD): number => {
  const left = Math.max(0, Math.floor(box.x));
  const right = Math.min(gray.ancho, Math.ceil(box.x + box.w));
  let most = 0;
  for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(gray.alto, Math.ceil(box.y + box.h)); y++) {
    let n = 0;
    for (let x = left; x < right; x++) if (gray.datos[y * gray.ancho + x] < threshold) n++;
    most = Math.max(most, n);
  }
  return right > left ? most / (right - left) : 0;
};

/** Una palabra con forma de importe, también dos importes pegados: el OCR puede dar el menos tipográfico. */
export const amountOrGlued = (text: string): boolean => {
  const t = text.replace(/\u2212/g, "-");
  return AMOUNT.test(t) || splitGluedAmount({ text: t, x: 0, y: 0, w: 1, h: 1 }, null).length > 1;
};
