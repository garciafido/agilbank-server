import type { IncomingHttpHeaders } from "http";
import busboy from "busboy";
import type { KnownAccount } from "../types";

export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 200;

export interface UploadRequest {
  headers: Record<string, unknown>;
  stream: NodeJS.ReadableStream;
}

export interface Upload {
  file: Buffer;
  fileName: string;
  mimeType: string;
  account: unknown;
}

export type UploadProblem = "not-multipart" | "invalid" | "unnamed-file" | "missing-file" | "too-large" | "invalid-account-json";

export type UploadResult = { ok: true; upload: Upload } | { ok: false; problem: UploadProblem };

/**
 * El extracto y sus partes. Busboy corta el archivo un byte después del tope (avisa al llegar al límite,
 * también cuando el archivo mide justo eso), así que un envío grande nunca pasa entero a memoria y la
 * respuesta es siempre nuestra. Una parte `archivo` sin `filename` se rechaza: busboy la entrega como
 * texto decodificado en UTF-8 (un binario o un CSV en latin1 llegarían cambiados, con otra huella), y la
 * regla es una sola aunque con `application/octet-stream` los bytes llegarían enteros. La parte `cuenta`
 * puede llegar antes o después del archivo.
 */
export const readUpload = (req: UploadRequest, maxBytes = MAX_UPLOAD_BYTES): Promise<UploadResult> =>
  new Promise((resolve) => {
    const contentType = req.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("multipart/form-data")) {
      resolve({ ok: false, problem: "not-multipart" });
      return;
    }
    let settled = false;
    const done = (result: UploadResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: req.headers as IncomingHttpHeaders,
        defParamCharset: "utf8",
        limits: { fileSize: maxBytes + 1, files: 1, fields: 10, fieldSize: MAX_FIELD_BYTES },
      });
    } catch {
      done({ ok: false, problem: "not-multipart" });
      return;
    }
    const chunks: Buffer[] = [];
    let seen = false;
    let unnamed = false;
    let extraFile = false;
    let originalName = "";
    let mimeType = "application/octet-stream";
    const fields = new Map<string, { value: string; truncated: boolean }>();

    parser.on("file", (name, stream, info) => {
      if (name !== "archivo" || seen) {
        if (name === "archivo") extraFile = true;
        stream.resume();
        return;
      }
      seen = true;
      if (info.filename === undefined) {
        unnamed = true;
        stream.resume();
        return;
      }
      originalName = info.filename;
      if (info.mimeType && info.mimeType !== "application/octet-stream") mimeType = info.mimeType;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("error", () => undefined);
    });
    parser.on("filesLimit", () => {
      extraFile = true;
    });
    parser.on("field", (name, value, info) => {
      if (name !== "archivo") {
        fields.set(name, { value, truncated: info.valueTruncated });
        return;
      }
      if (seen) extraFile = true;
      seen = true;
      unnamed = true;
    });
    parser.on("error", () => done({ ok: false, problem: "invalid" }));
    parser.on("close", () => {
      const file = Buffer.concat(chunks);
      if (extraFile) return done({ ok: false, problem: "invalid" });
      if (unnamed) return done({ ok: false, problem: "unnamed-file" });
      if (!seen || file.length === 0) return done({ ok: false, problem: "missing-file" });
      if (file.length > maxBytes) return done({ ok: false, problem: "too-large" });
      const accountField = fields.get("cuenta");
      let account: unknown;
      if (accountField) {
        if (accountField.truncated) return done({ ok: false, problem: "invalid-account-json" });
        try {
          account = JSON.parse(accountField.value);
        } catch {
          return done({ ok: false, problem: "invalid-account-json" });
        }
      }
      const declaredName = fields.get("nombre")?.value.trim();
      done({ ok: true, upload: { file, fileName: declaredName || originalName.trim() || "extracto", mimeType, account } });
    });
    req.stream.on("error", () => done({ ok: false, problem: "invalid" }));
    req.stream.pipe(parser);
  });

const STRING_FIELDS = [["banco", "bank"], ["numero", "number"], ["cbu", "cbu"], ["moneda", "currency"]] as const;
const DATE_FIELDS = [["periodoDesde", "periodFrom"], ["periodoHasta", "periodTo"]] as const;
const AMOUNT_FIELDS = [["saldoInicial", "openingBalance"], ["saldoFinal", "closingBalance"]] as const;

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);

/** La cuenta que manda ProntoNet, con las claves del contrato, a la forma del motor. */
export const parseAccount = (raw: unknown): { ok: true; account: KnownAccount | undefined } | { ok: false; field: string | null } => {
  if (raw === undefined) return { ok: true, account: undefined };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, field: null };
  const source = raw as Record<string, unknown>;
  const account: Record<string, string | number> = {};
  for (const [key, prop] of STRING_FIELDS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) return { ok: false, field: key };
    account[prop] = value;
  }
  for (const [key, prop] of DATE_FIELDS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !isIsoDate(value)) return { ok: false, field: key };
    account[prop] = value;
  }
  for (const [key, prop] of AMOUNT_FIELDS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, field: key };
    account[prop] = value;
  }
  return { ok: true, account: account as KnownAccount };
};
