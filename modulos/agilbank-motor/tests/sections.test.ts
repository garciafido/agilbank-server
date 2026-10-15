import { splitSections } from "../src/sections";
import { readTable } from "../src/columns";
import { judge } from "../src/judge";
import { cbusOutsideMovements } from "../src/header";
import { catalog } from "../src/catalog/catalog";
import type { Cell, Grid } from "../src/types";

const MAIN = ["Fecha", "Concepto", "Debito", "Credito", "Saldo"];
const ANNEX = ["Fecha", "Empresa", "Referencia", "Importe"];
const g = (rows: Cell[][]): Grid => ({ origin: "text", sheet: null, rows });

describe("splitSections", () => {
  it("con un solo encabezado, todo es la tabla", () => {
    const grid = g([MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"]]);
    expect(splitSections(grid)).toEqual({ main: grid, annexes: [] });
  });

  it("las filas que siguen a otro encabezado son un anexo: salen de la tabla y quedan vacías en su lugar", () => {
    const grid = g([
      MAIN,
      ["01/07/2026", "X", "-1,00", null, "9,00"],
      ["02/07/2026", "Y", null, "40,00", "49,00"],
      ANNEX,
      ["02/07/2026", "30712345671 ACME SA", "VARIOS", "40,00"],
      ["03/08/2026", "30712345671 ACME SA", "VARIOS", "50,00"],
    ]);
    const { main, annexes } = splitSections(grid);
    expect(main.rows).toEqual([grid.rows[0], grid.rows[1], grid.rows[2], [], [], []]);
    expect(annexes).toEqual([g([ANNEX, grid.rows[4], grid.rows[5]])]);
  });

  it("la tabla puede seguir después del anexo, con su encabezado repetido", () => {
    const grid = g([MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ANNEX, ["02/07/2026", "A", "R", "1,00"], MAIN, ["03/07/2026", "Z", "-1,00", null, "8,00"]]);
    const { main, annexes } = splitSections(grid);
    expect(main.rows).toEqual([grid.rows[0], grid.rows[1], [], [], grid.rows[4], grid.rows[5]]);
    expect(annexes).toHaveLength(1);
  });

  it("la tabla es la sección con más filas de datos, aunque el anexo aparezca primero", () => {
    const grid = g([ANNEX, ["02/07/2026", "A", "R", "1,00"], MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["02/07/2026", "Y", "-1,00", null, "8,00"]]);
    const { main, annexes } = splitSections(grid);
    expect(main.rows.slice(0, 2)).toEqual([[], []]);
    expect(annexes[0].rows).toEqual([ANNEX, grid.rows[1]]);
  });

  it("dos anexos de distinto encabezado son dos anexos, y conservan sus lugares", () => {
    const other = ["Fecha", "Servicio", "Referencia", "Importe", "Cuenta"];
    const grid: Grid = {
      ...g([MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["02/07/2026", "Y", "-1,00", null, "8,00"], ANNEX, ["02/07/2026", "A", "R", "1,00"], other, ["03/07/2026", "S", "R", "2,00", "C"]]),
      places: [1, 2, 3, 4, 5, 6, 7].map((line) => ({ page: 1, line, origin: "pdf" as const })),
    };
    const { main, annexes } = splitSections(grid);
    expect(annexes.map((a) => a.rows[0])).toEqual([ANNEX, other]);
    expect(annexes[1].places).toEqual([{ page: 1, line: 6, origin: "pdf" }, { page: 1, line: 7, origin: "pdf" }]);
    expect(main.places).toEqual(grid.places);
  });

  it("un encabezado con menos de tres rótulos no abre sección", () => {
    const grid = g([MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["TOTAL COBRADO", "TOTAL DEV"], ["1,00", "0,00"]]);
    expect(splitSections(grid).annexes).toEqual([]);
  });

  it("una fila intercalada con rótulos pero sin fecha no abre sección: la tabla queda entera", () => {
    const grid = g([
      MAIN,
      ["01/07/2026", "X", "-1,00", null, "9,00"],
      ["Débito", "Crédito", "Débito"],
      ["02/07/2026", "Y", "-1,00", null, "8,00"],
      ["03/07/2026", "Z", "-1,00", null, "7,00"],
      ["04/07/2026", "W", "-1,00", null, "6,00"],
    ]);
    expect(splitSections(grid)).toEqual({ main: grid, annexes: [] });
  });

  describe("qué sección es la tabla", () => {
    const NO_BALANCE = ["Fecha", "Concepto", "Debito", "Credito"];
    const data = (n: number, day = 1): Cell[][] => Array.from({ length: n }, (_, k) => [`0${day + k}/07/2026`, "X", "-1,00", null, "9,00"]);

    it("gana la que tiene más filas de datos, aunque la otra traiga saldo", () => {
      const grid = g([MAIN, ...data(1), NO_BALANCE, ...data(3)]);
      const { main, annexes } = splitSections(grid);
      expect(main.rows.slice(0, 2)).toEqual([[], []]);
      expect(annexes).toHaveLength(1);
      expect(annexes[0].rows[0]).toEqual(MAIN);
    });
    it("con las mismas filas de datos gana la que trae saldo, en cualquier orden", () => {
      const a = g([NO_BALANCE, ...data(2), MAIN, ...data(2)]);
      expect(splitSections(a).annexes[0].rows[0]).toEqual(NO_BALANCE);
      const b = g([MAIN, ...data(2), NO_BALANCE, ...data(2)]);
      expect(splitSections(b).annexes[0].rows[0]).toEqual(NO_BALANCE);
    });
    it("las filas de la misma forma suman aunque estén separadas", () => {
      const g2 = g([NO_BALANCE, ...data(2), ANNEX, ...data(3), NO_BALANCE, ...data(2)]);
      const { main, annexes } = splitSections(g2);
      expect(annexes).toHaveLength(1);
      expect(annexes[0].rows[0]).toEqual(ANNEX);
      expect(main.rows[0]).toEqual(NO_BALANCE);
    });
    it.each([
      ["solo una fecha", ["01/07/2026"]],
      ["solo importes", ["1,00", "2,00"]],
      ["una fecha y texto", ["01/07/2026", "texto"]],
      ["texto e importe", ["texto", "1,00"]],
      ["celdas vacías", [null, null]],
    ] as Array<[string, Cell[]]>)("una fila con %s no pesa como fila de datos", (_, junk) => {
      const grid = g([MAIN, junk, junk, junk, NO_BALANCE, ...data(2)]);
      expect(splitSections(grid).annexes[0].rows[0]).toEqual(MAIN);
    });
    it("un importe numérico con una fecha es una fila de datos", () => {
      const grid = g([MAIN, ["01/07/2026", "X", -1, null, 9], ["02/07/2026", "X", -1, null, 9], NO_BALANCE, ...data(1)]);
      expect(splitSections(grid).annexes[0].rows[0]).toEqual(NO_BALANCE);
    });
  });

  it("dos encabezados seguidos de la misma forma son un solo anexo", () => {
    const grid = g([MAIN, ...Array.from({ length: 3 }, () => ["01/07/2026", "X", "-1,00", null, "9,00"]), ANNEX, ["02/07/2026", "A", "R", "1,00"], ANNEX, ["03/07/2026", "B", "R", "2,00"]]);
    const { annexes } = splitSections(grid);
    expect(annexes).toHaveLength(1);
    expect(annexes[0].rows).toHaveLength(4);
  });

  it("una fila con fecha y menos de tres rótulos reconocidos no abre sección", () => {
    const grid = g([MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["Fecha", "zzz", "yyy"], ...Array.from({ length: 3 }, () => ["02/07/2026", "Y", "-1,00", null, "8,00"])]);
    expect(splitSections(grid).annexes).toEqual([]);
  });

  it("un bloque de título con fechas y sin importe no abre sección: la fila con el CBU queda en la tabla", () => {
    const title = ["Fecha desde", "Fecha hasta", "Cuenta", "CBU"];
    const grid = g([title, ["Julio", "2026", "123", "0170001500000123456784"], MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["02/07/2026", "Y", "-1,00", null, "8,00"]]);
    expect(splitSections(grid)).toEqual({ main: grid, annexes: [] });
  });

  it("el CBU del bloque de título sigue a la vista de la lectura de la cuenta", () => {
    const CBU = "0170001500000123456784";
    const grid = g([["Fecha desde", "Fecha hasta", "Cuenta", "CBU"], ["Julio", "2026", "123", CBU], MAIN, ["01/07/2026", "X", "-1,00", null, "9,00"], ["02/07/2026", "Y", "-1,00", null, "8,00"]]);
    const { main } = splitSections(grid);
    const rows = judge(main, readTable(main)!, catalog.synonyms.nonMovements, null)!.rows;
    expect(cbusOutsideMovements(main, rows)).toEqual([CBU]);
  });
});
