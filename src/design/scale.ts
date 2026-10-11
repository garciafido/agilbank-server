/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Derivación de escalas de color desde un color semilla.
 *
 * La decisión que sostiene todo lo demás: **la lightness de cada paso es fija y
 * la pone el generador; de la semilla salen solo el tono y la croma.**
 *
 * La consecuencia es la que importa: el contraste de `900` sobre `50` se conoce
 * ANTES de saber cuál va a ser la semilla. Eso hace que el gate WCAG casi nunca
 * falle por casualidad, y que cuando falle sea por una decisión explícita del
 * proyecto y no por el azar del color elegido.
 */

import { Hex, hexToOklch, toGamutHex } from "./color";

export const SCALE_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

export type ScaleStep = typeof SCALE_STEPS[number];
export type ColorScale = Record<ScaleStep, Hex>;

/** Lightness OKLab por paso. Fija: es la columna vertebral de la escala. */
const LIGHTNESS: Record<ScaleStep, number> = {
  50: 0.97,
  100: 0.94,
  200: 0.87,
  300: 0.78,
  400: 0.67,
  500: 0.56,
  600: 0.47,
  700: 0.39,
  800: 0.3,
  900: 0.22,
  950: 0.16,
};

/**
 * Croma relativa a la de la semilla. La campana es lo que evita los dos
 * defectos clásicos de una escala derivada: los pasos claros lavados de color
 * y los oscuros fluorescentes.
 */
const CHROMA_CURVE: Record<ScaleStep, number> = {
  50: 0.1,
  100: 0.2,
  200: 0.4,
  300: 0.65,
  400: 0.85,
  500: 1,
  600: 1,
  700: 0.9,
  800: 0.75,
  900: 0.55,
  950: 0.4,
};

/**
 * Tope de croma. Una semilla muy saturada produciría pasos fuera de gamut que
 * el ajuste de gamut aplanaría de todas formas; recortar acá conserva la
 * proporción entre pasos en vez de romperla en los extremos.
 */
const MAX_CHROMA = 0.16;

export function deriveScale(seed: Hex): ColorScale {
  const { c, h } = hexToOklch(seed);
  const peak = Math.min(c, MAX_CHROMA);

  const scale = {} as ColorScale;
  for (const step of SCALE_STEPS) {
    scale[step] = toGamutHex({
      l: LIGHTNESS[step],
      c: peak * CHROMA_CURVE[step],
      h,
    });
  }
  return scale;
}

/**
 * Escala de grises. Se deriva igual que las demás pero con la croma casi
 * anulada: un gris con una pizca del tono de la marca se percibe como parte del
 * mismo sistema, mientras que el gris puro se lee como ajeno. `tint` es cuánto
 * de ese tono se conserva.
 */
export function deriveNeutralScale(seed: Hex, tint = 0.12): ColorScale {
  const { c, h } = hexToOklch(seed);
  const peak = Math.min(c, MAX_CHROMA) * tint;

  const scale = {} as ColorScale;
  for (const step of SCALE_STEPS) {
    scale[step] = toGamutHex({
      l: LIGHTNESS[step],
      c: peak * CHROMA_CURVE[step],
      h,
    });
  }
  return scale;
}

/** El paso cuya lightness es la más cercana a la de un color dado. */
export function nearestStep(hex: Hex): ScaleStep {
  const { l } = hexToOklch(hex);
  return SCALE_STEPS.reduce((best, step) =>
    Math.abs(LIGHTNESS[step] - l) < Math.abs(LIGHTNESS[best] - l) ? step : best
  );
}
