import { filasPorGeometria } from "@agilmind/lectura";
import type { Cell, Grid, Place } from "../types";
import { roleOf, type Role } from "../columns";
import { isoDate, parseCents, type NumberFormat } from "../values";

/** Una palabra con su caja, en la unidad de su página: puntos si salió del texto del PDF, píxeles si del OCR. */
interface WordBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Una palabra con su caja. En el OCR puede estar medida en los píxeles (ver `ink.ts`): entonces guarda
 * en `ocr` dónde la había puesto el reparto de su caja, y el tipo no deja marcarla medida sin eso.
 */
export type Word = WordBox & ({ measured?: false; ocr?: undefined } | { measured: true; ocr: { x: number; w: number } });

/** Una palabra en la grilla: `estimated` si su posición es una estimación (ver `straightenOcrBoxes`). */
type PlacedWord = Word & { estimated?: boolean };

export interface PageWords {
  page: number;
  width: number;
  height: number;
  origin: "pdf" | "ocr";
  words: Word[];
}

/**
 * Un importe como lo imprime un extracto: con centavos, con signo adelante (menos o más) o atrás,
 * entre paréntesis y con la moneda pegada adelante. Sin los dos decimales no es un importe: un DNI con
 * puntos o la «TASA 10,5» de un concepto pasarían por uno. Los centavos van tras la coma, con punto de
 * miles (`AMOUNT_AR`), o tras el punto, con coma de miles o sin separador (`AMOUNT_US`): «1.234» sigue
 * siendo mil doscientos treinta y cuatro, no un importe.
 *
 * Una página usa uno solo (`amountFormatOf`): en una página con coma decimal, «VTO 15.07» es un
 * vencimiento. `AMOUNT` acepta los dos, para las celdas de una grilla ya armada.
 */
export const AMOUNT_AR = /^\(?[-+]?(?:\$|ARS|U\$S|USD)?[-+]?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}-?\)?$/i;
export const AMOUNT_US = /^\(?[-+]?(?:\$|ARS|U\$S|USD)?[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}-?\)?$/i;
export const AMOUNT = { test: (t: string): boolean => AMOUNT_AR.test(t) || AMOUNT_US.test(t) };

/** El formato de unos importes, por mayoría: con punto decimal solo si son más que los de coma. */
export const amountFormatOf = (texts: string[]): NumberFormat =>
  texts.filter((t) => AMOUNT_US.test(t)).length > texts.filter((t) => AMOUNT_AR.test(t)).length ? "us" : "ar";

/** El formato de una página, o null si no se sabe: entonces valen los dos. */
type PageFormat = NumberFormat | null;
const amountOf = (format: PageFormat): { test: (t: string) => boolean } => (format === "us" ? AMOUNT_US : format === "ar" ? AMOUNT_AR : AMOUNT);

/** Las palabras en renglones, como las agrupa el módulo: cada renglón de izquierda a derecha. */
const rowsOf = <T extends Word>(words: T[]): T[][] => {
  const source = new Map<object, T>();
  return filasPorGeometria(
    words.map((w) => {
      const o = { text: w.text, box: { x: w.x, y: w.y, w: w.w, h: w.h }, start: 0, end: 0 };
      source.set(o, w);
      return o;
    }),
  ).map((row) => row.map((o) => source.get(o)!));
};

const isDateRow = (row: Word[]): boolean => row.length > 0 && DATE.test(row[0].text);

/**
 * El formato de los importes de una página sale de sus filas de datos (las que empiezan con una
 * fecha): un pie con «10.00 A 15.00» o «TNA 45.50» no lo decide. Sin filas de datos no se sabe.
 */
export const pageFormatOf = (words: Word[]): PageFormat => {
  const data = rowsOf(words).filter(isDateRow);
  return data.length === 0 ? null : amountFormatOf(data.flat().map((w) => w.text));
};

/**
 * El OCR pega dos importes seguidos sin espacio: «123,451.234.567.890,12» es «123,45» y
 * «1.234.567.890,12». El corte va detrás de los dos decimales del primero, y vale solo si las dos
 * partes son importes del formato de la página. La caja se reparte por los caracteres.
 *
 * La caja cubre también el hueco entre los dos, que no tiene caracteres: el borde derecho del segundo
 * es cierto, el del primero queda corrido a la derecha. El primero es una estimación: va a la columna
 * más cercana pero no arma columnas. Si la palabra se midió en la tinta (ver `ink.ts`), el borde derecho
 * del segundo sigue medido; el corte por caracteres nunca es una medición.
 */
