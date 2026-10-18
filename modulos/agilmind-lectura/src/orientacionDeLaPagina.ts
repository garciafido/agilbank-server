// Si una página vino dada vuelta, por el voto de sus renglones: el clasificador de orientación de
// PP-OCR (ch_ppocr_mobile_v2.0_cls, el que trae @gutenye/ocr-models) dice de cada renglón si está a 0°
// o a 180°. Solo transforma datos; el modelo corre en `paddleOficial.ts`.

export interface OpcionesOrientacion {
  /** Fracción de renglones «180» que hay que superar para girar la página. */
  umbral: number;
  /** Con menos renglones que esto no se decide: una página casi vacía no vota. */
  minimoDeRenglones: number;
}

export const ORIENTACION: OpcionesOrientacion = { umbral: 0.5, minimoDeRenglones: 5 };

export interface VotoDeRenglones {
  renglones: number;
  fraccion: number;
}

/** predict_cls de PaddleOCR 2.x: alto 48, el ancho de la proporción con tope 192, relleno hasta 192. */
export function medidasDeOrientacion(w: number, h: number): { ancho: number; anchoTensor: number } {
  return { ancho: Math.min(192, Math.ceil((48 * w) / h)), anchoTensor: 192 };
}

/** La parte de los renglones donde la clase «180» supera a la «0». */
export function fraccionGirada(probabilidades: Array<[number, number]>): number {
  if (!probabilidades.length) return 0;
  return probabilidades.filter(([p0, p180]) => p180 > p0).length / probabilidades.length;
}

export function estaDadaVuelta(voto: VotoDeRenglones, opciones: Partial<OpcionesOrientacion> = {}): boolean {
  const op = { ...ORIENTACION, ...opciones };
  return voto.renglones >= op.minimoDeRenglones && voto.fraccion > op.umbral;
}
