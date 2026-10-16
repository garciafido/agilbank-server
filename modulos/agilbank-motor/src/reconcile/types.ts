import type { AccountPair, Catalogs, HistoryDbg, Origin } from "../dbg/types";

export interface PendingValue {
  id: string;
  kind: string;
  isEcheq: boolean;
  number: string | null;
  amountCents: number;
  voucherDate: string | null;
  valueDate: string | null;
  depositDate: string | null;
  depositId: string | null;
  batchId: string | null;
  drawerCuit: string | null;
  supplierId: string | null;
  customerId: string | null;
  paymentOrderType: string | null;
}
export interface Party { id: string; role: "supplier" | "customer"; cuit: string | null; cbu: string | null }
export interface OwnAccount { id: string; cbu: string | null; number: string | null }
export interface BatchTransfer { cuit: string | null; amountCents: number; failed: boolean; number: string | null; payDate: string | null }
export interface Batch { id: string; transfers: BatchTransfer[] }
/** `windowDays`: los días hacia cada lado de la ventana, los que pide el pedido (5 si no los pide). */
export interface ReconcileContext { lineIds: string[] | null; values: PendingValue[]; parties: Party[]; ownAccounts: OwnAccount[]; batchIds: string[]; windowDays: number; catalogs: Catalogs | null; history: HistoryDbg[] }
export type Confidence = "verified" | "grounded" | "weak";
export type Mark = "interchangeable" | "own-accounts" | "unchecked-line" | "reading-warning" | "single-amount" | "third-party";
export interface Coincidence { amount: true; number?: string; days?: number; cuit?: string; cbu?: string; deposit?: string; batch?: string }
export type Proposal =
  | { kind: "match"; lineId: string; groupLineIds: string[]; valueIds: string[]; confidence: Confidence; coincidence: Coincidence; marks: Mark[] }
  | { kind: "review"; lineId: string; reason: string; candidates: string[][] }
  | { kind: "pending"; lineId: string; reason: string; marks: Mark[] }
  | { kind: "dbg"; lineId: string; groupLineIds: string[]; pair: AccountPair; amountCents: number; vatCents: number; perceptionCents: number; groupKey: string; confidence: Confidence; origin: Origin; marks: Mark[] };
export interface Reconciliation { proposals: Proposal[] }
export interface ReconcileOptions { now: () => number; budgetMsPerLine: number; budgetMsTotal: number }
export const DEFAULT_RECONCILE_OPTIONS: ReconcileOptions = { now: Date.now, budgetMsPerLine: 2000, budgetMsTotal: 6000 };
export const LIMITS = { lines: 1500, values: 20000, transfers: 5000, batches: 50, windowDays: 31 } as const;
