import type { StatementLine } from "../types";
import type { Confidence, Mark } from "./types";

export type Basis = "number" | "unique" | "party" | "group" | "interchangeable" | "single" | "sum" | "split";

const BASE: Record<Basis, Confidence> = { number: "verified", unique: "grounded", party: "grounded", group: "grounded", interchangeable: "weak", single: "weak", sum: "weak", split: "weak" };
const RANK: Record<Confidence, number> = { weak: 0, grounded: 1, verified: 2 };
const lower = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);

const BASIS_MARK: Partial<Record<Basis, Mark>> = { interchangeable: "interchangeable", single: "single-amount" };

/** La propuesta nunca es más fuerte que el renglón más débil del que depende, ni que la lectura. Un tercero que paga por otro la deja en weak. */
export const confidenceOf = (basis: Basis, lines: StatementLine[], readingWarning: boolean, thirdParty = false): { confidence: Confidence; marks: Mark[] } => {
  let confidence = BASE[basis];
  const basisMark = BASIS_MARK[basis];
  const marks: Mark[] = basisMark ? [basisMark] : [];
  if (thirdParty) {
    confidence = "weak";
    marks.push("third-party");
  }
  if (lines.some((l) => l.chains === null)) confidence = lower(confidence, "grounded");
  if (lines.some((l) => l.chains === false)) {
    confidence = "weak";
    marks.push("unchecked-line");
  }
  if (readingWarning) {
    confidence = "weak";
    marks.push("reading-warning");
  }
  return { confidence, marks };
};
