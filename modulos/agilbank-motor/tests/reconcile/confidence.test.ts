import { confidenceOf } from "../../src/reconcile/confidence";
import { line } from "./fixtures";

describe("confidenceOf", () => {
  it("número e importe con un renglón que encadena: verified", () => {
    expect(confidenceOf("number", [line({ chains: true })], false)).toEqual({ confidence: "verified", marks: [] });
  });
  it("número e importe con un renglón sin control: grounded", () => {
    expect(confidenceOf("number", [line({ chains: null })], false)).toEqual({ confidence: "grounded", marks: [] });
  });
  it.each(["unique", "party", "group"] as const)("%s: grounded", (basis) => {
    expect(confidenceOf(basis, [line()], false).confidence).toBe("grounded");
  });
  it.each(["interchangeable", "sum", "split"] as const)("%s: weak", (basis) => {
    expect(confidenceOf(basis, [line()], false).confidence).toBe("weak");
  });
  it("importe único en el período: weak, con su marca", () => {
    expect(confidenceOf("single", [line()], false)).toEqual({ confidence: "weak", marks: ["single-amount"] });
  });
  it("intercambiable lleva su marca", () => {
    expect(confidenceOf("interchangeable", [line()], false).marks).toEqual(["interchangeable"]);
  });
  it("un renglón que no encadena deja la propuesta en weak, con la marca", () => {
    expect(confidenceOf("number", [line({ chains: true }), line({ chains: false })], false)).toEqual({ confidence: "weak", marks: ["unchecked-line"] });
  });
  it("una lectura con aviso deja todo en weak, con la marca", () => {
    expect(confidenceOf("number", [line()], true)).toEqual({ confidence: "weak", marks: ["reading-warning"] });
  });
});

describe("confidenceOf: un tercero que paga", () => {
  it("baja a weak cualquier base, con la marca", () => {
    expect(confidenceOf("number", [line()], false, true)).toEqual({ confidence: "weak", marks: ["third-party"] });
    expect(confidenceOf("group", [line()], false, true)).toEqual({ confidence: "weak", marks: ["third-party"] });
  });
  it("sin tercero no cambia nada", () => {
    expect(confidenceOf("unique", [line()], false, false)).toEqual({ confidence: "grounded", marks: [] });
  });
  it("las marcas se acumulan en orden: la base, el tercero, el renglón y la lectura", () => {
    expect(confidenceOf("interchangeable", [line({ chains: false })], true, true)).toEqual({ confidence: "weak", marks: ["interchangeable", "third-party", "unchecked-line", "reading-warning"] });
  });
});

describe("confidenceOf: el renglón más débil manda", () => {
  it("un renglón sin control entre otros que encadenan deja el número en grounded", () => {
    expect(confidenceOf("number", [line({ chains: true }), line({ chains: null })], false).confidence).toBe("grounded");
  });
  it("un renglón sin control no sube una base weak a grounded", () => {
    expect(confidenceOf("interchangeable", [line({ chains: null })], false)).toEqual({ confidence: "weak", marks: ["interchangeable"] });
  });
  it("las marcas se acumulan: intercambiable, renglón que no encadena y lectura con aviso", () => {
    expect(confidenceOf("interchangeable", [line({ chains: false })], true)).toEqual({ confidence: "weak", marks: ["interchangeable", "unchecked-line", "reading-warning"] });
  });
});
