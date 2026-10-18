// Las cuentas del reconocimiento de renglones de PP-OCR, con dos pre-procesos:
//  - «gutenye»: el de @gutenye/ocr-common 1.4.8 (alto 48, x/255, sin relleno ni tope de ancho).
//  - «oficial»: OCRReisizeNormImg de PaddleX 3.0 (alto 48, (x/255 − 0,5)/0,5, relleno con ceros
//    hasta 320 como mínimo, tope de 3200).
// En los dos el tensor va en BGR y el texto sale por CTC voraz. Solo transforma datos; el modelo y
// el redimensionado están en `paddleOficial.ts`.
import type { Punto } from "./deteccionDeTexto";

export type ModoReconocimiento = "gutenye" | "oficial";

export interface LineaReconocida {
  text: string;
  mean: number;
  box: Punto[];
}

export const ALTO_DE_RENGLON = 48;

/** El ancho al que se lleva el renglón y el del tensor (con el relleno), como OCRReisizeNormImg. */
export function medidasDeRenglon(w: number, h: number): { ancho: number; anchoTensor: number } {
  const proporcion = Math.max(320 / ALTO_DE_RENGLON, w / h);
  const anchoTensor = Math.trunc(ALTO_DE_RENGLON * proporcion);
  if (anchoTensor > 3200) return { ancho: 3200, anchoTensor: 3200 };
  const ancho = Math.ceil(ALTO_DE_RENGLON * (w / h));
  return { ancho: Math.min(ancho, anchoTensor), anchoTensor };
}

/** De RGBA (alto 48, ancho `w`) al tensor [3, 48, anchoTensor] en BGR; lo que sobra a la derecha queda en 0. */
export function tensorDeRenglon(rgba: ArrayLike<number>, w: number, anchoTensor: number, modo: ModoReconocimiento): Float32Array {
  const plano = ALTO_DE_RENGLON * anchoTensor;
  const out = new Float32Array(3 * plano);
  for (let c = 0; c < 3; c++) {
    const fuente = 2 - c;
    for (let y = 0; y < ALTO_DE_RENGLON; y++) {
      for (let x = 0; x < w; x++) {
        const v = rgba[(y * w + x) * 4 + fuente] / 255;
        out[c * plano + y * anchoTensor + x] = modo === "oficial" ? (v - 0.5) / 0.5 : v;
      }
    }
  }
  return out;
}

/**
 * CTC voraz: la clase más probable de cada paso, sin el blanco (0) ni los repetidos seguidos. La
 * clase k es `diccionario[k − 1]`; la confianza es la media de las probabilidades elegidas.
 */
export function decodificarCtc(datos: ArrayLike<number>, pasos: number, clases: number, diccionario: string[]): { text: string; mean: number } {
  let text = "";
  let suma = 0;
  let n = 0;
  let anterior = -1;
  for (let t = 0; t < pasos; t++) {
    let mejor = 0;
    let max = -Infinity;
    for (let k = 0; k < clases; k++) {
      const v = datos[t * clases + k];
      if (v > max) {
        max = v;
        mejor = k;
      }
    }
    if (mejor !== 0 && mejor !== anterior) {
      text += diccionario[mejor - 1];
      suma += max;
      n++;
    }
    anterior = mejor;
  }
  return { text, mean: n ? suma / n : 0 };
}

/**
 * afAfRec de gutenye: una caja entra al primer grupo cuya caja inicial tiene la línea media a menos
 * de medio alto promedio; cada grupo va de izquierda a derecha y los grupos, por la y de su primera caja.
 */
export function agruparPorLineaMedia(lineas: LineaReconocida[]): LineaReconocida[] {
  if (!lineas.length) return [];
  const alto = lineas.reduce((s, l) => s + (l.box[2][1] - l.box[0][1]), 0) / lineas.length;
  const media = (l: LineaReconocida) => (l.box[0][1] + l.box[2][1]) / 2;
  const grupos: LineaReconocida[][] = [];
  for (const l of lineas) {
    const g = grupos.find((gr) => Math.abs(media(gr[0]) - media(l)) < alto / 2);
    if (g) g.push(l);
    else grupos.push([l]);
  }
  for (const g of grupos) g.sort((a, b) => a.box[0][0] - b.box[0][0]);
  grupos.sort((a, b) => a[0].box[0][1] - b[0].box[0][1]);
  return grupos.map((g) => ({
    mean: g.reduce((s, l) => s + l.mean, 0) / g.length,
    text: g.map((l) => l.text).join(" "),
    box: [g[0].box[0], g[g.length - 1].box[1], g[g.length - 1].box[2], g[0].box[3]],
  }));
}

/**
 * Lo que devolvía `detect()` de gutenye a partir de los renglones leídos: sin los de confianza menor
 * a 0,5 y agrupados recorriéndolos al revés, porque gutenye los junta con `unshift` y el orden decide
 * qué caja siembra cada grupo.
 */
export function agruparComoGutenye(lineas: LineaReconocida[]): LineaReconocida[] {
  return agruparPorLineaMedia(lineas.filter((l) => l.mean >= 0.5).reverse());
}
