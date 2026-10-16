import { groupCharges, STANDALONE } from "../../src/dbg/grouping";
import { line } from "../reconcile/fixtures";
const RATES = { vat: [0.21, 0.105, 0.27], vatPerception: [0.03, 0.015] };
const t = (code: string) => ({ code, source: "table" as const });
const row = (id: string, order: number, code: string, amountCents: number, over: Partial<ReturnType<typeof line>> = {}) => line({ id, order, type: t(code), amountCents, date: "2026-07-10", ...over });

describe("groupCharges (RF-25)", () => {
  it("AC-25/AC-26: una comisión seguida el mismo día, sin número, de su IVA 21 % y su percepción 3 %", () => {
    const ls = [row("c", 1, "comision", -1280000), row("i", 2, "iva", -268800), row("p", 3, "percepcion-iva", -38400)];
    expect(groupCharges(ls, RATES)).toEqual([{ chargeId: "c", vatId: "i", perceptionId: "p" }]);
  });
  it("por número de comprobante, aunque estén lejos y en otro día", () => {
    const ls = [row("c", 1, "comision", -100000, { reference: "778" }), row("x", 2, "impuesto-debitos", -600), row("y", 3, "comision", -50000), row("z", 4, "comision", -70000), row("w", 5, "sellos", -1000), row("i", 6, "iva", -21000, { reference: "778", date: "2026-07-11" })];
    expect(groupCharges(ls, RATES).find((g) => g.chargeId === "c")).toEqual({ chargeId: "c", vatId: "i", perceptionId: null });
  });
  it("la alícuota con un centavo de tolerancia; dos centavos no", () => {
    expect(groupCharges([row("c", 1, "comision", -100000), row("i", 2, "iva", -21001)], RATES)[0].vatId).toBe("i");
    expect(groupCharges([row("c", 1, "comision", -100000), row("i", 2, "iva", -21002)], RATES).map((g) => g.chargeId).sort()).toEqual(["c", "i"]);
  });
  it("a más de 3 renglones o en otro día no se pega", () => {
    const far = [row("c", 1, "comision", -100000), row("a", 2, "impuesto-debitos", -1), row("b", 3, "impuesto-debitos", -1), row("d", 4, "impuesto-debitos", -1), row("i", 5, "iva", -21000)];
    expect(groupCharges(far, RATES).find((g) => g.chargeId === "c")?.vatId).toBeNull();
    expect(groupCharges([row("c", 1, "comision", -100000), row("i", 2, "iva", -21000, { date: "2026-07-11" })], RATES).find((g) => g.chargeId === "c")?.vatId).toBeNull();
  });
  it("un IVA que cierra con dos cargos queda suelto", () => {
    const ls = [row("c1", 1, "comision", -100000), row("i", 2, "iva", -21000), row("c2", 3, "comision", -100000)];
    expect(groupCharges(ls, RATES).map((g) => [g.chargeId, g.vatId])).toEqual([["c1", null], ["i", null], ["c2", null]]);
  });
  it("un cargo lleva a lo sumo un IVA: el segundo queda suelto; el 10,5 % y el 27 % también cierran", () => {
    const ls = [row("c", 1, "comision", -100000), row("i1", 2, "iva", -10500), row("i2", 3, "iva", -27000)];
    expect(groupCharges(ls, RATES)).toEqual([{ chargeId: "c", vatId: "i1", perceptionId: null }, { chargeId: "i2", vatId: null, perceptionId: null }]);
  });
  it("los impuestos y las percepciones de IIBB son siempre grupos propios, aunque cierren con una alícuota", () => {
    const ls = [row("c", 1, "comision", -100000), row("p", 2, "percepcion-iibb", -3000), row("t", 3, "impuesto-debitos", -600)];
    expect(groupCharges(ls, RATES)).toEqual([{ chargeId: "c", vatId: null, perceptionId: null }, { chargeId: "p", vatId: null, perceptionId: null }, { chargeId: "t", vatId: null, perceptionId: null }]);
  });
  it("un crédito (devolución) no se pega a un débito, y un IVA positivo no se pega a una comisión negativa", () => {
    const ls = [row("c", 1, "comision", -100000), row("i", 2, "iva", 21000)];
    expect(groupCharges(ls, RATES).map((g) => g.chargeId)).toEqual(["c", "i"]);
  });
  it("solo entran renglones de la familia banco: una transferencia no es cargo ni se agrupa", () => {
    expect(groupCharges([row("x", 1, "transferencia-enviada", -100000), row("i", 2, "iva", -21000)], RATES)).toEqual([{ chargeId: "i", vatId: null, perceptionId: null }]);
  });
  it.each([...STANDALONE])("%s nunca es un cargo: un IVA que cierra con él queda suelto", (code) => {
    expect(groupCharges([row("s", 1, code, -100000), row("i", 2, "iva", -21000)], RATES)).toEqual([{ chargeId: "s", vatId: null, perceptionId: null }, { chargeId: "i", vatId: null, perceptionId: null }]);
  });
  it("una percepción de IVA no es un cargo: no recibe el IVA que cierra con ella", () => {
    expect(groupCharges([row("p", 1, "percepcion-iva", -100000), row("i", 2, "iva", -21000)], RATES).map((g) => g.vatId)).toEqual([null, null]);
  });
  it("a exactamente 3 renglones el mismo día todavía se pega", () => {
    const ls = [row("c", 1, "comision", -100000), row("a", 2, "impuesto-debitos", -1), row("b", 3, "impuesto-debitos", -1), row("i", 4, "iva", -21000)];
    expect(groupCharges(ls, RATES).find((g) => g.chargeId === "c")?.vatId).toBe("i");
  });
  it("números distintos no son el mismo comprobante", () => {
    const ls = [row("c", 1, "comision", -100000, { reference: "778" }), row("i", 2, "iva", -5000, { reference: "779" })];
    expect(groupCharges(ls, RATES).map((g) => g.chargeId)).toEqual(["c", "i"]);
  });
  describe("la ambigüedad no depende del orden ni se resuelve por descarte", () => {
    const c1WithA = { chargeId: "c1", vatId: "a", perceptionId: null };
    it("un IVA que cierra con dos cargos queda suelto aunque otro IVA ya haya tomado uno de ellos", () => {
      const ls = [row("c1", 1, "comision", -100000), row("a", 2, "iva", -21000), row("s1", 3, "sellos", -1), row("b", 4, "iva", -21000), row("s2", 5, "sellos", -1), row("c2", 6, "comision", -100000)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual(c1WithA);
      expect(out.find((g) => g.chargeId === "c2")).toEqual({ chargeId: "c2", vatId: null, perceptionId: null });
      expect(out.find((g) => g.chargeId === "b")).toEqual({ chargeId: "b", vatId: null, perceptionId: null });
    });
    it("lo mismo con los renglones en el orden inverso", () => {
      const ls = [row("c2", 1, "comision", -100000), row("s1", 2, "sellos", -1), row("b", 3, "iva", -21000), row("s2", 4, "sellos", -1), row("a", 5, "iva", -21000), row("c1", 6, "comision", -100000)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual(c1WithA);
      expect(out.find((g) => g.chargeId === "c2")).toEqual({ chargeId: "c2", vatId: null, perceptionId: null });
      expect(out.find((g) => g.chargeId === "b")).toEqual({ chargeId: "b", vatId: null, perceptionId: null });
    });
  });
  it("el número manda: un IVA que comparte número con un cargo y cierra por cercanía con otro se pega al del número", () => {
    const ls = [row("c1", 1, "comision", -100000, { reference: "778", date: "2026-07-09" }), row("c2", 3, "comision", -100000), row("i", 4, "iva", -21000, { reference: "778" })];
    const out = groupCharges(ls, RATES);
    expect(out.find((g) => g.chargeId === "c1")?.vatId).toBe("i");
    expect(out.find((g) => g.chargeId === "c2")?.vatId).toBeNull();
  });
  describe("el IVA del total del día: varios cargos del mismo día y tipo cuya suma cierra con un IVA que no tiene otro cargo", () => {
    const far = (i: number) => row(`s${i}`, i, "sellos", -1);
    it("tres comisiones lejos del IVA, que juntas cierran con el 21 %, van en un grupo con el IVA, el primer cargo primero", () => {
      const ls = [row("i", 1, "iva", -12600), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000), row("c3", 7, "comision", -10000)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual({ chargeId: "c1", vatId: "i", perceptionId: null, otherChargeIds: ["c2", "c3"] });
      expect(out.map((g) => g.chargeId)).toEqual(["s2", "s3", "s4", "c1"]);
    });
    it("también cerca, cuando ninguno solo cierra", () => {
      expect(groupCharges([row("c1", 1, "comision", -30000), row("c2", 2, "comision", -20000), row("i", 3, "iva", -10500)], RATES)).toEqual([{ chargeId: "c1", vatId: "i", perceptionId: null, otherChargeIds: ["c2"] }]);
    });
    it("la suma con un centavo de tolerancia, para los dos lados; dos centavos no", () => {
      const day = (vat: number) => groupCharges([row("c1", 1, "comision", -600), row("c2", 2, "comision", -400), row("i", 3, "iva", vat)], RATES).find((g) => g.chargeId === "c1");
      expect(day(-211)?.vatId).toBe("i");
      expect(day(-209)?.vatId).toBe("i");
      expect(day(-212)?.vatId).toBeNull();
      expect(day(-208)?.vatId).toBeNull();
    });
    it("con el 10,5 % y el 27 % también", () => {
      const day = (vat: number) => groupCharges([row("c1", 1, "comision", -60000), row("c2", 2, "comision", -40000), row("i", 9, "iva", vat)], RATES)[0].vatId;
      expect(day(-10500)).toBe("i");
      expect(day(-27000)).toBe("i");
    });
    it("un solo cargo del día no es un total: lejos, sigue suelto (RF-25)", () => {
      const ls = [row("i", 1, "iva", -21000), far(2), far(3), far(4), row("c", 5, "comision", -100000)];
      expect(groupCharges(ls, RATES).find((g) => g.chargeId === "c")).toEqual({ chargeId: "c", vatId: null, perceptionId: null });
    });
    it("tienen que cerrar todos los cargos del tipo en el día: si cierra una parte, suelto", () => {
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000), row("c3", 7, "comision", -10000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null)).toBe(true);
    });
    it("se suman los del mismo tipo: los intereses del día no entran y quedan solos", () => {
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("n", 6, "intereses", -7777), row("c2", 7, "comision", -20000)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual({ chargeId: "c1", vatId: "i", perceptionId: null, otherChargeIds: ["c2"] });
      expect(out.find((g) => g.chargeId === "n")).toEqual({ chargeId: "n", vatId: null, perceptionId: null });
    });
    it("si cierran dos tipos, es ambiguo: suelto", () => {
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000), row("n1", 7, "intereses", -25000), row("n2", 8, "intereses", -25000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("los de otro día y los del otro signo no entran", () => {
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000), row("o", 7, "comision", -5000, { date: "2026-07-11" }), row("r", 8, "comision", 5000)];
      expect(groupCharges(ls, RATES).find((g) => g.chargeId === "c1")).toEqual({ chargeId: "c1", vatId: "i", perceptionId: null, otherChargeIds: ["c2"] });
    });
    it("un solo cargo de otro tipo cuyo IVA también cierra compite: suelto", () => {
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000), row("n", 7, "intereses", -50000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("un IVA que cierra con dos tipos le compite a otro IVA que cierra solo con uno de ellos: los dos sueltos", () => {
      // comisiones 50.000 → 10.500; intereses 50.005 → 10.501. i1 (10.500) cierra con los dos; i2 (10.499), solo con las comisiones.
      const ls = [row("i1", 1, "iva", -10500), row("i2", 2, "iva", -10499), far(3), far(4), far(5), row("c1", 6, "comision", -30000), row("c2", 7, "comision", -20000), row("n1", 8, "intereses", -25000), row("n2", 9, "intereses", -25005)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("un IVA que cierra solo con un tipo, sin nadie que le compita, sigue agrupando aunque otro IVA del día cierre con otro tipo", () => {
      const ls = [row("i1", 1, "iva", -10500), row("i2", 2, "iva", -2100), far(3), far(4), far(5), row("c1", 6, "comision", -30000), row("c2", 7, "comision", -20000), row("n1", 8, "intereses", -6000), row("n2", 9, "intereses", -4000)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual({ chargeId: "c1", vatId: "i1", perceptionId: null, otherChargeIds: ["c2"] });
      expect(out.find((g) => g.chargeId === "n1")).toEqual({ chargeId: "n1", vatId: "i2", perceptionId: null, otherChargeIds: ["n2"] });
    });
    it("dos IVA que cierran con el mismo total quedan sueltos los dos", () => {
      const ls = [row("i1", 1, "iva", -10500), row("i2", 2, "iva", -10500), far(3), far(4), far(5), row("c1", 6, "comision", -30000), row("c2", 7, "comision", -20000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("si un cargo del día ya tiene su IVA o su percepción por RF-25, el total no se arma", () => {
      const withVat = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("v", 6, "iva", -6300), row("c2", 7, "comision", -20000)];
      expect(groupCharges(withVat, RATES).find((g) => g.chargeId === "i")).toEqual({ chargeId: "i", vatId: null, perceptionId: null });
      const withPerception = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("p", 6, "percepcion-iva", -900), row("c2", 7, "comision", -20000)];
      expect(groupCharges(withPerception, RATES).find((g) => g.chargeId === "i")).toEqual({ chargeId: "i", vatId: null, perceptionId: null });
    });
    it("un IVA ambiguo por RF-25 no se resuelve por el total, aunque cierre con la suma", () => {
      const ls = [row("c1", 1, "comision", -100000), row("i", 2, "iva", -21000), row("c2", 3, "comision", -100000)];
      expect(groupCharges(ls, RATES)).toEqual([{ chargeId: "c1", vatId: null, perceptionId: null }, { chargeId: "i", vatId: null, perceptionId: null }, { chargeId: "c2", vatId: null, perceptionId: null }]);
    });
    it("un cargo candidato de un IVA ambiguo no entra en el total de otro IVA: su IVA no se cuenta dos veces", () => {
      // i cierra con c1 y con c2 (ambiguo, suelto); j, lejos, cierra con la suma de los dos
      const ls = [row("c1", 1, "comision", -100000), row("i", 2, "iva", -21000), row("c2", 3, "comision", -100000), far(4), far(5), far(6), row("j", 7, "iva", -42000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("tampoco el candidato de una percepción ambigua", () => {
      const ls = [row("c1", 1, "comision", -100000), row("p", 2, "percepcion-iva", -3000), row("c2", 3, "comision", -100000), far(4), far(5), far(6), row("j", 7, "iva", -42000)];
      expect(groupCharges(ls, RATES).every((g) => g.vatId === null && g.otherChargeIds === undefined)).toBe(true);
    });
    it("un IVA con número que no encuentra lugar no va al total", () => {
      const before = { date: "2026-07-09" };
      const ls = [row("c0", 1, "comision", -30000, { reference: "778", ...before }), row("v", 2, "iva", -6300, { reference: "778", ...before }), row("i", 3, "iva", -10500, { reference: "778" }), far(4), far(5), far(6), row("c1", 7, "comision", -30000), row("c2", 8, "comision", -20000)];
      expect(groupCharges(ls, RATES).find((g) => g.chargeId === "i")).toEqual({ chargeId: "i", vatId: null, perceptionId: null });
    });
    it("la percepción no se suma: una percepción suelta queda suelta, aunque su importe sea una alícuota del total", () => {
      for (const cents of [-1500, -10500]) {
        const ls = [row("p", 1, "percepcion-iva", cents), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000)];
        expect(groupCharges(ls, RATES).find((g) => g.chargeId === "p")).toEqual({ chargeId: "p", vatId: null, perceptionId: null });
      }
    });
    it("cada día arma su total: dos días con su IVA dan dos grupos", () => {
      const next = { date: "2026-07-11" };
      const ls = [row("i", 1, "iva", -10500), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000),
        row("j", 7, "iva", -4200, next), row("t1", 11, "comision", -10000, next), row("t2", 12, "comision", -10000, next)];
      const out = groupCharges(ls, RATES);
      expect(out.find((g) => g.chargeId === "c1")).toEqual({ chargeId: "c1", vatId: "i", perceptionId: null, otherChargeIds: ["c2"] });
      expect(out.find((g) => g.chargeId === "t1")).toEqual({ chargeId: "t1", vatId: "j", perceptionId: null, otherChargeIds: ["t2"] });
    });
  });
});
