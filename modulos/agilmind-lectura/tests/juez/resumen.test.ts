// agilmind-lectura/tests/juez/resumen.test.ts
import { resumirDictamen } from "../../src/juez";
import type { Control, Dictamen, Propuesta } from "../../src/juez";

const control = (juez: string, id: string, estado: Control["estado"], over: Partial<Control> = {}): Control => ({
  id, juez, estado, residuo: estado === "cierra" ? 0 : null, partes: [`${id}:a`], faltan: [], sospechosos: { informa: false }, posicion: { informa: false },
  veredicto: estado === "cierra" ? "verified" : "abstained", motivo: `motivo de ${id}`, parteMasDebil: "grounded", ...over,
});
const propuesta = (campo: string): Propuesta => ({ campo, valor: { tipo: "centavos", valor: 1, moneda: "ARS" }, controles: ["c"], derivadaDe: ["c"], veredicto: "weak", motivo: "m" });

const noCierra = control("cadena", "saldo del renglón L7", "no-cierra", { veredicto: "weak", residuo: 3, sospechosos: { informa: true, valor: ["L7"] }, posicion: { informa: true, valor: { renglon: "L7" } } });
const porConstruccion = control("punta", "final = inicial + movimientos", "cierra-por-construccion");
const sinJuzgar = control("completitud", "cbu presente", "no-se-puede-juzgar", { veredicto: "unavailable", faltan: [{ campo: "cbu" }] });

const dictamen: Dictamen = {
  version: { modulo: "1", jueces: { cadena: "1", completitud: "1", punta: "1" } },
  controles: [
    control("cadena", "saldo del renglón L1", "cierra"),
    control("cadena", "saldo del renglón L2", "cierra"),
    noCierra,
    control("cadena", "saldo del renglón L8", "cierra"),
    sinJuzgar,
    control("completitud", "periodoDesde presente", "cierra"),
    porConstruccion,
  ],
  sospechososPorInterseccion: ["L7"],
  porAlternativa: [
    { lista: "movimientos", alternativa: 0, controles: [control("cadena", "x", "cierra"), control("cadena", "y", "no-cierra"), control("punta", "z", "cierra")] },
    { lista: "movimientos", alternativa: 2, controles: [] },
  ],
  propuestas: [propuesta("saldo:L7")],
  ambiguas: [propuesta("saldo:L8"), propuesta("saldo:L8")],
  truncada: true,
};

describe("resumirDictamen", () => {
  it("guarda completos los controles que no cierran, en su orden, y de los que cierran solo cuántos por juez", () => {
    const r = resumirDictamen(dictamen);
    expect(r.controles).toEqual([noCierra, sinJuzgar, porConstruccion]);
    expect(r.cierran).toEqual({ cadena: 3, completitud: 1 });
  });

  it("guarda la versión, los sospechosos, las propuestas, las ambiguas y truncada tal cual", () => {
    const r = resumirDictamen(dictamen);
    expect(r.version).toEqual(dictamen.version);
    expect(r.sospechososPorInterseccion).toEqual(["L7"]);
    expect(r.propuestas).toEqual(dictamen.propuestas);
    expect(r.ambiguas).toEqual(dictamen.ambiguas);
    expect(r.truncada).toBe(true);
    expect(resumirDictamen({ ...dictamen, truncada: false }).truncada).toBe(false);
  });

  it("resume cada alternativa igual: completos los que no cierran, el conteo de los que cierran", () => {
    expect(resumirDictamen(dictamen).porAlternativa).toEqual([
      { lista: "movimientos", alternativa: 0, controles: [control("cadena", "y", "no-cierra")], cierran: { cadena: 1, punta: 1 } },
      { lista: "movimientos", alternativa: 2, controles: [], cierran: {} },
    ]);
  });

  it("no lleva otras claves que las del resumen", () => {
    expect(Object.keys(resumirDictamen(dictamen)).sort()).toEqual(
      ["ambiguas", "cierran", "controles", "porAlternativa", "propuestas", "sospechososPorInterseccion", "truncada", "version"],
    );
  });

  it("los jueces del conteo salen ordenados por id, vengan como vengan", () => {
    const r = resumirDictamen({ ...dictamen, controles: [control("z", "a", "cierra"), control("b", "a", "cierra"), control("z", "b", "cierra")] });
    expect(Object.entries(r.cierran)).toEqual([["b", 1], ["z", 2]]);
    const jueces = ["m", "c", "x", "a", "q", "b"];
    const muchos = resumirDictamen({ ...dictamen, controles: jueces.map((j) => control(j, "c", "cierra")) });
    expect(Object.keys(muchos.cierran)).toEqual([...jueces].sort());
  });

  it("no toca el dictamen que resume y su resultado sobrevive a JSON", () => {
    const copia = structuredClone(dictamen);
    const r = resumirDictamen(dictamen);
    expect(dictamen).toEqual(copia);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it("un dictamen sin controles resume a vacío", () => {
    const vacio: Dictamen = { version: { modulo: "1", jueces: {} }, controles: [], sospechososPorInterseccion: [], porAlternativa: [], propuestas: [], ambiguas: [], truncada: false };
    expect(resumirDictamen(vacio)).toEqual({ version: { modulo: "1", jueces: {} }, controles: [], cierran: {}, sospechososPorInterseccion: [], porAlternativa: [], propuestas: [], ambiguas: [], truncada: false });
  });
});
