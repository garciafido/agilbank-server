/**
 * CUÁNTO VIENE INCLINADA LA PÁGINA, medida en sus propias palabras.
 *
 * Un escaneo derecho es la excepción: sobre las 1.230 páginas escaneadas del corpus
 * congelado, el 19 % viene a más de 0,3° y el 2,5 % a más de 1°. No es cosmético — en una
 * página de 2.000 px de ancho, medio grado son 17 px de deriva vertical de un extremo al
 * otro, y los lectores que agrupan por altura trabajan con tolerancias de 4 a 14 px. Una
 * fila de la tabla se parte en tres bandas por esto, no porque el papel las separe.
 *
 * El ángulo sale de las propias palabras: las de un renglón impreso están sobre una
 * recta, así que la pendiente de esa recta ES la inclinación. Se ajusta renglón por
 * renglón y se toma la MEDIANA: un renglón con una palabra fuera de lugar —un sello, un
 * número que el OCR ubicó mal— inclina su propia recta y no la de la página.
 *
 * Lo que se devuelve es la pendiente (dy/dx), no el ángulo, porque es lo que se usa:
 * `y − pendiente · x` endereza una altura sin rotar nada ni mover una sola caja. Las
 * cajas siguen señalando dónde está el dato en la imagen ORIGINAL, que es lo que el
 * operador necesita para verificarlo.
 */
import type { OcrWord } from "./tipos";

/** Menos que esto es una página derecha: no vale la pena corregir el ruido del ajuste. */
const PENDIENTE_MINIMA = 0.0017; // ~0,1°

export function pendienteDeLaPagina(words: OcrWord[]): number {
  const conCaja = words.filter((w) => w.box?.h > 0 && w.text.trim().length > 1);
  if (conCaja.length < 20) return 0;
  const cy = (w: OcrWord) => w.box.y + w.box.h / 2;
  const cx = (w: OcrWord) => w.box.x + w.box.w / 2;

  const renglones: OcrWord[][] = [];
  for (const w of [...conCaja].sort((a, b) => cy(a) - cy(b))) {
    const ultimo = renglones[renglones.length - 1];
    if (ultimo && Math.abs(cy(w) - cy(ultimo[0])) <= w.box.h * 0.6) ultimo.push(w);
    else renglones.push([w]);
  }

  const pendientes: number[] = [];
  for (const r of renglones) {
    if (r.length < 4) continue;
    const n = r.length;
    const mx = r.reduce((s, w) => s + cx(w), 0) / n;
    const my = r.reduce((s, w) => s + cy(w), 0) / n;
    const sxx = r.reduce((s, w) => s + (cx(w) - mx) ** 2, 0);
    // Un renglón corto en x no define ninguna recta: su pendiente es ruido amplificado.
    if (sxx < 1000) continue;
    pendientes.push(r.reduce((s, w) => s + (cx(w) - mx) * (cy(w) - my), 0) / sxx);
  }
  if (pendientes.length < 5) return 0;
  pendientes.sort((a, b) => a - b);
  const mediana = pendientes[Math.floor(pendientes.length / 2)];
  return Math.abs(mediana) >= PENDIENTE_MINIMA ? mediana : 0;
}
