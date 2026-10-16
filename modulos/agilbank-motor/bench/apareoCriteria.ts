export interface CaseExpected { inStatement: Set<string>; notInStatement: Set<string> }
export interface CaseFloors { coverage: number; precision: number; approved: boolean }

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

export const checkCase = (result: { matched: Set<string> }, expected: CaseExpected, floors: CaseFloors): string[] => {
  const found = [...expected.inStatement].filter((id) => result.matched.has(id)).length;
  const coverage = expected.inStatement.size === 0 ? 1 : found / expected.inStatement.size;
  const out: string[] = [];
  if (coverage < floors.coverage) out.push(`cobertura ${pct(coverage)} bajo el piso ${pct(floors.coverage)}`);
  if (!floors.approved) return out;
  const right = [...result.matched].filter((id) => expected.inStatement.has(id)).length;
  const precision = result.matched.size === 0 ? 1 : right / result.matched.size;
  if (precision < floors.precision) out.push(`precisión ${pct(precision)} bajo el piso ${pct(floors.precision)}`);
  const wrong = [...result.matched].filter((id) => expected.notInStatement.has(id));
  if (wrong.length > 0) out.push(`${wrong.length} valores no reflejados apareados`);
  return out;
};

/** El archivo del extracto según la fila «Extracto» del `caso.md`: `Ejemplos Extractos/<archivo>`. El nombre trae datos del cliente, por eso no se escribe en el código. */
export const extractFileOf = (casoMd: string): string | null => {
  const row = casoMd.split("\n").find((l) => /^\|\s*Extracto\s*\|/.test(l));
  return row?.match(/`Ejemplos Extractos\/([^`]+)`/)?.[1] ?? null;
};
