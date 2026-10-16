import { createHash } from "crypto";
import { Readable } from "stream";
import { MAX_BATCH_BYTES, MAX_RECONCILE_JSON_BYTES, reconciliationsApi, SCOPE_RECONCILE } from "../../src/api/reconciliations";
import type { Authorize } from "../../src/api/http";
import { DEFAULT_RECONCILE_OPTIONS } from "../../src/reconcile/types";
import { fakeDb } from "./fakeDb";
import * as learning from "../../src/dbg/learning";
import { line } from "../reconcile/fixtures";

const allow = (tenantId: string | null = "T1", serviceUserId: string | null = "u1"): Authorize => async () => ({ ok: true, client: { id: "c1", name: "PN", tenantId, serviceUserId } });
const reading = (over = {}) => ({ fingerprint: "f", verdict: "verified", reason: null, header: null, lines: [line({ id: "l1", amountCents: 150025, reference: "4512" }), line({ id: "l2", amountCents: 999 })], warnings: [], checks: null, ...over });
const statement = (over = {}) => ({ id: "S1", tenant_id_: "T1", status: "read", verdict: "verified", reading: reading(), ...over });
const H = { authorization: "Bearer t" };
const body = { valores: [{ idValor: 101, tipo: "Cheque", numero: 4512, importe: 1500.25, fechaComprobante: "2026-07-10" }] };
const setup = (seed: Parameters<typeof fakeDb>[0] = { abStatement: [statement()] }, authorize = allow(), options?: Parameters<typeof reconciliationsApi>[0]["options"]) => {
  const base = fakeDb(seed);
  return { ...base, api: reconciliationsApi({ db: base.db, authorize, options }) };
};
const post = (api: ReturnType<typeof setup>["api"], b: unknown = body, id: string | undefined = "S1") => api.reconcileStatement({ headers: H, body: b, params: { idExtracto: id } });
/** La huella del cuerpo de arriba con las claves ordenadas: así la calcula la API. */
const BODY_HASH = createHash("sha256").update(JSON.stringify({ valores: [{ fechaComprobante: "2026-07-10", idValor: 101, importe: 1500.25, numero: 4512, tipo: "Cheque" }] })).digest("hex");
/** La clave que la API guarda para `body` sobre el extracto de `statement()`: sale de una conciliación hecha. */
const keyOf = async (): Promise<string> => {
  const s = setup();
  await post(s.api);
  return s.rows.abReconciliation[0].requestKey;
};
const P2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

it("el ámbito y los topes del contrato", () => {
  expect(SCOPE_RECONCILE).toBe("ab:conciliar");
  expect(MAX_RECONCILE_JSON_BYTES).toBe(16 * 1024 * 1024);
  expect(MAX_BATCH_BYTES).toBe(10 * 1024 * 1024);
});

