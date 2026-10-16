import { exactSubsets } from "../../src/reconcile/sums";

const items = (cents: number[]) => cents.map((c, i) => ({ id: `i${i}`, cents: c }));
const opts = (over = {}) => ({ maxCombos: 2, minSize: 1, maxSize: 100, deadline: Number.POSITIVE_INFINITY, now: () => 0, ...over });
const sorted = (combos: string[][]) => combos.map((c) => [...c].sort());

describe("exactSubsets", () => {
  it("encuentra la única combinación que suma exacto", () => {
    const r = exactSubsets(items([100, 250, 400, 50]), 650, opts());
    expect(sorted(r.combos)).toEqual([["i1", "i2"]]);
    expect(r.exhausted).toBe(false);
  });
  it("devuelve dos combinaciones cuando las hay (RF-19)", () => {
    const r = exactSubsets(items([100, 200, 300]), 300, opts());
    expect(sorted(r.combos)).toEqual(expect.arrayContaining([["i2"], ["i0", "i1"]]));
    expect(r.combos).toHaveLength(2);
  });
  it("no pasa de maxCombos", () => {
    expect(exactSubsets(items([100, 200, 300, 100]), 300, opts({ maxCombos: 1 })).combos).toHaveLength(1);
  });
  it("recorre de mayor a menor: la primera combinación lleva los ítems más grandes", () => {
    expect(exactSubsets(items([100, 200, 300]), 300, opts({ maxCombos: 1 })).combos).toEqual([["i2"]]);
  });
  it("AC-18: 63 valores que suman exacto el total se encuentran enseguida", () => {
    const cents = Array.from({ length: 63 }, (_, i) => 10_000 + i * 37);
    const total = cents.reduce((a, b) => a + b, 0);
    const r = exactSubsets(items(cents), total, opts());
    expect(r.combos).toHaveLength(1);
    expect(r.combos[0]).toHaveLength(63);
  });
  it("respeta el tamaño mínimo y el máximo", () => {
    expect(sorted(exactSubsets(items([300, 100, 200]), 300, opts({ minSize: 2 })).combos)).toEqual([["i1", "i2"]]);
    expect(exactSubsets(items([100, 100, 100]), 300, opts({ maxSize: 2 })).combos).toEqual([]);
    expect(exactSubsets(items([100, 100, 100]), 300, opts({ maxSize: 3 })).combos).toEqual([["i0", "i1", "i2"]]);
  });
  it("sin combinación, ninguna y sin cortar", () => {
    expect(exactSubsets(items([100, 250]), 300, opts())).toEqual({ combos: [], exhausted: false });
  });
  it("con el techo vencido corta y lo dice", () => {
    // Ninguna combinación de 1.000 a 1.039 suma 20.001: 19 ítems llegan a 19.570 y 20 arrancan en 20.190. Obliga a explorar.
    let t = 0;
    const r = exactSubsets(items(Array.from({ length: 40 }, (_, i) => 1000 + i)), 20_001, opts({ deadline: 5, now: () => (t += 1) }));
    expect(r).toEqual({ combos: [], exhausted: true });
  });
  it("con el techo vencido antes de empezar no busca", () => {
    expect(exactSubsets(items([100, 200]), 300, opts({ deadline: 5, now: () => 10 }))).toEqual({ combos: [], exhausted: true });
  });
  it("con el reloj justo en el techo todavía busca", () => {
    expect(exactSubsets(items([100, 200]), 300, opts({ deadline: 0, now: () => 0 }))).toEqual({ combos: [["i1", "i0"]], exhausted: false });
  });
  it("los negativos se suman igual: un pago masivo es un débito", () => {
    expect(sorted(exactSubsets(items([-100, -250]), -350, opts()).combos)).toEqual([["i0", "i1"]]);
  });
  it("un ítem del signo contrario no entra en la suma", () => {
    expect(exactSubsets(items([-100, 300, 200, 100]), 400, opts())).toEqual({ combos: [["i1", "i3"]], exhausted: false });
  });
  it("una combinación que no acepta no ocupa el lugar de otra", () => {
    // 300 suman i0, i3 e i2+i1; sin aceptar i0, salen las otras dos aunque maxCombos sea 2.
    const r = exactSubsets(items([300, 100, 200, 300]), 300, opts({ accept: (ids: string[]) => !ids.includes("i0") }));
    expect(r).toEqual({ combos: [["i3"], ["i2", "i1"]], exhausted: false });
  });
  it("accept recibe una copia de la combinación: guardarla no la deja cambiar", () => {
    const seen: string[][] = [];
    const r = exactSubsets(items([100, 200, 300]), 300, opts({ accept: (ids: string[]) => (seen.push(ids), true) }));
    expect(seen).toEqual(r.combos);
  });
  it("una búsqueda larga con el reloj justo en el techo termina sin cortar", () => {
    // Ninguna combinación de 1.000 a 1.015 suma 8.001: miles de pasos, así que el reloj se mira varias veces.
    expect(exactSubsets(items(Array.from({ length: 16 }, (_, i) => 1000 + i)), 8001, opts({ deadline: 0, now: () => 0 }))).toEqual({ combos: [], exhausted: false });
  });
});
