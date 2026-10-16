import { toPublicReconciliation } from "../../src/reconcile/publicReconciliation";

describe("toPublicReconciliation", () => {
  it("un apareo en castellano, con los ids de valores como llegaron", () => {
    const out = toPublicReconciliation("C1", [{ id: "p1", proposal: { kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["101"], confidence: "grounded", coincidence: { amount: true, days: 2, cuit: "20222222223" }, marks: ["interchangeable", "own-accounts", "unchecked-line", "reading-warning"] } }], { "101": 101 });
    expect(out).toEqual({ idConciliacion: "C1", propuestas: [{
      idPropuesta: "p1", idRenglon: "l1", tipo: "apareo", valores: [101], renglones: ["l1"], confianza: "grounded",
      coincidencias: { importe: true, fecha: { dias: 2 }, cuit: "20222222223" },
      marcas: ["intercambiable", "cuentas-propias", "renglon-sin-control", "lectura-con-aviso"], motivo: null, candidatos: null,
    }] });
  });
  it("a revisar sin valores, con los candidatos; pendiente con su motivo", () => {
    const out = toPublicReconciliation("C1", [
      { id: "p1", proposal: { kind: "review", lineId: "l1", reason: "Dos.", candidates: [["101"], ["102", "103"]] } },
      { id: "p2", proposal: { kind: "pending", lineId: "l2", reason: "No hay.", marks: [] } },
    ], { "101": 101, "102": "A-102", "103": 103 });
    expect(out.propuestas).toEqual([
      { idPropuesta: "p1", idRenglon: "l1", tipo: "a-revisar", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: [], motivo: "Dos.", candidatos: [{ valores: [101] }, { valores: ["A-102", 103] }] },
      { idPropuesta: "p2", idRenglon: "l2", tipo: "pendiente", valores: null, renglones: null, confianza: null, coincidencias: null, marcas: [], motivo: "No hay.", candidatos: null },
    ]);
  });
  it("número, boleta y lote entre las coincidencias", () => {
    const out = toPublicReconciliation("C1", [{ id: "p", proposal: { kind: "match", lineId: "l", groupLineIds: ["l"], valueIds: [], confidence: "verified", coincidence: { amount: true, number: "4512", deposit: "B9", batch: "L1", cbu: "011" }, marks: [] } }], {});
    expect(out.propuestas[0].coincidencias).toStrictEqual({ importe: true, numero: "4512", boleta: "B9", lote: "L1", cbu: "011" });
  });
  it("sin más coincidencia que el importe, solo el importe", () => {
    const out = toPublicReconciliation("C1", [{ id: "p", proposal: { kind: "match", lineId: "l", groupLineIds: ["l", "m"], valueIds: ["7"], confidence: "weak", coincidence: { amount: true, days: 0 }, marks: [] } }], { "7": 7 });
    expect(out.propuestas[0]).toEqual(expect.objectContaining({ renglones: ["l", "m"], confianza: "weak", marcas: [] }));
    // Estricto: una clave en `undefined` cuenta como una clave de más.
    expect(out.propuestas[0].coincidencias).toStrictEqual({ importe: true, fecha: { dias: 0 } });
  });
  it("el importe único y el pago de un tercero, en castellano", () => {
    const out = toPublicReconciliation("C1", [{ id: "p", proposal: { kind: "match", lineId: "l", groupLineIds: ["l"], valueIds: ["7"], confidence: "weak", coincidence: { amount: true, days: 1 }, marks: ["single-amount", "third-party", "reading-warning"] } }], { "7": 7 });
    expect(out.propuestas[0].marcas).toEqual(["importe-unico", "pago-de-un-tercero", "lectura-con-aviso"]);
  });
  it("el pendiente lleva sus marcas en castellano", () => {
    const out = toPublicReconciliation("C1", [{ id: "p", proposal: { kind: "pending", lineId: "l", reason: "Propias.", marks: ["own-accounts", "reading-warning"] } }], {});
    expect(out.propuestas[0].marcas).toEqual(["cuentas-propias", "lectura-con-aviso"]);
  });
  it("un id sin original sale tal cual, aunque se llame como una propiedad de cualquier objeto", () => {
    const out = toPublicReconciliation("C1", [{ id: "p", proposal: { kind: "review", lineId: "l", reason: "R.", candidates: [["constructor", "9"]] } }], { "9": 9 });
    expect(out.propuestas[0].candidatos).toEqual([{ valores: ["constructor", 9] }]);
  });
  it("lo que el motor lleve de más no sale", () => {
    const proposal = { kind: "pending", lineId: "l", reason: "R.", marks: [], interno: "no" } as never;
    const out = toPublicReconciliation("C1", [{ id: "p", proposal, extra: 1 } as never], {});
    expect(Object.keys(out)).toEqual(["idConciliacion", "propuestas"]);
    expect(Object.keys(out.propuestas[0]).sort()).toEqual(["candidatos", "coincidencias", "confianza", "idPropuesta", "idRenglon", "marcas", "motivo", "renglones", "tipo", "valores"]);
  });
});
