import { randomUUID } from "crypto";
import { DBG_LIMITS, type AccountPair, type ChosenKind, type DecisionResult } from "../dbg/types";
import type { StoredProposal } from "../reconcile/publicReconciliation";
import { LIMITS } from "../reconcile/types";
import { authorizeCaller, fail, reply, type ApiRequest, type ApiResponse, type Authorize, type Db } from "./http";

export const SCOPE_DECIDE = "ab:decidir";
const RESULTS: Record<string, DecisionResult> = { aceptada: "accepted", corregida: "corrected", rechazada: "rejected" };
const KINDS: Record<string, ChosenKind> = { apareo: "match", dbg: "dbg", pendiente: "pending" };
const RECONCILIATION_VIEW = { statementId: true, bankCode: true, result: true } as const;

class Invalid extends Error { constructor(readonly field: string) { super(field); } }
const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const isId = (x: unknown): x is string | number => Number.isSafeInteger(x) || (typeof x === "string" && x.trim() !== "" && x.length <= 100);
const id = (x: unknown, field: string): string => { if (isId(x)) return String(x).trim(); throw new Invalid(field); };
/** Una cuenta que falta: ausente, null o vacía, como en la conciliación. */
const missing = (x: unknown): boolean => x === undefined || x === null || x === "";
const optionalId = (x: unknown, field: string): string | null => (missing(x) ? null : id(x, field));
/** Un mapa del contrato sin lo que hereda: `toString` no es un resultado. */
const lookup = <T>(map: Record<string, T>, key: unknown): T | undefined => (typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined);

interface Parsed { reconciliationId: string; proposalId: string; result: DecisionResult; chosenKind: ChosenKind; chosenPair: AccountPair | null; chosen: Record<string, unknown> }

/** Lo elegido se guarda con los campos del contrato tal como llegaron; lo que sobra no entra a la base. */
const parseChosen = (raw: Record<string, unknown>): Pick<Parsed, "chosenKind" | "chosenPair" | "chosen"> => {
  const chosenKind = lookup(KINDS, raw.tipo);
  if (!chosenKind) throw new Invalid("elegido.tipo");
  if (chosenKind === "dbg") {
    // La cuenta de IVA y la de percepción pueden faltar; el tipo de movimiento y la cuenta, no: un DBG sin cuenta no enseña nada.
    // Con la cuenta y el tipo de movimiento mal, el campo que se informa es la cuenta.
    const accountId = id(raw.cuenta, "elegido.cuenta");
    const chosenPair: AccountPair = {
      movementTypeId: id(raw.tipoMovimiento, "elegido.tipoMovimiento"), accountId,
      vatAccountId: optionalId(raw.cuentaIva, "elegido.cuentaIva"), perceptionAccountId: optionalId(raw.cuentaPercepcion, "elegido.cuentaPercepcion"),
    };
    return { chosenKind, chosenPair, chosen: { tipo: raw.tipo, tipoMovimiento: raw.tipoMovimiento, cuenta: raw.cuenta, cuentaIva: missing(raw.cuentaIva) ? null : raw.cuentaIva, cuentaPercepcion: missing(raw.cuentaPercepcion) ? null : raw.cuentaPercepcion } };
  }
  if (chosenKind === "match") {
    const values = raw.valores ?? null;
    if (values !== null && (!Array.isArray(values) || !values.every(isId))) throw new Invalid("elegido.valores");
    return { chosenKind, chosenPair: null, chosen: { tipo: raw.tipo, valores: values } };
  }
  return { chosenKind, chosenPair: null, chosen: { tipo: raw.tipo } };
};

const parseDecision = (raw: unknown): Parsed => {
  if (!isObject(raw)) throw new Invalid("decisiones");
  const result = lookup(RESULTS, raw.resultado);
  if (!result) throw new Invalid("resultado");
  if (!isObject(raw.elegido)) throw new Invalid("elegido");
  const chosen = parseChosen(raw.elegido);
  return { reconciliationId: id(raw.idConciliacion, "idConciliacion"), proposalId: id(raw.idPropuesta, "idPropuesta"), result, ...chosen };
};

type StoredReconciliation = {
  statementId: string; bankCode?: string | null;
  result: { proposals: StoredProposal[]; lines?: Record<string, { conceptKey: string; canonicalType: string }> };
};
type Outcome = { ok: true } | { ok: false; motivo: string };

const NO_RECONCILIATION = "No hay una conciliación con ese identificador en esta empresa.";
const NO_PROPOSAL = "La propuesta no está en esa conciliación.";
const TOO_OLD = "La conciliación es anterior a las decisiones: hay que volver a conciliar.";
const TOO_MANY_VALUES = "Lo elegido lleva más de 20.000 valores.";
const isUniqueViolation = (e: unknown): boolean => (e as { code?: unknown } | null)?.code === "P2002";