export const splitGluedAmount = (w: PlacedWord, format: PageFormat): PlacedWord[] => {
  if (format === null) {
    const ar = splitGluedAmount(w, "ar");
    return ar.length > 1 ? ar : splitGluedAmount(w, "us");
  }
  const amount = amountOf(format);
  const decimal = format === "ar" ? "," : ".";
  const at = w.text.indexOf(decimal);
  const cut = at + 3;
  if (at < 0 || cut >= w.text.length) return [w];
  const [first, rest] = [w.text.slice(0, cut), w.text.slice(cut)];
  if (!amount.test(first) || !amount.test(rest) || amount.test(w.text)) return [w];
  const share = w.w / w.text.length;
  return [
    { ...w, text: first, w: share * first.length, estimated: true, measured: false, ocr: undefined },
    { ...w, text: rest, x: w.x + share * first.length, w: share * rest.length },
  ];
};
/** Una fecha con o sin año. */
export const DATE = /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2}(?:\d{2})?)?$/;
const GLUED_DATE = /^(\d{1,2}\/\d{1,2}\/)(\d{5,})$/;

/**
 * Una palabra impresa de costado (la leyenda legal en el margen, un código de control) llega como una
 * caja angosta y alta que cruza varios renglones: agrupada por altura, los fundiría en una sola fila.
 * Es girada si mide más que esto en altos de renglón (la mediana de la página) y más que el doble de su ancho.
 */
const ROTATED_HEIGHT = 2.5;
const ROTATED_ASPECT = 2;
/**
 * Las palabras cortas de la misma leyenda («S.A.», un guion) no son altas, pero tienen el borde
 * izquierdo y el ancho de la girada, con esta diferencia como mucho, en anchos de ella: son su misma
 * línea impresa de costado. El texto derecho de una columna no comparte la caja exacta de una de ellas.
 */
const ROTATED_SAME_BOX = 0.1;
/**
 * Una caja del OCR más ancha que la típica de su página por esta cantidad de caracteres, o más, trae
 * adentro un hueco que el OCR leyó como un espacio.
 */
const HIDDEN_GAP = 2;
/**
 * Dos palabras seguidas son de la misma caja si tienen el mismo ancho por carácter y las separa un
 * carácter de ese ancho, con esta diferencia como mucho: la parte del ancho, más un píxel y medio por
 * el redondeo del reparto. Dos cajas distintas de un mismo renglón pueden tener la misma altura.
 */
const SAME_BOX_SHARE = 0.15;
const SAME_BOX_ROUNDING = 1.5;
/** El menos tipográfico (U+2212) que a veces da el OCR es un menos. */
const TYPOGRAPHIC_MINUS = /\u2212/g;

/**
 * El OCR detecta cada renglón como una caja y reparte su ancho entre las palabras por la cantidad de
 * caracteres: las palabras de una caja comparten su altura y su alto. Solo los bordes de la caja son
 * ciertos. Si adentro hay un hueco grande leído como un espacio (en el cierre del día, entre el
 * débito y el saldo), todo lo que está antes se corre a la derecha y un débito cae bajo los créditos.
 *
 * En una caja más ancha que la típica de la página (la mediana del ancho por carácter de las cajas de
 * varias palabras) por `HIDDEN_GAP` caracteres o más, el hueco se supone delante del último importe:
 * en un extracto los importes se alinean a la derecha, y el saldo va último. Ese importe y lo que lo
 * sigue (un resto de la leyenda del margen) se ubican desde el borde derecho, que es cierto; lo
 * anterior, desde el izquierdo, con el ancho típico. Lo anterior es una estimación: va a la columna
 * más cercana pero no arma columnas. Solo se miran las cajas de las filas de datos: una fecha al
 * principio de la fila y un importe del formato de la página. La fecha puede venir en otra caja. El
 * texto del PDF trae la caja de cada palabra y no pasa por acá.
 */
