import type { Verdict } from "./verdict";

/** Una celda como sale de la fuente. Las fechas de una planilla ya vienen como "AAAA-MM-DD". */
export type Cell = string | number | null;

/** Cualquier formato llevado a filas y celdas. La fila 0 es la fila 1 del archivo. */
export interface Grid {
  origin: "cell" | "text";
  sheet: string | null;
  rows: Cell[][];
}

/** Lo que ProntoNet sabe de la cuenta. Todo es opcional: el extracto se lee igual sin nada. */
export interface KnownAccount {
  bank?: string | null;
  number?: string | null;
  cbu?: string | null;
  currency?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
}

/** De dónde salió el tipo: la corrección de la empresa, la tabla común, una regla general o nada. */
export type TypeSource = "company" | "table" | "rule" | "none";

export interface LineType {
  code: string;
  source: TypeSource;
}

export interface Counterparty {
  cuit: string | null;
  name: string | null;
  cbu: string | null;
}

export interface StatementLine {
  id: string;
  /** La posición en el extracto, desde 1, en el orden del archivo. */
  order: number;
  date: string;
  valueDate: string | null;
  type: LineType;
  /** Con signo, desde el punto de vista del banco: positivo entra plata. */
  amountCents: number;
  balanceCents: number | null;
  reference: string | null;
  counterparty: Counterparty | null;
  /** Lo que dice el banco, tal cual: su código de operación, su texto y las otras columnas. */
  bank: { code: string | null; text: string; extras: string[] };
  /** Si el saldo anterior más el importe da el saldo; null si no hay con qué controlarlo. */
  chains: boolean | null;
  provenance: { origin: "cell" | "text"; sheet: string | null; fromRow: number; toRow: number };
}

export interface StatementHeader {
  bankCode: string | null;
  bankName: string | null;
  account: string | null;
  cbu: string | null;
  currency: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
}

/** Los códigos son parte del contrato: estables, en castellano, como las señales de AgilPost. */
export type WarningCode =
  | "varias-cuentas"
  | "no-cierra"
  | "no-encadena"
  | "cuenta-distinta"
  | "sin-saldos"
  | "lectura-parcial"
  | "concepto-nuevo";

export interface Warning {
  code: WarningCode;
  /** En castellano, para mostrarle al usuario. */
  detail: string;
  blocksProposals: boolean;
  /** Los órdenes de los renglones a los que se refiere. */
  lines?: number[];
  data?: Record<string, string | number | null>;
}

export interface Balances {
  openingCents: number | null;
  closingCents: number | null;
}

export interface ReadingChecks {
  direction: "chronological" | "reverse";
  /** Si el saldo de una fila es el que queda después de su movimiento o el que había antes. */
  balanceIs: "after" | "before" | null;
  linesWithBalance: number;
  linesThatChain: number;
  closesWithOwnBalances: boolean | null;
  closesWithProntoNet: boolean | null;
  /** Los saldos inicial y final impresos en el archivo. El encabezado lleva estos y, si faltan, los de los renglones. */
  printedBalances: Balances;
  /** Los que salen del primer y del último saldo de renglón, en orden cronológico. */
  lineBalances: Balances;
}

export interface StatementReading {
  fingerprint: string;
  verdict: Exclude<Verdict, "grounded">;
  reason: string | null;
  header: StatementHeader | null;
  lines: StatementLine[];
  warnings: Warning[];
  checks: ReadingChecks | null;
}

/** Lo que un usuario de la empresa marcó para un concepto. Vale solo para su empresa. */
export interface Correction {
  bankCode: string | null;
  operationCode?: string | null;
  text?: string | null;
  type: string;
}

export interface ReadOptions {
  fileName?: string;
  account?: KnownAccount;
  corrections?: Correction[];
}
