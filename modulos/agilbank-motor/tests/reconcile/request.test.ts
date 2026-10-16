import { parseReconcileRequest } from "../../src/reconcile/request";
import { LIMITS } from "../../src/reconcile/types";

const value = (over: Record<string, unknown> = {}) => ({ idValor: 101, tipo: "Cheque", numero: 4512, importe: -1500.25, fechaComprobante: "2026-07-01", ...over });
const ok = (body: unknown) => {
  const r = parseReconcileRequest(body);
  if (!r.ok) throw new Error(`esperaba ok, falló ${r.field}`);
  return r;
};

describe("parseReconcileRequest", () => {
  it("lleva el pedido en castellano al contexto: centavos, número en dígitos, ids como texto", () => {
    const r = ok({ valores: [value({ esEcheq: true, fechaValor: "2026-07-03", idDepositoBancario: 9, loteEnvioBanco: 3, cuitLibrador: "30-11111111-8", idProveedor: 7, tipoOrdenPago: "CC" })] });
    expect(r.context.values[0]).toEqual({
      id: "101", kind: "Cheque", isEcheq: true, number: "4512", amountCents: -150025, voucherDate: "2026-07-01", valueDate: "2026-07-03",
      depositDate: null, depositId: "9", batchId: "3", drawerCuit: "30111111118", supplierId: "7", customerId: null, paymentOrderType: "CC",
    });
    expect(r.originalIds.get("101")).toBe(101);
    expect(r.context.lineIds).toBeNull();
  });
  it("los renglones pedidos, las contrapartes, las cuentas propias y los lotes", () => {
    const r = ok({
      renglones: ["a", "b"], valores: [],
      contrapartes: { proveedores: [{ id: 7, razonSocial: "X", cuit: "20-22222222-3", cbu: "0110000000000000000001" }], clientes: [{ id: 8, cuit: null }] },
      cuentasPropias: [{ id: 2, banco: "B", numero: "12/3", cbu: "1910000000000000000002" }], lotes: ["L1"],
    });
    expect(r.context.lineIds).toEqual(["a", "b"]);
    expect(r.context.parties).toEqual([
      { id: "7", role: "supplier", cuit: "20222222223", cbu: "0110000000000000000001" },
      { id: "8", role: "customer", cuit: null, cbu: null },
    ]);
    expect(r.context.ownAccounts).toEqual([{ id: "2", cbu: "1910000000000000000002", number: "12/3" }]);
    expect(r.context.batchIds).toEqual(["L1"]);
  });
  it("el número sin ceros a la izquierda, y un número que no tiene dígitos es null", () => {
    expect(ok({ valores: [value({ numero: "000820519" })] }).context.values[0].number).toBe("820519");
    expect(ok({ valores: [value({ numero: "s/n" })] }).context.values[0].number).toBeNull();
  });
  it.each([
    [{ importe: 1.005 }, "importe"], [{ importe: NaN }, "importe"], [{ importe: "10" }, "importe"], [{ importe: 1e14 }, "importe"],
    [{ fechaComprobante: "01/07/2026" }, "fechaComprobante"], [{ fechaValor: "2026-02-30" }, "fechaValor"], [{ idValor: null }, "idValor"],
  ])("un importe con tres decimales es inválido, y lo mismo cualquier campo mal formado: %j → %s", (over, field) => {
    const r = parseReconcileRequest({ valores: [value(over)] });
    expect(r).toEqual(expect.objectContaining({ ok: false, field }));
  });
  it("dice el idValor del valor inválido", () => {
    expect(parseReconcileRequest({ valores: [value(), value({ idValor: 102, importe: "x" })] })).toEqual({ ok: false, field: "importe", valueId: 102 });
  });
  it("un idValor repetido es inválido: un apareo no sabría a cuál apunta", () => {
    expect(parseReconcileRequest({ valores: [value(), value()] })).toEqual({ ok: false, field: "idValor", valueId: 101 });
  });
  it.each([[null], [[]], ["x"], [{ valores: "x" }], [{ renglones: "a", valores: [] }], [{ renglones: [1], valores: [] }]])("un cuerpo sin la forma del contrato: %j", (body) => {
    expect(parseReconcileRequest(body).ok).toBe(false);
  });
  it("los topes: más de 1.500 renglones o 20.000 valores", () => {
    expect(parseReconcileRequest({ renglones: Array.from({ length: 1501 }, (_, i) => `r${i}`), valores: [] })).toEqual({ ok: false, field: "renglones" });
    expect(parseReconcileRequest({ valores: Array.from({ length: 20001 }, (_, i) => value({ idValor: i })) })).toEqual({ ok: false, field: "valores" });
  });

  describe("fronteras de cada campo", () => {
    const fail = (body: unknown) => parseReconcileRequest(body);
    const first = (over: Record<string, unknown>) => ok({ valores: [value(over)] }).context.values[0];

    it("el idValor: entero seguro o texto no vacío de hasta 100 caracteres, sin espacios de borde", () => {
      expect(fail({ valores: [value({ idValor: 1.5 })] })).toStrictEqual({ ok: false, field: "idValor", valueId: 1.5 });
      expect(fail({ valores: [value({ idValor: true })] })).toStrictEqual({ ok: false, field: "idValor", valueId: true });
      expect(fail({ valores: [value({ idValor: 2 ** 53 })] })).toStrictEqual({ ok: false, field: "idValor", valueId: 2 ** 53 });
      expect(fail({ valores: [value({ idValor: "   " })] })).toStrictEqual({ ok: false, field: "idValor", valueId: "   " });
      expect(fail({ valores: [value({ idValor: "x".repeat(101) })] }).ok).toBe(false);
      expect(first({ idValor: "x".repeat(100) }).id).toBe("x".repeat(100));
      const r = ok({ valores: [value({ idValor: " v-7 " })] });
      expect(r.context.values[0].id).toBe("v-7");
      expect(r.originalIds.get("v-7")).toBe(" v-7 ");
    });
    it("un idValor ausente no lleva valueId", () => {
      expect(fail({ valores: [value({ idValor: undefined })] })).toStrictEqual({ ok: false, field: "idValor" });
    });
    it("un elemento de valores que no es objeto es inválido", () => {
      expect(fail({ valores: [5] })).toStrictEqual({ ok: false, field: "valores" });
      expect(fail({ valores: [null] })).toStrictEqual({ ok: false, field: "valores" });
    });
    it.each(["idDepositoBancario", "loteEnvioBanco", "idProveedor", "idCliente"])("%s: vacío es null y mal formado es inválido con el idValor", (field) => {
      const key = { idDepositoBancario: "depositId", loteEnvioBanco: "batchId", idProveedor: "supplierId", idCliente: "customerId" }[field] as "depositId";
      expect(first({ [field]: null })[key]).toBeNull();
      expect(first({ [field]: "" })[key]).toBeNull();
      expect(first({ [field]: " 12 " })[key]).toBe("12");
      expect(fail({ valores: [value({ [field]: 1.5 })] })).toStrictEqual({ ok: false, field, valueId: 101 });
    });
    it.each(["fechaComprobante", "fechaValor", "fechaDeposito"])("%s: vacío es null y una fecha mal formada es inválida con el idValor", (field) => {
      const key = { fechaComprobante: "voucherDate", fechaValor: "valueDate", fechaDeposito: "depositDate" }[field] as "voucherDate";
      expect(first({ [field]: "" })[key]).toBeNull();
      expect(first({ [field]: null })[key]).toBeNull();
      expect(first({ [field]: "2024-02-29" })[key]).toBe("2024-02-29");
      expect(fail({ valores: [value({ [field]: "2026-13-01" })] })).toStrictEqual({ ok: false, field, valueId: 101 });
      expect(fail({ valores: [value({ [field]: "2026-00-10" })] })).toStrictEqual({ ok: false, field, valueId: 101 });
      expect(fail({ valores: [value({ [field]: "2026-04-31" })] })).toStrictEqual({ ok: false, field, valueId: 101 });
      expect(fail({ valores: [value({ [field]: "2026-02-29" })] })).toStrictEqual({ ok: false, field, valueId: 101 });
    });
    it("una fecha es el texto completo AAAA-MM-DD y nada más", () => {
      for (const bad of ["x2026-07-01", "2026-07-01x", "2026-07-01\n", 20260701, { toString: () => "2026-07-01" }]) {
        expect(fail({ valores: [value({ fechaValor: bad })] })).toStrictEqual({ ok: false, field: "fechaValor", valueId: 101 });
      }
    });
    it("el importe: tope exclusivo en 1e13 y la tolerancia de un centavo no redondea", () => {
      expect(first({ importe: 9999999999999.99 }).amountCents).toBe(999999999999999);
      expect(fail({ valores: [value({ importe: 1e13 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
      expect(fail({ valores: [value({ importe: -1e13 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
      expect(fail({ valores: [value({ importe: Infinity })] }).ok).toBe(false);
      expect(first({ importe: 0.1 + 0.2 }).amountCents).toBe(30);
      expect(first({ importe: 1.15 }).amountCents).toBe(115);
      expect(first({ importe: 0 }).amountCents).toBe(0);
    });
    it("importes grandes de dos decimales se aceptan, y un tercer decimal se rechaza a cualquier escala", () => {
      expect(first({ importe: 1234567890.12 }).amountCents).toBe(123456789012);
      expect(first({ importe: 500000000.01 }).amountCents).toBe(50000000001);
      expect(first({ importe: -98765432109.87 }).amountCents).toBe(-9876543210987);
      expect(first({ importe: 9999999999999.99 }).amountCents).toBe(999999999999999);
      expect(fail({ valores: [value({ importe: 1234567890.125 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
      expect(fail({ valores: [value({ importe: 500000000.015 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
      expect(fail({ valores: [value({ importe: 99999999999.995 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
      expect(fail({ valores: [value({ importe: -1234567890.121 })] })).toStrictEqual({ ok: false, field: "importe", valueId: 101 });
    });
    it("de dos decimales con redondeo de representación, ningún importe válido del rango se rechaza", () => {
      let seed = 12345;
      const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
      for (let i = 0; i < 20000; i++) {
        const c = (next() * 2147483648 + next()) % 1e15;
        const pesos = Number((c / 100).toFixed(2));
        expect(first({ importe: pesos }).amountCents).toBe(c);
      }
    });
    it("el número conserva los ceros que no son de la izquierda y se vacía si todo son ceros", () => {
      expect(first({ numero: "0040" }).number).toBe("40");
      expect(first({ numero: "4012" }).number).toBe("4012");
      expect(first({ numero: "000" }).number).toBeNull();
      expect(first({ numero: 0 }).number).toBeNull();
      expect(first({ numero: undefined }).number).toBeNull();
      expect(first({ numero: null }).number).toBeNull();
      expect(first({ numero: "" }).number).toBeNull();
    });
    it("el CUIT del librador solo pierde lo que no es dígito, nunca los ceros", () => {
      expect(first({ cuitLibrador: "0-11" }).drawerCuit).toBe("011");
      expect(first({ cuitLibrador: "s/n" }).drawerCuit).toBeNull();
      expect(first({ cuitLibrador: "" }).drawerCuit).toBeNull();
      expect(first({ cuitLibrador: null }).drawerCuit).toBeNull();
      expect(first({}).drawerCuit).toBeNull();
    });
    it("tipo y tipoOrdenPago: texto recortado; lo que no es texto no vacío es '' y null", () => {
      expect(first({ tipo: "  Cheque " }).kind).toBe("Cheque");
      expect(first({ tipo: "   " }).kind).toBe("");
      expect(first({ tipo: 5 }).kind).toBe("");
      expect(first({ tipo: undefined }).kind).toBe("");
      expect(first({ tipoOrdenPago: " CC " }).paymentOrderType).toBe("CC");
      expect(first({ tipoOrdenPago: "  " }).paymentOrderType).toBeNull();
      expect(first({ tipoOrdenPago: 3 }).paymentOrderType).toBeNull();
    });
    it("esEcheq solo es verdadero con el booleano true", () => {
      expect(first({}).isEcheq).toBe(false);
      expect(first({ esEcheq: "true" }).isEcheq).toBe(false);
      expect(first({ esEcheq: 1 }).isEcheq).toBe(false);
      expect(first({ esEcheq: true }).isEcheq).toBe(true);
    });
    it("sin valores ni contrapartes ni cuentas ni lotes, todo vacío", () => {
      const r = ok({});
      expect(r.context).toStrictEqual({ lineIds: null, values: [], parties: [], ownAccounts: [], batchIds: [], windowDays: 5 });
      expect(r.originalIds.size).toBe(0);
      expect(ok({ contrapartes: {} }).context.parties).toStrictEqual([]);
    });
    it("el cuerpo, los renglones y los topes dicen qué campo falló, y el borde está permitido", () => {
      expect(fail(null)).toStrictEqual({ ok: false, field: "cuerpo" });
      expect(fail({ renglones: "a" })).toStrictEqual({ ok: false, field: "renglones" });
      expect(fail({ renglones: ["a", 1] })).toStrictEqual({ ok: false, field: "renglones" });
      expect(fail({ renglones: ["a", ""] })).toStrictEqual({ ok: false, field: "renglones" });
      expect(ok({ renglones: Array.from({ length: 1500 }, (_, i) => `r${i}`) }).context.lineIds).toHaveLength(1500);
      expect(ok({ valores: Array.from({ length: 20000 }, (_, i) => value({ idValor: i })) }).context.values).toHaveLength(20000);
      expect(fail({ valores: {} })).toStrictEqual({ ok: false, field: "valores" });
    });
    it("hasta 50 lotes: uno más, lotes", () => {
      expect(LIMITS).toEqual({ lines: 1500, values: 20000, transfers: 5000, batches: 50, windowDays: 31 });
      expect(ok({ lotes: Array.from({ length: 50 }, (_, i) => `L${i}`) }).context.batchIds).toHaveLength(50);
      expect(fail({ lotes: Array.from({ length: 51 }, (_, i) => `L${i}`) })).toStrictEqual({ ok: false, field: "lotes" });
    });
    it("ventanaDias: sin el campo son 5; un entero de 0 a 31 pasa tal cual", () => {
      expect(ok({}).context.windowDays).toBe(5);
      expect(ok({ ventanaDias: 10 }).context.windowDays).toBe(10);
      expect(ok({ ventanaDias: 0 }).context.windowDays).toBe(0);
      expect(ok({ ventanaDias: 31 }).context.windowDays).toBe(31);
    });
    it.each([[32], [-1], [2.5], ["5"], [null], [true], [NaN], [Infinity]])("ventanaDias %p es inválida", (ventanaDias) => {
      expect(fail({ ventanaDias })).toStrictEqual({ ok: false, field: "ventanaDias" });
    });
    it("contrapartes: cada forma rota señala contrapartes", () => {
      const bad = { ok: false, field: "contrapartes" };
      expect(fail({ contrapartes: [] })).toStrictEqual(bad);
      expect(fail({ contrapartes: "x" })).toStrictEqual(bad);
      expect(fail({ contrapartes: { proveedores: {} } })).toStrictEqual(bad);
      expect(fail({ contrapartes: { clientes: "x" } })).toStrictEqual(bad);
      expect(fail({ contrapartes: { proveedores: [5] } })).toStrictEqual(bad);
      expect(fail({ contrapartes: { clientes: [null] } })).toStrictEqual(bad);
      expect(fail({ contrapartes: { proveedores: [{ cuit: "1" }] } })).toStrictEqual(bad);
      expect(fail({ contrapartes: { clientes: [{ id: 1.5 }] } })).toStrictEqual(bad);
    });
    it("cuentasPropias y lotes: cada forma rota señala su campo; el CBU conserva el cero inicial", () => {
      const bad = (field: string) => ({ ok: false, field });
      expect(fail({ cuentasPropias: {} })).toStrictEqual(bad("cuentasPropias"));
      expect(fail({ cuentasPropias: [5] })).toStrictEqual(bad("cuentasPropias"));
      expect(fail({ cuentasPropias: [null] })).toStrictEqual(bad("cuentasPropias"));
      expect(fail({ cuentasPropias: [{ cbu: "1" }] })).toStrictEqual(bad("cuentasPropias"));
      expect(fail({ lotes: "L" })).toStrictEqual(bad("lotes"));
      expect(fail({ lotes: [{}] })).toStrictEqual(bad("lotes"));
      expect(ok({ cuentasPropias: [{ id: 1, cbu: "011-0" }] }).context.ownAccounts).toStrictEqual([{ id: "1", cbu: "0110", number: null }]);
      expect(ok({ cuentasPropias: [{ id: 1, numero: "  " }] }).context.ownAccounts[0].number).toBeNull();
    });
    it("un error que no es del pedido no se disfraza de pedido inválido", () => {
      const hostile = { get valores(): never { throw new TypeError("boom"); } };
      expect(() => parseReconcileRequest(hostile)).toThrow("boom");
    });
  });
});