export const straightenOcrBoxes = (words: Word[], format: PageFormat = null): PlacedWord[] => {
  const amount = amountOf(format);
  const isAmount = (w: Word): boolean => amount.test(w.text.replace(TYPOGRAPHIC_MINUS, "-"));
  // Las cajas se arman con todas sus palabras y con la geometría del reparto del OCR, también la de lo
  // que se midió en los píxeles: así se sabe qué está antes del último importe de la caja. Lo medido
  // no se mueve.
  // Una palabra cuenta como medida solo si guarda la caja del OCR: sin ella no se sabe qué tenía antes.
  const isMeasured = (w: Word): boolean => w.measured === true && w.ocr !== undefined;
  const at = (w: Word): { x: number; w: number } => (isMeasured(w) ? w.ocr! : w);
  const sameHeight = new Map<string, Word[]>();
  for (const w of words) {
    const key = `${w.y}|${w.h}`;
    sameHeight.set(key, [...(sameHeight.get(key) ?? []), w]);
  }
  const close = (a: number, b: number, s: number): boolean => Math.abs(a - b) <= SAME_BOX_SHARE * s + SAME_BOX_ROUNDING;
  const boxes: Word[][] = [];
  for (const ws of sameHeight.values()) {
    let current: Word[] = [];
    for (const w of [...ws].sort((a, b) => at(a).x - at(b).x)) {
      const prev = current[current.length - 1];
      const s = prev ? at(prev).w / prev.text.length : 0;
      if (prev && close(at(w).w / w.text.length, s, s) && close(at(w).x - (at(prev).x + at(prev).w), s, s)) current.push(w);
      else {
        if (current.length > 0) boxes.push(current);
        current = [w];
      }
    }
    boxes.push(current);
  }
  const measured = boxes.map((sorted) => {
    const chars = sorted.reduce((n, w) => n + w.text.length, 0) + sorted.length - 1;
    const left = at(sorted[0]).x;
    const right = at(sorted[sorted.length - 1]).x + at(sorted[sorted.length - 1]).w;
    return { words: sorted, chars, left, right, share: (right - left) / chars, last: sorted.map(isAmount).lastIndexOf(true) };
  });
  // Solo las cajas de las filas de datos (una fecha al principio y un importe): el texto legal de una
  // página, más denso, haría parecer estiradas a todas.
  const inData = new Set(rowsOf(words).filter((r) => isDateRow(r) && r.some(isAmount)).flat());
  const data = measured.filter((b) => b.words.length > 1 && b.words.some((w) => inData.has(w)));
  const typical = median(data.map((b) => b.share));
  const out = new Map<Word, PlacedWord>();
  for (const b of data) {
    const last = b.last;
    if (last < 1 || (b.share - typical) * b.chars < HIDDEN_GAP * typical) continue;
    let offset = 0;
    b.words.forEach((w, k) => {
      if (k < last && !isMeasured(w)) out.set(w, { ...w, x: b.left + offset * typical, w: w.text.length * typical, estimated: true });
      offset += w.text.length + 1;
    });
    let back = 0;
    for (const w of b.words.slice(last).reverse()) {
      back += w.text.length;
      if (!isMeasured(w)) out.set(w, { ...w, x: b.right - back * typical, w: w.text.length * typical });
      back += 1;
    }
  }
  // Lo marcado como medido sin la caja del OCR sale sin la marca: no se toma como medido.
  return words.map((w) => {
    const placed = out.get(w) ?? w;
    return placed.measured && !isMeasured(w) ? { ...placed, measured: undefined, ocr: undefined } : placed;
  });
};

/** Toda página se lleva a este ancho: así se comparan las posiciones del texto del PDF y las del OCR. */
const PAGE_WIDTH = 1000;
/** Dos palabras de una misma frase están más cerca que esto, en anchos de carácter. */
const PHRASE_GAP = 1.5;
/** Dos anclas de una misma columna están más cerca que esto, en anchos de carácter. */
const COLUMN_TOLERANCE = 2;
/** Una columna de texto tiene que aparecer en esta parte de las filas de datos, y en dos como mínimo. */
const TEXT_SUPPORT = 0.15;
/**
 * Un texto que pisa casi entero una columna de importes es su rótulo («DÉBITO» sobre los débitos). Con
 * la mitad no alcanza: la cola de un concepto pegado al importe también pisa la mitad.
 */
const LABEL_OVERLAP = 0.8;
const AMOUNT_LABELS: Array<Role | null> = ["debit", "credit", "balance", "amount"];

/**
 * El OCR pega la fecha al número que la sigue: «05/08/26718293». La fecha se separa con cuatro
 * cifras de año si forman un año posible, y si no con dos. La caja se reparte por los caracteres.
 */
