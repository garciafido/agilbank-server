import { createHash, randomUUID } from "crypto";
import { fingerprintOf } from "../identity";
import { readBatch } from "../reconcile/batch";
import { toPublicReconciliation, type StoredProposal } from "../reconcile/publicReconciliation";
import { reconcile } from "../reconcile/reconcile";
import { parseReconcileRequest } from "../reconcile/request";
import { DEFAULT_RECONCILE_OPTIONS, LIMITS, type Batch, type BatchTransfer, type ReconcileOptions } from "../reconcile/types";
import type { StatementReading } from "../types";
import { authorizeCaller, fail, reply, type ApiRequest, type ApiResponse, type Authorize, type Db } from "./http";
import { readUpload, type UploadRequest } from "./multipart";
import { safeFileName } from "./statements";

export const SCOPE_RECONCILE = "ab:conciliar";
export const MAX_RECONCILE_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_BATCH_BYTES = 10 * 1024 * 1024;

/** Los valores son de otra cuenta: no se concilia. */
const OTHER_ACCOUNT = new Set(["varias-cuentas", "cuenta-distinta"]);
/** Se concilia igual, con todo en `weak` y la marca: un importe exacto contra un valor no depende de que el extracto cierre. */
const CONTINUES_WEAK = new Set(["no-cierra", "lectura-parcial"]);
const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === "P2002";
const touched = () => ({ version_: randomUUID(), createdAt_: new Date(), lastUpdatedAt_: new Date() });

/** La huella del pedido: el mismo JSON con las claves en cualquier orden da la misma; el orden de las listas cuenta. */
const canonical = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(canonical)
    : x !== null && typeof x === "object"
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canonical((x as Record<string, unknown>)[k])]))
      : x;
const hashOf = (x: unknown): string => createHash("sha256").update(JSON.stringify(canonical(x))).digest("hex");
/** Lo que el apareo usa de la lectura: los renglones y los códigos de los avisos. Una relectura que cambie algo da otra conciliación. */
const readingHash = (reading: StatementReading): string => hashOf({ lines: reading.lines, warnings: reading.warnings.map((w) => w.code) });

type StoredResult = { proposals: StoredProposal[]; originalIds: Record<string, string | number> };
type BatchView = { id: string; transferCount: number; failedCount: number };
const BATCH_VIEW = { id: true, transferCount: true, failedCount: true } as const;
const RECONCILIATION_VIEW = { id: true, result: true } as const;

const replyStored = (row: { id: string; result: unknown }): ApiResponse => {
  const r = row.result as StoredResult;
  return reply(200, toPublicReconciliation(row.id, r.proposals, r.originalIds));
};

const batchView = (b: BatchView) => ({ idLote: b.id, transferencias: b.transferCount, conError: b.failedCount });

