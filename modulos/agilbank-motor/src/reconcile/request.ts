import { DBG_LIMITS, type Account, type Catalogs, type HistoryDbg, type MovementType } from "../dbg/types";
import { WINDOW_DAYS } from "./match";
import { LIMITS, type OwnAccount, type Party, type PendingValue, type ReconcileContext } from "./types";

// El pedido del contrato está en castellano; adentro, en inglés. Esta es la única frontera de entrada.

export type ParsedRequest =
  | { ok: true; context: ReconcileContext; originalIds: Map<string, string | number> }
  | { ok: false; field: string; valueId?: string | number };

class Invalid extends Error {
  constructor(readonly field: string, readonly valueId?: string | number) { super(field); }
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_ABS_PESOS = 1e13;

const id = (x: unknown, field: string, valueId?: string | number): string => {
  if ((typeof x === "number" && Number.isSafeInteger(x)) || (typeof x === "string" && x.trim() !== "" && x.length <= 100)) return String(x).trim();
  throw new Invalid(field, valueId);
};
const optionalId = (x: unknown, field: string, valueId?: string | number): string | null => (x === undefined || x === null || x === "" ? null : id(x, field, valueId));
const digits = (x: unknown): string | null => {
  if (x === undefined || x === null) return null;
  const d = String(x).replace(/\D/g, "");
  return d === "" ? null : d;
};
/** El número de un valor se compara sin ceros a la izquierda; un CBU o un CUIT no los pierde. */
const numberOf = (x: unknown): string | null => {
  const d = digits(x)?.replace(/^0+/, "");
  return d === undefined || d === "" ? null : d;
};
const date = (x: unknown, field: string, valueId?: string | number): string | null => {
  if (x === undefined || x === null || x === "") return null;
  const m = typeof x === "string" ? DATE.exec(x) : null;
  if (!m) throw new Invalid(field, valueId);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Invalid(field, valueId);
  return x as string;
};
/** Pesos con hasta dos decimales, a centavos. Un tercer decimal no se redondea: se rechaza. La tolerancia crece con la magnitud (unos 2 ulp de x*100) porque el error de representación de x se multiplica por 100. */
const cents = (x: unknown, field: string, valueId?: string | number): number => {
  if (typeof x !== "number" || !Number.isFinite(x) || Math.abs(x) >= MAX_ABS_PESOS) throw new Invalid(field, valueId);
  const c = Math.round(x * 100);
  if (Math.abs(x * 100 - c) > Math.max(1e-6, Math.abs(c) * 4.5e-16)) throw new Invalid(field, valueId);
  return c;
};
const text = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x.trim() : null);
const list = (x: unknown, field: string): unknown[] => {
  if (x === undefined) return [];
  if (!Array.isArray(x)) throw new Invalid(field);
  return x;
};

const windowDays = (x: unknown): number => {
  if (x === undefined) return WINDOW_DAYS;
  if (!Number.isInteger(x) || (x as number) < 0 || (x as number) > LIMITS.windowDays) throw new Invalid("ventanaDias");
  return x as number;
};

const pendingValue = (raw: unknown): PendingValue => {
  if (!isObject(raw)) throw new Invalid("valores");
  const original = raw.idValor as string | number;
  const valueId = id(raw.idValor, "idValor", original ?? undefined);
  return {
    id: valueId,
    kind: text(raw.tipo) ?? "",
    isEcheq: raw.esEcheq === true,
    number: numberOf(raw.numero),
    amountCents: cents(raw.importe, "importe", original),
    voucherDate: date(raw.fechaComprobante, "fechaComprobante", original),
    valueDate: date(raw.fechaValor, "fechaValor", original),
    depositDate: date(raw.fechaDeposito, "fechaDeposito", original),
    depositId: optionalId(raw.idDepositoBancario, "idDepositoBancario", original),
    batchId: optionalId(raw.loteEnvioBanco, "loteEnvioBanco", original),
    drawerCuit: digits(raw.cuitLibrador),
    supplierId: optionalId(raw.idProveedor, "idProveedor", original),
    customerId: optionalId(raw.idCliente, "idCliente", original),
    paymentOrderType: text(raw.tipoOrdenPago),
  };
};

const party = (role: Party["role"]) => (raw: unknown): Party => {
  if (!isObject(raw)) throw new Invalid("contrapartes");
  return { id: id(raw.id, "contrapartes"), role, cuit: digits(raw.cuit), cbu: digits(raw.cbu) };
};

const ownAccount = (raw: unknown): OwnAccount => {
  if (!isObject(raw)) throw new Invalid("cuentasPropias");
  return { id: id(raw.id, "cuentasPropias"), cbu: digits(raw.cbu), number: text(raw.numero) };
};