export const splitGluedDate = (w: Word): Word[] => {
  const m = GLUED_DATE.exec(w.text);
  if (!m) return [w];
  const four = Number(m[2].slice(0, 4));
  const date = m[1] + m[2].slice(0, four >= 1990 && four <= 2100 ? 4 : 2);
  const rest = w.text.slice(date.length);
  const share = w.w / w.text.length;
  return [
    { ...w, text: date, w: share * date.length },
    { ...w, text: rest, x: w.x + share * date.length, w: share * rest.length },
  ];
};

interface Phrase {
  text: string;
  left: number;
  right: number;
  numeric: boolean;
  /** Alguna de sus palabras tiene la posición estimada: la frase va a una columna, pero no la arma. */
  estimated: boolean;
}

const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
};

/**
 * Las palabras de una fila en frases. Un importe, la fecha del principio y la que la sigue (la fecha
 * valor) son siempre frases solas. Una fecha más adelante es parte del concepto: «VTO 15/07 CUOTA».
 */
const phrasesOf = (row: PlacedWord[], gap: number, amount: { test: (t: string) => boolean }): Phrase[] => {
  const out: Phrase[] = [];
  let lastAlone = false;
  row.forEach((w, k) => {
    const numeric = amount.test(w.text);
    const alone = numeric || (DATE.test(w.text) && (k === 0 || (k === 1 && DATE.test(row[0].text))));
    const last = out[out.length - 1];
    if (last && !alone && !lastAlone && w.x - last.right < gap) {
      last.text += ` ${w.text}`;
      last.right = w.x + w.w;
      last.estimated ||= w.estimated === true;
    } else {
      out.push({ text: w.text, left: w.x, right: w.x + w.w, numeric, estimated: w.estimated === true });
    }
    lastAlone = alone;
  });
  return out;
};

const isDateText = (t: string): boolean => DATE.test(t);
const isDataRow = (phrases: Phrase[]): boolean => phrases.length > 0 && isDateText(phrases[0].text) && phrases.some((p) => p.numeric);
const anchorOf = (p: Phrase): number => (p.numeric ? p.right : p.left);

interface Column {
  numeric: boolean;
  anchor: number;
  left: number;
  right: number;
}

const columnsOf = (data: Phrase[][], tolerance: number): Column[] => {
  const columns: Column[] = [];
  for (const numeric of [false, true]) {
    // Con un solo movimiento, una aparición alcanza: si no, un extracto de un renglón no tendría columnas de texto.
    const min = numeric ? 1 : Math.min(data.length, Math.max(2, Math.ceil(data.length * TEXT_SUPPORT)));
    const phrases = data.flat().filter((p) => p.numeric === numeric).sort((a, b) => anchorOf(a) - anchorOf(b));
    let group: Phrase[] = [];
    const flush = (): void => {
      if (group.length >= min) {
        columns.push({
          numeric,
          anchor: median(group.map(anchorOf)),
          left: Math.min(...group.map((p) => p.left)),
          right: Math.max(...group.map((p) => p.right)),
        });
      }
      group = [];
    };
    for (const p of phrases) {
      if (group.length > 0 && anchorOf(p) - anchorOf(group[group.length - 1]) > tolerance) flush();
      group.push(p);
    }
    flush();
  }
  return columns.sort((a, b) => a.left + a.right - (b.left + b.right));
};

