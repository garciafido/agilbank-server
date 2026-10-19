import type { Verdict } from "./contrato";

const FIRMEZA = { verified: 3, grounded: 2, weak: 1 } as const;
type Firme = keyof typeof FIRMEZA;

const esFirme = (v: string): v is Firme => Object.hasOwn(FIRMEZA, v);

/**
 * El eslabón más débil. `unavailable` domina (no pudimos mirar), después `abstained` (miramos y no
 * está), después la menos firme de las leídas. Sin partes no hay límite: `verified`. Un veredicto que
 * no es ninguno de los cinco no se puede interpretar: cuenta como `unavailable`.
 */
export function masDebil(vs: Verdict[]): Verdict {
  if (vs.some((v) => v !== "abstained" && !esFirme(v))) return "unavailable";
  if (vs.includes("abstained")) return "abstained";
  let peor: Firme = "verified";
  for (const v of vs) if (esFirme(v) && FIRMEZA[v] < FIRMEZA[peor]) peor = v;
  return peor;
}

/** Un veredicto nunca más firme que su tope. */
export const acotar = (v: Verdict, tope: Verdict): Verdict => masDebil([v, tope]);
