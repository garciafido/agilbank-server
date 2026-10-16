import { parseReconcileRequest } from "../../src/reconcile/request";

const ok = (body: unknown) => { const r = parseReconcileRequest(body); if (!r.ok) throw new Error(`esperaba ok, falló ${r.field}`); return r.context; };

describe("el pedido con catálogos e historia", () => {
  it("lleva los catálogos a ids en texto y el coeficiente a 1 o -1", () => {
    const c = ok({ valores: [], tiposGastoBancario: [{ id: 7, descripcion: "Débito Bancario Gtos", abreviatura: "DBG", coeficiente: 1 }, { id: 8, descripcion: "Crédito Bancario", coeficiente: -1 }],
      cuentasImputables: [{ id: 100, codigo: 9900102, descripcion: "COMISIONES DEL BANCO" }], cuentasIvaYPercepciones: [{ id: 200, codigo: "9900201", descripcion: "IVA CREDITO COMPRAS" }] });
    expect(c.catalogs).toEqual({
      movementTypes: [{ id: "7", description: "Débito Bancario Gtos", coefficient: 1 }, { id: "8", description: "Crédito Bancario", coefficient: -1 }],
      accounts: [{ id: "100", code: "9900102", description: "COMISIONES DEL BANCO" }],
      taxAccounts: [{ id: "200", code: "9900201", description: "IVA CREDITO COMPRAS" }],
    });
  });
  it("sin ninguno de los tres catálogos, catalogs es null; con uno solo, los otros van vacíos", () => {
    expect(ok({ valores: [] }).catalogs).toBeNull();
    expect(ok({ valores: [], cuentasImputables: [] }).catalogs).toEqual({ movementTypes: [], accounts: [], taxAccounts: [] });
  });
  it("la historia: centavos sin signo, coeficiente, código de cuenta como texto", () => {
    const c = ok({ valores: [], historiaDbg: [{ idValor: 9, fecha: "2026-05-31", tipoGasto: "Débito Bancario Gtos", coeficiente: 1, importe: 1210.5, iva: 210, percepcionIva: 0, cuentaContableCodigo: 9900102, cuentaContable: "COMISIONES DEL BANCO", detalle: "GASTOS 05-2026" }] });
    expect(c.history).toEqual([{ id: "9", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1, amountCents: 121050, vatCents: 21000, perceptionCents: 0, accountCode: "9900102", accountName: "COMISIONES DEL BANCO", detail: "GASTOS 05-2026" }]);
  });
  it("sin historia, la lista va vacía; un DBG sin cuenta lleva accountCode null", () => {
    expect(ok({ valores: [] }).history).toEqual([]);
    expect(ok({ valores: [], historiaDbg: [{ idValor: 1, fecha: "2026-01-01", tipoGasto: "X", coeficiente: 1, importe: 1 }] }).history[0]).toEqual(expect.objectContaining({ accountCode: null, accountName: "", vatCents: 0, perceptionCents: 0, detail: null }));
  });
  it.each([
    [{ tiposGastoBancario: [{ id: 1, descripcion: "x", coeficiente: 2 }] }, "tiposGastoBancario"],
    [{ cuentasImputables: [{ id: 1, descripcion: "x" }] }, "cuentasImputables"],
    [{ cuentasIvaYPercepciones: "x" }, "cuentasIvaYPercepciones"],
    [{ historiaDbg: [{ idValor: 1, fecha: "31/05/2026", tipoGasto: "x", coeficiente: 1, importe: 1 }] }, "historiaDbg"],
    [{ historiaDbg: [{ idValor: 1, fecha: "2026-05-31", tipoGasto: "x", coeficiente: 1, importe: -1 }] }, "historiaDbg"],
    [{ cuentasImputables: null }, "cuentasImputables"],
  ])("%j → inválido en %s", (extra, field) => {
    expect(parseReconcileRequest({ valores: [], ...extra })).toEqual(expect.objectContaining({ ok: false, field }));
  });
  it("los topes: 5.000 DBG de historia, 10.000 cuentas entre los dos catálogos, 100 tipos", () => {
    const h = Array.from({ length: 5001 }, (_, i) => ({ idValor: i, fecha: "2026-01-01", tipoGasto: "x", coeficiente: 1, importe: 1 }));
    expect(parseReconcileRequest({ valores: [], historiaDbg: h })).toEqual({ ok: false, field: "historiaDbg" });
    const a = Array.from({ length: 6000 }, (_, i) => ({ id: i, codigo: String(i), descripcion: "c" }));
    expect(parseReconcileRequest({ valores: [], cuentasImputables: a, cuentasIvaYPercepciones: a })).toEqual({ ok: false, field: "cuentasIvaYPercepciones" });
    expect(parseReconcileRequest({ valores: [], tiposGastoBancario: Array.from({ length: 101 }, (_, i) => ({ id: i, descripcion: "t", coeficiente: 1 })) })).toEqual({ ok: false, field: "tiposGastoBancario" });
  });
});

