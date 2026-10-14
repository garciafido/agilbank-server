import { randomUUID } from "crypto";
import path from "path";
import { fingerprintOf } from "../identity";
import { toPublicReading } from "../publicReading";
import type { StatementReading } from "../types";
import { authorizeCaller, fail, reply, type ApiRequest, type ApiResponse, type Authorize, type Db } from "./http";
import { parseAccount, readUpload, type UploadProblem, type UploadRequest } from "./multipart";

export const SCOPE_READ = "ab:leer";
export const RETRY_AFTER_SECONDS = 5;

export interface StatementFileKey {
  baseName: string;
  uuid: string;
  fileName: string;
  key: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** La clave del archivo en el almacenamiento: solo el nombre base, para que nunca salga de su carpeta. */
export const statementFileKey = (originalName: string, when: Date, uuid: string): StatementFileKey => {
  const fileName = path.posix.basename(originalName.trim().replace(/\\/g, "/")) || "extracto";
  const baseName = `AbStatement.file/${when.getFullYear()}/${pad(when.getMonth() + 1)}/${pad(when.getDate())}/`;
  return { baseName, uuid, fileName, key: `${baseName}${uuid}/${fileName}` };
};

export interface StatementRow {
  id: string;
  contentHash: string | null;
  status: string;
  verdict: string | null;
  reading: unknown;
}

const VIEW = { id: true, contentHash: true, status: true, verdict: true, reading: true } as const;

/** El estado público de un extracto (§4 del contrato). */
export const publicView = (row: StatementRow): Record<string, unknown> => {
  const base = { idExtracto: row.id, huella: row.contentHash };
  if (row.status === "read") return { ...base, estado: "leido", lectura: toPublicReading(row.reading as StatementReading) };
  if (row.status === "failed") return { ...base, estado: "fallido" };
  return { ...base, estado: "en-proceso", reintentarEn: RETRY_AFTER_SECONDS };
};

/** Un intento que no dice nada del archivo: un fallo nuestro o una lectura que no pudo mirar. */
const rereadable = (row: StatementRow): boolean => row.status === "failed" || (row.status === "read" && row.verdict === "unavailable");

const UPLOAD_PROBLEMS: Record<UploadProblem, ApiResponse> = {
  "not-multipart": fail(415, "ENVIO_NO_MULTIPART", "El extracto se envía como multipart/form-data, con la parte archivo."),
  invalid: fail(400, "ENVIO_INVALIDO", "El envío no se pudo leer: el cuerpo está cortado o trae más de un archivo."),
  "missing-file": fail(400, "FALTA_ARCHIVO", "Falta la parte archivo, o llegó vacía."),
  "too-large": fail(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo pesa más de 60 MB."),
  "invalid-account-json": fail(400, "CUENTA_INVALIDA", "La parte cuenta no es un JSON válido.", { campo: null }),
};

const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === "P2002";

export interface StatementsDeps {
  db: Db;
  authorize: Authorize;
  upload(bytes: Buffer, key: string, mimeType: string): Promise<void>;
  enqueueReading(statementId: string, authorId: string, tenantId: string): Promise<unknown>;
}

export const statementsApi = (deps: StatementsDeps) => {
  /** Si no se pudo encolar, el extracto no puede quedar en `queued`: el reenvío lo tomaría por en curso y nadie lo leería nunca. */
  const enqueueOrFail = async (statementId: string, authorId: string, tenantId: string): Promise<void> => {
    try {
      await deps.enqueueReading(statementId, authorId, tenantId);
    } catch (e) {
      await deps.db.abStatement.updateMany({ where: { id: statementId, tenant_id_: tenantId }, data: { status: "failed" } });
      throw e;
    }
  };

  const accepted = (id: string, fingerprint: string | null): ApiResponse =>
    reply(202, { idExtracto: id, huella: fingerprint, estado: "en-proceso" });

  /** El mismo archivo de la misma empresa: el existente, salvo que haya que leerlo de nuevo. */
  const resend = async (row: StatementRow, tenantId: string, authorId: string): Promise<ApiResponse> => {
    if (!rereadable(row)) return reply(200, publicView(row));
    const claimed = await deps.db.abStatement.updateMany({
      where: { id: row.id, tenant_id_: tenantId, status: row.status, verdict: row.verdict },
      data: { status: "queued", verdict: null, error: null },
    });
    if (claimed.count === 1) {
      await enqueueOrFail(row.id, authorId, tenantId);
      return accepted(row.id, row.contentHash);
    }
    const current = await deps.db.abStatement.findFirst({ where: { id: row.id, tenant_id_: tenantId }, select: VIEW });
    return reply(200, publicView(current ?? row));
  };

  const receive = async (req: UploadRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_READ, true);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.caller;
    const authorId = auth.caller.serviceUserId as string;
    const read = await readUpload(req);
    if (!read.ok) return UPLOAD_PROBLEMS[read.problem];
    const account = parseAccount(read.upload.account);
    if (!account.ok) return fail(400, "CUENTA_INVALIDA", "Un dato de la cuenta no tiene la forma del contrato.", { campo: account.field });

    const fingerprint = fingerprintOf(read.upload.file);
    const existing: StatementRow | null = await deps.db.abStatement.findFirst({ where: { tenant_id_: tenantId, contentHash: fingerprint }, select: VIEW });
    if (existing) return resend(existing, tenantId, authorId);

    const now = new Date();
    const key = statementFileKey(read.upload.fileName, now, randomUUID());
    const { file, mimeType } = read.upload;
    await deps.upload(file, key.key, mimeType);
    let created: { id: string };
    try {
      created = await deps.db.abStatement.create({
        data: {
          version_: randomUUID(),
          createdAt_: now,
          createdBy_: { connect: { id: authorId } },
          tenant_: { connect: { id: tenantId } },
          file: key.fileName,
          file_server_data: { baseName: key.baseName, filename: key.fileName, mimetype: mimeType, size: file.length, uuid: key.uuid },
          file_data: { name: key.fileName, mimetype: mimeType, size: file.length, url: "AbStatement.file" },
          originalName: key.fileName,
          contentHash: fingerprint,
          declaredAccount: account.account ?? undefined,
          status: "queued",
        },
        select: { id: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner: StatementRow | null = await deps.db.abStatement.findFirst({ where: { tenant_id_: tenantId, contentHash: fingerprint }, select: VIEW });
      if (!winner) throw e;
      return reply(200, publicView(winner));
    }
    await enqueueOrFail(created.id, authorId, tenantId);
    return accepted(created.id, fingerprint);
  };

  const NOT_FOUND = fail(404, "NO_ENCONTRADO", "No hay ningún extracto con ese identificador en esta empresa.");

  const byId = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_READ, false);
    if (!auth.ok) return auth.response;
    const id = req.params.idExtracto;
    if (!id) return fail(400, "SIN_IDENTIFICADOR", "Falta el identificador del extracto.");
    const row: StatementRow | null = await deps.db.abStatement.findFirst({ where: { id, tenant_id_: auth.caller.tenantId }, select: VIEW });
    return row ? reply(200, publicView(row)) : NOT_FOUND;
  };

  const byFingerprint = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_READ, false);
    if (!auth.ok) return auth.response;
    const fingerprint = (req.params.huella ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
      return fail(400, "HUELLA_INVALIDA", "La huella es el SHA-256 del archivo en hexadecimal: 64 caracteres.");
    }
    const row: StatementRow | null = await deps.db.abStatement.findFirst({ where: { tenant_id_: auth.caller.tenantId, contentHash: fingerprint }, select: VIEW });
    return row ? reply(200, publicView(row)) : fail(404, "NO_ENCONTRADO", "No recibimos ningún extracto con esa huella en esta empresa.");
  };

  return { receive, byId, byFingerprint };
};
