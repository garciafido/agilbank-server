import { AMOUNT, DATE, type Word } from "./words";

/** Una página escaneada puede traer un sello de texto: con menos palabras no se juzga. */
const MIN_WORDS = 5;
/** Las fechas y los importes que hacen falta para creer que la tabla está en el texto. */
const MIN_DATES = 2;
const MIN_AMOUNTS = 2;
/** La parte de las palabras largas que tienen que ser legibles en una página sin tabla. */
const LEGIBLE_SHARE = 0.6;
const LEGIBLE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.,:;()'"%/-]*$/;

/**
 * Si el texto de una página sirve, o hay que leerla por OCR. Se decide por lo que dice, no por cuánto
 * texto hay: el BBVA de junio trae 14.338 caracteres, todos basura, porque su fuente no tiene mapa de
 * caracteres.
 */
export const pageTextUsable = (words: Word[]): boolean => {
  const texts = words.map((w) => w.text.trim()).filter((t) => t !== "");
  if (texts.length < MIN_WORDS) return false;
  // Sin filas no hay de dónde sacar el formato de la página: valen los importes de los dos.
  if (texts.filter((t) => DATE.test(t)).length >= MIN_DATES && texts.filter((t) => AMOUNT.test(t)).length >= MIN_AMOUNTS) return true;
  const long = texts.filter((t) => t.length >= 3);
  return long.length > 0 && long.filter((t) => LEGIBLE.test(t)).length / long.length >= LEGIBLE_SHARE;
};

/** Las páginas en tandas de páginas seguidas, cada una de hasta `size`: cada tanda es un render. */
export const contiguousBatches = (pages: number[], size: number): number[][] => {
  const out: number[][] = [];
  for (const p of pages) {
    const last = out[out.length - 1];
    if (last && last.length < size && last[last.length - 1] === p - 1) last.push(p);
    else out.push([p]);
  }
  return out;
};