const coefficient = (x: unknown, field: string): 1 | -1 => {
  if (x !== 1 && x !== -1) throw new Invalid(field);
  return x;
};
/** Pesos sin signo (la historia y los catálogos no traen signo): centavos, cero o más. */
const unsignedCents = (x: unknown, field: string, valueId?: string | number): number => {
  if (x === undefined || x === null) return 0;
  const c = cents(x, field, valueId);
  if (c < 0) throw new Invalid(field, valueId);
  return c;
};
const movementType = (raw: unknown): MovementType => {
  if (!isObject(raw)) throw new Invalid("tiposGastoBancario");
  return { id: id(raw.id, "tiposGastoBancario"), description: text(raw.descripcion) ?? "", coefficient: coefficient(raw.coeficiente, "tiposGastoBancario") };
};
const account = (field: string) => (raw: unknown): Account => {
  if (!isObject(raw)) throw new Invalid(field);
  const code = raw.codigo === undefined || raw.codigo === null ? null : id(raw.codigo, field);
  if (code === null) throw new Invalid(field);
  return { id: id(raw.id, field), code, description: text(raw.descripcion) ?? "" };
};
const historyDbg = (raw: unknown): HistoryDbg => {
  if (!isObject(raw)) throw new Invalid("historiaDbg");
  const original = raw.idValor as string | number;
  const d = date(raw.fecha, "historiaDbg", original);
  if (!d) throw new Invalid("historiaDbg", original);
  return {
    id: id(raw.idValor, "historiaDbg", original), date: d, movementType: text(raw.tipoGasto) ?? "", coefficient: coefficient(raw.coeficiente, "historiaDbg"),
    amountCents: unsignedCents(raw.importe, "historiaDbg", original), vatCents: unsignedCents(raw.iva, "historiaDbg", original), perceptionCents: unsignedCents(raw.percepcionIva, "historiaDbg", original),
    accountCode: raw.cuentaContableCodigo === undefined || raw.cuentaContableCodigo === null ? null : id(raw.cuentaContableCodigo, "historiaDbg", original),
    accountName: text(raw.cuentaContable) ?? "", detail: text(raw.detalle),
  };
};
const catalogsOf = (body: Record<string, unknown>): Catalogs | null => {
  if (body.tiposGastoBancario === undefined && body.cuentasImputables === undefined && body.cuentasIvaYPercepciones === undefined) return null;
  const movementTypes = list(body.tiposGastoBancario, "tiposGastoBancario").map(movementType);
  if (movementTypes.length > DBG_LIMITS.movementTypes) throw new Invalid("tiposGastoBancario");
  const accounts = list(body.cuentasImputables, "cuentasImputables").map(account("cuentasImputables"));
  if (accounts.length > DBG_LIMITS.accounts) throw new Invalid("cuentasImputables");
  const taxAccounts = list(body.cuentasIvaYPercepciones, "cuentasIvaYPercepciones").map(account("cuentasIvaYPercepciones"));
  if (accounts.length + taxAccounts.length > DBG_LIMITS.accounts) throw new Invalid("cuentasIvaYPercepciones");
  return { movementTypes, accounts, taxAccounts };
};

export const parseReconcileRequest = (body: unknown): ParsedRequest => {
  try {
    if (!isObject(body)) throw new Invalid("cuerpo");
    let lineIds: string[] | null = null;
    if (body.renglones !== undefined) {
      const raw = list(body.renglones, "renglones");
      if (raw.length > LIMITS.lines || raw.some((x) => typeof x !== "string" || x === "")) throw new Invalid("renglones");
      lineIds = raw as string[];
    }
    const rawValues = list(body.valores, "valores");
    if (rawValues.length > LIMITS.values) throw new Invalid("valores");
    const values = rawValues.map(pendingValue);
    const originalIds = new Map<string, string | number>();
    rawValues.forEach((raw, i) => {
      const valueId = values[i].id;
      if (originalIds.has(valueId)) throw new Invalid("idValor", (raw as Record<string, unknown>).idValor as string | number);
      originalIds.set(valueId, (raw as Record<string, unknown>).idValor as string | number);
    });
    const parties = body.contrapartes === undefined ? [] : (() => {
      if (!isObject(body.contrapartes)) throw new Invalid("contrapartes");
      return [...list(body.contrapartes.proveedores, "contrapartes").map(party("supplier")), ...list(body.contrapartes.clientes, "contrapartes").map(party("customer"))];
    })();
    const ownAccounts = list(body.cuentasPropias, "cuentasPropias").map(ownAccount);
    const rawBatches = list(body.lotes, "lotes");
    if (rawBatches.length > LIMITS.batches) throw new Invalid("lotes");
    const batchIds = rawBatches.map((x) => id(x, "lotes"));
    const catalogs = catalogsOf(body);
    const rawHistory = list(body.historiaDbg, "historiaDbg");
    if (rawHistory.length > DBG_LIMITS.history) throw new Invalid("historiaDbg");
    const history = rawHistory.map(historyDbg);
    return { ok: true, context: { lineIds, values, parties, ownAccounts, batchIds, windowDays: windowDays(body.ventanaDias), catalogs, history }, originalIds };
  } catch (e) {
    if (e instanceof Invalid) return e.valueId === undefined ? { ok: false, field: e.field } : { ok: false, field: e.field, valueId: e.valueId };
    throw e;
  }
};
