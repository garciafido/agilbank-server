// E/S: lee un PDF o una foto con poppler y PP-OCR. Queda fuera de la mutación; lo que decide (qué
// página va al OCR, cómo se arma la grilla) vive en pages.ts y words.ts, que sí se mutan.
import {
  contarPaginasPdf, girarPng, herramientasDeLectura, leerConPaddleDetallado, paddleDisponible, paginasDeImagen, palabrasDelPdf, pixelesGrises, prepararFoto, renderizarPaginas,
  tamanoDelPng,
} from "@agilmind/lectura";
import type { Grid } from "../types";
import { measureAmounts } from "./ink";
import { contiguousBatches, pageTextUsable } from "./pages";
import { countDataRows, gridFromPages, type PageWords, type Word } from "./words";

export interface VisualLimits {
  budgetMs: number;
  maxPages: number;
  dpi: number;
}

/**
 * El paso de lectura corre en el worker sin transacción envolvente (`.transactional(false)` en el DSL del
 * producto): el evento vence a los 30 minutos, y a los 10 la lectura se corta, con lo leído y el aviso de
 * lectura parcial. Un producto que deje el paso dentro de la transacción de 5 minutos del andamiaje no
 * llega a este techo. El OCR va a 150 dpi: a 200 no lee mejor en conjunto y tarda
 * 1,24 a 1,34 veces más: un PDF de 38 páginas que tardó 213 s a 150, con carga de 4 a 6 y antes de los
 * arreglos de columnas, pasaría a unos 264 s (LEEME, «La lectura visual»).
 */
export const VISUAL_LIMITS: VisualLimits = { budgetMs: 600_000, maxPages: 60, dpi: 150 };

/**
 * Por qué una lectura no llegó a la última página. El tiempo, el render y el OCR son fallas nuestras
 * de un momento: otra lectura puede llegar más lejos. El tope de páginas es del archivo.
 */
export type Cut = "tiempo" | "render" | "ocr" | "paginas";

/** `cut` es `null` si se leyeron todas las páginas. */
export type VisualReading =
  | { kind: "read"; grid: Grid; pages: number; pagesRead: number; cut: Cut | null }
  | { kind: "unavailable"; reason: string }
  | { kind: "unreadable"; reason: string };

const UNAVAILABLE =
  "No se pudo leer el archivo: el servidor no tiene el lector de imágenes. Avísennos; mientras tanto, manden el extracto en Excel, CSV o texto.";
const NOT_A_PDF = "No se pudo abrir el PDF: está dañado o protegido con contraseña.";
const OUT_OF_TIME = "La lectura no llegó a leer ninguna página en el tiempo disponible: vuelvan a enviarlo más tarde.";
const NOT_RENDERED = "No se pudo leer el archivo: no se pudieron preparar sus páginas para el OCR. Vuelvan a enviarlo más tarde.";
const DAMAGED_IMAGE = "No se pudo abrir la imagen: el archivo está dañado.";
const SEVERAL_PAGES = (pages: number) => `La imagen tiene ${pages} páginas: manden el extracto en PDF.`;
const OCR_FAILED = "No se pudo leer el archivo: el lector de imágenes falló al leer sus páginas. Vuelvan a enviarlo más tarde.";
/** De a cuántas páginas se renderiza: el PDF se escribe una vez por tanda. */
const OCR_BATCH = 4;
/**
 * El tope de píxeles de una página para el OCR, el mismo que pone AgilPost a PP-OCR: su memoria crece
 * con los píxeles. Una app que pasa una foto a PDF le da a la página el tamaño en píxeles de la foto, a
 * 72 dpi: una de 12 MP da una página de 4032 × 3024 pt, que a 150 dpi son 53 MP.
 */
const MAX_OCR_PIXELS = 12_000_000;
/** Con menos filas de movimientos que esto, una foto se prueba girada. */
const MIN_PHOTO_ROWS = 3;

/** Lo que la lectura visual usa de afuera. Las pruebas lo reemplazan. */
export interface VisualTools {
  now: () => number;
  render: typeof renderizarPaginas;
  ocr: typeof leerConPaddleDetallado;
  ocrReady: typeof paddleDisponible;
  rotate: typeof girarPng;
}

const TOOLS: VisualTools = { now: Date.now, render: renderizarPaginas, ocr: leerConPaddleDetallado, ocrReady: paddleDisponible, rotate: girarPng };

/**
 * Una página por OCR, o `null` si el OCR falló: una falla no es una página en blanco. El módulo reparte
 * el ancho de cada caja entre sus palabras por caracteres: los importes que quedan solos en su tramo de
 * tinta toman la posición medida en los píxeles (ver ink.ts).
 */
const ocrPage = async (page: number, png: Buffer, ocr: VisualTools["ocr"]): Promise<PageWords | null> => {
  const r = await ocr(png);
  if ("fallo" in r) return null;
  const size = tamanoDelPng(png);
  const read: Word[] = ("palabras" in r ? r.palabras.words : []).map((w) => ({ text: w.text, x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h }));
  const gray = read.length > 0 ? await pixelesGrises(png) : null;
  const words = gray ? measureAmounts(read, gray) : read;
  return { page, width: size?.ancho ?? 1, height: size?.alto ?? 1, origin: "ocr", words };
};

/**
 * La página como va al OCR: achicada si pasa el tope, o `null` si no se puede abrir. El OCR da las
 * posiciones en los píxeles del PNG que recibe, y `ocrPage` mide la página en ese mismo PNG.
 */
