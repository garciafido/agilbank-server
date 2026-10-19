import { randomUUID } from "crypto";
import type { Db } from "./api/http";
import { resumirDictamen } from "@agilmind/lectura";
import { conceptKeyOf } from "./dbg/conceptKey";
import { dictaminarExtracto } from "./juez/juecesDelExtracto";
import { balanceUnseen, unseenEnd } from "./partialReading";
import { readStatement } from "./readStatement";
import type { Correction, KnownAccount, LecturaGuardada, StatementReading } from "./types";

export interface BackgroundStorage {
  downloadBuffer(key: string): Promise<Buffer>;
}

let configured: { storage: () => BackgroundStorage } | null = null;

/** El producto lo llama al arrancar el worker: el motor no puede importar el almacenamiento del producto. */
export const configureBackgroundReading = (options: { storage: () => BackgroundStorage }): void => {
  configured = options;
};

/** Lo que el paso usa del contexto del worker: la base fuera de la transacción del paso, y la empresa del trabajo. */
export interface StageContextLike {
  prisma: Db;
  currentUser?: { tenant_id_?: string | null } | null;
}

type CorrectionRow = { bankCode: string | null; operationCode: string | null; bankText: string; canonicalType: string };

/** Una corrección por concepto: la más nueva. Las filas llegan ordenadas de la más nueva a la más vieja. */
export const latestCorrections = (rows: CorrectionRow[]): Correction[] => {
  const seen = new Set<string>();
  const out: Correction[] = [];
  for (const row of rows) {
    const key = conceptKeyOf(row.bankCode, row.operationCode, row.bankText);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bankCode: row.bankCode, operationCode: row.operationCode, text: row.bankText, type: row.canonicalType });
  }
  return out;
};

/**
 * Los arranques que el paso tolera sin terminar. Un archivo que tumba al worker (memoria) no tira
 * error: el evento vence y se vuelve a tomar sin contar el intento. Al cuarto arranque queda fallido.
 */
export const MAX_READ_STARTS = 3;

const touched = (): { lastUpdatedAt_: Date; version_: string } => ({ lastUpdatedAt_: new Date(), version_: randomUUID() });

const pesos = (cents: number | null | undefined): string | null => (cents === null || cents === undefined ? null : (cents / 100).toFixed(2));
const day = (iso: string | null | undefined): Date | null => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

/** El dictamen es un agregado: si no se puede armar, la lectura no pierde nada por eso, y queda el porqué. */
function conDictamen(reading: StatementReading): LecturaGuardada {
  try {
    return { ...reading, dictamen: resumirDictamen(dictaminarExtracto(reading)) };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.warn("[juez] el dictamen del extracto no se pudo armar:", motivo);
    return { ...reading, dictamen: null, dictamenFallo: motivo };
  }
}

/**
 * El paso `read` del pipeline AbStatementRead (`.implementedBy`). Escribe con `context.prisma` y no con la
 * transacción del paso: si escribiera adentro, el rollback al relanzar se llevaría el estado y la causa.
 * Nunca baja un extracto leído: un trabajo tardío sobre él (un reintento manual) devuelve `read` sin leer.
 * `readStarts` cuenta los arranques que no terminaron en error: los interrumpidos y el que lee.
 */
export const readStatementStage = async (context: StageContextLike, statementId: string, _workerEventId?: string): Promise<{ status: string }> => {
  if (!configured) throw new Error("La lectura de extractos no está configurada: falta configureBackgroundReading en el arranque del worker.");
  const tenantId = context.currentUser?.tenant_id_;
  if (!tenantId) throw new Error("El trabajo de lectura no trae empresa.");
  const db = context.prisma;
  const where = { id: statementId, tenant_id_: tenantId };
  const statement = await db.abStatement.findFirst({ where, select: { id: true, originalName: true, file_server_data: true, declaredAccount: true, readStarts: true } });
  if (!statement) return { status: "not-found" };
  const notRead = { ...where, status: { not: "read" } };
  if ((statement.readStarts ?? 0) >= MAX_READ_STARTS) {
    const gaveUp = await db.abStatement.updateMany({ where: notRead, data: { status: "failed", error: "La lectura se interrumpió tres veces.", ...touched() } });
    return { status: gaveUp.count === 1 ? "failed" : "read" };
  }
  const started = await db.abStatement.updateMany({ where: notRead, data: { status: "processing", readStarts: { increment: 1 }, ...touched() } });
  if (started.count === 0) return { status: "read" };
  try {
    const file = statement.file_server_data as { baseName: string; uuid: string; filename: string };
    const bytes = await configured.storage().downloadBuffer(`${file.baseName}${file.uuid}/${file.filename}`);
    const corrections = latestCorrections(
      await db.abConceptCorrection.findMany({
        where: { tenant_id_: tenantId },
        orderBy: { createdAt_: "desc" },
        select: { bankCode: true, operationCode: true, bankText: true, canonicalType: true },
      }),
    );
    const reading = await readStatement(bytes, {
      fileName: statement.originalName,
      account: (statement.declaredAccount ?? undefined) as KnownAccount | undefined,
      corrections,
    });
    const header = reading.header;
    await db.abStatement.updateMany({
      where,
      data: {
        status: "read",
        verdict: reading.verdict,
        reading: JSON.parse(JSON.stringify(conDictamen(reading))),
        bankCode: header?.bankCode ?? null,
        cbu: header?.cbu ?? null,
        periodFrom: unseenEnd(reading) === "opening" ? null : day(header?.periodFrom),
        periodTo: unseenEnd(reading) === "closing" ? null : day(header?.periodTo),
        openingBalance: balanceUnseen(reading, "opening") ? null : pesos(header?.openingBalanceCents),
        closingBalance: balanceUnseen(reading, "closing") ? null : pesos(header?.closingBalanceCents),
        lineCount: reading.lines.length,
        error: null,
        processedAt: new Date(),
        ...touched(),
      },
    });
    return { status: "read" };
  } catch (e) {
    // Queda en `queued` mientras el worker reintenta: `failed` lo pone markStatementFailed al agotarse.
    await db.abStatement.updateMany({
      where: notRead,
      data: { status: "queued", error: e instanceof Error ? e.message : String(e), readStarts: { decrement: 1 }, ...touched() },
    });
    throw e;
  }
};

/**
 * El manejador de reintentos agotados (`deadLetterHandlers.AbStatementRead`). La empresa sale del evento del
 * worker, no del mensaje: es la misma con la que el paso se negó o se animó a leer, y nunca queda sin ella.
 */
export const markStatementFailed = async ({ payload, prisma }: { payload: any; prisma: Db }): Promise<void> => {
  const id = payload?.input?.statementId;
  const workerEventId = payload?.workerEventId;
  if (typeof id !== "string" || id === "" || typeof workerEventId !== "string" || workerEventId === "") return;
  const event = await prisma.workerEvent.findFirst({ where: { id: workerEventId }, select: { tenant_id_: true } });
  if (!event?.tenant_id_) return;
  await prisma.abStatement.updateMany({ where: { id, tenant_id_: event.tenant_id_, status: { not: "read" } }, data: { status: "failed", ...touched() } });
};
