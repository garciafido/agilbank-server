import { balancesOf, bankOf, cbusOutsideMovements, hasLabeledBalanceColumn } from "../src/header";
import { catalog, type Catalog } from "../src/catalog/catalog";
import { readTable } from "../src/columns";
import { judge } from "../src/judge";
import type { Cell, Grid } from "../src/types";

const grid = (rows: Cell[][]): Grid => ({ origin: "cell", sheet: "H", rows });
const NON = catalog.synonyms.nonMovements;
const CBU_A = "1910018600001234567891";
const CBU_B = "0140007600009876543219";
/** Un CBU válido de un banco que no está en la tabla. */
const CBU_NACION = "0110001300001234567891";

describe("bankOf", () => {
  it("por los tres primeros dígitos del CBU", () => {
    expect(bankOf(CBU_A, null, catalog)).toEqual({ code: "191", name: "Banco Credicoop Cooperativo Limitado" });
    expect(bankOf(CBU_B, "credicoop", catalog)?.code).toBe("014");
  });

  it("con un CBU válido de un banco que no está en la tabla, el código del CBU y sin nombre, aunque el nombre diga otro banco", () => {
    expect(bankOf(CBU_NACION, null, catalog)).toEqual({ code: "011", name: null });
    expect(bankOf(CBU_NACION, "Banco Credicoop Central", catalog)).toEqual({ code: "011", name: null });
  });

  it("con un CBU cuyos verificadores no validan, el código sale igual de sus tres primeros dígitos", () => {
    expect(bankOf("1910018600001234567890", null, catalog)).toEqual({ code: "191", name: "Banco Credicoop Cooperativo Limitado" });
    expect(bankOf("9990000000000000000000", "Banco Credicoop Central", catalog)).toEqual({ code: "999", name: null });
    expect(bankOf("191", null, catalog)?.code).toBe("191");
  });

  it("sin tres cifras adelante, o con el banco 000 de los ceros de relleno, por el nombre", () => {
    expect(bankOf("0000000000000000000000", "Banco Credicoop Central", catalog)?.code).toBe("191");
    expect(bankOf("0001234", null, catalog)).toBeNull();
    expect(bankOf("19", "Banco de Galicia", catalog)?.code).toBe("007");
  });

  it("sin CBU, por el nombre; sin nombre ni CBU, nada", () => {
    expect(bankOf(null, "BANCO CREDICOOP CENTRAL", catalog)?.code).toBe("191");
    expect(bankOf(null, "Banco de Galicia", catalog)?.code).toBe("007");
    expect(bankOf(null, null, catalog)).toBeNull();
    expect(bankOf(null, "   ", catalog)).toBeNull();
    expect(bankOf(null, "Banco Desconocido", catalog)).toBeNull();
  });

  it("el alias es una palabra entera, no un pedazo", () => {
    expect(bankOf(null, "Credicooperativa del Sur", catalog)).toBeNull();
  });

  it("gana el alias más largo", () => {
    const c: Catalog = {
      ...catalog,
      banks: [
        { code: "001", name: "Uno", cuit: null, aliases: ["provincia"] },
        { code: "002", name: "Dos", cuit: null, aliases: ["provincia de buenos aires"] },
      ],
    };
    expect(bankOf(null, "Banco de la Provincia de Buenos Aires", c)?.code).toBe("002");
  });
});

