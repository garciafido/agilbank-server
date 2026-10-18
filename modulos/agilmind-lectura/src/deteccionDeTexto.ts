// Las cuentas de la detección de texto de PP-OCR tal como las hace PaddleX 3.0
// (paddlex/inference/models/text_detection/processors.py): DetResizeForTest de tipo 0,
// NormalizeImage, DBPostProcess «quad» con el puntaje «fast» y SortQuadBoxes. Solo transforma
// datos; el modelo, OpenCV y Clipper están en `paddleOficial.ts`.

export type Punto = [number, number];
export type TipoDeLimite = "max" | "min";

export interface OpcionesDeteccion {
  /** El lado que limita: el mayor con «max», el menor con «min». null: la imagen a su tamaño. */
  lado: number | null;
  tipo: TipoDeLimite;
  /** Tope del lado mayor después del límite. null: sin tope. */
  ladoMaximo: number | null;
  /** Probabilidad desde la que un píxel es texto. */
  thresh: number;
  /** Probabilidad media mínima de la caja. */
  boxThresh: number;
  /** Cuánto se agranda la caja: distancia = área × ratio / perímetro. */
  unclipRatio: number;
  /** Contornos que se miran, como mucho. */
  maxCandidates: number;
}

/**
 * Lo que dice el inference.yml de PP-OCRv5_mobile_det, leído como lo lee PaddleX: para los detectores
 * v3 a v5, `resize_long: 960` es `limit_side_len 960, limit_type max` con el tope de 4000.
 */
export const DETECCION_OFICIAL: OpcionesDeteccion = {
  lado: 960,
  tipo: "max",
  ladoMaximo: 4000,
  thresh: 0.3,
  boxThresh: 0.6,
  unclipRatio: 1.5,
  maxCandidates: 1000,
};

/** El `round` de Python 3: a la mitad, al par. La escala de vuelta de las cajas y el múltiplo de 32 lo usan. */
export function redondeoPar(x: number): number {
  const piso = Math.floor(x);
  const resto = x - piso;
  if (resto !== 0.5) return Math.round(x);
  return piso % 2 === 0 ? piso : piso + 1;
}

/** El tamaño con que la imagen entra a la red: el límite, el tope, y cada lado al múltiplo de 32 (mínimo 32). */
export function medidasDeEntrada(
  w: number,
  h: number,
  op: Pick<OpcionesDeteccion, "lado" | "tipo" | "ladoMaximo">,
): { w: number; h: number } {
  let ratio = 1;
  if (op.lado !== null) {
    if (op.tipo === "max") ratio = Math.max(h, w) > op.lado ? op.lado / Math.max(h, w) : 1;
    else ratio = Math.min(h, w) < op.lado ? op.lado / Math.min(h, w) : 1;
  }
  let rh = Math.trunc(h * ratio);
  let rw = Math.trunc(w * ratio);
  if (op.ladoMaximo !== null && Math.max(rh, rw) > op.ladoMaximo) {
    const tope = op.ladoMaximo / Math.max(rh, rw);
    rh = Math.trunc(rh * tope);
    rw = Math.trunc(rw * tope);
  }
  return { w: Math.max(redondeoPar(rw / 32) * 32, 32), h: Math.max(redondeoPar(rh / 32) * 32, 32) };
}

const MEDIA = [0.485, 0.456, 0.406];
const DESVIO = [0.229, 0.224, 0.225];

/**
 * De RGB intercalado a los tres planos que espera la red. PaddleX lee la imagen en BGR y le aplica la
 * media y el desvío de ImageNet en ese orden: el plano 0 es el azul con la media 0,485.
 */
export function normalizarBgrChw(rgb: ArrayLike<number>, w: number, h: number): Float32Array {
  const n = w * h;
  const out = new Float32Array(3 * n);
  for (let c = 0; c < 3; c++) {
    const alfa = 1 / 255 / DESVIO[c];
    const beta = -MEDIA[c] / DESVIO[c];
    const fuente = 2 - c;
    for (let i = 0; i < n; i++) out[c * n + i] = rgb[i * 3 + fuente] * alfa + beta;
  }
  return out;
}

