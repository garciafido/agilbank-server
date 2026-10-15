import type { OcrWord } from "../../src/tipos";

/** Una palabra por su centro: así el centro de la caja es exactamente el que se pide. */
export const palabraEn = (text: string, cx: number, cy: number, w: number, h: number): OcrWord => ({
  text,
  box: { x: cx - w / 2, y: cy - h / 2, w, h },
  start: 0,
  end: text.length,
});
