import { decisionsApi, SCOPE_DECIDE } from "../../src/api/decisions";
import { LIMITS } from "../../src/reconcile/types";
import type { Authorize } from "../../src/api/http";
import { fakeDb } from "./fakeDb";

const allow = (tenantId: string | null = "T1", serviceUserId: string | null = "u1"): Authorize => async () => ({ ok: true, client: { id: "c1", name: "PN", tenantId, serviceUserId } });
const H = { authorization: "Bearer t" };
const stored = (lineId: string, proposal: object) => ({ id: `p-${lineId}`, proposal: { lineId, ...proposal } });
const reconciliation = (tenant = "T1") => ({
  id: "C1", tenant_id_: tenant, statementId: "S1", bankCode: "191",
  result: { proposals: [stored("c", { kind: "dbg", groupLineIds: ["c"], pair: { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null }, amountCents: -1, vatCents: 0, perceptionCents: 0, groupKey: "k", confidence: "weak", origin: "catalog", marks: [] }), stored("m", { kind: "match", groupLineIds: ["m"], valueIds: ["5"], confidence: "verified", coincidence: { amount: true }, marks: [] })], originalIds: {}, accountCodes: {},
    lines: { c: { conceptKey: "191||comision", canonicalType: "comision" }, m: { conceptKey: "191||transf", canonicalType: "transferencia-enviada" } } },
});
const setup = (seed: Parameters<typeof fakeDb>[0] = { abReconciliation: [reconciliation()] }, authorize = allow()) => { const base = fakeDb(seed); return { ...base, api: decisionsApi({ db: base.db, authorize }) }; };
const post = (api: ReturnType<typeof setup>["api"], decisiones: unknown) => api.create({ headers: H, body: { decisiones }, params: {} });
const d = (over = {}) => ({ idConciliacion: "C1", idPropuesta: "p-c", resultado: "corregida", elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 102 }, ...over });
const P2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

it("el ámbito de la ruta", () => {
  expect(SCOPE_DECIDE).toBe("ab:decidir");
});