export const decisionsApi = (deps: { db: Db; authorize: Authorize }) => {
  const create = async (req: ApiRequest): Promise<ApiResponse> => {
    const auth = await authorizeCaller(deps.authorize, req.headers, SCOPE_DECIDE, true);
    if (!auth.ok) return auth.response;
    const { tenantId } = auth.caller;
    const body = req.body;
    if (!isObject(body) || !Array.isArray(body.decisiones) || body.decisiones.length > DBG_LIMITS.decisions) {
      return fail(400, "DECISION_INVALIDA", "El pedido lleva una lista decisiones, de hasta 1.500.", { campo: "decisiones" });
    }
    let parsed: Parsed[];
    try {
      parsed = body.decisiones.map(parseDecision);
    } catch (e) {
      if (e instanceof Invalid) return fail(400, "DECISION_INVALIDA", "Una decisión no tiene la forma del contrato.", { campo: e.field });
      throw e;
    }

    /** Reemplaza la decisión de esa clave en la empresa; la fecha es la de ahora: la huella de la conciliación la mira. */
    const save = async (d: Parsed, rec: StoredReconciliation): Promise<Outcome> => {
      if (Array.isArray(d.chosen.valores) && d.chosen.valores.length > LIMITS.values) return { ok: false, motivo: TOO_MANY_VALUES };
      const stored = rec.result.proposals.find((p) => p.id === d.proposalId);
      if (!stored) return { ok: false, motivo: NO_PROPOSAL };
      const { proposal } = stored;
      // La decisión de un DBG es la de su grupo: el renglón y el concepto del cargo, que va primero.
      const lineId = proposal.kind === "dbg" ? proposal.groupLineIds[0] : proposal.lineId;
      const lines = rec.result.lines;
      if (!lines || !Object.hasOwn(lines, lineId)) return { ok: false, motivo: TOO_OLD };
      const now = new Date();
      const decisionKey = `${d.reconciliationId}:${lineId}`;
      const data = {
        proposalId: d.proposalId, statementId: rec.statementId, lineId, bankCode: rec.bankCode ?? null,
        conceptKey: lines[lineId].conceptKey, canonicalType: lines[lineId].canonicalType, result: d.result,
        proposedKind: proposal.kind, proposedPair: proposal.kind === "dbg" ? proposal.pair : null,
        chosenKind: d.chosenKind, chosenPair: d.chosenPair, chosen: d.chosen, decidedAt: now,
      };
      const replace = async (): Promise<number> =>
        (await deps.db.abDecision.updateMany({ where: { tenant_id_: tenantId, decisionKey }, data: { ...data, lastUpdatedAt_: now, version_: randomUUID() } })).count;
      if ((await replace()) > 0) return { ok: true };
      try {
        await deps.db.abDecision.create({
          data: {
            version_: randomUUID(), createdAt_: now, lastUpdatedAt_: now, createdBy_: { connect: { id: auth.caller.serviceUserId as string } },
            tenant_: { connect: { id: tenantId } }, decisionKey, reconciliationId: d.reconciliationId, ...data,
          },
        });
      } catch (e) {
        // Otro pedido la dio de alta entre el update y el alta: se reemplaza la suya.
        if (!isUniqueViolation(e) || (await replace()) === 0) throw e;
      }
      return { ok: true };
    };

    // Una conciliación por vez, en el orden en que aparece: en memoria nunca hay más de un resultado guardado.
    const outcomes: Outcome[] = [];
    const byReconciliation = new Map<string, number[]>();
    parsed.forEach((d, i) => {
      const indexes = byReconciliation.get(d.reconciliationId);
      if (indexes) indexes.push(i);
      else byReconciliation.set(d.reconciliationId, [i]);
    });
    if (byReconciliation.size > DBG_LIMITS.decisionReconciliations) {
      return fail(400, "DECISION_INVALIDA", "Un pedido lleva decisiones de hasta 50 conciliaciones.", { campo: "idConciliacion" });
    }
    for (const [reconciliationId, indexes] of byReconciliation) {
      const rec: StoredReconciliation | null = await deps.db.abReconciliation.findFirst({ where: { id: reconciliationId, tenant_id_: tenantId }, select: RECONCILIATION_VIEW });
      for (const i of indexes) outcomes[i] = rec ? await save(parsed[i], rec) : { ok: false, motivo: NO_RECONCILIATION };
    }

    const registradas: string[] = [];
    const rechazadas: Array<{ idPropuesta: string; motivo: string }> = [];
    outcomes.forEach((o, i) => (o.ok ? registradas.push(parsed[i].proposalId) : rechazadas.push({ idPropuesta: parsed[i].proposalId, motivo: o.motivo })));
    return reply(200, { registradas, rechazadas });
  };
  return { create };
};
