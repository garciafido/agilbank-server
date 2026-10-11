/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Contraste WCAG 2.2.
 *
 * Va acá y no en una verificación final por el motivo de 6.8 del sistema de
 * diseño: comprobado al final obliga a rehacer la paleta. Comprobado al
 * derivarla, un par que no pasa es un error de generación.
 */

import { Hex, parseHex } from "./color";

export type ContrastLevel = "AA" | "AAA";

/**
 * Umbrales de 1.4.3 (texto) y 1.4.11 (componentes de interfaz), más uno propio.
 *
 * `subtle` NO viene de WCAG y no cambia entre AA y AAA a propósito: no mide
 * accesibilidad sino PERCEPTIBILIDAD de un relleno grande que separa sin
 * identificar nada — el rayado de una grilla. WCAG no le exige nada, y por eso
 * hasta acá un color así no se podía medir: o se le pedía 3:1 (y fallaba
 * siempre, que es como se apaga un gate) o no se miraba nunca.
 *
 * 1.03 es el piso: por debajo, la diferencia entre una fila y la de al lado
 * queda en 2 o 3 valores de 255 —lo que la Task 3 ya midió como "por debajo del
 * piso del corpus" al ablandar `legacy`— y las dos filas se leen como una.
 */
const THRESHOLDS: Record<
  ContrastLevel,
  { text: number; largeText: number; ui: number; subtle: number }
> = {
  AA: { text: 4.5, largeText: 3, ui: 3, subtle: 1.03 },
  AAA: { text: 7, largeText: 4.5, ui: 3, subtle: 1.03 },
};

export type PairKind = "text" | "largeText" | "ui" | "subtle";

export interface Pair {
  /** Nombre del par tal como se declara, p. ej. "primary / onPrimary". */
  name: string;
  background: Hex;
  foreground: Hex;
  kind: PairKind;
}

export interface PairResult extends Pair {
  ratio: number;
  required: number;
  passes: boolean;
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Luminancia relativa según WCAG 2.2, definición de `relative luminance`. */
export function relativeLuminance(hex: Hex): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkPair(pair: Pair, level: ContrastLevel): PairResult {
  const required = THRESHOLDS[level][pair.kind];
  const ratio = contrastRatio(pair.background, pair.foreground);
  // Se redondea a dos decimales antes de comparar: sin esto un 4.4999 que el
  // reporte imprime como "4.50" queda rechazado y el mensaje se vuelve
  // indefendible para quien lo lee.
  const rounded = Math.round(ratio * 100) / 100;
  return { ...pair, ratio: rounded, required, passes: rounded >= required };
}

/**
 * El motivo es obligatorio. Es lo que convierte "excepciones documentadas" de
 * 6.8 en algo comprobable: sin motivo no se puede saber, dentro de un año, si
 * la excepción sigue vigente o se puso para destrabar una corrida.
 */
export interface ContrastException {
  pair: string;
  reason: string;
}

export interface ContrastReport {
  results: PairResult[];
  failures: PairResult[];
  excused: PairResult[];
  /**
   * Excepciones declaradas cuyo par no está entre los que fallaron: la
   * declaración quedó de adorno. Pasa por typo en el nombre, o porque el par
   * dejó de fallar (se corrigió el color, o cambió el gate) — en los dos
   * casos hay que enterarse, no arrastrarla en silencio para siempre. Aplica
   * igual a las excepciones de `theme.contrast.exceptions` y a las que trae
   * el preset: las dos entran a `checkPairs` en la misma lista.
   */
  orphaned: ContrastException[];
}

export function checkPairs(
  pairs: Pair[],
  level: ContrastLevel,
  exceptions: ContrastException[] = []
): ContrastReport {
  for (const e of exceptions) {
    if (!e.reason || !e.reason.trim()) {
      throw new Error(
        `La excepción de contraste "${e.pair}" no tiene motivo. ` +
          `Toda excepción se declara con su porqué en hkconfig.json → theme.contrast.exceptions.`
      );
    }
  }

  const excusedNames = new Set(exceptions.map((e) => e.pair));
  const results = pairs.map((p) => checkPair(p, level));
  const failed = results.filter((r) => !r.passes);
  const failedNames = new Set(failed.map((r) => r.name));

  return {
    results,
    failures: failed.filter((r) => !excusedNames.has(r.name)),
    excused: failed.filter((r) => excusedNames.has(r.name)),
    orphaned: exceptions.filter((e) => !failedNames.has(e.pair)),
  };
}

/**
 * El remedio del mensaje de fallas: qué hacer con ellas EN GENERACIÓN. Es una
 * constante nombrada porque tiene dos audiencias y solo una lo entiende: quien
 * corre el generador puede editar hkconfig.json; quien aplica un tema desde la
 * aplicación no — para ese camino está `stripGenerationRemedy`.
 */
const GENERATION_REMEDY =
  "Corregir los colores, o declarar la excepción CON SU MOTIVO en\n" +
  "hkconfig.json → theme.contrast.exceptions: [{ pair, reason }].";

export function formatFailures(
  failures: PairResult[],
  level: ContrastLevel
): string {
  const lines = failures.map(
    (f) =>
      `  ${f.name}: ${f.ratio}:1 — se exige ${f.required}:1 (${level}, ${f.kind}). ` +
      `Fondo ${f.background}, encima ${f.foreground}`
  );
  return [
    `Contraste insuficiente en ${failures.length} par(es):`,
    ...lines,
    "",
    GENERATION_REMEDY,
  ].join("\n");
}

/**
 * El mismo mensaje sin el remedio de generación: los pares medidos, nada más.
 * Un mensaje que no lo trae vuelve intacto — recortar no puede perder datos.
 */
export function stripGenerationRemedy(message: string): string {
  return message.endsWith(GENERATION_REMEDY)
    ? message
        .slice(0, message.length - GENERATION_REMEDY.length)
        .replace(/\n+$/, "")
    : message;
}

/**
 * Nunca corta la generación, ni siquiera con `contrast.onFailure: "error"`:
 * a diferencia de una falla, una excepción sobrante no es una regresión de
 * accesibilidad — es una de dos buenas señales (el color se corrigió, o el
 * gate se volvió más preciso) que quedó sin retirar. Bloquear la generación
 * por eso sería más disruptivo que el problema que señala; el aviso alcanza
 * para que alguien la borre de `theme.contrast.exceptions` o del preset.
 */
export function formatOrphaned(orphaned: ContrastException[]): string {
  const lines = orphaned.map((o) => `  ${o.pair}: ${o.reason}`);
  return [
    `Excepción(es) de contraste que ya no hacen falta (${orphaned.length}):`,
    ...lines,
    "",
    "El par pasa el umbral sin necesitar excepción. Retirarla de",
    "hkconfig.json → theme.contrast.exceptions, o del preset si es de ahí.",
  ].join("\n");
}
