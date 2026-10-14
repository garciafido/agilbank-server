import { randomUUID } from "crypto";
import { catalog } from "../catalog/catalog";
import { authorizeCaller, fail, reply, type ApiRequest, type ApiResponse, type Authorize, type Db } from "./http";

export const SCOPE_CORRECT = "ab:corregir";

const CANONICAL_TYPES = new Set(catalog.types.map((t) => t.code));

export interface CorrectionInput {
  bankCode: string | null;
  operationCode: string | null;
  bankText: string;
  canonicalType: string;
  rate: number | null;
}

type Parsed = { ok: true; value: CorrectionInput } | { ok: false; field: string | null };

type Optional = { ok: true; value: string | null } | { ok: false };

/** Un texto opcional, recortado: ausente, null o vacío es null. */
const optionalText = (value: unknown, accepts: (text: string) => boolean): Optional => {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const text = value.trim();
  if (text === "") return { ok: true, value: null };
  return accepts(text) ? { ok: true, value: text } : { ok: false };
};

/** El banco de la corrección es el código de entidad, como el `bankCode` del encabezado: con otra forma no aplicaría nunca. */
const BANK_CODE = /^\d{3}$/;

/** La corrección del §6 del contrato, validada. */
export const parseCorrection = (body: unknown): Parsed => {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: null };
  const b = body as Record<string, unknown>;
  const text = b.textoDelBanco;
  if (typeof text !== "string" || text.trim() === "" || text.length > 500) return { ok: false, field: "textoDelBanco" };
  if (typeof b.tipo !== "string" || !CANONICAL_TYPES.has(b.tipo)) return { ok: false, field: "tipo" };
  const bank = optionalText(b.banco, (text) => BANK_CODE.test(text));
  if (!bank.ok) return { ok: false, field: "banco" };
  const code = optionalText(b.codigoDelBanco, (text) => text.length <= 50);
  if (!code.ok) return { ok: false, field: "codigoDelBanco" };
  const rate = b.alicuota;
  if (rate !== undefined && rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
    return { ok: false, field: "alicuota" };
  }
  return { ok: true, value: { bankCode: bank.value, operationCode: code.value, bankText: text, canonicalType: b.tipo, rate: (rate as number | null | undefined) ?? null } };
};

export const correctionsApi = (deps: { db: Db; authorize: Authorize }) => {
  const create = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_CORRECT, true);
    if (!auth.ok) return auth.response;
    const parsed = parseCorrection(req.body);
    if (!parsed.ok) return fail(400, "CORRECCION_INVALIDA", "La corrección no tiene la forma del contrato.", { campo: parsed.field });
    const created: { id: string } = await deps.db.abConceptCorrection.create({
      data: {
        version_: randomUUID(),
        createdAt_: new Date(),
        createdBy_: { connect: { id: auth.caller.serviceUserId as string } },
        tenant_: { connect: { id: auth.caller.tenantId } },
        ...parsed.value,
        review: "pending",
      },
      select: { id: true },
    });
    return reply(201, { idCorreccion: created.id, vigente: "empresa", revision: "pendiente" });
  };
  return { create };
};