describe("cbusOutsideMovements", () => {
  const read = (rows: Cell[][]) => {
    const g = grid(rows);
    const t = readTable(g)!;
    return { g, rows: judge(g, t, NON, null)!.rows };
  };

  it("junta los del título y del pie, una vez cada uno, y no los de los movimientos", () => {
    const { g, rows } = read([
      [`Cuenta ${CBU_A}`],
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", `Transf a ${CBU_B}`, "100,00", "1.100,00"],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      [`CBU ${CBU_A} y ${CBU_A}`],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([CBU_A]);
  });

  it("solo mira antes del primer movimiento y después del último: un CBU suelto entre movimientos no cuenta", () => {
    const { g, rows } = read([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      [`CBU ORIGEN ${CBU_B}`],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([]);
  });

  it("el CBU de la última fila de un movimiento es del movimiento, no del pie", () => {
    const { g, rows } = read([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      ["02/07/2026", `Transf a ${CBU_B}`, "-10,00", "1.090,00"],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([]);
  });

  it("el título y el pie cuentan, y en el orden del archivo", () => {
    const { g, rows } = read([
      [`Cuenta ${CBU_A}`],
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      [`CBU ${CBU_B}`],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([CBU_A, CBU_B]);
  });

  it("un número de 22 cifras que no es un CBU no cuenta", () => {
    const { g, rows } = read([
      ["Cuenta 1910018600001234567890"],
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([]);
  });

  it("un CBU en la fila de continuación de un movimiento es del movimiento, no de la cuenta del archivo", () => {
    const { g, rows } = read([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      [null, `Ref ${CBU_B}`, null, null],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
    ]);
    expect(cbusOutsideMovements(g, rows)).toEqual([]);
  });
});

describe("hasLabeledBalanceColumn", () => {
  const table = (rows: Cell[][]) => {
    const g = grid(rows);
    return { g, t: readTable(g)! };
  };

  it("hay una columna rotulada saldo en alguna manera de leer la tabla", () => {
    const { g, t } = table([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Uno", "100,00", "777,00"],
      ["02/07/2026", "Dos", "-10,00", "5,00"],
    ]);
    expect(hasLabeledBalanceColumn(g, t)).toBe(true);
  });

  it("sin rótulo de saldo, no", () => {
    const { g, t } = table([
      ["Fecha", "Concepto", "Importe", "Otra"],
      ["01/07/2026", "Uno", "100,00", "777,00"],
      ["02/07/2026", "Dos", "-10,00", "5,00"],
    ]);
    expect(hasLabeledBalanceColumn(g, t)).toBe(false);
  });

  it("sin encabezado, no", () => {
    const { g, t } = table([
      ["01/07/2026", "Uno", "100,00", "777,00"],
      ["02/07/2026", "Dos", "-10,00", "5,00"],
    ]);
    expect(t.headerRow).toBeNull();
    expect(hasLabeledBalanceColumn(g, t)).toBe(false);
  });
});

describe("balancesOf", () => {
  const judged = (rows: Cell[][]) => {
    const g = grid(rows);
    return judge(g, readTable(g)!, NON, null)!;
  };

  it("los impresos mandan sobre los derivados", () => {
    const j = judged([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["Saldo anterior", null, null, "900,00"],
      ["01/07/2026", "Uno", "100,00", "1.100,00"],
      ["02/07/2026", "Dos", "-10,00", "1.090,00"],
      ["Saldo final", null, null, "5.000,00"],
    ]);
    expect(balancesOf(j)).toEqual({ openingCents: 90000, closingCents: 500000 });
  });

  it("sin saldos de fila ni impresos, ninguno", () => {
    const j = judged([
      ["Fecha", "Concepto", "Importe"],
      ["01/07/2026", "Uno", "100,00"],
      ["02/07/2026", "Dos", "-10,00"],
    ]);
    expect(balancesOf(j)).toEqual({ openingCents: null, closingCents: null });
  });

  it("deriva de la primera y la última fila con saldo, sumando las filas sin saldo de las puntas", () => {
    const j = judged([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Uno", "100,00", null],
      ["02/07/2026", "Dos", "50,00", "1.150,00"],
      ["03/07/2026", "Tres", "-10,00", "1.140,00"],
      ["04/07/2026", "Cuatro", "-20,00", null],
    ]);
    expect(balancesOf(j)).toEqual({ openingCents: 100000, closingCents: 112000 });
  });
});
