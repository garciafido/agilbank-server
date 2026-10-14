import { correctionsApi, parseCorrection } from "../../src/api/corrections";
import { fakeDb } from "./fakeDb";

const VALID = { banco: "191", codigoDelBanco: "IVAA1", textoDelBanco: "IVA-Ali Adic RG 2408 s/Comis", tipo: "percepcion-iva" };

describe("parseCorrection", () => {
  it("traduce las claves del contrato", () => {
    expect(parseCorrection({ ...VALID, alicuota: 3 })).toEqual({ ok: true, value: {
      bankCode: "191", operationCode: "IVAA1", bankText: "IVA-Ali Adic RG 2408 s/Comis", canonicalType: "percepcion-iva", rate: 3,
    } });
  });
  it("banco, código y alícuota pueden faltar o ir en null", () => {
    expect(parseCorrection({ textoDelBanco: "COMISION", tipo: "comision", banco: null, codigoDelBanco: null, alicuota: null })).toEqual({
      ok: true, value: { bankCode: null, operationCode: null, bankText: "COMISION", canonicalType: "comision", rate: null },
    });
  });
  it("sin banco ni código del banco (ausentes, no null): quedan en null", () => {
    expect(parseCorrection({ textoDelBanco: "COMISION", tipo: "comision" })).toEqual({
      ok: true, value: { bankCode: null, operationCode: null, bankText: "COMISION", canonicalType: "comision", rate: null },
    });
  });
  it("banco y código del banco tienen que ser texto: una lista con texto no vale", () => {
    expect(parseCorrection({ ...VALID, banco: ["191"] })).toEqual({ ok: false, field: "banco" });
    expect(parseCorrection({ ...VALID, codigoDelBanco: ["IVAA1"] })).toEqual({ ok: false, field: "codigoDelBanco" });
  });
  it("un cuerpo que no es objeto: campo null", () => {
    for (const body of [undefined, null, "x", [VALID]]) expect(parseCorrection(body)).toEqual({ ok: false, field: null });
  });
  it.each([
    ["textoDelBanco", undefined], ["textoDelBanco", "   "], ["textoDelBanco", 3], ["textoDelBanco", "x".repeat(501)],
    ["tipo", "no-existe"], ["tipo", undefined],
    ["banco", 191], ["banco", "x".repeat(11)], ["codigoDelBanco", 5], ["codigoDelBanco", "x".repeat(51)],
    ["alicuota", -1], ["alicuota", 100.01], ["alicuota", "3"], ["alicuota", Number.NaN],
  ])("%s inválido: devuelve el campo", (field, value) => {
    expect(parseCorrection({ ...VALID, [field]: value })).toEqual({ ok: false, field });
  });
  it("los bordes se aceptan: alícuota 0 y 100, textos de 500, 10 y 50", () => {
    expect(parseCorrection({ ...VALID, alicuota: 0 }).ok).toBe(true);
    expect(parseCorrection({ ...VALID, alicuota: 100 }).ok).toBe(true);
    expect(parseCorrection({ ...VALID, textoDelBanco: "x".repeat(500), codigoDelBanco: "x".repeat(50) }).ok).toBe(true);
  });
});

describe("parseCorrection: el banco son los tres dígitos del código de entidad", () => {
  const value = (over: Record<string, unknown>) => {
    const r = parseCorrection({ ...VALID, ...over });
    return r.ok ? [r.value.bankCode, r.value.operationCode] : r.field;
  };

  it("tres dígitos, con o sin espacios en los extremos", () => {
    expect(value({ banco: "007" })).toEqual(["007", "IVAA1"]);
    expect(value({ banco: " 191 " })).toEqual(["191", "IVAA1"]);
  });
  it.each(["", "   "])("vacío (%j) es null: vale para cualquier banco", (banco) => {
    expect(value({ banco })).toEqual([null, "IVAA1"]);
  });
  it.each(["7", "19", "1910", "Galicia", "19a", "1 9", "１９１", "x".repeat(11)])("%j no es un código de entidad: campo banco", (banco) => {
    expect(value({ banco })).toBe("banco");
  });
  it("el código del banco se recorta, y vacío es null", () => {
    expect(value({ codigoDelBanco: "  IVAA1 " })).toEqual(["191", "IVAA1"]);
    expect(value({ codigoDelBanco: "" })).toEqual(["191", null]);
    expect(value({ codigoDelBanco: "   " })).toEqual(["191", null]);
  });
  it("el tope de 50 del código del banco se mide sin los espacios de los extremos", () => {
    expect(value({ codigoDelBanco: ` ${"x".repeat(50)} ` })).toEqual(["191", "x".repeat(50)]);
    expect(value({ codigoDelBanco: ` ${"x".repeat(51)} ` })).toBe("codigoDelBanco");
  });
});

describe("create", () => {
  const req = (body: unknown) => ({ headers: { authorization: "Bearer t" }, body, params: {} });
  const allow = async () => ({ ok: true as const, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: "u1" } });

  it("crea la corrección pendiente en la empresa y responde 201", async () => {
    const b = fakeDb();
    const scopes: string[] = [];
    const api = correctionsApi({ db: b.db, authorize: async (_t, s) => { scopes.push(s); return allow(); } });
    const r = await api.create(req(VALID));
    const row = b.rows.abConceptCorrection[0];
    expect(r).toEqual({ status: 201, body: { idCorreccion: row.id, vigente: "empresa", revision: "pendiente" } });
    expect(scopes).toEqual(["ab:corregir"]);
    expect(row).toMatchObject({ tenant_id_: "T1", createdBy_id_: "u1", bankCode: "191", operationCode: "IVAA1", bankText: VALID.textoDelBanco, canonicalType: "percepcion-iva", rate: null, review: "pending" });
  });
  it("una corrección inválida: 400 CORRECCION_INVALIDA con el campo, sin crear nada", async () => {
    const b = fakeDb();
    const r = await correctionsApi({ db: b.db, authorize: allow }).create(req({ ...VALID, tipo: "x" }));
    expect(r).toEqual({ status: 400, body: { codigo: "CORRECCION_INVALIDA", error: "La corrección no tiene la forma del contrato.", campo: "tipo" } });
    expect(b.rows.abConceptCorrection).toEqual([]);
  });
  it("un banco con el nombre en lugar del código: 400 con campo banco, sin crear nada", async () => {
    const b = fakeDb();
    const r = await correctionsApi({ db: b.db, authorize: allow }).create(req({ ...VALID, banco: "Galicia" }));
    expect(r).toEqual({ status: 400, body: { codigo: "CORRECCION_INVALIDA", error: "La corrección no tiene la forma del contrato.", campo: "banco" } });
    expect(b.rows.abConceptCorrection).toEqual([]);
  });
  it("banco y código del banco vacíos se guardan en null", async () => {
    const b = fakeDb();
    expect((await correctionsApi({ db: b.db, authorize: allow }).create(req({ ...VALID, banco: "", codigoDelBanco: " " }))).status).toBe(201);
    expect(b.rows.abConceptCorrection[0]).toMatchObject({ bankCode: null, operationCode: null });
  });
  it("sin usuario de servicio: 403", async () => {
    const r = await correctionsApi({ db: fakeDb().db, authorize: async () => ({ ok: true, client: { id: "c", name: "n", tenantId: "T1", serviceUserId: null } }) }).create(req(VALID));
    expect(r.status).toBe(403);
  });
});
