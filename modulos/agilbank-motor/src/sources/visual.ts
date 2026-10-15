// E/S: lee un PDF o una foto con poppler y PP-OCR. Queda fuera de la mutación; lo que decide (qué
// página va al OCR, cómo se arma la grilla) vive en pages.ts y words.ts, que sí se mutan.
import {
  contarPaginasPdf, girarPng, herramientasDeLectura, paddleDisponible, palabrasDelPdf, pixelesGrises, prepararFoto, renderizarPaginas, runPaddleOcr, tamanoDelPng,
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
 * El paso de lectura corre dentro de una transacción de 5 minutos del worker: a los 4 se corta, con lo
 * leído y el aviso de lectura parcial. El OCR va a 150 dpi: a 200 no lee mejor en conjunto y tarda
 * 1,24 a 1,34 veces más: un PDF de 38 páginas que tardó 213 s a 150, con carga de 4 a 6 y antes de los
 * arreglos de columnas, pasaría a unos 264 s, fuera del techo (LEEME, «La lectura visual»).
 */
export const VISUAL_LIMITS: VisualLimits = { budgetMs: 240_000, maxPages: 60, dpi: 150 };

export type VisualReading =
  | { kind: "read"; grid: Grid; pages: number; pagesRead: number }
  | { kind: "unavailable"; reason: string }
  | { kind: "unreadable"; reason: string };

const UNAVAILABLE =
  "No se pudo leer el archivo: el servidor no tiene el lector de imágenes. Avísennos; mientras tanto, manden el extracto en Excel, CSV o texto.";
const NOT_A_PDF = "No se pudo abrir el PDF: está dañado o protegido con contraseña.";
const OUT_OF_TIME = "La lectura no llegó a leer ninguna página en el tiempo disponible: vuelvan a enviarlo más tarde.";
const NOT_RENDERED = "No se pudo leer el archivo: no se pudieron preparar sus páginas para el OCR. Vuelvan a enviarlo más tarde.";
/** De a cuántas páginas se renderiza: el PDF se escribe una vez por tanda. */
const OCR_BATCH = 4;
/** Con menos filas de movimientos que esto, una foto se prueba girada. */
const MIN_PHOTO_ROWS = 3;

/**
 * Una página por OCR. El módulo reparte el ancho de cada caja entre sus palabras por caracteres: los
 * importes que quedan solos en su tramo de tinta toman la posición medida en los píxeles (ver ink.ts).
 */
const ocrPage = async (page: number, png: Buffer): Promise<PageWords> => {
  const size = tamanoDelPng(png);
  const r = await runPaddleOcr(png);
  const read: Word[] = (r?.words ?? []).map((w) => ({ text: w.text, x: w.box.x, y: w.box.y, w: w.box.w, h: w.box.h }));
  const gray = read.length > 0 ? await pixelesGrises(png) : null;
  const words = gray ? measureAmounts(read, gray) : read;
  return { page, width: size?.ancho ?? 1, height: size?.alto ?? 1, origin: "ocr", words };
};

/**
 * Un PDF, página por página: la que tiene texto que sirve, por su texto; la otra, por OCR. Si alguna
 * página necesita OCR y el OCR no está, no se lee a medias: no disponible.
 *
 * La lectura se corta en la primera página que llega pasado el techo de tiempo o que no sale del
 * render: se devuelven las anteriores y nada de las que siguen, aunque tengan texto, para que la
 * grilla no tenga huecos.
 */
export const readPdf = async (
  file: Buffer,
  limits: VisualLimits = VISUAL_LIMITS,
  now: () => number = Date.now,
  render: typeof renderizarPaginas = renderizarPaginas,
): Promise<VisualReading> => {
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
  if (pending.length > 0 && !(await paddleDisponible())) return { kind: "unavailable", reason: UNAVAILABLE };

  const outOfTime = () => now() - started >= limits.budgetMs;
  let readUpTo = last;
  let cut: "time" | "render" | null = null;
  reading: for (const batch of contiguousBatches(pending, OCR_BATCH)) {
    if (outOfTime()) {
      [readUpTo, cut] = [batch[0] - 1, "time"];
      break;
    }
    const rendered = (await render(file, { dpi: limits.dpi, desde: batch[0], hasta: batch[batch.length - 1] })) ?? [];
    const pngs = new Map(rendered.map((r) => [r.pagina, r.png]));
    for (const n of batch) {
      const png = pngs.get(n);
      if (png === undefined || outOfTime()) {
        [readUpTo, cut] = [n - 1, png === undefined ? "render" : "time"];
        break reading;
      }
      pages.set(n, await ocrPage(n, png));
    }
  }
  if (readUpTo === 0) return { kind: "unavailable", reason: cut === "render" ? NOT_RENDERED : OUT_OF_TIME };
  const read = [...pages.values()].filter((p) => p.page <= readUpTo).sort((a, b) => a.page - b.page);
  return { kind: "read", grid: gridFromPages(read), pages: total, pagesRead: readUpTo };
};

/**
 * Una foto: derecha según su EXIF y, si no aparecen movimientos, girada. Una foto sin EXIF sacada
 * de costado lee renglones verticales.
 */
export const readImage = async (file: Buffer): Promise<VisualReading> => {
  if (!(await paddleDisponible())) return { kind: "unavailable", reason: UNAVAILABLE };
  const png = await prepararFoto(file);
  if (png === null) return { kind: "unreadable", reason: "No se pudo abrir la imagen: el archivo está dañado." };
  let best: { grid: Grid; rows: number } | null = null;
  for (const degrees of [0, 90, 180, 270] as const) {
    const image = degrees === 0 ? png : await girarPng(png, degrees);
    const grid = gridFromPages([await ocrPage(1, image)]);
    const rows = countDataRows(grid);
    if (best === null || rows > best.rows) best = { grid, rows };
    if (rows >= MIN_PHOTO_ROWS) break;
  }
  return { kind: "read", grid: best!.grid, pages: 1, pagesRead: 1 };
};
