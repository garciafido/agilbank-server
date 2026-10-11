/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * El catálogo de presets.
 *
 * `legacy` es el default y es lo que hay hoy. Los demás son el banco de
 * pruebas: existen para comprobar que la estructura de tokens aguanta diseños
 * distintos, cosa que con un solo diseño no se puede saber. **Ninguno lleva la
 * identidad de ningún proyecto** — eso es lo que 2.3 mantiene fuera del
 * generador, y por eso ni siquiera `neutral` declara un color de marca: su
 * "marca" es el mismo gris del resto.
 */

import { Preset } from "./types";
import { BASELINE_SELECTION, matuResolvedFor } from "./matuSelection";
import { Seeds, derivePreset } from "./derived";
import { legacyPreset } from "./legacy";
import { matuToPreset } from "./matuAdapter";

const ESTADO = {
  error: "#DC3545",
  warning: "#E8912D",
  success: "#2F9E44",
  info: "#2B6CB0",
};

/**
 * Las semillas de los tres presets derivados, con nombre propio y exportadas.
 *
 * Se sacaron de las llamadas a `derivePreset` porque tienen un segundo lector:
 * el catálogo de temas de fábrica (`catalog.ts`) las re-expresa en el
 * vocabulario de Matu. Ese catálogo las LEE de acá en vez de repetirlas, así
 * que cambiar una semilla mueve el preset y su tema de fábrica juntos —
 * copiarlas habría dejado dos verdades que solo se contradicen a la vista.
 *
 * Los cuatro colores de estado son los mismos para los tres: ningún preset
 * tiene un rojo propio, y un error tiene que verse igual en todos.
 */
export const SEMILLAS: { neutral: Seeds; slate: Seeds; atrium: Seeds } = {
  neutral: {
    brand: "#5B6470",
    accent: "#5B6470",
    neutral: "#5B6470",
    ...ESTADO,
  },
  slate: { brand: "#3B5BA5", accent: "#5B6470", neutral: "#41474F", ...ESTADO },
  atrium: {
    brand: "#6A5A48",
    accent: "#7A6E60",
    neutral: "#6A6259",
    ...ESTADO,
  },
};

/** Sin identidad: gris institucional. El default para proyectos nuevos. */
const neutralPreset = derivePreset({
  name: "neutral",
  seeds: SEMILLAS.neutral,
  spacingUnit: 8,
  radiusBase: 6,
  radiusProgression: "even",
  elevation: "flat",
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  density: "default",
});

/** Denso y de alto contraste: solidez + agilidad del cuadro 4.2. */
const slatePreset = derivePreset({
  name: "slate",
  seeds: SEMILLAS.slate,
  spacingUnit: 8,
  radiusBase: 4,
  radiusProgression: "even",
  elevation: "layered",
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  density: "compact",
});

/** Holgado y de restricción cromática: sofisticación del cuadro 4.2. */
const atriumPreset = derivePreset({
  name: "atrium",
  seeds: SEMILLAS.atrium,
  spacingUnit: 8,
  radiusBase: 9,
  radiusProgression: "growing",
  elevation: "layered",
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  density: "comfortable",
});

/**
 * El tema ESTÁNDAR en el vocabulario de Matu, resuelto desde el corpus. No es
 * "un preset más": es el que trae el sistema de roles completo —seis capas de
 * contraste, marca y los cuatro estados como esquemas propios— y del que cuelga
 * la galería. Sigue siendo opt-in mientras `legacy` sea el default: adoptarlo es
 * una decisión de cada proyecto, no un cambio de cara.
 *
 * Es UNA entrada y no una por combinación: los dos ejes de Matu no entran en un
 * nombre plano, y quien quiera otra combinación la elige con `theme.base`.
 */
const matuPreset = matuToPreset(matuResolvedFor(BASELINE_SELECTION));

export const PRESETS: Record<string, Preset> = {
  legacy: legacyPreset,
  neutral: neutralPreset,
  slate: slatePreset,
  atrium: atriumPreset,
  base: matuPreset,
};

export const DEFAULT_PRESET = "legacy";

export function getPreset(name: string): Preset {
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(
      `El preset "${name}" no existe. Disponibles: ${Object.keys(PRESETS).join(
        ", "
      )}.`
    );
  }
  return preset;
}