describe("el pedido con catálogos e historia: fronteras", () => {
  const bad = (extra: object) => parseReconcileRequest({ valores: [], ...extra });
  const dbg = (over: object = {}) => ({ idValor: 5, fecha: "2026-05-31", tipoGasto: "x", coeficiente: 1, importe: 1, ...over });

  it("un elemento que no es objeto es inválido en su propio campo", () => {
    expect(bad({ tiposGastoBancario: [1] })).toEqual({ ok: false, field: "tiposGastoBancario" });
    expect(bad({ cuentasImputables: ["x"] })).toEqual({ ok: false, field: "cuentasImputables" });
    expect(bad({ cuentasIvaYPercepciones: [null] })).toEqual({ ok: false, field: "cuentasIvaYPercepciones" });
    expect(bad({ historiaDbg: [[]] })).toEqual({ ok: false, field: "historiaDbg" });
  });
  it("el campo de cada catálogo es el que se informa, también con el id o el código mal", () => {
    expect(bad({ tiposGastoBancario: [{ id: "", coeficiente: 1 }] })).toEqual({ ok: false, field: "tiposGastoBancario" });
    expect(bad({ cuentasImputables: [{ id: 1, codigo: "" }] })).toEqual({ ok: false, field: "cuentasImputables" });
    expect(bad({ cuentasImputables: [{ id: 1, codigo: null }] })).toEqual({ ok: false, field: "cuentasImputables" });
    expect(bad({ cuentasIvaYPercepciones: [{ id: 1 }] })).toEqual({ ok: false, field: "cuentasIvaYPercepciones" });
    expect(bad({ cuentasIvaYPercepciones: [{ codigo: "1" }] })).toEqual({ ok: false, field: "cuentasIvaYPercepciones" });
    expect(bad({ tiposGastoBancario: null })).toEqual({ ok: false, field: "tiposGastoBancario" });
    expect(bad({ historiaDbg: null })).toEqual({ ok: false, field: "historiaDbg" });
  });
  it("sin descripción, el catálogo lleva texto vacío", () => {
    const c = ok({ valores: [], tiposGastoBancario: [{ id: 1, coeficiente: -1 }], cuentasImputables: [{ id: 2, codigo: "5" }], cuentasIvaYPercepciones: [{ id: 3, codigo: "6" }] });
    expect(c.catalogs).toEqual({ movementTypes: [{ id: "1", description: "", coefficient: -1 }], accounts: [{ id: "2", code: "5", description: "" }], taxAccounts: [{ id: "3", code: "6", description: "" }] });
  });
  it("un error en la historia nombra el valor de origen", () => {
    expect(bad({ historiaDbg: [dbg({ fecha: "2026-13-01" })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ fecha: undefined })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ iva: -1 })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ percepcionIva: -0.01 })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ importe: 1.005 })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ iva: "x" })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ percepcionIva: "x" })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
    expect(bad({ historiaDbg: [dbg({ coeficiente: 0 })] })).toEqual({ ok: false, field: "historiaDbg" });
    expect(bad({ historiaDbg: [dbg({ idValor: "" })] })).toEqual({ ok: false, field: "historiaDbg", valueId: "" });
    expect(bad({ historiaDbg: [dbg({ cuentaContableCodigo: "" })] })).toEqual({ ok: false, field: "historiaDbg", valueId: 5 });
  });
  it("un importe cero es válido y el nulo de cada importe vale cero", () => {
    const h = ok({ valores: [], historiaDbg: [dbg({ importe: 0, iva: null, percepcionIva: null, cuentaContableCodigo: null })] }).history[0];
    expect(h).toEqual(expect.objectContaining({ amountCents: 0, vatCents: 0, perceptionCents: 0, accountCode: null }));
  });
  it("el coeficiente -1 de la historia se conserva", () => {
    expect(ok({ valores: [], historiaDbg: [dbg({ coeficiente: -1 })] }).history[0].coefficient).toBe(-1);
  });
  it("los topes son inclusivos: 5.000 de historia, 100 tipos y 10.000 cuentas entran", () => {
    expect(ok({ valores: [], historiaDbg: Array.from({ length: 5000 }, (_, i) => dbg({ idValor: i })) }).history).toHaveLength(5000);
    expect(ok({ valores: [], tiposGastoBancario: Array.from({ length: 100 }, (_, i) => ({ id: i, coeficiente: 1 })) }).catalogs?.movementTypes).toHaveLength(100);
    const acc = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, codigo: String(i) }));
    expect(ok({ valores: [], cuentasImputables: acc(10000) }).catalogs?.accounts).toHaveLength(10000);
    expect(ok({ valores: [], cuentasImputables: acc(5000), cuentasIvaYPercepciones: acc(5000) }).catalogs?.taxAccounts).toHaveLength(5000);
  });
  it("10.001 cuentas imputables solas exceden el tope en cuentasImputables; entre los dos, en cuentasIvaYPercepciones", () => {
    const acc = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, codigo: String(i) }));
    expect(bad({ cuentasImputables: acc(10001) })).toEqual({ ok: false, field: "cuentasImputables" });
    expect(bad({ cuentasImputables: acc(10000), cuentasIvaYPercepciones: acc(1) })).toEqual({ ok: false, field: "cuentasIvaYPercepciones" });
    expect(bad({ cuentasImputables: [{ id: 1 }], cuentasIvaYPercepciones: acc(10001) })).toEqual({ ok: false, field: "cuentasImputables" });
  });
});
