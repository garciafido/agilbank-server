export interface DbgResult { byAccount: Map<string, number>; dbgLines: number; bankLines: number; pendingLines: number }
export interface DbgExpected { byAccount: Map<string, number>; pendingLines: number }
export interface DbgFloors { amountShare: number; dbgShare: number; approved: boolean }

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

/** Por cuenta, lo propuesto cuenta hasta lo esperado (de más no suma); la parte es sobre el total esperado en valor absoluto. */
export const amountShare = (result: Map<string, number>, expected: Map<string, number>): number => {
  let total = 0;
  let hit = 0;
  for (const [code, cents] of expected) {
    total += Math.abs(cents);
    hit += Math.min(Math.abs(cents), Math.abs(result.get(code) ?? 0));
  }
  return total === 0 ? 1 : hit / total;
};

export const dbgShareOf = (r: DbgResult): number => (r.bankLines === 0 ? 1 : r.dbgLines / r.bankLines);

export const checkDbgCase = (r: DbgResult, e: DbgExpected, f: DbgFloors): string[] => {
  const out: string[] = [];
  const dbgShare = dbgShareOf(r);
  if (dbgShare < f.dbgShare) out.push(`familia banco como dbg ${pct(dbgShare)} bajo el piso ${pct(f.dbgShare)}`);
  if (f.approved) {
    const a = amountShare(r.byAccount, e.byAccount);
    if (a < f.amountShare) out.push(`importe con la cuenta correcta ${pct(a)} bajo el piso ${pct(f.amountShare)}`);
  }
  return out;
};

/** La línea que se imprime si el banco se corta: el caso y el código del error. El mensaje no, porque trae rutas con el nombre del cliente. */
export const abortLine = (e: unknown, caseNumber: string | null): string => {
  const code = (e as { code?: unknown } | null)?.code;
  const what = typeof code === "string" ? code : e instanceof Error ? e.name : "un error";
  return `${caseNumber === null ? "antes de los casos" : `caso ${caseNumber}`}: se cortó con ${what}`;
};
