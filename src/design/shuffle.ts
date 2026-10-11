/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Explorar combinaciones al azar, descartando las que no sirven.
 *
 * La utilidad de un botón así no es el azar sino el descarte. Un generador que
 * propone cualquier combinación obliga a mirar cada una y decidir si es legible
 * — y eso cansa a la quinta. Como acá el contraste es computable, las que no
 * pasan ni se muestran: lo que aparece en pantalla ya es elegible.
 *
 * Que exista este módulo, y no una función escondida en el panel, es porque su
 * salida es una decisión de diseño: qué combinaciones son admisibles.
 */

import { ContrastLevel, checkPairs } from "./contrast";
import { DerivedOptions, derivePreset } from "./derived";
import { Hex, toGamutHex } from "./color";
import { pairsOf } from "./semanticMap";

/**
 * De dónde salen los tonos.
 *
 * No es el círculo completo: se saltean las zonas donde una marca institucional
 * casi nunca cae —los verdes muy amarillentos y los naranjas puros— y que
 * además chocan con los colores de estado. El azar acotado propone más seguido
 * algo usable que el azar total.
 */
const HUE_ARCS: [number, number][] = [
  [220, 280], // azules y violetas
  [150, 200], // verdeazulados
  [330, 20], // rojos y borravinos
  [30, 60], // tierras y ocres
];

export interface Combination {
  brandSeed: Hex;
  neutralSeed: Hex;
  radiusBase: number;
  radiusProgression: "even" | "growing";
  elevation: "flat" | "layered";
  density: "compact" | "default" | "comfortable";
  motionSpeed: "fast" | "default" | "slow";
}

/** Un entero en [min, max]. Se inyecta el azar para poder testear. */
type Random = () => number;

function pick<T>(options: readonly T[], random: Random): T {
  return options[Math.floor(random() * options.length) % options.length];
}

function randomHue(random: Random): number {
  const [from, to] = pick(HUE_ARCS, random);
  const width = (to - from + 360) % 360;
  return (from + random() * width) % 360;
}

/**
 * Una combinación cualquiera. La croma y la lightness de la semilla se acotan a
 * la zona donde una marca se lee bien tanto sobre blanco como sobre negro; el
 * tono es lo que de verdad varía.
 */
export function randomCombination(random: Random = Math.random): Combination {
  const hue = randomHue(random);
  return {
    brandSeed: toGamutHex({
      l: 0.5 + random() * 0.08,
      c: 0.1 + random() * 0.07,
      h: hue,
    }),
    // El gris lleva el tono de la marca: un gris puro junto a una marca teñida
    // se lee como de otro sistema.
    neutralSeed: toGamutHex({ l: 0.45, c: 0.02 + random() * 0.02, h: hue }),
    radiusBase: pick([0, 2, 4, 6, 8, 10, 14], random),
    radiusProgression: pick(["even", "growing"] as const, random),
    elevation: pick(["flat", "layered"] as const, random),
    density: pick(["compact", "default", "comfortable"] as const, random),
    motionSpeed: pick(["fast", "default", "slow"] as const, random),
  };
}

export const FIXED_STATES = {
  error: "#DC3545",
  warning: "#E8912D",
  success: "#2F9E44",
  info: "#2B6CB0",
};

export function optionsOf(c: Combination, fontFamily: string): DerivedOptions {
  return {
    name: "shuffle",
    seeds: {
      brand: c.brandSeed,
      accent: c.neutralSeed,
      neutral: c.neutralSeed,
      ...FIXED_STATES,
    },
    spacingUnit: 8,
    radiusBase: c.radiusBase,
    radiusProgression: c.radiusProgression,
    elevation: c.elevation,
    fontFamily,
    density: c.density,
    motionSpeed: c.motionSpeed,
  };
}

/** Cuántos pares quedan por debajo del nivel exigido, en los dos modos. */
export function contrastFailures(
  c: Combination,
  fontFamily: string,
  level: ContrastLevel = "AA"
): number {
  const preset = derivePreset(optionsOf(c, fontFamily));
  const { failures } = checkPairs(
    [...pairsOf(preset.light, "light"), ...pairsOf(preset.dark, "dark")],
    level
  );
  return failures.length;
}

/**
 * Una combinación que se pueda usar.
 *
 * Se prueban varias y se devuelve la primera que no tenga fallas de contraste;
 * si ninguna limpia, la mejor de las probadas — devolver nada dejaría el botón
 * sin hacer nada, que es peor que proponer algo imperfecto y decirlo.
 */
export function usableCombination(
  fontFamily: string,
  attempts = 12,
  random: Random = Math.random,
  level: ContrastLevel = "AA"
): { combination: Combination; failures: number; attempts: number } {
  let best: Combination | null = null;
  let bestFailures = Infinity;

  for (let i = 1; i <= attempts; i++) {
    const c = randomCombination(random);
    const failures = contrastFailures(c, fontFamily, level);
    if (failures === 0) return { combination: c, failures: 0, attempts: i };
    if (failures < bestFailures) {
      best = c;
      bestFailures = failures;
    }
  }

  return { combination: best!, failures: bestFailures, attempts };
}
