import type { StatementReading } from "./types";

/** La lectura se cortó a mitad: lo que depende del final del archivo no se vio. */
export const isPartialReading = (r: Pick<StatementReading, "warnings">): boolean => r.warnings.some((w) => w.code === "lectura-parcial");

export type Punta = "opening" | "closing";

/**
 * La punta del extracto que la lectura cortada no vio. El PDF se lee desde la página 1 y lo que falta es el
 * final del archivo: el fin del período en un extracto cronológico, el principio en uno inverso. Sin los
 * controles se toma el cronológico, como el contexto de los jueces.
 */
export const unseenEnd = (r: Pick<StatementReading, "warnings" | "checks">): Punta | null =>
  !isPartialReading(r) ? null : r.checks?.direction === "reverse" ? "opening" : "closing";

/** Un saldo de la punta que no se vio y que no está impreso sale del renglón leído más cercano a ella, no del extracto. */
export const balanceUnseen = (r: Pick<StatementReading, "warnings" | "checks">, punta: Punta): boolean =>
  unseenEnd(r) === punta && r.checks?.printedBalances[`${punta}Cents`] == null;
