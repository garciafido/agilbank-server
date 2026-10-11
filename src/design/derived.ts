/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Constructor de presets derivados: semillas → escalas → conjuntos semánticos.
 *
 * `legacy` no pasa por acá porque declara sus valores a mano; todos los demás
 * sí. Que las dos formas produzcan el mismo tipo `Preset` es lo que permite que
 * `resolveTheme` no tenga que saber cuál es cuál.
 */

import { ColorScale, deriveNeutralScale, deriveScale } from "./scale";
import { buildSemanticSet } from "./semanticMap";
import { Preset, RadiusScale, TypographyScale } from "./types";
import {
  CAPAS,
  FOCO,
  SIN_GRADIENTES,
  TIPO_DE_FILA_POR_DEFECTO,
  elevation,
  espaciadosDeComponente,
  iconography,
  motion,
  spacingScale,
} from "./doctrine";
import { Hex } from "./color";

export interface Seeds {
  brand: Hex;
  accent: Hex;
  neutral: Hex;
  error: Hex;
  warning: Hex;
  success: Hex;
  info: Hex;
}

export interface DerivedOptions {
  name: string;
  seeds: Seeds;
  spacingUnit: number;
  /** 6.4: lo que diferencia no es el radio, es la progresión de la escala. */
  radiusBase: number;
  radiusProgression: "even" | "growing";
  /** 6.5: plano, o con profundidad de dos capas. */
  elevation: "flat" | "layered";
  fontFamily: string;
  /** 6.3: la densidad. Multiplica la escala tipográfica, no el espaciado. */
  density: "compact" | "default" | "comfortable";
  /** 6.7 */
  motionSpeed?: "fast" | "default" | "slow";
  /** 6.6 */
  iconFamily?: "material" | "lucide";
}

/**
 * `even` avanza de a un paso constante y produce una familia de formas pareja;
 * `growing` crece más que la suma de los anteriores y produce otra. La
 * diferencia se percibe aunque nadie la mida, y es parte de la identidad.
 */
export function radiusScale(
  base: number,
  progression: "even" | "growing"
): RadiusScale {
  const step = Math.max(2, Math.round(base / 3));
  return progression === "even"
    ? {
        none: 0,
        xs: base - step,
        s: base,
        m: base + step,
        l: base + step * 2,
        xl: base + step * 4,
        full: 9999,
      }
    : {
        none: 0,
        xs: Math.round(base / 2),
        s: base,
        m: base * 2,
        l: base * 3,
        xl: base * 5,
        full: 9999,
      };
}

/**
 * Qué componentes cuelgan de la escala de radios, y de qué escalón cada uno.
 *
 * Exportado porque lo necesitan dos caminos: derivar un preset desde cero, y
 * cambiarle el radio a uno que declara sus colores a mano. Escrito dos veces se
 * desincroniza, y el síntoma —el botón se redondea y la tarjeta no— es de los
 * que se ven pero no se atribuyen.
 */
export function radiosDeComponente(radius: RadiusScale) {
  return {
    button: { radius: radius.s },
    card: { radius: radius.m },
    dialog: { radius: radius.l },
    chip: { radius: radius.xs },
    tooltip: { radius: radius.xs },
    input: { radius: radius.s },
  };
}

/**
 * Cuánto multiplica cada modo la escala tipográfica. Exportado porque la
 * densidad tiene DOS caminos —construir un preset derivado desde las semillas,
 * y recomponer la rampa de un preset tokenizado desde sus ingredientes
 * (`resolve.ts`)— y el factor tiene que ser el mismo en los dos, o "compacto"
 * significaría una cosa en `neutral` y otra en `matu`.
 */
export const DENSITY_FACTOR = {
  compact: 0.9375,
  default: 1,
  comfortable: 1.0625,
} as const;

function typography(
  fontFamily: string,
  density: DerivedOptions["density"]
): TypographyScale {
  const k = DENSITY_FACTOR[density];
  const rem = (base: number) => `${Math.round(base * k * 10000) / 10000}rem`;
  return {
    fontFamily,
    // Sin distinción de roles en este camino: los tres valen lo mismo.
    titleFontFamily: fontFamily,
    buttonFontFamily: fontFamily,
    weights: [400, 500, 600, 700],
    h1: { fontWeight: 600, fontSize: rem(2), lineHeight: 1.4 },
    h2: { fontWeight: 600, fontSize: rem(1.5), lineHeight: 1.4 },
    h3: { fontWeight: 600, fontSize: rem(1.25), lineHeight: 1.5 },
    h4: { fontWeight: 500, fontSize: rem(1.125), lineHeight: 1.5 },
    h5: { fontWeight: 500, fontSize: rem(1), lineHeight: 1.5 },
    h6: { fontWeight: 500, fontSize: rem(0.875), lineHeight: 1.6 },
    body1: { fontWeight: 400, fontSize: rem(0.9375), lineHeight: 1.7 },
    body2: { fontWeight: 400, fontSize: rem(0.8125), lineHeight: 1.6 },
    subtitle1: { fontWeight: 500, lineHeight: 1.6 },
    subtitle2: { fontWeight: 400, lineHeight: 1.6 },
    button: { fontWeight: 500, textTransform: "none" },
  };
}

export function derivePreset(o: DerivedOptions): Preset {
  const scales: Record<string, ColorScale> = {
    brand: deriveScale(o.seeds.brand),
    accent: deriveScale(o.seeds.accent),
    // El gris lleva una pizca del tono de la marca: un gris puro junto a una
    // marca teñida se lee como de otro sistema.
    neutral: deriveNeutralScale(o.seeds.neutral),
    error: deriveScale(o.seeds.error),
    warning: deriveScale(o.seeds.warning),
    success: deriveScale(o.seeds.success),
    info: deriveScale(o.seeds.info),
  };

  const radius = radiusScale(o.radiusBase, o.radiusProgression);
  const rc = radiosDeComponente(radius);
  const esp = espaciadosDeComponente(o.spacingUnit);
  const elev = elevation(o.elevation);
  const mov = motion(o.motionSpeed ?? "default");
  const elevations = elev.shadows;

  return {
    name: o.name,
    derivedFrom: o,
    primitives: {
      scales,
      spacingUnit: o.spacingUnit,
      spacing: spacingScale(o.spacingUnit),
      radius,
      radiusProgression: o.radiusProgression,
      elevation: elev,
      gradients: SIN_GRADIENTES,
      motion: mov,
      focus: FOCO,
      icons: iconography(o.iconFamily ?? "material"),
      shadows: elevations,
      layers: CAPAS,
      duration: {
        fast: mov.duration.fast,
        base: mov.duration.base,
        slow: mov.duration.slow,
      },
      typography: typography(o.fontFamily, o.density),
    },
    components: {
      button: { ...rc.button, ...esp.button, fontSize: "0.875rem" },
      card: rc.card,
      dialog: { ...rc.dialog, shadow: elevations[4] },
      chip: { ...rc.chip, fontSize: "0.75rem" },
      tooltip: { ...rc.tooltip, ...esp.tooltip, fontSize: "0.75rem" },
      input: rc.input,
      table: {
        ...esp.table,
        fontSize: "0.875rem",
        headFontSize: "0.8125rem",
        rows: TIPO_DE_FILA_POR_DEFECTO,
      },
    },
    light: buildSemanticSet(scales, "light"),
    dark: buildSemanticSet(scales, "dark"),
  };
}