const nearest = (columns: Column[], p: Phrase, numeric: boolean, except = -1): number => {
  let best = -1;
  let distance = Infinity;
  columns.forEach((c, i) => {
    if (c.numeric !== numeric || i === except) return;
    const d = Math.abs(anchorOf(p) - c.anchor);
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best;
};

const isLabelOf = (c: Column, p: Phrase): boolean =>
  c.numeric && Math.min(p.right, c.right) - Math.max(p.left, c.left) >= (p.right - p.left) * LABEL_OVERLAP;

/**
 * Las frases de una fila en sus columnas: ver el algoritmo en el plan de la etapa 3, paso 6.
 *
 * En una fila de datos la fecha y los importes son lo que se lee: un texto nunca va a su columna,
 * porque pegado ahí los destruye. Si no queda ninguna columna de texto que no sea la de la fecha, el
 * texto se pierde antes que el movimiento. El rótulo de un importe solo existe en una fila sin importes.
 * Fuera de las filas de datos, un texto sin columna de texto también se pierde: solo pasa si las fechas
 * mismas no forman columna. Y en un encabezado se descarta el rótulo de un importe que no pisa
 * ninguna columna de importes.
 */
const cellsOf = (columns: Column[], phrases: Phrase[]): Cell[] => {
  const cells: Cell[] = columns.map(() => null);
  const data = isDataRow(phrases);
  const withAmount = phrases.some((p) => p.numeric);
  const header = !withAmount && isHeader(phrases);
  let dateColumn = -1;
  phrases.forEach((p, k) => {
    let i: number;
    // Cada fila de datos trae un importe y una columna de importes pide uno solo: siempre hay alguna.
    if (p.numeric) i = nearest(columns, p, true);
    else if (data) {
      i = nearest(columns, p, false, dateColumn);
      if (k === 0) dateColumn = i;
    } else {
      const label = withAmount ? -1 : columns.findIndex((c) => isLabelOf(c, p));
      // En un encabezado, un rótulo de importe sin columna de importes debajo es de una columna que este
      // extracto no trae: pegado a un texto, le daría a esa columna un rol que no tiene. Fuera de un
      // encabezado es texto: «CREDITO INMEDIATO» continúa un concepto.
      const orphan = header && AMOUNT_LABELS.includes(roleOf(p.text));
      i = label >= 0 ? label : orphan ? -1 : nearest(columns, p, false);
    }
    if (i >= 0) cells[i] = cells[i] === null ? p.text : `${cells[i]} ${p.text}`;
  });
  return cells;
};

/**
 * Con qué se compara una línea para saber si se repite: su texto sin cifras ni acentos, así «Página 1
 * de 7» y «Página 2 de 7» son la misma. Una línea sin letras se compara con cada cifra como comodín:
 * «1/2» y «2/2» son la misma, pero un CBU no se confunde con un número de página.
 */
const signature = (phrases: Phrase[]): string => {
  const text = phrases.map((p) => p.text).join(" ");
  const letters = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  return letters !== "" ? letters : text.replace(/\d/g, "#");
};

const isHeader = (phrases: Phrase[]): boolean => phrases.filter((p) => roleOf(p.text) !== null).length >= 2;

interface Line {
  page: PageWords & { lineHeight: number };
  /** El lugar de la página en la lista: dos páginas pueden traer el mismo número. */
  at: number;
  line: number;
  phrases: Phrase[];
  /** Arriba y abajo de la línea, en la unidad de la grilla. */
  top: number;
  bottom: number;
}

/** El lugar de cada línea, con el blanco que la separa de la anterior de su página (ver `Place`). */
const placesOf = (lines: Line[]): Place[] =>
  lines.map((l, k) => {
    const place: Place = { page: l.page.page, line: l.line, origin: l.page.origin };
    const previous = lines[k - 1];
    return previous?.at === l.at ? { ...place, gap: (l.top - previous.bottom) / l.page.lineHeight } : place;
  });

/**
 * Las palabras de las páginas llevadas a la grilla común: filas por renglón impreso, columnas por
 * alineación. Lo que viene después (columnas, renglones, juez) no sabe que vinieron de un PDF.
 */
export const gridFromPages = (pages: PageWords[]): Grid => {
  const origin = pages.some((p) => p.origin === "ocr") ? "ocr" : "pdf";
  const scaled = pages.map((p) => {
    const f = PAGE_WIDTH / p.width;
    const lineHeight = median(p.words.map((w) => w.h));
    const rotated = p.words.filter((w) => w.h > ROTATED_HEIGHT * lineHeight && w.h > ROTATED_ASPECT * w.w);
    const sameBox = (w: Word, r: Word): boolean => Math.abs(w.x - r.x) <= ROTATED_SAME_BOX * r.w && Math.abs(w.w - r.w) <= ROTATED_SAME_BOX * r.w;
    const upright = p.words.filter((w) => !rotated.some((r) => sameBox(w, r)));
    const plain = upright.map((w) => ({ ...w, text: w.text.replace(TYPOGRAPHIC_MINUS, "-") }));
    const format = pageFormatOf(plain);
    const placed: PlacedWord[] = p.origin === "ocr" ? straightenOcrBoxes(plain, format) : plain;
    const words = placed
      .flatMap(splitGluedDate)
      .flatMap((w) => splitGluedAmount(w, format))
      .map((w) => ({ ...w, x: w.x * f, y: w.y * f, w: w.w * f, h: w.h * f }));
    return { ...p, format, words, lineHeight: median(words.map((w) => w.h)) || 1 };
  });
  const grouped = scaled.map((p) => ({ p, rows: rowsOf(p.words) }));
  // El ancho de un carácter sale de las filas de datos (una fecha al principio y un importe): el texto
  // legal de una página puede estar en otra letra, o, en el OCR, en cajas más densas.
  const widthOf = (ws: Word[]): number[] => ws.filter((w) => w.text.length > 0).map((w) => w.w / w.text.length);
  const dataWords = grouped.flatMap(({ p, rows }) => rows.filter((r) => isDateRow(r) && r.some((w) => amountOf(p.format).test(w.text))).flat());
  const charWidth = median(widthOf(dataWords.length > 0 ? dataWords : scaled.flatMap((p) => p.words))) || 1;

  const lines: Line[] = [];
  let shift: number | null = null;
  for (const [at, { p, rows }] of grouped.entries()) {
    const pageLines = rows.map((row, k) => ({
      page: p,
      at,
      line: k + 1,
      phrases: phrasesOf(
        row,
        PHRASE_GAP * charWidth,
        amountOf(p.format),
      ),
      top: Math.min(...row.map((w) => w.y)),
      bottom: Math.max(...row.map((w) => w.y + w.h)),
    }));
    // La columna de fechas queda donde la dejó la página anterior: un escaneo corrido no corre las columnas.
    const firsts = pageLines.filter((l) => isDataRow(l.phrases)).map((l) => l.phrases[0].left);
    if (firsts.length > 0) {
      const here = median(firsts);
      if (shift === null) shift = here;
      const dx = shift - here;
      for (const l of pageLines) for (const ph of l.phrases) {
        ph.left += dx;
        ph.right += dx;
      }
    }
    lines.push(...pageLines);
  }

  const data = lines.filter((l) => isDataRow(l.phrases)).map((l) => l.phrases);
  if (data.length === 0) {
    return { origin, sheet: null, rows: lines.map((l) => l.phrases.map((p) => p.text)), places: placesOf(lines) };
  }
  // Las frases con la posición estimada no arman columnas. Toda fila con importes conserva uno cierto:
  // el último de una caja estirada se ubica desde su borde derecho.
  const columns = columnsOf(data.map((phrases) => phrases.filter((ph) => !ph.estimated)), COLUMN_TOLERANCE * charWidth);

  // Los adornos: fuera de la tabla de su página, sin importes y repetidos en dos páginas o más. Una fila
  // con un importe es un dato aunque se repita: el saldo anterior que cada página trae arriba.
  const outside = new Set<Line>();
  const pagesBySignature = new Map<string, Set<number>>();
  for (const at of scaled.keys()) {
    const own = lines.filter((l) => l.at === at);
    const firstData = own.findIndex((l) => isDataRow(l.phrases));
    const lastData = own.length - 1 - [...own].reverse().findIndex((l) => isDataRow(l.phrases));
    own.forEach((l, k) => {
      if ((firstData >= 0 && k >= firstData && k <= lastData) || l.phrases.some((ph) => ph.numeric)) return;
      outside.add(l);
      const s = signature(l.phrases);
      pagesBySignature.set(s, (pagesBySignature.get(s) ?? new Set()).add(at));
    });
  }
  // La primera aparición de un membrete, antes del primer movimiento del documento, se queda: trae la
  // cuenta y el CBU que el encabezado lee de la grilla. Las demás, y todo pie, se van.
  const firstDataLine = lines.findIndex((l) => isDataRow(l.phrases));
  const seen = new Set<string>();
  const kept = lines.filter((l, k) => {
    if (!outside.has(l) || isHeader(l.phrases)) return true;
    const s = signature(l.phrases);
    if (pagesBySignature.get(s)!.size < 2) return true;
    const first = !seen.has(s);
    seen.add(s);
    return first && k < firstDataLine;
  });

  const rows: Cell[][] = kept.map((l) => cellsOf(columns, l.phrases));
  return { origin, sheet: null, rows, places: placesOf(kept) };
};

/**
 * Las filas que tienen una fecha y un importe: cuántos movimientos parece haber. La fecha puede venir
 * sin año («03/07»): el año se completa después, y esto decide antes si una foto se gira.
 */
export const countDataRows = (grid: Grid): number =>
  grid.rows.filter((r) => r.some((v) => typeof v === "string" && (DATE.test(v) || isoDate(v) !== null)) && r.some((v) => typeof v === "string" && AMOUNT.test(v) && (parseCents(v, "ar") !== null || parseCents(v, "us") !== null))).length;
