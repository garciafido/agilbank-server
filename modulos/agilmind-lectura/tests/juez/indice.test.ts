import { indice } from "../../src/juez/indice";
import type { Campo } from "../../src/juez/contrato";

const c = (id: string): Campo => ({ id, valor: null, veredicto: "abstained" });

describe("indice", () => {
  it("junta los campos sueltos y los elementos de las listas, con el mismo objeto", () => {
    const total = c("total");
    const r1 = c("r1");
    const r2 = c("r2");
    const m = indice({ campos: [total], listas: [{ id: "renglones", elementos: [r1, r2] }] });
    expect([...m.keys()].sort()).toEqual(["r1", "r2", "total"]);
    expect(m.get("total")).toBe(total);
    expect(m.get("r1")).toBe(r1);
    expect(m.get("r2")).toBe(r2);
  });
  it("un id repetido es un error de programación del adaptador", () => {
    expect(() => indice({ campos: [c("total"), c("total")], listas: [] })).toThrow("id repetido: total");
  });
  it("un id repetido entre un campo suelto y un elemento de lista tira", () => {
    expect(() => indice({ campos: [c("r1")], listas: [{ id: "renglones", elementos: [c("r1")] }] })).toThrow("id repetido: r1");
  });
  it("un id repetido entre elementos de dos listas distintas tira", () => {
    expect(() =>
      indice({ campos: [], listas: [{ id: "a", elementos: [c("x")] }, { id: "b", elementos: [c("x")] }] }),
    ).toThrow("id repetido: x");
  });
});
