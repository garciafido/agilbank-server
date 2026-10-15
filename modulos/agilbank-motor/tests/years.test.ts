import { completeYears, yearUnknown } from "../src/years";
import type { Grid } from "../src/types";

const g = (...rows: Array<Array<string | number | null>>): Grid => ({ origin: "text", sheet: null, rows });

describe("completeYears", () => {
  it("con el período de ProntoNet, la fecha sin año toma el año que la deja más cerca", () => {
    const out = completeYears(g(["03/07", "x"], ["30/06", "y"]), { from: "2026-07-01", to: "2026-07-31" });
    expect(out.rows).toEqual([["03/07/2026", "x"], ["30/06/2026", "y"]]);
  });

  it("de diciembre a enero, enero queda en el año siguiente", () => {
    const out = completeYears(g(["30/12"], ["02/01"]), { from: "2026-12-15", to: "2027-01-14" });
    expect(out.rows).toEqual([["30/12/2026"], ["02/01/2027"]]);
  });

  it("sin período, el año sale de las fechas completas del archivo, aunque estén dentro de un texto", () => {
    const out = completeYears(g(["Periodo al 03/08/2026"], ["01/07", "PAGO 15/07/26"]));
    expect(out.rows[1][0]).toBe("01/07/2026");
  });

  it("sin período ni fechas completas, la grilla queda como está", () => {
    const grid = g(["03/07", "x"]);
    expect(completeYears(grid)).toBe(grid);
  });

  it("no toca lo que no es una fecha sin año entera", () => {
    const out = completeYears(g(["12.05", "06/26", "31/02", "pago 03/07", 3]), { from: "2026-07-01", to: "2026-07-31" });
    expect(out.rows).toEqual([["12.05", "06/26", "31/02", "pago 03/07", 3]]);
  });

  it("una grilla sin fechas sin año vuelve igual, sin copiarse", () => {
    const grid = g(["01/07/2026", "x"]);
    expect(completeYears(grid, { from: "2026-07-01" })).toBe(grid);
  });

  it("conserva el origen, la hoja y los lugares", () => {
    const grid: Grid = { origin: "pdf", sheet: null, rows: [["03/07"]], places: [{ page: 2, line: 5, origin: "pdf" }] };
    expect(completeYears(grid, { from: "2026-07-01", to: "2026-07-31" })).toEqual({ ...grid, rows: [["03/07/2026"]] });
  });

  it("una cuota «3/12» o una cantidad «1/2», con una cifra de un lado, no es una fecha en ninguna columna", () => {
    const out = completeYears(g(["03/07", "3/12"], ["04/07", "1/2"], ["05/07", "3/07"], ["06/07", "03/7"]), { from: "2026-07-01", to: "2026-07-31" });
    expect(out.rows).toEqual([["03/07/2026", "3/12"], ["04/07/2026", "1/2"], ["05/07/2026", "3/07"], ["06/07/2026", "03/7"]]);
  });

  it("se completa aunque la columna tenga membrete, el rótulo y los saldos y solo dos movimientos", () => {
    const out = completeYears(
      g(["BBVA Extracto de cuenta"], ["FECHA"], ["SALDO ANTERIOR"], ["03/07"], ["04/07"], ["SALDO FINAL"]),
      { from: "2026-07-01", to: "2026-07-31" },
    );
    expect(out.rows.map((r) => r[0])).toEqual(["BBVA Extracto de cuenta", "FECHA", "SALDO ANTERIOR", "03/07/2026", "04/07/2026", "SALDO FINAL"]);
  });

  it("se completa en cualquier columna: las fechas de un anexo no dependen de la sección principal", () => {
    const out = completeYears(g(["03/07", "x", null], [null, "ANEXO", "05/07"]), { from: "2026-07-01", to: "2026-07-31" });
    expect(out.rows).toEqual([["03/07/2026", "x", null], [null, "ANEXO", "05/07/2026"]]);
  });

  it("«10/12» se completa: una cuota con dos cifras de cada lado pasa por fecha (riesgo aceptado)", () => {
    const out = completeYears(g(["10/12"]), { from: "2026-12-01", to: "2026-12-31" });
    expect(out.rows).toEqual([["10/12/2026"]]);
  });

  it("las celdas con espacios alrededor se completan sin ellos", () => {
    expect(completeYears(g([" 03/07 "]), { from: "2026-07-01", to: "2026-07-31" }).rows).toEqual([["03/07/2026"]]);
  });

  it("los números no son fechas", () => {
    expect(completeYears(g([307], ["03/07"]), { from: "2026-07-01", to: "2026-07-31" }).rows).toEqual([[307], ["03/07/2026"]]);
  });

  it("si la fecha más cercana queda a más de 200 días, la celda queda como está", () => {
    const out = completeYears(g(["29/02"], ["03/07"]), { from: "2027-07-01", to: "2027-07-31" });
    expect(out.rows).toEqual([["29/02"], ["03/07/2027"]]);
  });

  it("con una sola punta de período, la cercanía se mide a esa punta", () => {
    expect(completeYears(g(["30/12"]), { from: "2026-12-20" }).rows).toEqual([["30/12/2026"]]);
    expect(completeYears(g(["02/01"]), { to: "2027-01-10" }).rows).toEqual([["02/01/2027"]]);
  });
});

describe("yearUnknown", () => {
  it("fechas sin año, sin período ni fechas completas: no se sabe el año", () => {
    expect(yearUnknown(g(["03/07", "x"], [" 04/07 ", 3]))).toBe(true);
    expect(yearUnknown(g(["03/07", "x"]), { from: null, to: null })).toBe(true);
  });

  it("con el período, un extremo o una fecha completa en el archivo, sí se sabe", () => {
    expect(yearUnknown(g(["03/07"]), { from: "2026-07-01" })).toBe(false);
    expect(yearUnknown(g(["03/07"]), { to: "2026-07-31" })).toBe(false);
    expect(yearUnknown(g(["03/07"], ["Periodo al 31/07/2026"]))).toBe(false);
  });

  it("sin fechas sin año, no falta nada", () => {
    expect(yearUnknown(g(["x", "pago 03/07", 3]))).toBe(false);
  });
});