describe("POST /v1/decisiones", () => {
  it("AC-29: registra la decisión y responde con su id; guarda la clave del concepto, el par y el tipo", async () => {
    const { api, rows } = setup();
    expect(await post(api, [d()])).toEqual({ status: 200, body: { registradas: ["p-c"], rechazadas: [] } });
    expect(rows.abDecision[0]).toEqual(expect.objectContaining({ tenant_id_: "T1", reconciliationId: "C1", proposalId: "p-c", statementId: "S1", lineId: "c", bankCode: "191", conceptKey: "191||comision", canonicalType: "comision", result: "corrected", proposedKind: "dbg", proposedPair: expect.objectContaining({ accountId: "100" }), chosenKind: "dbg", chosenPair: { movementTypeId: "7", accountId: "102", vatAccountId: null, perceptionAccountId: null } }));
  });
  it("la fila nueva lleva la clave, el autor, la empresa, la fecha y los campos de control", async () => {
    const { api, rows } = setup();
    const before = Date.now();
    await post(api, [d()]);
    const row = rows.abDecision[0];
    expect(row).toEqual(expect.objectContaining({ decisionKey: "C1:c", createdBy_id_: "u1", tenant_id_: "T1" }));
    expect(typeof row.version_).toBe("string");
    expect(row.createdAt_).toBeInstanceOf(Date);
    expect(row.lastUpdatedAt_).toBeInstanceOf(Date);
    expect(row.decidedAt).toBeInstanceOf(Date);
    expect(row.decidedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
  it("lo elegido se guarda con los campos del contrato tal como llegaron, sin lo que sobra", async () => {
    const { api, rows } = setup();
    await post(api, [d({ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: "102", cuentaIva: 300, extra: "x".repeat(10) } }), d({ idPropuesta: "p-m", resultado: "aceptada", elegido: { tipo: "apareo", valores: [5, "6"], extra: 1 } })]);
    expect(rows.abDecision.map((r) => r.chosen)).toStrictEqual([
      { tipo: "dbg", tipoMovimiento: 7, cuenta: "102", cuentaIva: 300, cuentaPercepcion: null },
      { tipo: "apareo", valores: [5, "6"] },
    ]);
    expect(rows.abDecision[0].chosenPair).toStrictEqual({ movementTypeId: "7", accountId: "102", vatAccountId: "300", perceptionAccountId: null });
  });
  it("un apareo o un pendiente elegido no lleva par; un apareo sin valores se registra igual", async () => {
    const { api, rows } = setup();
    await post(api, [d({ idPropuesta: "p-m", resultado: "aceptada", elegido: { tipo: "apareo", tipoMovimiento: 7, cuenta: 102 } }), d({ resultado: "rechazada", elegido: { tipo: "pendiente", cuenta: 102 } })]);
    expect(rows.abDecision.map((r) => [r.proposalId, r.result, r.proposedKind, r.proposedPair, r.chosenKind, r.chosenPair, r.chosen])).toStrictEqual([
      ["p-m", "accepted", "match", null, "match", null, { tipo: "apareo", valores: null }],
      ["p-c", "rejected", "dbg", { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null }, "pending", null, { tipo: "pendiente" }],
    ]);
  });
  it("lo propuesto se guarda con su tipo, sin par: un a-revisar como review (no enseña), un pendiente como pending", async () => {
    const rec = { ...reconciliation(), result: { ...reconciliation().result, proposals: [stored("c", { kind: "review", reason: "x", candidates: [] }), stored("m", { kind: "pending", reason: "x", marks: [] })] } };
    const { api, rows } = setup({ abReconciliation: [rec] });
    await post(api, [d(), d({ idPropuesta: "p-m" })]);
    expect(rows.abDecision.map((r) => [r.lineId, r.proposedKind, r.proposedPair, r.conceptKey, r.canonicalType])).toStrictEqual([
      ["c", "review", null, "191||comision", "comision"],
      ["m", "pending", null, "191||transf", "transferencia-enviada"],
    ]);
  });
  it("una decisión sobre cualquier renglón de un grupo DBG es la del grupo: se guarda con el cargo, y decidir los tres renglones deja una sola fila", async () => {
    const grouped = { kind: "dbg", groupLineIds: ["c", "i"], pair: { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null }, amountCents: -2, vatCents: -1, perceptionCents: 0, groupKey: "k", confidence: "weak", origin: "catalog", marks: [] };
    const rec = { ...reconciliation(), result: { ...reconciliation().result, proposals: [stored("c", grouped), stored("i", grouped)], lines: { c: { conceptKey: "191||comision", canonicalType: "comision" }, i: { conceptKey: "191||iva", canonicalType: "iva" } } } };
    const { api, rows } = setup({ abReconciliation: [rec] });
    expect((await post(api, [d({ idPropuesta: "p-c" }), d({ idPropuesta: "p-i" })])).body).toEqual({ registradas: ["p-c", "p-i"], rechazadas: [] });
    expect(rows.abDecision).toHaveLength(1);
    expect(rows.abDecision[0]).toEqual(expect.objectContaining({ decisionKey: "C1:c", lineId: "c", conceptKey: "191||comision", canonicalType: "comision", proposalId: "p-i" }));
  });
  it("una decisión sobre el IVA del grupo sola también se guarda con el cargo", async () => {
    const grouped = { kind: "dbg", groupLineIds: ["c", "i"], pair: { movementTypeId: "7", accountId: "100", vatAccountId: "9", perceptionAccountId: null }, amountCents: -2, vatCents: -1, perceptionCents: 0, groupKey: "k", confidence: "weak", origin: "catalog", marks: [] };
    const rec = { ...reconciliation(), result: { ...reconciliation().result, proposals: [stored("c", grouped), stored("i", grouped)], lines: { c: { conceptKey: "191||comision", canonicalType: "comision" }, i: { conceptKey: "191||iva", canonicalType: "iva" } } } };
    const { api, rows } = setup({ abReconciliation: [rec] });
    await post(api, [d({ idPropuesta: "p-i" })]);
    expect(rows.abDecision).toEqual([expect.objectContaining({ decisionKey: "C1:c", lineId: "c", conceptKey: "191||comision", proposalId: "p-i" })]);
  });
  it("repetir la decisión la reemplaza: una sola fila, con la última", async () => {
    const { api, rows } = setup();
    await post(api, [d()]);
    await post(api, [d({ resultado: "aceptada", elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 100 } })]);
    expect(rows.abDecision).toHaveLength(1);
    expect(rows.abDecision[0]).toEqual(expect.objectContaining({ result: "accepted", chosenPair: expect.objectContaining({ accountId: "100" }) }));
  });
  it("repetir la decisión reescribe la fecha de la decisión y la versión, y conserva el alta", async () => {
    const { api, rows } = setup();
    await post(api, [d()]);
    const first = { ...rows.abDecision[0] };
    const old = new Date("2026-01-01T00:00:00Z");
    rows.abDecision[0].decidedAt = old;
    rows.abDecision[0].lastUpdatedAt_ = old;
    await post(api, [d({ resultado: "aceptada" })]);
    const row = rows.abDecision[0];
    expect(row.decidedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(row.lastUpdatedAt_.getTime()).toBe(row.decidedAt.getTime());
    expect(row.version_).not.toBe(first.version_);
    expect(row.createdAt_).toBe(first.createdAt_);
    expect(row.createdBy_id_).toBe("u1");
  });
  it("la misma propuesta en otra empresa no reemplaza la decisión de esta", async () => {
    const { api, rows } = setup({ abReconciliation: [reconciliation()], abDecision: [{ id: "x", tenant_id_: "T2", decisionKey: "C1:c", result: "rejected" }] });
    await post(api, [d()]);
    expect(rows.abDecision.map((r) => [r.tenant_id_, r.result])).toEqual([["T2", "rejected"], ["T1", "corrected"]]);
  });
  it("una propuesta de otra empresa se rechaza con motivo y no se guarda; el resto del pedido se registra", async () => {
    const { api, rows } = setup({ abReconciliation: [reconciliation("T2"), { ...reconciliation(), id: "C9" }] });
    const r = await post(api, [d(), d({ idConciliacion: "C9", idPropuesta: "p-m", elegido: { tipo: "apareo", valores: [5] } })]);
    expect(r.body).toEqual({ registradas: ["p-m"], rechazadas: [{ idPropuesta: "p-c", motivo: "No hay una conciliación con ese identificador en esta empresa." }] });
    expect(rows.abDecision.map((x) => x.proposalId)).toEqual(["p-m"]);
  });
  it("una propuesta que no está en la conciliación se rechaza", async () => {
    const { api, rows } = setup();
    expect((await post(api, [d({ idPropuesta: "nope" })])).body).toEqual({ registradas: [], rechazadas: [{ idPropuesta: "nope", motivo: "La propuesta no está en esa conciliación." }] });
    expect(rows.abDecision).toHaveLength(0);
  });
  it("una conciliación anterior a las decisiones (sin los renglones guardados) se rechaza con el motivo", async () => {
    const { lines: _lines, ...old } = reconciliation().result;
    const partial = { ...reconciliation(), id: "C2", result: { ...reconciliation().result, lines: { m: reconciliation().result.lines.m } } };
    const { api, rows } = setup({ abReconciliation: [{ ...reconciliation(), result: old }, partial] });
    const r = await post(api, [d(), d({ idConciliacion: "C2" })]);
    const motivo = "La conciliación es anterior a las decisiones: hay que volver a conciliar.";
    expect(r.body).toEqual({ registradas: [], rechazadas: [{ idPropuesta: "p-c", motivo }, { idPropuesta: "p-c", motivo }] });
    expect(rows.abDecision).toHaveLength(0);
  });
  it("la respuesta sigue el orden del pedido aunque mezcle conciliaciones; cada conciliación se lee una vez", async () => {
    const { api, db } = setup({ abReconciliation: [reconciliation(), { ...reconciliation(), id: "C9" }] });
    const reads: unknown[] = [];
    const findFirst = db.abReconciliation.findFirst;
    db.abReconciliation.findFirst = (async (args: never) => { reads.push(args); return findFirst(args); }) as never;
    const r = await post(api, [d({ idConciliacion: "C9" }), d({ idPropuesta: "nope" }), d({ idConciliacion: "C9", idPropuesta: "p-m" }), d({ idPropuesta: "p-m" }), d({ idConciliacion: "C404" })]);
    expect(r.body).toEqual({
      registradas: ["p-c", "p-m", "p-m"],
      rechazadas: [{ idPropuesta: "nope", motivo: expect.any(String) }, { idPropuesta: "p-c", motivo: expect.any(String) }],
    });
    expect(reads).toEqual([
      { where: { id: "C9", tenant_id_: "T1" }, select: { statementId: true, bankCode: true, result: true } },
      { where: { id: "C1", tenant_id_: "T1" }, select: { statementId: true, bankCode: true, result: true } },
      { where: { id: "C404", tenant_id_: "T1" }, select: { statementId: true, bankCode: true, result: true } },
    ]);
  });
  it("una conciliación sin banco guarda la decisión con el banco vacío", async () => {
    const { bankCode: _b, ...noBank } = reconciliation();
    const { api, rows } = setup({ abReconciliation: [noBank] });
    await post(api, [d()]);
    expect(rows.abDecision[0].bankCode).toBeNull();
  });
  it.each([
    [{ resultado: "si" }, "resultado"], [{ elegido: { tipo: "otro" } }, "elegido.tipo"], [{ elegido: { tipo: "dbg", cuenta: {} } }, "elegido.cuenta"], [{ idConciliacion: "" }, "idConciliacion"],
  ])("un campo mal formado: 400 con %s", async (over, field) => {
    const { api } = setup();
    expect(await post(api, [d(over)])).toEqual({ status: 400, body: expect.objectContaining({ codigo: "DECISION_INVALIDA", campo: field }) });
  });
  it.each([
    [null, "decisiones"], [[], "decisiones"], ["x", "decisiones"],
    [{ resultado: undefined }, "resultado"], [{ resultado: "toString" }, "resultado"], [{ elegido: null }, "elegido"], [{ elegido: [] }, "elegido"], [{ elegido: "dbg" }, "elegido"],
    [{ elegido: { tipo: "constructor" } }, "elegido.tipo"], [{ elegido: {} }, "elegido.tipo"],
    [{ elegido: { tipo: "dbg", cuenta: 102 } }, "elegido.tipoMovimiento"], [{ elegido: { tipo: "dbg", tipoMovimiento: 7 } }, "elegido.cuenta"],
    [{ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: " " } }, "elegido.cuenta"], [{ elegido: { tipo: "dbg", tipoMovimiento: 1.5, cuenta: 1 } }, "elegido.tipoMovimiento"],
    [{ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 1, cuentaIva: false } }, "elegido.cuentaIva"], [{ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 1, cuentaPercepcion: "x".repeat(101) } }, "elegido.cuentaPercepcion"],
    [{ elegido: { tipo: "apareo", valores: 5 } }, "elegido.valores"], [{ elegido: { tipo: "apareo", valores: [{}] } }, "elegido.valores"],
    [{ idConciliacion: undefined }, "idConciliacion"], [{ idPropuesta: 1.5 }, "idPropuesta"], [{ idPropuesta: "x".repeat(101) }, "idPropuesta"],
    [{ resultado: ["aceptada"] }, "resultado"], [{ elegido: { tipo: ["dbg"] } }, "elegido.tipo"], [{ elegido: { tipo: "apareo", valores: [5, {}] } }, "elegido.valores"],
  ])("%j: 400 DECISION_INVALIDA con el campo %s", async (over, field) => {
    const { api } = setup();
    const item = Array.isArray(over) || over === null || typeof over !== "object" ? over : d(over);
    expect(await post(api, [item])).toEqual({ status: 400, body: { codigo: "DECISION_INVALIDA", error: "Una decisión no tiene la forma del contrato.", campo: field } });
  });
  it("un id de hasta 100 caracteres se acepta; las cuentas de IVA y de percepción en null son las que faltan", async () => {
    const long = "x".repeat(100);
    const { api, rows } = setup();
    expect((await post(api, [d({ idPropuesta: long })])).body).toEqual({ registradas: [], rechazadas: [{ idPropuesta: long, motivo: "La propuesta no está en esa conciliación." }] });
    await post(api, [d({ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 102, cuentaIva: null, cuentaPercepcion: null } })]);
    expect(rows.abDecision[0].chosenPair).toStrictEqual({ movementTypeId: "7", accountId: "102", vatAccountId: null, perceptionAccountId: null });
  });
  it("una cuenta de IVA o de percepción vacía es la que falta, como en la conciliación: se registra con null", async () => {
    const { api, rows } = setup();
    expect((await post(api, [d({ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 102, cuentaIva: "", cuentaPercepcion: "" } })])).body).toEqual({ registradas: ["p-c"], rechazadas: [] });
    expect(rows.abDecision[0].chosenPair).toStrictEqual({ movementTypeId: "7", accountId: "102", vatAccountId: null, perceptionAccountId: null });
    expect(rows.abDecision[0].chosen).toStrictEqual({ tipo: "dbg", tipoMovimiento: 7, cuenta: 102, cuentaIva: null, cuentaPercepcion: null });
  });
  it("una cuenta de IVA de solo espacios no es una vacía: corta el pedido como cualquier id mal formado", async () => {
    const { api } = setup();
    expect((await post(api, [d({ elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 102, cuentaIva: " " } })])).body).toEqual(expect.objectContaining({ campo: "elegido.cuentaIva" }));
  });
  it("un error que no es de la forma no sale como 400: sigue", async () => {
    const { api } = setup();
    const e = new Error("getter");
    const item = Object.defineProperty(d(), "resultado", { get: () => { throw e; } });
    await expect(post(api, [item])).rejects.toBe(e);
  });
  it("una decisión mal formada corta el pedido entero: no se guarda ninguna", async () => {
    const { api, rows } = setup();
    expect((await post(api, [d(), d({ resultado: "si" })])).status).toBe(400);
    expect(rows.abDecision).toHaveLength(0);
  });
  it("los ids se recortan como en la conciliación", async () => {
    const { api, rows } = setup();
    expect((await post(api, [d({ idConciliacion: " C1 ", idPropuesta: "p-c " })])).body).toEqual({ registradas: ["p-c"], rechazadas: [] });
    expect(rows.abDecision[0].reconciliationId).toBe("C1");
  });
  it.each([
    [undefined], [null], [[]], [{}], [{ decisiones: "x" }], [{ decisiones: {} }],
  ])("un cuerpo sin la lista decisiones (%j): 400", async (body) => {
    const { api } = setup();
    expect(await api.create({ headers: H, body, params: {} })).toEqual({ status: 400, body: { codigo: "DECISION_INVALIDA", error: "El pedido lleva una lista decisiones, de hasta 1.500.", campo: "decisiones" } });
  });
  it("más de 1.500 decisiones: 400; 1.500 se aceptan", async () => {
    const { api, rows } = setup();
    expect(await post(api, Array.from({ length: 1501 }, () => d()))).toEqual({ status: 400, body: expect.objectContaining({ codigo: "DECISION_INVALIDA", campo: "decisiones" }) });
    expect(rows.abDecision).toHaveLength(0);
    expect((await post(api, Array.from({ length: 1500 }, () => d()))).status).toBe(200);
  });
  it("un apareo elegido con más valores que el tope de la conciliación se rechaza con motivo; el resto se registra", async () => {
    const { api, rows } = setup();
    const many = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    const r = await post(api, [d({ idPropuesta: "p-m", elegido: { tipo: "apareo", valores: many(LIMITS.values + 1) } }), d()]);
    expect(r).toEqual({ status: 200, body: { registradas: ["p-c"], rechazadas: [{ idPropuesta: "p-m", motivo: "Lo elegido lleva más de 20.000 valores." }] } });
    expect(rows.abDecision.map((x) => x.proposalId)).toEqual(["p-c"]);
    expect((await post(api, [d({ idPropuesta: "p-m", elegido: { tipo: "apareo", valores: many(LIMITS.values) } })])).body).toEqual({ registradas: ["p-m"], rechazadas: [] });
  });
  it("más de 50 conciliaciones distintas en un pedido: 400 sin leer ninguna; 50 se aceptan", async () => {
    const recs = Array.from({ length: 51 }, (_, i) => ({ ...reconciliation(), id: `C${i}` }));
    const { api, wheres } = setup({ abReconciliation: recs });
    const over = recs.map((x) => d({ idConciliacion: x.id }));
    expect(await post(api, over)).toEqual({ status: 400, body: { codigo: "DECISION_INVALIDA", error: "Un pedido lleva decisiones de hasta 50 conciliaciones.", campo: "idConciliacion" } });
    expect(wheres).toHaveLength(0);
    const fifty = [...over.slice(0, 50), d({ idConciliacion: "C0", idPropuesta: "p-m" })];
    expect((await post(api, fifty)).status).toBe(200);
  });
  it("una lista vacía responde sin registrar nada", async () => {
    const { api } = setup();
    expect(await post(api, [])).toEqual({ status: 200, body: { registradas: [], rechazadas: [] } });
  });
  it("sin ámbito, sin empresa o sin usuario de servicio: 403; todo where lleva la empresa", async () => {
    const noScope: Authorize = async () => ({ ok: false, reason: "no-scope", message: "x" });
    expect((await post(setup(undefined, noScope).api, [d()])).status).toBe(403);
    expect((await post(setup(undefined, allow(null)).api, [d()])).status).toBe(403);
    expect((await post(setup(undefined, allow("T1", null)).api, [d()])).body).toEqual(expect.objectContaining({ codigo: "SIN_USUARIO_DE_SERVICIO" }));
    const { api, wheres } = setup();
    await post(api, [d()]);
    await post(api, [d()]);
    expect(wheres.length).toBeGreaterThanOrEqual(4);
    expect(wheres.every((w) => w.tenant_id_ === "T1")).toBe(true);
  });
  it("pide el ámbito ab:decidir con el token del pedido; un token inválido es 401", async () => {
    const asked: unknown[] = [];
    const deny: Authorize = async (token, scope) => { asked.push([token, scope]); return { ok: false, reason: "unauthorized", message: "x" }; };
    const { api, rows } = setup(undefined, deny);
    expect((await post(api, [d()])).status).toBe(401);
    expect(asked).toEqual([["t", "ab:decidir"]]);
    expect(rows.abDecision).toHaveLength(0);
  });
  it("dos pedidos simultáneos con la misma decisión: si el alta choca con la restricción, se reemplaza la que ganó", async () => {
    const { api, db, rows } = setup({ abReconciliation: [reconciliation()], abDecision: [{ id: "w", tenant_id_: "T1", decisionKey: "C1:c", result: "rejected" }] });
    const updateMany = db.abDecision.updateMany;
    let calls = 0;
    // La primera vez la otra todavía no estaba: el update no encuentra nada y el alta choca.
    db.abDecision.updateMany = (async (args: never) => (++calls === 1 ? { count: 0 } : updateMany(args))) as never;
    expect((await post(api, [d()])).body).toEqual({ registradas: ["p-c"], rechazadas: [] });
    expect(calls).toBe(2);
    expect(rows.abDecision).toEqual([expect.objectContaining({ id: "w", result: "corrected", proposalId: "p-c" })]);
  });
  it("un error del alta que no es de la restricción sigue aunque la fila ya exista", async () => {
    const { api, db, rows } = setup({ abReconciliation: [reconciliation()], abDecision: [{ id: "w", tenant_id_: "T1", decisionKey: "C1:c", result: "rejected" }] });
    const updateMany = db.abDecision.updateMany;
    let calls = 0;
    db.abDecision.updateMany = (async (args: never) => (++calls === 1 ? { count: 0 } : updateMany(args))) as never;
    const other = new Error("db");
    db.abDecision.create = (async () => { throw other; }) as never;
    await expect(post(api, [d()])).rejects.toBe(other);
    expect(calls).toBe(1);
    expect(rows.abDecision[0].result).toBe("rejected");
  });
  it("si el alta choca y la otra no aparece, el error sigue; un error que no es de la restricción también", async () => {
    const { api, db } = setup();
    const e = P2002();
    db.abDecision.create = (async () => { throw e; }) as never;
    await expect(post(api, [d()])).rejects.toBe(e);
    const other = new Error("db");
    db.abDecision.create = (async () => { throw other; }) as never;
    await expect(post(api, [d()])).rejects.toBe(other);
    db.abDecision.create = (async () => { throw null; }) as never;
    await expect(post(api, [d()])).rejects.toBeNull();
  });
});