export const reconciliationsApi = (deps: { db: Db; authorize: Authorize; options?: ReconcileOptions }) => {
  const options = deps.options ?? DEFAULT_RECONCILE_OPTIONS;
  const NOT_FOUND = fail(404, "NO_ENCONTRADO", "No hay ningún extracto con ese identificador en esta empresa.");
  const NO_BATCH = fail(400, "PEDIDO_INVALIDO", "Un lote no existe en esta empresa.", { campo: "lotes" });

  /** Los lotes del pedido, una vez cada uno, en el orden pedido y en una sola consulta por empresa; null si falta alguno. */
  const batchesOf = async (ids: string[], tenantId: string): Promise<Batch[] | null> => {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const found: Array<{ id: string; transfers: unknown }> = await deps.db.abPaymentBatch.findMany({ where: { id: { in: wanted }, tenant_id_: tenantId }, select: { id: true, transfers: true } });
    const byId = new Map(found.map((b) => [b.id, b.transfers as BatchTransfer[]]));
    if (wanted.some((id) => !byId.has(id))) return null;
    return wanted.map((id) => ({ id, transfers: byId.get(id) as BatchTransfer[] }));
  };

  const reconcileStatement = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_RECONCILE, true);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.caller;
    const statementId = req.params.idExtracto;
    if (!statementId) return fail(400, "SIN_IDENTIFICADOR", "Falta el identificador del extracto.");
    const row = await deps.db.abStatement.findFirst({ where: { id: statementId, tenant_id_: tenantId }, select: { status: true, verdict: true, reading: true } });
    if (!row) return NOT_FOUND;
    if (row.status !== "read") return fail(409, "EXTRACTO_SIN_LEER", "El extracto todavía no está leído.");
    if (!row.reading || row.verdict === "abstained" || row.verdict === "unavailable") return fail(409, "SIN_LECTURA", "El extracto no tiene una lectura con renglones para conciliar.");
    const readingDoc = row.reading as StatementReading;
    const otherAccount = readingDoc.warnings.find((w) => OTHER_ACCOUNT.has(w.code));
    if (otherAccount) return fail(409, "OTRA_CUENTA", otherAccount.detail);
    // Compiten todos los renglones aunque se pidan algunos: el tope va sobre la lectura, no sobre el pedido.
    if (readingDoc.lines.length > LIMITS.lines) return fail(409, "LECTURA_DEMASIADO_GRANDE", "El extracto tiene más de 1.500 renglones: mándenlo partido.");

    const parsed = parseReconcileRequest(req.body);
    if (!parsed.ok) return fail(400, "PEDIDO_INVALIDO", "El pedido no tiene la forma del contrato.", { campo: parsed.field, ...(parsed.valueId !== undefined ? { idValor: parsed.valueId } : {}) });
    const lineIds = new Set(readingDoc.lines.map((l) => l.id));
    if (parsed.context.lineIds?.some((id) => !lineIds.has(id))) return fail(400, "PEDIDO_INVALIDO", "Un renglón pedido no está en la lectura del extracto.", { campo: "renglones" });

    const requestKey = `${statementId}:${readingHash(readingDoc)}:${hashOf(req.body)}`;
    const existing = await deps.db.abReconciliation.findFirst({ where: { tenant_id_: tenantId, requestKey }, select: RECONCILIATION_VIEW });
    if (existing) return replyStored(existing);

    const batches = await batchesOf(parsed.context.batchIds, tenantId);
    if (!batches) return NO_BATCH;
    const readingWarning = readingDoc.warnings.some((w) => CONTINUES_WEAK.has(w.code));
    const result = reconcile({ lines: readingDoc.lines, context: parsed.context, batches, readingWarning }, options);
    const stored: StoredResult = { proposals: result.proposals.map((proposal) => ({ id: randomUUID(), proposal })), originalIds: Object.fromEntries(parsed.originalIds) };
    try {
      const created = await deps.db.abReconciliation.create({
        data: {
          ...touched(), createdBy_: { connect: { id: auth.caller.serviceUserId as string } }, tenant_: { connect: { id: tenantId } },
          requestKey, statementId, request: req.body as object, result: stored, proposalCount: stored.proposals.length,
        },
        select: RECONCILIATION_VIEW,
      });
      return replyStored(created);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner = await deps.db.abReconciliation.findFirst({ where: { tenant_id_: tenantId, requestKey }, select: RECONCILIATION_VIEW });
      if (!winner) throw e;
      return replyStored(winner);
    }
  };

  const byId = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_RECONCILE, false);
    if (!auth.ok) return auth.response;
    const id = req.params.idConciliacion;
    if (!id) return fail(400, "SIN_IDENTIFICADOR", "Falta el identificador de la conciliación.");
    const row = await deps.db.abReconciliation.findFirst({ where: { id, tenant_id_: auth.caller.tenantId }, select: RECONCILIATION_VIEW });
    return row ? replyStored(row) : fail(404, "NO_ENCONTRADO", "No hay ninguna conciliación con ese identificador en esta empresa.");
  };

  const uploadBatch = async (req: UploadRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_RECONCILE, true);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.caller;
    const read = await readUpload(req, MAX_BATCH_BYTES);
    if (!read.ok) {
      return read.problem === "too-large"
        ? fail(413, "ARCHIVO_DEMASIADO_GRANDE", "El lote pesa más de 10 MB.")
        : fail(400, "ENVIO_INVALIDO", "El lote se envía como multipart/form-data, con la parte archivo.");
    }
    const contentHash = fingerprintOf(read.upload.file);
    const existing: BatchView | null = await deps.db.abPaymentBatch.findFirst({ where: { tenant_id_: tenantId, contentHash }, select: BATCH_VIEW });
    if (existing) return reply(200, batchView(existing));
    const batch = readBatch(read.upload.file);
    if (!batch.ok) return fail(422, "LOTE_ILEGIBLE", batch.reason);
    try {
      const created: BatchView = await deps.db.abPaymentBatch.create({
        data: {
          ...touched(), createdBy_: { connect: { id: auth.caller.serviceUserId as string } }, tenant_: { connect: { id: tenantId } },
          originalName: safeFileName(read.upload.fileName, "lote"), contentHash, transfers: batch.transfers,
          transferCount: batch.transfers.length, failedCount: batch.transfers.filter((t) => t.failed).length,
        },
        select: BATCH_VIEW,
      });
      return reply(201, batchView(created));
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner: BatchView | null = await deps.db.abPaymentBatch.findFirst({ where: { tenant_id_: tenantId, contentHash }, select: BATCH_VIEW });
      if (!winner) throw e;
      return reply(200, batchView(winner));
    }
  };

  return { reconcileStatement, byId, uploadBatch };
};