const fitForOcr = async (png: Buffer): Promise<Buffer | null> => {
  const size = tamanoDelPng(png);
  return size !== null && size.ancho * size.alto <= MAX_OCR_PIXELS ? png : prepararFoto(png, MAX_OCR_PIXELS);
};

/**
 * Un PDF, página por página: la que tiene texto que sirve, por su texto; la otra, por OCR. Si alguna
 * página necesita OCR y el OCR no está, no se lee a medias: no disponible.
 *
 * La lectura se corta en la primera página que llega pasado el techo de tiempo, que no sale del render
 * o en la que el OCR falla: se devuelven las anteriores y nada de las que siguen, aunque tengan texto,
 * para que la grilla no tenga huecos. Si no se leyó ninguna, no disponible.
 */
export const readPdf = async (file: Buffer, limits: VisualLimits = VISUAL_LIMITS, tools: Partial<VisualTools> = {}): Promise<VisualReading> => {
  const { now, render, ocr, ocrReady } = { ...TOOLS, ...tools };
  const started = now();
  if (!(await herramientasDeLectura()).poppler) return { kind: "unavailable", reason: UNAVAILABLE };
  const total = await contarPaginasPdf(file);
  if (total === null) return { kind: "unreadable", reason: NOT_A_PDF };
  const last = Math.min(total, limits.maxPages);
  const pages = new Map<number, PageWords>();
  for (const p of (await palabrasDelPdf(file, { desde: 1, hasta: last })) ?? []) {
    const words = p.palabras.map((w) => ({ text: w.texto, x: w.x, y: w.y, w: w.w, h: w.h }));
    if (pageTextUsable(words)) pages.set(p.pagina, { page: p.pagina, width: p.ancho, height: p.alto, origin: "pdf", words });
  }
  const pending = Array.from({ length: last }, (_, i) => i + 1).filter((n) => !pages.has(n));
  if (pending.length > 0 && !(await ocrReady())) return { kind: "unavailable", reason: UNAVAILABLE };

  const outOfTime = () => now() - started >= limits.budgetMs;
  let readUpTo = last;
  let cut: Cut | null = total > last ? "paginas" : null;
  reading: for (const batch of contiguousBatches(pending, OCR_BATCH)) {
    if (outOfTime()) {
      [readUpTo, cut] = [batch[0] - 1, "tiempo"];
      break;
    }
    const rendered = (await render(file, { dpi: limits.dpi, desde: batch[0], hasta: batch[batch.length - 1] })) ?? [];
    const pngs = new Map(rendered.map((r) => [r.pagina, r.png]));
    for (const n of batch) {
      const raw = pngs.get(n);
      const png = raw === undefined ? null : await fitForOcr(raw);
      if (png === null || outOfTime()) {
        [readUpTo, cut] = [n - 1, png === null ? "render" : "tiempo"];
        break reading;
      }
      const words = await ocrPage(n, png, ocr);
      if (words === null) {
        [readUpTo, cut] = [n - 1, "ocr"];
        break reading;
      }
      pages.set(n, words);
    }
  }
  if (readUpTo === 0) return { kind: "unavailable", reason: cut === "render" ? NOT_RENDERED : cut === "ocr" ? OCR_FAILED : OUT_OF_TIME };
  const read = [...pages.values()].filter((p) => p.page <= readUpTo).sort((a, b) => a.page - b.page);
  return { kind: "read", grid: gridFromPages(read), pages: total, pagesRead: readUpTo, cut };
};

/**
 * Una foto: derecha según su EXIF y, si no aparecen movimientos, girada. Una foto sin EXIF sacada
 * de costado lee renglones verticales. Si el OCR falla en cualquier vuelta, no disponible.
 *
 * Un TIFF de varias páginas, de un escáner con alimentador, no se lee: sharp abre solo la primera, y
 * leerla sola daría un extracto con renglones de menos. Como el HEIC, es el formato del archivo, no una
 * falla nuestra: se decide antes de mirar si está el OCR.
 */
export const readImage = async (file: Buffer, tools: Partial<VisualTools> = {}): Promise<VisualReading> => {
  const { ocr, ocrReady, rotate } = { ...TOOLS, ...tools };
  const pages = await paginasDeImagen(file);
  if (pages !== null && pages > 1) return { kind: "unreadable", reason: SEVERAL_PAGES(pages) };
  if (!(await ocrReady())) return { kind: "unavailable", reason: UNAVAILABLE };
  const png = await prepararFoto(file);
  if (png === null) return { kind: "unreadable", reason: DAMAGED_IMAGE };
  let best: { grid: Grid; rows: number } | null = null;
  for (const degrees of [0, 90, 180, 270] as const) {
    const image = degrees === 0 ? png : await rotate(png, degrees).catch(() => null);
    if (image === null) return { kind: "unreadable", reason: DAMAGED_IMAGE };
    const page = await ocrPage(1, image, ocr);
    if (page === null) return { kind: "unavailable", reason: OCR_FAILED };
    const grid = gridFromPages([page]);
    const rows = countDataRows(grid);
    if (best === null || rows > best.rows) best = { grid, rows };
    if (rows >= MIN_PHOTO_ROWS) break;
  }
  return { kind: "read", grid: best!.grid, pages: 1, pagesRead: 1, cut: null };
};