/**
 * Píxeles de texto (255) donde la probabilidad supera el umbral: la máscara que recorre findContours.
 * El mapa es float32 y numpy compara contra el umbral en float32: 0,3 pasado a float32 no supera a 0,3.
 */
export function binarizar(probabilidad: ArrayLike<number>, umbral: number): Uint8Array {
  const out = new Uint8Array(probabilidad.length);
  const u = Math.fround(umbral);
  for (let i = 0; i < probabilidad.length; i++) if (probabilidad[i] > u) out[i] = 255;
  return out;
}

/** Las cuatro esquinas de un rectángulo rotado, en el orden de cv2.boxPoints. */
export function puntosDelRectangulo(cx: number, cy: number, ancho: number, alto: number, anguloGrados: number): Punto[] {
  const ang = (anguloGrados * Math.PI) / 180;
  const b = Math.cos(ang) * 0.5;
  const a = Math.sin(ang) * 0.5;
  const p0: Punto = [cx - a * alto - b * ancho, cy + b * alto - a * ancho];
  const p1: Punto = [cx + a * alto - b * ancho, cy - b * alto - a * ancho];
  return [p0, p1, [2 * cx - p0[0], 2 * cy - p0[1]], [2 * cx - p1[0], 2 * cy - p1[1]]];
}

/** El orden de get_mini_boxes: por x, y en cada mitad primero el de arriba → [ai, ad, bd, bi]. */
export function ordenarCaja(puntos: Punto[]): Punto[] {
  const p = puntos.slice().sort((u, v) => u[0] - v[0]);
  const [i1, i4] = p[1][1] > p[0][1] ? [0, 1] : [1, 0];
  const [i2, i3] = p[3][1] > p[2][1] ? [2, 3] : [3, 2];
  return [p[i1], p[i2], p[i3], p[i4]];
}

/** Cuánto agranda unclip la caja: área × ratio / perímetro del polígono. */
export function distanciaDeDespliegue(poligono: Punto[], ratio: number): number {
  let doble = 0;
  let perimetro = 0;
  for (let i = 0; i < poligono.length; i++) {
    const [x1, y1] = poligono[i];
    const [x2, y2] = poligono[(i + 1) % poligono.length];
    doble += x1 * y2 - x2 * y1;
    perimetro += Math.hypot(x2 - x1, y2 - y1);
  }
  return ((Math.abs(doble) / 2) * ratio) / perimetro;
}

/** El rectángulo del mapa que mira box_score_fast: piso y techo de la caja, dentro de [0, lado − 1]. */
export function limitesDeCaja(caja: Punto[], w: number, h: number): { xmin: number; xmax: number; ymin: number; ymax: number } {
  const xs = caja.map((p) => p[0]);
  const ys = caja.map((p) => p[1]);
  const dentro = (v: number, lado: number) => Math.max(0, Math.min(v, lado - 1));
  return {
    xmin: dentro(Math.floor(Math.min(...xs)), w),
    xmax: dentro(Math.ceil(Math.max(...xs)), w),
    ymin: dentro(Math.floor(Math.min(...ys)), h),
    ymax: dentro(Math.ceil(Math.max(...ys)), h),
  };
}

/** La caja del mapa de la red a píxeles de la imagen: por la escala, redondeada como Python, dentro de [0, destino]. */
export function aEscalaOriginal(caja: Punto[], escalaX: number, escalaY: number, destW: number, destH: number): Punto[] {
  return caja.map(([x, y]) => [
    Math.max(0, Math.min(redondeoPar(x * escalaX), destW)),
    Math.max(0, Math.min(redondeoPar(y * escalaY), destH)),
  ]);
}

/** SortQuadBoxes: por la y (y después la x) del primer punto; en una franja de menos de 10 px, de izquierda a derecha. */
export function ordenarCajas<T extends { caja: Punto[] }>(cajas: T[]): T[] {
  const b = cajas.slice().sort((u, v) => u.caja[0][1] - v.caja[0][1] || u.caja[0][0] - v.caja[0][0]);
  for (let i = 0; i < b.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      if (Math.abs(b[j + 1].caja[0][1] - b[j].caja[0][1]) < 10 && b[j + 1].caja[0][0] < b[j].caja[0][0]) {
        [b[j], b[j + 1]] = [b[j + 1], b[j]];
      } else break;
    }
  }
  return b;
}