describe("POST /v1/extractos/:id/conciliacion", () => {
  it("concilia, guarda y responde una propuesta por renglón", async () => {
    const { api, rows } = setup();
    const r = await post(api);
    expect(r.status).toBe(200);
    const out = r.body as any;
    expect(out.propuestas.map((p: any) => [p.idRenglon, p.tipo, p.valores])).toEqual([["l1", "apareo", [101]], ["l2", "pendiente", null]]);
    expect(out.propuestas[0]).toEqual(expect.objectContaining({ confianza: "verified", marcas: [], coincidencias: { importe: true, numero: "4512", fecha: { dias: 0 } } }));
    expect(rows.abReconciliation).toHaveLength(1);
    expect(rows.abReconciliation[0]).toEqual(expect.objectContaining({ tenant_id_: "T1", statementId: "S1", proposalCount: 2 }));
    expect(out.idConciliacion).toBe(rows.abReconciliation[0].id);
    expect(rows.abReconciliation[0].result.accountCodes).toStrictEqual({});
  });
  it("guarda el pedido tal cual, la clave del extracto y la huella, el autor, y las propuestas con sus ids", async () => {
    const { api, rows } = setup();
    const out = (await post(api)).body as any;
    const row = rows.abReconciliation[0];
    expect(row.requestKey).toMatch(new RegExp(`^S1:[0-9a-f]{64}:${BODY_HASH}:0:$`));
    expect(row).toEqual(expect.objectContaining({ request: body, createdBy_id_: "u1", tenant_id_: "T1" }));
    expect(typeof row.version_).toBe("string");
    expect(row.createdAt_).toBeInstanceOf(Date);
    expect(row.lastUpdatedAt_).toBeInstanceOf(Date);
    expect(row.result.originalIds).toEqual({ "101": 101 });
    expect(row.result.proposals.map((p: any) => p.id)).toEqual(out.propuestas.map((p: any) => p.idPropuesta));
    expect(row.result.proposals.map((p: any) => p.proposal.lineId)).toEqual(["l1", "l2"]);
    expect(new Set(out.propuestas.map((p: any) => p.idPropuesta)).size).toBe(2);
  });
  it("el mismo pedido otra vez devuelve la misma conciliación, sin guardar otra", async () => {
    const { api, rows, db } = setup();
    const create = jest.spyOn(db.abReconciliation, "create");
    const a = (await post(api)).body as any;
    const b = (await post(api)).body as any;
    expect(b).toEqual(a);
    expect(rows.abReconciliation).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("el mismo pedido con las claves en otro orden es el mismo; otro pedido, otra conciliación", async () => {
    const { api, rows } = setup();
    const a = (await post(api)).body as any;
    const reordered = { valores: [{ fechaComprobante: "2026-07-10", importe: 1500.25, numero: 4512, tipo: "Cheque", idValor: 101 }] };
    expect(((await post(api, reordered)).body as any).idConciliacion).toBe(a.idConciliacion);
    const other = (await post(api, { ...body, renglones: ["l2"] })).body as any;
    expect(other.idConciliacion).not.toBe(a.idConciliacion);
    expect(other.propuestas.map((p: any) => p.idRenglon)).toEqual(["l2"]);
    expect(rows.abReconciliation).toHaveLength(2);
  });
  it("otra ventanaDias es otro pedido: otra conciliación, con otra ventana", async () => {
    const { api, rows } = setup({ abStatement: [statement({ reading: reading({ lines: [line({ id: "l1", amountCents: 150025, date: "2026-07-18" })] }) })] });
    // Otro valor del importe, lejos: sin él, el importe único en el período aparearía con cualquier ventana.
    const two = { valores: [body.valores[0], { idValor: 102, tipo: "Cheque", importe: 1500.25, fechaComprobante: "2026-05-01" }] };
    const a = (await post(api, two)).body as any;
    const b = (await post(api, { ...two, ventanaDias: 10 })).body as any;
    expect(b.idConciliacion).not.toBe(a.idConciliacion);
    expect([a.propuestas[0].tipo, b.propuestas[0].tipo]).toEqual(["pendiente", "apareo"]);
    expect(rows.abReconciliation).toHaveLength(2);
  });
  it("una ventanaDias fuera de rango es un pedido inválido", async () => {
    expect(await post(setup().api, { ...body, ventanaDias: 32 })).toEqual({ status: 400, body: expect.objectContaining({ codigo: "PEDIDO_INVALIDO", campo: "ventanaDias" }) });
  });
  it("un null en el pedido (un campo vacío) entra en la huella", async () => {
    const { api, rows } = setup();
    expect((await post(api, { valores: [{ ...body.valores[0], fechaValor: null }] })).status).toBe(200);
    expect(rows.abReconciliation).toHaveLength(1);
  });
  it("el orden de los valores cuenta: es otro pedido", async () => {
    const { api, rows } = setup();
    const two = [{ idValor: 1, importe: 1 }, { idValor: 2, importe: 2 }];
    await post(api, { valores: two });
    await post(api, { valores: [...two].reverse() });
    expect(rows.abReconciliation).toHaveLength(2);
  });
  it("el mismo pedido sobre otro extracto es otra conciliación", async () => {
    const { api, rows } = setup({ abStatement: [statement(), statement({ id: "S2" })] });
    await post(api);
    await post(api, body, "S2");
    expect(rows.abReconciliation.map((r) => r.statementId)).toEqual(["S1", "S2"]);
  });
  it("la conciliación guardada de otra empresa no se devuelve", async () => {
    const requestKey = await keyOf();
    const { api, rows } = setup({ abStatement: [statement()], abReconciliation: [{ id: "X", tenant_id_: "T2", requestKey, result: { proposals: [], originalIds: {} } }] });
    const out = (await post(api)).body as any;
    expect(out.idConciliacion).not.toBe("X");
    expect(rows.abReconciliation).toHaveLength(2);
  });
  describe("después de una relectura", () => {
    const again = async (changed: Record<string, unknown>, before: Record<string, unknown> = {}) => {
      const { api, rows } = setup({ abStatement: [statement({ reading: reading(before) })] });
      const a = (await post(api)).body as any;
      rows.abStatement[0].reading = reading(changed);
      const b = (await post(api)).body as any;
      return { a, b, rows };
    };
    it("el mismo pedido sobre otros renglones es otra conciliación; la vieja sigue por su id", async () => {
      const { a, b, rows } = await again({ lines: [line({ id: "l1", amountCents: 150025, reference: "4512" }), line({ id: "l2", amountCents: 999 }), line({ id: "l3", amountCents: 5 })] });
      expect(b.idConciliacion).not.toBe(a.idConciliacion);
      expect(b.propuestas.map((p: any) => p.idRenglon)).toEqual(["l1", "l2", "l3"]);
      expect(rows.abReconciliation).toHaveLength(2);
    });
    it("un importe corregido también", async () => {
      const { a, b } = await again({ lines: [line({ id: "l1", amountCents: 150025, reference: "4512" }), line({ id: "l2", amountCents: 998 })] });
      expect(b.idConciliacion).not.toBe(a.idConciliacion);
    });
    it("una lectura que ahora trae no-cierra también: el apareo cambia de confianza", async () => {
      const { a, b } = await again({ warnings: [{ code: "no-cierra", detail: "No cierra.", blocksProposals: true }] });
      expect(b.idConciliacion).not.toBe(a.idConciliacion);
      expect(b.propuestas[0]).toEqual(expect.objectContaining({ confianza: "weak", marcas: ["lectura-con-aviso"] }));
    });
    it("el mismo número de avisos con otro código también", async () => {
      const notice = (code: string) => ({ warnings: [{ code, detail: "Aviso.", blocksProposals: code === "no-cierra" }] });
      const { a, b } = await again(notice("no-cierra"), notice("no-encadena"));
      expect(b.idConciliacion).not.toBe(a.idConciliacion);
      expect(b.propuestas[0].confianza).toBe("weak");
    });
    it("los mismos renglones con las claves en otro orden: la misma", async () => {
      const lines = reading().lines.map((l) => Object.fromEntries(Object.entries(l).reverse()));
      const { a, b, rows } = await again({ lines });
      expect(b.idConciliacion).toBe(a.idConciliacion);
      expect(rows.abReconciliation).toHaveLength(1);
    });
  });
  it("una lectura de más de 1.500 renglones: 409, con o sin renglones pedidos; 1.500 se concilia", async () => {
    const many = (n: number) => statement({ reading: reading({ lines: Array.from({ length: n }, (_, i) => line({ id: `l${i}`, amountCents: 100 + i })) }) });
    const big = setup({ abStatement: [many(1501)] });
    const TOO_BIG = { status: 409, body: { codigo: "LECTURA_DEMASIADO_GRANDE", error: "El extracto tiene más de 1.500 renglones: mándenlo partido." } };
    expect(await post(big.api)).toEqual(TOO_BIG);
    expect(await post(big.api, { ...body, renglones: ["l0"] })).toEqual(TOO_BIG);
    expect(big.rows.abReconciliation).toHaveLength(0);
    expect((await post(setup({ abStatement: [many(1500)] }).api)).status).toBe(200);
  });
  it("más de 50 lotes: 400 lotes, sin consultar ninguno", async () => {
    const { api, db } = setup();
    const findMany = jest.spyOn(db.abPaymentBatch, "findMany");
    expect(await post(api, { ...body, lotes: Array.from({ length: 51 }, (_, i) => `L${i}`) })).toEqual({ status: 400, body: expect.objectContaining({ codigo: "PEDIDO_INVALIDO", campo: "lotes" }) });
    expect(findMany).not.toHaveBeenCalled();
  });
  it("el extracto de otra empresa da 404", async () => {
    const { api, rows } = setup({ abStatement: [statement({ tenant_id_: "T2" })] });
    expect(await post(api)).toEqual({ status: 404, body: { codigo: "NO_ENCONTRADO", error: "No hay ningún extracto con ese identificador en esta empresa." } });
    expect(rows.abReconciliation).toHaveLength(0);
  });
  it("sin el id del extracto: 400", async () => {
    const { api } = setup();
    expect(await api.reconcileStatement({ headers: H, body, params: {} })).toEqual({ status: 400, body: { codigo: "SIN_IDENTIFICADOR", error: "Falta el identificador del extracto." } });
  });
  it.each([
    [{ status: "processing" }, "EXTRACTO_SIN_LEER", "El extracto todavía no está leído."],
    [{ verdict: "abstained" }, "SIN_LECTURA", "El extracto no tiene una lectura con renglones para conciliar."],
    [{ verdict: "unavailable" }, "SIN_LECTURA", "El extracto no tiene una lectura con renglones para conciliar."],
    [{ reading: null }, "SIN_LECTURA", "El extracto no tiene una lectura con renglones para conciliar."],
    [{ reading: reading({ warnings: [{ code: "varias-cuentas", detail: "Dos cuentas.", blocksProposals: true }] }) }, "OTRA_CUENTA", "Dos cuentas."],
    [{ reading: reading({ warnings: [{ code: "no-encadena", detail: "x", blocksProposals: false }, { code: "cuenta-distinta", detail: "Otro CBU.", blocksProposals: true }] }) }, "OTRA_CUENTA", "Otro CBU."],
  ])("409 con %j", async (over, codigo, error) => {
    const { api, rows } = setup({ abStatement: [statement(over)] });
    expect(await post(api)).toEqual({ status: 409, body: { codigo, error } });
    expect(rows.abReconciliation).toHaveLength(0);
  });
  it.each(["no-cierra", "lectura-parcial"])("con %s concilia igual: todo weak con la marca lectura-con-aviso", async (code) => {
    const { api } = setup({ abStatement: [statement({ verdict: "weak", reading: reading({ verdict: "weak", warnings: [{ code, detail: "Aviso.", blocksProposals: true }] }) })] });
    const out = (await post(api)).body as any;
    expect(out.propuestas[0]).toEqual(expect.objectContaining({ tipo: "apareo", confianza: "weak", marcas: ["lectura-con-aviso"] }));
  });
  it("un aviso que no frena no marca la lectura", async () => {
    const { api } = setup({ abStatement: [statement({ reading: reading({ warnings: [{ code: "no-encadena", detail: "x", blocksProposals: false }] }) })] });
    const out = (await post(api)).body as any;
    expect(out.propuestas[0]).toEqual(expect.objectContaining({ tipo: "apareo", marcas: [] }));
  });
  it("un renglón pedido que no está en la lectura: 400 con el campo", async () => {
    const { api, rows } = setup();
    expect(await post(api, { ...body, renglones: ["l1", "l9"] })).toEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "Un renglón pedido no está en la lectura del extracto.", campo: "renglones" } });
    expect(rows.abReconciliation).toHaveLength(0);
  });
  it("los renglones pedidos que están: solo esos", async () => {
    const { api } = setup();
    const out = (await post(api, { ...body, renglones: ["l1"] })).body as any;
    expect(out.propuestas.map((p: any) => p.idRenglon)).toEqual(["l1"]);
  });
  it("un valor inválido: 400 con el campo y el idValor", async () => {
    const { api } = setup();
    expect(await post(api, { valores: [{ idValor: 7, importe: "x" }] })).toEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "El pedido no tiene la forma del contrato.", campo: "importe", idValor: 7 } });
  });
  it("un cuerpo sin la forma del contrato: 400 con el campo, sin idValor", async () => {
    const { api, rows } = setup();
    expect(await post(api, null)).toStrictEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "El pedido no tiene la forma del contrato.", campo: "cuerpo" } });
    expect(rows.abReconciliation).toHaveLength(0);
  });
  describe("los lotes", () => {
    const A = "20222222223";
    const B = "27333333334";
    const t = (cuit: string, amountCents: number) => ({ cuit, number: null, amountCents, failed: false, payDate: "2026-07-10" });
    const L1 = { id: "L1", tenant_id_: "T1", transfers: [t(A, 30000), t(B, 20000)] };
    const bulk = { abStatement: [statement({ reading: reading({ lines: [line({ id: "l1", amountCents: -50000 })] }) })], abPaymentBatch: [L1] };
    const paid = {
      valores: [{ idValor: "op7", importe: -300, idProveedor: 7, fechaComprobante: "2026-07-10" }, { idValor: "op8", importe: -200, idProveedor: 8, fechaComprobante: "2026-07-10" }],
      contrapartes: { proveedores: [{ id: 7, cuit: A }, { id: 8, cuit: B }] },
    };
    it("un lote de la empresa se usa en el apareo", async () => {
      const { api } = setup(bulk);
      const out = (await post(api, { ...paid, lotes: ["L1"] })).body as any;
      expect(out.propuestas).toEqual([expect.objectContaining({ tipo: "apareo", valores: ["op7", "op8"], coincidencias: { importe: true, lote: "L1" } })]);
    });
    it("un lote nombrado dos veces se usa una sola vez", async () => {
      const { api, wheres } = setup(bulk);
      const out = (await post(api, { ...paid, lotes: ["L1", "L1"] })).body as any;
      expect(out.propuestas).toEqual([expect.objectContaining({ tipo: "apareo", valores: ["op7", "op8"] })]);
      expect(wheres.filter((w) => typeof w.id === "object")).toEqual([{ id: { in: ["L1"] }, tenant_id_: "T1" }]);
    });
    it("un lote de otra empresa no se usa: 400 lotes", async () => {
      const { api, rows } = setup({ abStatement: [statement()], abPaymentBatch: [{ id: "L1", tenant_id_: "T2", transfers: [] }] });
      expect(await post(api, { ...body, lotes: ["L1"] })).toEqual({ status: 400, body: { codigo: "PEDIDO_INVALIDO", error: "Un lote no existe en esta empresa.", campo: "lotes" } });
      expect(rows.abReconciliation).toHaveLength(0);
    });
    it("uno de la empresa y otro que no existe: 400 lotes", async () => {
      const { api } = setup(bulk);
      expect(await post(api, { ...paid, lotes: ["L1", "L9"] })).toEqual({ status: 400, body: expect.objectContaining({ campo: "lotes" }) });
    });
    it("sin lotes no se consulta ninguno", async () => {
      const { api, db } = setup(bulk);
      const findMany = jest.spyOn(db.abPaymentBatch, "findMany");
      await post(api, paid);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
  it("usa los techos que recibe", async () => {
    const now = jest.fn(() => 0);
    const { api } = setup(undefined, allow(), { ...DEFAULT_RECONCILE_OPTIONS, now });
    await post(api);
    expect(now).toHaveBeenCalled();
  });
  it("sin ámbito: 403; sin empresa: 403; sin usuario de servicio: 403", async () => {
    const noScope: Authorize = async () => ({ ok: false, reason: "no-scope", message: "x" });
    expect((await post(setup(undefined, noScope).api)).status).toBe(403);
    expect((await post(setup(undefined, allow(null)).api)).status).toBe(403);
    expect((await post(setup(undefined, allow("T1", null)).api)).status).toBe(403);
  });
  it("pide el ámbito ab:conciliar con el token del pedido", async () => {
    const seen: unknown[] = [];
    const spy: Authorize = async (token, scope) => { seen.push([token, scope]); return { ok: false, reason: "unauthorized", message: "x" }; };
    expect((await post(setup(undefined, spy).api)).status).toBe(401);
    expect(seen).toEqual([["t", "ab:conciliar"]]);
  });
  it("dos pedidos iguales a la vez: el que pierde devuelve la del que ganó, de su empresa", async () => {
    const other = { id: "X", tenant_id_: "T2", requestKey: await keyOf(), result: { proposals: [], originalIds: {} } };
    const { api, db, rows } = setup({ abStatement: [statement()], abReconciliation: [other] });
    const winner = (await post(api)).body as any;
    const findFirst = db.abReconciliation.findFirst;
    let calls = 0;
    // La consulta previa no la ve (llegó antes de que la otra se guardara); la restricción sí.
    db.abReconciliation.findFirst = (async (args: never) => (calls++ === 0 ? null : findFirst(args))) as never;
    expect(await post(api)).toEqual({ status: 200, body: winner });
    expect(rows.abReconciliation).toHaveLength(2);
  });
  it("un error que no es de la restricción sigue aunque la otra ya esté guardada", async () => {
    const { api, db } = setup();
    await post(api);
    const findFirst = db.abReconciliation.findFirst;
    let calls = 0;
    db.abReconciliation.findFirst = (async (args: never) => (calls++ === 0 ? null : findFirst(args))) as never;
    const e = new Error("db");
    db.abReconciliation.create = (async () => { throw e; }) as never;
    await expect(post(api)).rejects.toBe(e);
  });
  it("si la restricción salta y la otra no aparece, el error sigue", async () => {
    const { api, db } = setup();
    const e = P2002();
    db.abReconciliation.create = (async () => { throw e; }) as never;
    await expect(post(api)).rejects.toBe(e);
  });
  it("un error que no es de la restricción sigue", async () => {
    const { api, db } = setup();
    const e = new Error("db");
    db.abReconciliation.create = (async () => { throw e; }) as never;
    await expect(post(api)).rejects.toBe(e);
    db.abReconciliation.create = (async () => { throw null; }) as never;
    await expect(post(api)).rejects.toBeNull();
  });
  it("todo where lleva la empresa de la credencial", async () => {
    const { api, wheres } = setup({ abStatement: [statement()], abPaymentBatch: [{ id: "L1", tenant_id_: "T1", transfers: [] }] });
    await post(api, { ...body, lotes: ["L1"] });
    await post(api, { ...body, lotes: ["L1"] });
    expect(wheres.length).toBeGreaterThanOrEqual(4);
    expect(wheres.every((w) => w.tenant_id_ === "T1")).toBe(true);
  });
});

describe("GET /v1/conciliaciones/:id", () => {
  it("devuelve la guardada; de otra empresa, 404", async () => {
    const { api } = setup();
    const created = (await post(api)).body as any;
    const got = await api.byId({ headers: H, body: undefined, params: { idConciliacion: created.idConciliacion } });
    expect(got).toEqual({ status: 200, body: created });
    const other = setup({ abStatement: [statement()], abReconciliation: [{ id: "X", tenant_id_: "T2", result: { proposals: [], originalIds: {} } }] });
    expect(await other.api.byId({ headers: H, body: undefined, params: { idConciliacion: "X" } })).toEqual({ status: 404, body: { codigo: "NO_ENCONTRADO", error: "No hay ninguna conciliación con ese identificador en esta empresa." } });
  });
  it("no pide usuario de servicio, pero sí empresa y ámbito", async () => {
    const seed = { abReconciliation: [{ id: "X", tenant_id_: "T1", result: { proposals: [], originalIds: {} } }] };
    const get = (authorize: Authorize) => setup(seed, authorize).api.byId({ headers: H, body: undefined, params: { idConciliacion: "X" } });
    expect(await get(allow("T1", null))).toEqual({ status: 200, body: { idConciliacion: "X", propuestas: [] } });
    expect((await get(allow(null))).status).toBe(403);
    const seen: unknown[] = [];
    expect((await get(async (token, scope) => { seen.push([token, scope]); return { ok: false, reason: "no-scope", message: "x" }; })).status).toBe(403);
    expect(seen).toEqual([["t", "ab:conciliar"]]);
  });
  it("sin el id: 400", async () => {
    const { api } = setup();
    expect(await api.byId({ headers: H, body: undefined, params: {} })).toEqual({ status: 400, body: { codigo: "SIN_IDENTIFICADOR", error: "Falta el identificador de la conciliación." } });
  });
  it("el where lleva la empresa", async () => {
    const { api, wheres } = setup();
    await api.byId({ headers: H, body: undefined, params: { idConciliacion: "X" } });
    expect(wheres).toEqual([{ id: "X", tenant_id_: "T1" }]);
  });
});

describe("POST /v1/lotes", () => {
  const BOUNDARY = "----limite";
  const CSV = "Cuit Beneficiario;Número de pago;Monto;Estado\n20222222223;1;100,00;OK\n27333333334;2;50,00;ERROR\n";
  const multipart = (file: Buffer | string, filename = "pagos.csv", nombre?: string) => Buffer.concat([
    Buffer.from(nombre === undefined ? "" : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="nombre"\r\n\r\n${nombre}\r\n`),
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`),
    Buffer.isBuffer(file) ? file : Buffer.from(file),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
  const upload = (csv: Buffer | string = CSV, filename?: string, headers: Record<string, unknown> = {}, nombre?: string) =>
    ({ headers: { ...H, "content-type": `multipart/form-data; boundary=${BOUNDARY}`, ...headers }, stream: Readable.from([multipart(csv, filename, nombre)]) });
  it("201 con el id, las transferencias y las con error; el mismo archivo, 200 con el mismo id", async () => {
    const { api, rows } = setup();
    const a = await api.uploadBatch(upload());
    expect(a).toEqual({ status: 201, body: { idLote: rows.abPaymentBatch[0].id, transferencias: 2, conError: 1 } });
    const b = await api.uploadBatch(upload());
    expect(b).toEqual({ status: 200, body: { idLote: rows.abPaymentBatch[0].id, transferencias: 2, conError: 1 } });
    expect(rows.abPaymentBatch).toHaveLength(1);
  });
  it("guarda el lote leído con su huella, su nombre, la empresa y el autor", async () => {
    const { api, rows } = setup();
    await api.uploadBatch(upload());
    const row = rows.abPaymentBatch[0];
    expect(row).toEqual(expect.objectContaining({
      tenant_id_: "T1", createdBy_id_: "u1", originalName: "pagos.csv", contentHash: createHash("sha256").update(CSV).digest("hex"),
      transferCount: 2, failedCount: 1,
      transfers: [
        { cuit: "20222222223", number: "1", amountCents: 10000, failed: false, payDate: null },
        { cuit: "27333333334", number: "2", amountCents: 5000, failed: true, payDate: null },
      ],
    }));
    expect(typeof row.version_).toBe("string");
    expect(row.createdAt_).toBeInstanceOf(Date);
  });
  it("el mismo archivo en otra empresa es otro lote", async () => {
    const { api, rows } = setup({ abPaymentBatch: [{ id: "X", tenant_id_: "T2", contentHash: createHash("sha256").update(CSV).digest("hex"), transferCount: 2, failedCount: 1 }] });
    expect((await api.uploadBatch(upload())).status).toBe(201);
    expect(rows.abPaymentBatch).toHaveLength(2);
  });
  it("el nombre declarado se guarda sin carpetas ni caracteres de control, y acotado; «..», «lote»", async () => {
    const { api, rows } = setup();
    await api.uploadBatch(upload(CSV, undefined, {}, "..\\x/a\u0001b.csv"));
    await api.uploadBatch(upload(CSV + "\n", undefined, {}, ".."));
    await api.uploadBatch(upload(CSV + "\n\n", undefined, {}, "ñ".repeat(150)));
    expect(rows.abPaymentBatch.map((r) => r.originalName)).toEqual(["ab.csv", "lote", "ñ".repeat(100)]);
  });
  it("columnas que no se reconocen: 422 con el motivo", async () => {
    const { api, rows } = setup();
    expect(await api.uploadBatch(upload("a;b\n1;2\n"))).toEqual({ status: 422, body: { codigo: "LOTE_ILEGIBLE", error: "No se reconocen las columnas del lote: hacen falta al menos el monto y el estado." } });
    expect(rows.abPaymentBatch).toHaveLength(0);
  });
  it("un archivo de más de 10 MB: 413", async () => {
    const { api } = setup();
    expect(await api.uploadBatch(upload(Buffer.alloc(MAX_BATCH_BYTES + 1, 0x61)))).toEqual({ status: 413, body: { codigo: "ARCHIVO_DEMASIADO_GRANDE", error: "El lote pesa más de 10 MB." } });
  });
  it("un envío que no es multipart: 400", async () => {
    const { api } = setup();
    expect(await api.uploadBatch(upload(CSV, undefined, { "content-type": "text/csv" }))).toEqual({ status: 400, body: { codigo: "ENVIO_INVALIDO", error: "El lote se envía como multipart/form-data, con la parte archivo." } });
  });
  it("sin ámbito, sin empresa o sin usuario de servicio: 403; pide ab:conciliar", async () => {
    const seen: unknown[] = [];
    const noScope: Authorize = async (token, scope) => { seen.push([token, scope]); return { ok: false, reason: "no-scope", message: "x" }; };
    expect((await setup(undefined, noScope).api.uploadBatch(upload())).status).toBe(403);
    expect(seen).toEqual([["t", "ab:conciliar"]]);
    expect((await setup(undefined, allow(null)).api.uploadBatch(upload())).status).toBe(403);
    expect((await setup(undefined, allow("T1", null)).api.uploadBatch(upload())).status).toBe(403);
  });
  it("dos subidas iguales a la vez: la que pierde devuelve la que ganó, de su empresa", async () => {
    const other = { id: "X", tenant_id_: "T2", contentHash: createHash("sha256").update(CSV).digest("hex"), transferCount: 9, failedCount: 9 };
    const { api, db, rows } = setup({ abPaymentBatch: [other] });
    const first = (await api.uploadBatch(upload())).body;
    const findFirst = db.abPaymentBatch.findFirst;
    let calls = 0;
    db.abPaymentBatch.findFirst = (async (args: never) => (calls++ === 0 ? null : findFirst(args))) as never;
    expect(await api.uploadBatch(upload())).toEqual({ status: 200, body: first });
    expect(rows.abPaymentBatch).toHaveLength(2);
  });
  it("un error que no es de la restricción sigue aunque el otro ya esté guardado", async () => {
    const { api, db } = setup();
    await api.uploadBatch(upload());
    const findFirst = db.abPaymentBatch.findFirst;
    let calls = 0;
    db.abPaymentBatch.findFirst = (async (args: never) => (calls++ === 0 ? null : findFirst(args))) as never;
    const e = new Error("db");
    db.abPaymentBatch.create = (async () => { throw e; }) as never;
    await expect(api.uploadBatch(upload())).rejects.toBe(e);
  });
  it("si la restricción salta y el otro no aparece, o el error es otro, sigue", async () => {
    const { api, db } = setup();
    const e = P2002();
    db.abPaymentBatch.create = (async () => { throw e; }) as never;
    await expect(api.uploadBatch(upload())).rejects.toBe(e);
    const other = new Error("db");
    db.abPaymentBatch.create = (async () => { throw other; }) as never;
    await expect(api.uploadBatch(upload())).rejects.toBe(other);
  });
  it("todo where lleva la empresa de la credencial", async () => {
    const { api, wheres } = setup();
    await api.uploadBatch(upload());
    await api.uploadBatch(upload());
    expect(wheres).toHaveLength(2);
    expect(wheres.every((w) => w.tenant_id_ === "T1")).toBe(true);
  });
});

describe("la conciliación con catálogos y decisiones", () => {
  const catalogs = { tiposGastoBancario: [{ id: 7, descripcion: "Débito Bancario Gtos", coeficiente: 1 }], cuentasImputables: [{ id: 100, codigo: 9900102, descripcion: "COMISIONES DEL BANCO" }], cuentasIvaYPercepciones: [] };
  const charge = { id: "S2", tenant_id_: "T1", status: "read", verdict: "verified", reading: reading({ header: { bankCode: "191", bankName: null, account: null, cbu: null, currency: null, periodFrom: null, periodTo: null, openingBalanceCents: null, closingBalanceCents: null }, lines: [line({ id: "c", type: { code: "comision", source: "table" }, amountCents: -100000, bank: { code: null, text: "COMISION", extras: [] } })] }) };
  const decision = (decidedAt: Date) => ({ id: `d${+decidedAt}`, tenant_id_: "T1", statementId: "S0", lineId: `l${+decidedAt}`, bankCode: "191", conceptKey: "191||comision", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null }, decidedAt });
  it("sin decisiones, la comisión sale dbg con la cuenta del catálogo; con una decisión de la empresa, con la de la decisión", async () => {
    const { api } = setup({ abStatement: [charge] });
    const a = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(a.propuestas[0]).toEqual(expect.objectContaining({ tipo: "dbg", cuenta: { id: "100", codigo: "9900102" }, origen: "catalogo" }));
    const withDecision = setup({ abStatement: [charge], abDecision: [decision(new Date("2026-07-01"))] });
    const b = (await post(withDecision.api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(b.propuestas[0].origen).toBe("decision");
  });
  it("la misma conciliación después de una decisión nueva se vuelve a calcular; sin cambios, se devuelve la guardada", async () => {
    const { api, rows } = setup({ abStatement: [charge] });
    const a = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(((await post(api, { valores: [], ...catalogs }, "S2")).body as any).idConciliacion).toBe(a.idConciliacion);
    rows.abDecision.push(decision(new Date("2026-07-02")));
    const b = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(b.idConciliacion).not.toBe(a.idConciliacion);
    expect(b.propuestas[0].origen).toBe("decision");
  });
  it("las decisiones de otra empresa o de otro banco no cuentan", async () => {
    const { api, wheres } = setup({ abStatement: [charge], abDecision: [{ ...decision(new Date("2026-07-01")), tenant_id_: "T2" }, { ...decision(new Date("2026-07-01")), id: "x", bankCode: "072" }] });
    const a = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(a.propuestas[0].origen).toBe("catalogo");
    expect(wheres.filter((w) => "bankCode" in w).every((w) => w.tenant_id_ === "T1")).toBe(true);
  });
  it("guarda el banco, los códigos de cuenta del pedido y, por renglón, la clave del concepto y el tipo canónico", async () => {
    const { api, rows } = setup({ abStatement: [charge] });
    await post(api, { valores: [], ...catalogs, cuentasIvaYPercepciones: [{ id: 200, codigo: 9900201, descripcion: "IVA CREDITO COMPRAS" }] }, "S2");
    const row = rows.abReconciliation[0];
    expect(row.bankCode).toBe("191");
    expect(row.result.accountCodes).toEqual({ "100": "9900102", "200": "9900201" });
    expect(row.result.lines).toEqual({ c: { conceptKey: "191||comision", canonicalType: "comision" } });
  });
  it("un id que está en los dos catálogos con códigos distintos no lleva código; con el mismo código, sí", async () => {
    const { api, rows } = setup({ abStatement: [charge] });
    await post(api, { valores: [], ...catalogs, cuentasIvaYPercepciones: [{ id: 100, codigo: 9900201, descripcion: "IVA" }, { id: 300, codigo: 9, descripcion: "OTRA" }] }, "S2");
    expect(rows.abReconciliation[0].result.accountCodes).toEqual({ "300": "9" });
    const same = setup({ abStatement: [charge] });
    await post(same.api, { valores: [], ...catalogs, cuentasIvaYPercepciones: [{ id: 100, codigo: 9900102, descripcion: "IGUAL" }] }, "S2");
    expect(same.rows.abReconciliation[0].result.accountCodes).toEqual({ "100": "9900102" });
  });
  it("lee las decisiones más recientes primero y con el tope", async () => {
    const seen: unknown[] = [];
    const { api, db } = setup({ abStatement: [charge], abDecision: [decision(new Date("2026-07-01T15:00:00Z")), decision(new Date("2026-07-03T02:00:00Z"))] });
    const findMany = db.abDecision.findMany;
    db.abDecision.findMany = (async (args: any) => { seen.push(args); return findMany(args as never); }) as never;
    await post(api, { valores: [], ...catalogs }, "S2");
    expect(seen).toEqual([expect.objectContaining({ where: { tenant_id_: "T1", bankCode: "191", conceptKey: { in: ["191||comision"] } }, orderBy: { decidedAt: "desc" }, take: 5000 })]);
  });
  it("lee solo las decisiones de los conceptos del extracto, una vez cada uno: el tope no lo llena un concepto de mucho volumen", async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000);
    const busy = Array.from({ length: 5000 }, (_, i) => ({ ...decision(day(1)), id: `b${i}`, lineId: `b${i}`, conceptKey: "191||impuesto debitos", chosenPair: { movementTypeId: "7", accountId: "999", vatAccountId: null, perceptionAccountId: null } }));
    const rare = [30, 60, 90].map((n) => decision(day(n)));
    const twice = { ...charge, reading: { ...charge.reading, lines: [...charge.reading.lines, { ...charge.reading.lines[0], id: "c2" }] } };
    const seen: any[] = [];
    const { api, db } = setup({ abStatement: [twice], abDecision: [...busy, ...rare] });
    const findMany = db.abDecision.findMany;
    db.abDecision.findMany = (async (args: any) => { seen.push(args); return findMany(args as never); }) as never;
    const out = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
    expect(seen[0].where.conceptKey).toEqual({ in: ["191||comision"] });
    expect(out.propuestas[0]).toEqual(expect.objectContaining({ origen: "decision", confianza: "grounded" }));
  });
  it("una decisión nueva de otro concepto no cambia la huella; una del concepto del extracto, sí", async () => {
    const { api, rows } = setup({ abStatement: [charge], abDecision: [decision(new Date("2026-07-01T10:00:00Z"))] });
    const ask = async () => ((await post(api, { valores: [], ...catalogs }, "S2")).body as any).idConciliacion as string;
    const first = await ask();
    rows.abDecision.push({ ...decision(new Date("2026-07-02T10:00:00Z")), conceptKey: "191||otro" });
    expect(await ask()).toBe(first);
    rows.abDecision.push(decision(new Date("2026-07-03T10:00:00Z")));
    expect(await ask()).not.toBe(first);
  });
  it("un extracto sin renglones no consulta las decisiones", async () => {
    const empty = { ...charge, reading: { ...charge.reading, lines: [] } };
    const { api, db, rows } = setup({ abStatement: [empty] });
    let asked = 0;
    const findMany = db.abDecision.findMany;
    db.abDecision.findMany = (async (args: any) => { asked += 1; return findMany(args as never); }) as never;
    expect((await post(api, { valores: [], ...catalogs }, "S2")).status).toBe(200);
    expect(asked).toBe(0);
    expect(rows.abReconciliation[0].requestKey).toMatch(/:0:$/); // sin decisiones: ni cantidad, ni instante, ni día
  });
  it("al aprendizaje le llegan las decisiones por renglón (extracto:renglón) y con el día, de la más reciente a la más vieja", async () => {
    const spy = jest.spyOn(learning, "learnFromDecisions");
    try {
      const { api } = setup({ abStatement: [charge], abDecision: [decision(new Date("2026-07-01T15:00:00Z")), decision(new Date("2026-07-03T02:30:00Z"))] });
      await post(api, { valores: [], ...catalogs }, "S2");
      const rows = spy.mock.calls[0][0];
      expect(rows.map((r) => [r.lineRef, r.decidedAt])).toEqual([[`S0:l${+new Date("2026-07-03T02:30:00Z")}`, "2026-07-03"], [`S0:l${+new Date("2026-07-01T15:00:00Z")}`, "2026-07-01"]]);
    } finally { spy.mockRestore(); }
  });
  it("la huella cambia con una decisión nueva, con una corregida el mismo día (otro instante) y con el día en que se pide", async () => {
    let today = Date.parse("2026-10-16T12:00:00Z");
    const options = { ...DEFAULT_RECONCILE_OPTIONS, now: () => today };
    const { api, rows } = setup({ abStatement: [charge], abDecision: [decision(new Date("2026-07-01T10:00:00Z"))] }, allow(), options);
    const ask = async () => ((await post(api, { valores: [], ...catalogs }, "S2")).body as any).idConciliacion as string;
    const first = await ask();
    expect(await ask()).toBe(first);
    const [key] = rows.abReconciliation.map((r) => r.requestKey);
    expect(key).toMatch(/:1:2026-07-01T10:00:00\.000Z:2026-10-16$/);
    today = Date.parse("2026-10-16T23:59:00Z");
    expect(await ask()).toBe(first);
    rows.abDecision[0].decidedAt = new Date("2026-07-01T18:30:00Z");
    const corrected = await ask();
    expect(corrected).not.toBe(first);
    today = Date.parse("2026-10-17T00:01:00Z");
    expect(await ask()).not.toBe(corrected);
  });
  it("sin decisiones la huella no depende del día", async () => {
    let today = Date.parse("2026-10-16T12:00:00Z");
    const { api } = setup({ abStatement: [charge] }, allow(), { ...DEFAULT_RECONCILE_OPTIONS, now: () => today });
    const first = ((await post(api, { valores: [], ...catalogs }, "S2")).body as any).idConciliacion;
    today = Date.parse("2026-10-20T12:00:00Z");
    expect(((await post(api, { valores: [], ...catalogs }, "S2")).body as any).idConciliacion).toBe(first);
  });
  it("una decisión guardada sobre un a-revisar le llega al aprendizaje como review y no enseña", async () => {
    const spy = jest.spyOn(learning, "learnFromDecisions");
    try {
      const day = (n: number) => new Date(Date.now() - n * 86_400_000);
      const reviews = [1, 2, 3].map((n) => ({ ...decision(day(n)), proposedKind: "review" }));
      const { api } = setup({ abStatement: [charge], abDecision: reviews });
      const out = (await post(api, { valores: [], ...catalogs }, "S2")).body as any;
      expect(spy.mock.calls[0][0].map((r) => r.proposedKind)).toEqual(["review", "review", "review"]);
      expect(out.propuestas[0].origen).toBe("catalogo");
    } finally { spy.mockRestore(); }
  });
  it("pide de cada decisión todo lo que el aprendizaje usa", async () => {
    const seen: any[] = [];
    const { api, db } = setup({ abStatement: [charge] });
    const findMany = db.abDecision.findMany;
    db.abDecision.findMany = (async (args: any) => { seen.push(args); return findMany(args as never); }) as never;
    await post(api, { valores: [], ...catalogs }, "S2");
    expect(seen[0].select).toStrictEqual({ statementId: true, lineId: true, conceptKey: true, result: true, proposedKind: true, proposedPair: true, chosenKind: true, chosenPair: true, decidedAt: true });
  });
  it("una decisión vale por renglón del extracto (extracto:renglón): tres sobre el mismo renglón no alcanzan, tres renglones sí", async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000);
    const onLine = (n: number, over = {}) => ({ ...decision(day(n)), ...over });
    const grounded = async (decisions: unknown[]) => {
      const { api } = setup({ abStatement: [charge], abDecision: decisions as never[] });
      return ((await post(api, { valores: [], ...catalogs }, "S2")).body as any).propuestas[0];
    };
    const distinct = await grounded([1, 2, 3].map((n) => onLine(n)));
    const sameLine = await grounded([1, 2, 3].map((n) => onLine(n, { lineId: "l1" })));
    const otherStatement = await grounded([1, 2, 3].map((n) => onLine(n, { lineId: "l1", statementId: `S${n}` })));
    expect([distinct.confianza, sameLine.confianza, otherStatement.confianza]).toEqual(["grounded", "weak", "grounded"]);
  });
  it("sin banco en el encabezado, se leen las decisiones sin banco", async () => {
    const noBank = { ...charge, reading: { ...charge.reading, header: null } };
    const { api, wheres, rows } = setup({ abStatement: [noBank] });
    await post(api, { valores: [], ...catalogs }, "S2");
    expect(wheres).toContainEqual({ tenant_id_: "T1", bankCode: null, conceptKey: { in: ["||comision"] } });
    expect(rows.abReconciliation[0].bankCode).toBeNull();
  });
  it("las conciliaciones guardadas antes (sin códigos de cuenta) se responden igual", async () => {
    const old = { id: "R0", tenant_id_: "T1", requestKey: "k", result: { proposals: [{ id: "p", proposal: { kind: "pending", lineId: "l", reason: "x", marks: [] } }], originalIds: {} } };
    const { api } = setup({ abReconciliation: [old] });
    const r = await api.byId({ headers: H, body: null, params: { idConciliacion: "R0" } });
    expect(r.status).toBe(200);
  });
});
