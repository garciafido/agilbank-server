// Los armadores de las pruebas del apareo (no es un archivo de test: jest no lo corre)
import type { PendingValue } from "../../src/reconcile/types";
import type { StatementLine } from "../../src/types";

export const line = (over: Partial<StatementLine> = {}): StatementLine => ({
  id: "l1", order: 1, date: "2026-07-10", valueDate: null, type: { code: "transferencia-recibida", source: "table" },
  amountCents: 100000, balanceCents: null, reference: null, counterparty: null,
  bank: { code: null, text: "TRANSF", extras: [] }, chains: true,
  provenance: { origin: "cell", sheet: null, page: null, pageTo: null, fromRow: 1, toRow: 1 }, ...over,
});
export const val = (over: Partial<PendingValue> = {}): PendingValue => ({
  id: "v1", kind: "Transferencia bancaria", isEcheq: false, number: null, amountCents: 100000, voucherDate: "2026-07-10", valueDate: null,
  depositDate: null, depositId: null, batchId: null, drawerCuit: null, supplierId: null, customerId: null, paymentOrderType: null, ...over,
});
