import { abortLine, checkDbgCase } from "../bench/dbgCriteria";
const m = (o: Record<string, number>) => new Map(Object.entries(o));
it("la parte del importe con la cuenta correcta y la parte de la familia banco como dbg, contra los pisos", () => {
  const ok = checkDbgCase({ byAccount: m({ "9900102": -1000, "9900104": -500 }), dbgLines: 9, bankLines: 10, pendingLines: 0 }, { byAccount: m({ "9900102": -1000, "9900104": -600 }), pendingLines: 0 }, { amountShare: 0.9, dbgShare: 0.9, approved: true });
  expect(ok).toEqual([]);
  expect(checkDbgCase({ byAccount: m({ "9900102": -1000 }), dbgLines: 9, bankLines: 10, pendingLines: 0 }, { byAccount: m({ "9900102": -1000, "9900104": -600 }), pendingLines: 0 }, { amountShare: 0.9, dbgShare: 0.9, approved: true })).toEqual([expect.stringContaining("importe")]);
  expect(checkDbgCase({ byAccount: m({}), dbgLines: 5, bankLines: 10, pendingLines: 0 }, { byAccount: m({}), pendingLines: 0 }, { amountShare: 0, dbgShare: 0.9, approved: true })).toEqual([expect.stringContaining("dbg")]);
});
it("sin aprobar, el importe no es criterio", () => {
  expect(checkDbgCase({ byAccount: m({}), dbgLines: 10, bankLines: 10, pendingLines: 0 }, { byAccount: m({ x: -1 }), pendingLines: 0 }, { amountShare: 0.9, dbgShare: 0.9, approved: false })).toEqual([]);
});
describe("abortLine", () => {
  it("dice el caso y el código del error, sin el mensaje (trae rutas con el nombre del cliente)", () => {
    const e = Object.assign(new Error("ENOENT: no such file, open '/carpeta/del/cliente/x.json'"), { code: "ENOENT" });
    expect(abortLine(e, "02")).toBe("caso 02: se cortó con ENOENT");
  });
  it("sin código, el nombre del error; sin caso, antes de empezar", () => {
    expect(abortLine(new TypeError("en /carpeta/del/cliente"), null)).toBe("antes de los casos: se cortó con TypeError");
    expect(abortLine("texto con /ruta", "01")).toBe("caso 01: se cortó con un error");
    expect(abortLine({ code: 42 }, "01")).toBe("caso 01: se cortó con un error");
  });
});
