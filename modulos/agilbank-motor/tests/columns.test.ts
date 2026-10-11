import { readTable, roleOf, type Interpretation } from "../src/columns";
import type { Cell, Grid } from "../src/types";

const grid = (rows: Cell[][]): Grid => ({ origin: "cell", sheet: "H", rows });
const shapes = (i: Interpretation[]) => i.map((x) => ({ amount: x.amount, balance: x.balance }));

describe("readTable", () => {
  it("una planilla como la de Credicoop: columna A vacía, encabezado, fechas como texto", () => {
    const t = readTable(
      grid([
        [null, "Fecha", "Concepto", "Nro.Cpbte.", "Débito", "Crédito", "Saldo", "Cód."],
        [null, "31/07/2026", "IVA - Alicuota Inscripto", 0, 2100, 0, 1512345.6, "IVA08"],
        [null, "31/07/2026", "Com. mantenimiento cuenta", 100001, 10000, 0, 1514445.6, 500],
        [null, "30/07/2026", "Transf. Interbanking - Distinto Titular", 100002, 0, 1000000, 1524445.6, 974],
      ]),
    );
    expect(t).not.toBeNull();
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(1);
    const i = t!.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    expect(i).toMatchObject({ date: 1, concept: 2, reference: 3, code: 7, headerSupport: 3 });
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "debit-credit", debit: 5, credit: 4 }, balance: 6 });
  });

  it("encuentra la tabla después de títulos y filas en blanco", () => {
    const t = readTable(
      grid([
        ["Banco de Ejemplo S.A."],
        ["Extracto de cuenta corriente"],
        [null],
        ["Período: julio 2026"],
        [null],
        ["Fecha", "Descripción", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "1.000,00", "11.000,00"],
        ["02/07/2026", "Comision", "-12,10", "10.987,90"],
      ]),
    );
    expect(t!.headerRow).toBe(5);
    expect(t!.interpretations[0]).toMatchObject({ date: 0, concept: 1 });
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "signed", column: 2 }, balance: 3 });
  });

  it("sin encabezado, toma el concepto por el texto más largo y propone el importe con signo", () => {
    const t = readTable(
      grid([
        ["01/07/2026", "Transferencia recibida de un cliente", "1000,00"],
        ["02/07/2026", "Comision por transferencia", "-12,10"],
      ]),
    );
    expect(t!.headerRow).toBeNull();
    expect(t!.interpretations).toEqual([expect.objectContaining({ concept: 1, amount: { shape: "signed", column: 2 }, balance: null })]);
  });

  it("una sola columna de importes, todos positivos y sin saldo: no hay cómo saber el signo", () => {
    const t = readTable(
      grid([
        ["Fecha de pago", "Razón Social", "Monto"],
        ["2025-10-02", "Proveedor Uno S.R.L", "1500.50"],
        ["2025-10-02", "Proveedor Dos S.A", "2750.25"],
      ]),
    );
    expect(t!.interpretations).toEqual([]);
  });

  it("interpreta importes escritos como texto en formato argentino", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Débitos", "Créditos"],
        ["04/05/2026", "IMPUESTO DEBITO - LEY 25413", "12.345,67", null],
        ["04/05/2026", "TRANSF DE EMPRESA EJEMPLO SA (30123456781)", null, "234.567,89"],
      ]),
    );
    const i = t!.interpretations.find((x) => x.headerSupport === 2)!;
    expect(i.amount).toEqual({ shape: "debit-credit", debit: 2, credit: 3 });
    expect(i.formats[2]).toBe("ar");
  });

  it("como el Galicia por otro canal: débito y crédito, importe con signo y el saldo una vez por día", () => {
    const t = readTable(
      grid([
        ["Concepto/Cod.Op.", "Fecha", "Comprobante", "Debito", "Credito", "Importe", "CUIT", "Saldo"],
        [null, null, null, null, null, null, null, 5000000],
        ["FA.DATANET", "05/08/2025", "1000001", 0, 100000, -100000, "30123456781", null],
        ["TRANS P PR", "07/08/2025", "1000002", 20000000, 0, 20000000, "30234567892", 4900000],
      ]),
    );
    const s = shapes(t!.interpretations);
    expect(s).toContainEqual({ amount: { shape: "signed", column: 5 }, balance: 7 });
    expect(s).toContainEqual({ amount: { shape: "debit-credit", debit: 4, credit: 3 }, balance: 7 });
    expect(t!.interpretations[0]).toMatchObject({ concept: 0, reference: 2, extras: [6] });
  });

  it("una columna de débitos vacía en todas las filas sigue siendo la de débitos", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Débito", "Crédito"],
        ["01/07/2026", "Transf recibida", null, "100,00"],
        ["02/07/2026", "Transf recibida", null, "50,00"],
      ]),
    );
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "debit-credit", debit: 2, credit: 3 }, balance: null });
  });

  it("sin ninguna fecha no hay tabla", () => {
    expect(readTable(grid([["Concepto", "Importe"], ["algo", "10"]]))).toBeNull();
  });
});

describe("readTable: la tabla empieza donde empieza la corrida de fechas", () => {
  const credicoop = (): Cell[][] => [
    [null, "Fecha", "Concepto", "Nro.Cpbte.", "Débito", "Crédito", "Saldo", "Cód."],
    [null, "31/07/2026", "IVA - Alicuota Inscripto", 0, 2100, 0, 1512345.6, "IVA08"],
    [null, "31/07/2026", "Com. mantenimiento cuenta", 100001, 10000, 0, 1514445.6, 500],
    [null, "30/07/2026", "Transf. Interbanking - Distinto Titular", 100002, 0, 1000000, 1524445.6, 974],
  ];

  it("una fecha en el bloque de título no esconde el encabezado", () => {
    const t = readTable(grid([["Fecha de emisión:", "10/08/2026"], [null], ...credicoop()]));
    expect(t).not.toBeNull();
    expect(t!.headerRow).toBe(2);
    expect(t!.firstRow).toBe(3);
    const i = t!.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    expect(i).toMatchObject({ date: 1, concept: 2, reference: 3, code: 7, headerSupport: 3 });
  });

  it("la fecha del título no se cuenta como un movimiento", () => {
    const t = readTable(grid([["Fecha de emisión:", "10/08/2026"], [null], ...credicoop()]));
    expect(t!.interpretations.length).toBeGreaterThan(0);
    expect(t!.firstRow).toBe(3);
  });

  it("un extracto de un solo movimiento con una fecha de título también se lee", () => {
    const t = readTable(grid([["Fecha de emisión:", "10/08/2026"], [null], ...credicoop().slice(0, 2)]));
    expect(t!.headerRow).toBe(2);
    expect(t!.firstRow).toBe(3);
  });

  const continuations = (n: number): Cell[][] =>
    Array.from({ length: n }, (_, i): Cell[] => [null, null, `continúa la operación anterior, línea ${i + 1}`]);
  const withContinuations = (n: number): Cell[][] => {
    const [header, first, second, third] = credicoop();
    return [header, first, ...continuations(n), second, third];
  };

  it.each([3, 5])("un primer renglón con %i líneas de continuación abre la tabla y no pierde el encabezado", (n) => {
    const t = readTable(grid(withContinuations(n)));
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(1);
    const i = t!.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    expect(i).toMatchObject({ date: 1, concept: 2, reference: 3, code: 7, headerSupport: 3 });
  });

  it("una fecha de título y un primer renglón con líneas de continuación: la tabla empieza en el renglón", () => {
    const t = readTable(grid([["Fecha de emisión:", "10/08/2026"], [null], ...withContinuations(4)]));
    expect(t!.headerRow).toBe(2);
    expect(t!.firstRow).toBe(3);
  });

  it("dos fechas de título («desde» y «hasta») antes del encabezado: la tabla empieza en el primer movimiento", () => {
    const t = readTable(grid([["Fecha desde:", "01/07/2026"], ["Fecha hasta:", "31/07/2026"], [null], ...credicoop()]));
    expect(t!.headerRow).toBe(3);
    expect(t!.firstRow).toBe(4);
    const i = t!.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    expect(i).toMatchObject({ date: 1, concept: 2, reference: 3, code: 7, headerSupport: 3 });
  });

  it("un encabezado repetido (otra página) no hace perder el primer movimiento", () => {
    const [header, m1, m2, m3] = credicoop();
    const t = readTable(grid([header, m1, header, m2, m3]));
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(1);
    const i = t!.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    expect(i).toMatchObject({ concept: 2, headerSupport: 3 });
  });

  it("sin encabezado, un movimiento cuyo texto tiene dos palabras de rótulo no se toma por encabezado", () => {
    const t = readTable(
      grid([
        ["01/07/2026", "Debito automatico", "Cuenta 191-001", "-120,00"],
        ["02/07/2026", "Transferencia recibida de un cliente", "Cuenta 191-002", "1000,00"],
        ["03/07/2026", "Comision por transferencia", "Cuenta 191-003", "-12,10"],
      ]),
    );
    expect(t!.headerRow).toBeNull();
    expect(t!.firstRow).toBe(0);
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "signed", column: 3 }, balance: null });
  });

  it("un encabezado con menos de dos rótulos no se completa con una fila lejana", () => {
    const t = readTable(
      grid([
        ["Cuenta", "0001-1", "CBU", "0170000000000000000001"],
        [null],
        ["Movimientos"],
        [null],
        ["Fecha", "Texto libre", "Valor", "Total"],
        ["01/07/2026", "Transferencia recibida de un cliente", "1000,00", "11000,00"],
        ["02/07/2026", "Comision por transferencia", "-12,10", "10987,90"],
      ]),
    );
    expect(t).not.toBeNull();
    expect(t!.headerRow).toBeNull();
    expect(t!.firstRow).toBe(5);
    expect(t!.interpretations.every((x) => x.account === null)).toBe(true);
  });
});

describe("readTable: la referencia", () => {
  const galicia = (): Cell[][] => [
    ["Concepto/Cod.Op.", "Fecha", "Número de Terminal", "Número de Comprobante", "Debito", "Credito", "Importe", "Saldo"],
    [null, null, null, null, null, null, null, 5000000],
    ["FA.DATANET", "05/08/2025", 1, 1000001, 0, 100000, -100000, null],
    ["TRANS P PR", "07/08/2025", 1, 1000002, 20000000, 0, 20000000, 4900000],
    ["COMISION", "08/08/2025", 2, 1000003, 12.1, 0, 12.1, 4899987.9],
  ];

  it("terminal y sucursal son auxiliares, no referencias", () => {
    expect(roleOf("Número de Terminal")).toBe("auxiliary");
    expect(roleOf("Sucursal")).toBe("auxiliary");
    expect(roleOf("Número de Comprobante")).toBe("reference");
  });

  it("la referencia es el comprobante y no la terminal, que va a los extras", () => {
    const t = readTable(grid(galicia()));
    expect(t!.interpretations.length).toBeGreaterThan(0);
    for (const i of t!.interpretations) {
      expect(i.reference).toBe(3);
      expect(i.extras).toContain(2);
      const used = i.amount.shape === "signed" ? [i.amount.column] : [i.amount.debit, i.amount.credit];
      expect(used).not.toContain(2);
      expect(i.balance).not.toBe(2);
    }
  });

  it("entre varias columnas de referencia gana la de más valores distintos", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Comprobante", "Secuencia", "Débito", "Crédito"],
        ["01/07/2026", "Transf recibida", "A1", "X1", null, "100,00"],
        ["02/07/2026", "Transf recibida", "A1", "X2", null, "50,00"],
        ["03/07/2026", "Comision", "A1", "X3", "12,10", null],
      ]),
    );
    expect(t!.interpretations[0].reference).toBe(3);
  });
});

describe("readTable: la columna de importes con un solo signo", () => {
  it("todos negativos y con saldo: se propone el importe con signo con ese saldo", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Comision", "-10,00", "990,00"],
        ["02/07/2026", "Impuesto", "-20,00", "970,00"],
      ]),
    );
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "signed", column: 2 }, balance: 3 });
  });

  it("todos positivos y con saldo: también se propone, el saldo dirá si el signo es ese", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "10,00", "1010,00"],
        ["02/07/2026", "Transf recibida", "20,00", "1030,00"],
      ]),
    );
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "signed", column: 2 }, balance: 3 });
  });

  it("una columna sin ningún valor no se propone como importe con signo", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Débito", "Crédito"],
        ["01/07/2026", "Transf recibida", null, "100,00"],
        ["02/07/2026", "Transf recibida", null, "50,00"],
      ]),
    );
    expect(shapes(t!.interpretations).filter((x) => x.amount.shape === "signed" && x.amount.column === 2)).toEqual([]);
  });
});

describe("readTable: archivos grandes", () => {
  it("200.000 filas de texto no desbordan la pila", () => {
    const rows: Cell[][] = Array.from({ length: 200_000 }, (_, i) => [
      `${String(1 + (i % 28)).padStart(2, "0")}/07/2026`,
      `Movimiento ${i}`,
      i % 2 === 0 ? "1000,00" : "-12,10",
    ]);
    let t: ReturnType<typeof readTable> = null;
    expect(() => {
      t = readTable(grid(rows));
    }).not.toThrow();
    expect(t!.interpretations).toEqual([expect.objectContaining({ concept: 1, amount: { shape: "signed", column: 2 }, balance: null })]);
  }, 20_000);
});

describe("readTable: el tope de columnas candidatas", () => {
  const used = (i: Interpretation): number[] => [
    ...(i.amount.shape === "signed" ? [i.amount.column] : [i.amount.debit, i.amount.credit]),
    ...(i.balance === null ? [] : [i.balance]),
  ];

  it("20 columnas numéricas sin rótulo: a lo sumo 6x6 + 6x5x5 interpretaciones, con las 6 más llenas", () => {
    const columns = 20;
    const full = [16, 17, 18, 19, 20, 21];
    const rows: Cell[][] = Array.from({ length: 6 }, (_, r) => [
      `0${r + 1}/07/2026`,
      `Movimiento número ${r}`,
      ...Array.from({ length: columns }, (_, c): Cell => (full.includes(c + 2) || r % 2 === 0 ? (r + c) % 3 === 0 ? -(r + c + 1) : r + c + 1 : null)),
    ]);
    const t = readTable(grid(rows));
    expect(t!.interpretations.length).toBeGreaterThan(0);
    expect(t!.interpretations.length).toBeLessThanOrEqual(6 * 6 + 6 * 5 * 5);
    const columnsUsed = new Set(t!.interpretations.flatMap(used));
    expect([...columnsUsed].every((c) => full.includes(c))).toBe(true);
  });

  it("20 columnas numéricas con 3 rotuladas: se usan solo las rotuladas", () => {
    const rows: Cell[][] = [
      ["Fecha", "Concepto", "Débito", "Crédito", "Saldo", ...Array.from({ length: 17 }, (_, c) => `Col ${c}`)],
      ...Array.from({ length: 4 }, (_, r): Cell[] => [
        `0${r + 1}/07/2026`,
        `Movimiento número ${r}`,
        r % 2 === 0 ? 100 + r : 0,
        r % 2 === 0 ? 0 : 50 + r,
        1000 - r,
        ...Array.from({ length: 17 }, (_, c): Cell => ((r + c) % 3 === 0 ? -(r + c + 1) : r + c + 1)),
      ]),
    ];
    const t = readTable(grid(rows));
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "debit-credit", debit: 2, credit: 3 }, balance: 4 });
    for (const i of t!.interpretations) expect(used(i).every((c) => [2, 3, 4].includes(c))).toBe(true);
  });
});

describe("roleOf: qué dice cada rótulo", () => {
  it.each([
    ["Fecha", "date"],
    ["Fec.", "date"],
    ["FECHA OPERACION", "date"],
    ["Fecha valor", "valueDate"],
    ["F. Valor", "valueDate"],
    ["F Valor", "valueDate"],
    ["FechaValor", "valueDate"],
    ["Concepto", "concept"],
    ["Descripción", "description"],
    ["Detalle", "description"],
    ["Leyenda", "description"],
    ["Cuenta", "account"],
    ["CBU", "account"],
    ["Nro. de cuenta", "account"],
    ["Nro de cuenta", "account"],
    ["Número de cuenta", "account"],
    ["Débito", "debit"],
    ["Debe", "debit"],
    ["Crédito", "credit"],
    ["Haber", "credit"],
    ["Saldo", "balance"],
    ["Importe", "amount"],
    ["Monto", "amount"],
    ["Terminal", "auxiliary"],
    ["Sucursal", "auxiliary"],
    ["Comprobante", "reference"],
    ["Nro.Cpbte.", "reference"],
    ["Nro", "reference"],
    ["Cód.", "code"],
    ["CUIT", "party"],
    ["Razón social", "party"],
    ["Nombre", "party"],
  ])("«%s» es %s", (header, role) => {
    expect(roleOf(header)).toBe(role);
  });

  it.each([
    ["  Fecha", "date"],
    [" Debe ", "debit"],
    ["Haber  ", "credit"],
    ["  Cód.", "code"],
  ])("los espacios alrededor no cambian el rótulo: «%s»", (header, role) => {
    expect(roleOf(header)).toBe(role);
  });

  it.each([
    ["Saldo a la fecha", "balance"],
    ["Saldo fecha valor", "balance"],
    ["Saldo en cuenta", "balance"],
    ["Importe por concepto", "amount"],
  ])("la palabra de rótulo en medio del texto no manda: «%s» es %s", (header, role) => {
    expect(roleOf(header)).toBe(role);
  });

  it.each(["Haberes", "Observaciones", "Tipo", "Total haber", "Total debe", "Debe/Haber", ""])("«%s» no dice nada", (header) => {
    expect(roleOf(header)).toBeNull();
  });
});

describe("readTable: dónde está el encabezado", () => {
  const movements = (): Cell[][] => [
    ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
    ["02/07/2026", "Comision", "-12,10", "10.987,90"],
  ];

  it("una fila de título sin rótulos y una fecha de título en la columna de fechas: la tabla empieza después del encabezado", () => {
    const t = readTable(
      grid([
        ["Banco de Ejemplo", null, null, null, null],
        ["Período desde", "01/07/2026", null, null, null],
        ["Nro", "Fecha", "Concepto", "Importe", "Saldo"],
        ["1", "01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
        ["2", "02/07/2026", "Comision", "-12,10", "10.987,90"],
      ]),
    );
    expect(t!.headerRow).toBe(2);
    expect(t!.firstRow).toBe(3);
  });

  it("un encabezado con exactamente dos rótulos alcanza", () => {
    const t = readTable(grid([["Fecha", "Movimiento", "Importe", "Total acumulado"], ...movements()]));
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(1);
  });

  it("un encabezado con dos rótulos deja afuera la fecha del título que tiene arriba", () => {
    const t = readTable(
      grid([
        ["Período desde", "01/07/2026", null, null, null],
        ["Ref", "Fecha", "Movimiento", "Importe", "Total acumulado"],
        ["1", "01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
        ["2", "02/07/2026", "Comision", "-12,10", "10.987,90"],
      ]),
    );
    expect(t!.headerRow).toBe(1);
    expect(t!.firstRow).toBe(2);
  });

  it("con un solo rótulo no hay encabezado", () => {
    const t = readTable(grid([["Fecha", "Movimiento", "Valor", "Total acumulado"], ...movements()]));
    expect(t!.headerRow).toBeNull();
  });

  it("el saldo inicial escrito como texto argentino, entre el encabezado y el primer movimiento, no corta la búsqueda", () => {
    const t = readTable(grid([["Fecha", "Concepto", "Importe", "Saldo"], [null, "Saldo anterior", null, "10.000,00"], ...movements()]));
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(2);
  });

  it("el saldo inicial escrito como texto en formato inglés tampoco", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        [null, "Saldo anterior", null, "10,000.00"],
        ["01/07/2026", "Transf. recibida", "1,000.00", "11,000.00"],
        ["02/07/2026", "Comision", "-12.10", "10,987.90"],
      ]),
    );
    expect(t!.headerRow).toBe(0);
  });

  it("un texto que no es un importe en la fila de arriba no es un saldo inicial: ahí se corta la búsqueda", () => {
    const t = readTable(grid([["Fecha", "Concepto", "Importe", "Saldo"], [null, "Nota 3A", null, "pendiente"], ...movements()]));
    expect(t!.headerRow).toBeNull();
  });

  it("las filas en blanco entre el encabezado y el primer movimiento se saltean", () => {
    const t = readTable(grid([["Fecha", "Concepto", "Importe", "Saldo"], [null, null, null, null], ...movements()]));
    expect(t!.headerRow).toBe(0);
    expect(t!.firstRow).toBe(2);
  });
});

describe("readTable: la fecha de valor", () => {
  const valueDated = (rows: Cell[][]): ReturnType<typeof readTable> =>
    readTable(grid([["Fecha", "Fecha valor", "Concepto", "Importe", "Saldo"], ...rows]));

  it("la segunda columna de fechas es la fecha de valor, no un texto más", () => {
    const t = valueDated([
      ["01/07/2026", "02/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", "03/07/2026", "Comision", "-12,10", "10.987,90"],
    ]);
    expect(t!.interpretations[0]).toMatchObject({ date: 0, valueDate: 1, concept: 2, extras: [] });
  });

  it("alcanza con que la tenga la mitad de los movimientos", () => {
    const t = valueDated([
      ["01/07/2026", "02/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", null, "Comision", "-12,10", "10.987,90"],
      ["03/07/2026", "04/07/2026", "Comision", "-12,10", "10.975,80"],
      ["04/07/2026", null, "Comision", "-12,10", "10.963,70"],
    ]);
    expect(t!.interpretations[0].valueDate).toBe(1);
  });

  it("con menos de la mitad no es una fecha de valor", () => {
    const t = valueDated([
      ["01/07/2026", "02/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", null, "Comision", "-12,10", "10.987,90"],
      ["03/07/2026", null, "Comision", "-12,10", "10.975,80"],
    ]);
    expect(t!.interpretations[0].valueDate).toBeNull();
  });

  it("sin una segunda columna de fechas no hay fecha de valor", () => {
    const t = readTable(grid([["Fecha", "Concepto", "Importe", "Saldo"], ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"], ["02/07/2026", "Comision", "-12,10", "10.987,90"]]));
    expect(t!.interpretations[0].valueDate).toBeNull();
  });
});

describe("readTable: importes escritos como texto", () => {
  it("en formato inglés: la columna se lee con punto decimal", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf. recibida", "1,000.00", "11,000.00"],
        ["02/07/2026", "Comision", "-12.10", "10,987.90"],
      ]),
    );
    expect(t!.interpretations[0].formats[2]).toBe("us");
    expect(t!.interpretations[0].formats[3]).toBe("us");
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "signed", column: 2 }, balance: 3 });
  });

  it("una columna en la que justo la mitad de los valores son importes es una columna de importes", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Mixta"],
        ["01/07/2026", "Transf. recibida", "1.000,00", "2.500,00"],
        ["02/07/2026", "Comision", "-12,10", "sin dato"],
        ["03/07/2026", "Comision", "-12,10", "3.100,00"],
        ["04/07/2026", "Comision", "-12,10", "sin dato"],
      ]),
    );
    expect(t!.interpretations.some((i) => i.balance === 3)).toBe(true);
  });

  it("una columna de texto con un solo valor que parece importe sigue siendo de texto", () => {
    const t = readTable(
      grid([
        ["01/07/2026", "Transferencia recibida", "1.000,00"],
        ["02/07/2026", "Comision", "-12,10"],
        ["03/07/2026", "Debito automatico", "-8,00"],
        ["04/07/2026", "Pago de servicios", "-50,00"],
        ["05/07/2026", "12345", "-5,00"],
      ]),
    );
    expect(t).not.toBeNull();
    expect(t!.interpretations[0].concept).toBe(1);
  });

  it("sin ninguna columna de texto no hay concepto y no hay tabla", () => {
    expect(readTable(grid([["01/07/2026", "100,00", "1.000,00"], ["02/07/2026", "-20,00", "980,00"]]))).toBeNull();
  });
});

describe("readTable: las columnas de texto", () => {
  const dated = (n: number): string[] => Array.from({ length: n }, (_, i) => `0${i + 1}/07/2026`);

  it("sin rótulo, el concepto es la columna de texto más larga en promedio, no la más llena ni la rotulada de otra cosa", () => {
    const rows: Cell[][] = dated(4).map((d, r) => [
      d,
      "Transferencia",
      r === 0 ? "Pago de la factura 0001 a proveedor" : null,
      "Ref-00000000000000000000000000000001",
      r % 2 === 0 ? "100,00" : "-20,00",
    ]);
    const t = readTable(grid([["Fecha", "Tipo", "Observaciones", "Referencia", "Importe"], ...rows]));
    expect(t!.interpretations[0]).toMatchObject({ concept: 2, reference: 3 });
  });

  it.each([
    ["la primera tiene más valores distintos", ["A1", "A2", "A3", "A4"], ["X1", "X1", "X1", "X1"], 2],
    ["la segunda tiene más valores distintos", ["A1", "A1", "A1", "A1"], ["X1", "X2", "X3", "X4"], 3],
    ["empatan: gana la primera", ["A1", "A2", "A1", "A2"], ["X1", "X2", "X1", "X2"], 2],
    ["los vacíos no cuentan como un valor distinto", ["A1", "A1", "A1", "A1"], ["X1", null, null, null], 2],
  ])("entre dos columnas de referencia, %s", (_, first, second, expected) => {
    const rows: Cell[][] = dated(4).map((d, r) => [d, "Transferencia recibida", first[r], second[r], r % 2 === 0 ? "100,00" : "-20,00"]);
    const t = readTable(grid([["Fecha", "Concepto", "Nro", "Comprobante", "Importe"], ...rows]));
    expect(t!.interpretations[0].reference).toBe(expected);
  });

  it("el código y la cuenta no son extras: tienen su propio lugar", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Cód.", "Cuenta", "Importe", "Obs"],
        ["01/07/2026", "Transferencia recibida", "974", "0012345678", "100,00", "ejemplo"],
        ["02/07/2026", "Comision", "500", "0012345678", "-20,00", "otro"],
      ]),
    );
    expect(t!.interpretations[0]).toMatchObject({ code: 2, account: 3, extras: [5] });
  });

  it.each([
    ["Cuenta", "account", "00123456"],
    ["Concepto", "concept", "1234567"],
    ["Descripción", "description", "7654321"],
    ["Fecha emisión", "date", "20260701"],
    ["Fecha valor", "valueDate", "20260702"],
  ])("una columna rotulada «%s» no es de importes aunque sus valores parezcan números", (label, _role, value) => {
    const t = readTable(
      grid([
        ["Fecha", label, "Observaciones", "Importe", "Saldo"],
        ["01/07/2026", value, "Transferencia recibida", "1.000,00", "11.000,00"],
        ["02/07/2026", value, "Comision mensual", "-12,10", "10.987,90"],
      ]),
    );
    expect(t).not.toBeNull();
    const amountColumns = new Set(t!.interpretations.flatMap((i) => [i.balance, ...(i.amount.shape === "signed" ? [i.amount.column] : [i.amount.debit, i.amount.credit])]));
    expect(amountColumns.has(1)).toBe(false);
    expect(amountColumns.has(3)).toBe(true);
  });
});

describe("readTable: la columna de importe con signo y la de débito y crédito", () => {
  const dated = (n: number): string[] => Array.from({ length: n }, (_, i) => `${String(1 + i).padStart(2, "0")}/07/2026`);
  const pairs = (a: Cell[], b: Cell[]): Cell[][] => dated(a.length).map((d, r) => [d, "Movimiento de la cuenta", a[r], b[r]]);
  const hasDebitCredit = (rows: Cell[][]): boolean => shapes(readTable(grid(rows))!.interpretations).some((x) => x.amount.shape === "debit-credit");
  const times = <T,>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

  it("débitos con signo menos y créditos con signo más: es un par", () => {
    const t = readTable(grid(pairs(["-100,00", "-50,00", null, null], [null, null, "70,00", "30,00"])));
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "debit-credit", debit: 2, credit: 3 }, balance: null });
  });

  it("un valor del signo contrario en veinte es el cinco por ciento: todavía es un par", () => {
    const debits = [...times(19, "-10,00"), "10,00", ...times(20, null)];
    const credits = [...times(20, null), ...times(20, "10,00")];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(true);
  });

  it("lo mismo del otro lado: diecinueve positivos y uno negativo", () => {
    const debits = [...times(19, "10,00"), "-10,00", ...times(20, null)];
    const credits = [...times(20, null), ...times(20, "10,00")];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(true);
  });

  it("dos en veinte pasan el cinco por ciento: la columna mezcla signos y no es de débitos", () => {
    const debits = [...times(18, "-10,00"), "10,00", "10,00", ...times(20, null)];
    const credits = [...times(20, null), ...times(20, "10,00")];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(false);
  });

  it("una columna con la mitad de cada signo no es de débitos ni de créditos", () => {
    const mixed = ["100,00", "-50,00", null, null];
    const other = [null, null, "30,00", "-20,00"];
    expect(hasDebitCredit(pairs(mixed, other))).toBe(false);
  });

  it("los ceros no cuentan para el signo de la columna", () => {
    const debits = [...times(10, "-10,00"), ...times(10, "0,00")];
    const credits = [...times(10, "0,00"), ...times(10, "10,00")];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(true);
  });

  it("importe y saldo, los dos con valor en todas las filas, no son débito y crédito", () => {
    const amounts = ["100,00", "50,00", "70,00", "30,00"];
    const balances = ["1.100,00", "1.150,00", "1.220,00", "1.250,00"];
    expect(hasDebitCredit(pairs(amounts, balances))).toBe(false);
  });

  it("una fila con valor en las dos columnas de diez es el diez por ciento: todavía es un par", () => {
    const debits = ["10,00", "10,00", "10,00", "10,00", "10,00", null, null, null, null, "10,00"];
    const credits = [null, null, null, null, null, "10,00", "10,00", "10,00", "10,00", "10,00"];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(true);
  });

  it("las filas con las dos columnas en cero no cuentan para el total: dos filas con ambas de diez con valor son demasiadas", () => {
    const debits = ["10,00", "10,00", "10,00", "10,00", "10,00", "10,00", "10,00", "10,00", "10,00", "10,00", ...times(10, "0,00")];
    const credits = [null, null, null, null, null, null, null, null, "10,00", "10,00", ...times(10, "0,00")];
    expect(hasDebitCredit(pairs(debits, credits))).toBe(false);
  });

  it("dos columnas de puros ceros no forman un par", () => {
    expect(hasDebitCredit(pairs(times(4, "0,00"), times(4, "0,00")))).toBe(false);
  });

  it("una sola columna con valores positivos y ceros no alcanza para saber el signo", () => {
    const t = readTable(grid([["01/07/2026", "Pago a un proveedor", "0,00"], ["02/07/2026", "Pago a otro proveedor", "100,00"]]));
    expect(t!.interpretations).toEqual([]);
  });

  it("con una sola columna de importes y un negativo alcanza", () => {
    const t = readTable(grid([["01/07/2026", "Pago a un proveedor", "-50,00"], ["02/07/2026", "Pago a otro proveedor", "100,00"]]));
    expect(shapes(t!.interpretations)).toEqual([{ amount: { shape: "signed", column: 2 }, balance: null }]);
  });
});

describe("readTable: lo que avala el encabezado", () => {
  const support = (amount: number, balance: number | null): number => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Importe", "Saldo", "Otro"],
        ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00", "10,00"],
        ["02/07/2026", "Comision", "-12,10", "10.987,90", "20,00"],
      ]),
    )!;
    return t.interpretations.find((i) => i.amount.shape === "signed" && i.amount.column === amount && i.balance === balance)!.headerSupport;
  };

  it("cada columna en su rol suma uno", () => {
    expect(support(2, 3)).toBe(2);
    expect(support(2, null)).toBe(1);
  });

  it("cada columna rotulada con otro rol resta uno", () => {
    expect(support(3, 2)).toBe(-2);
    expect(support(3, null)).toBe(-1);
  });

  it("una columna sin rótulo ni suma ni resta", () => {
    expect(support(2, 4)).toBe(1);
    expect(support(4, 3)).toBe(1);
    expect(support(4, null)).toBe(0);
  });
});

describe("readTable: el tope de columnas candidatas, los bordes", () => {
  const rowsOf = (columns: number, fill: (r: number, c: number) => Cell): Cell[][] =>
    Array.from({ length: 4 }, (_, r) => [`0${r + 1}/07/2026`, `Movimiento número ${r}`, ...Array.from({ length: columns }, (_, c) => fill(r, c))]);
  const amountOf = (v: number, r: number): Cell => `${v}${r},00`;
  const used = (i: Interpretation): number[] => [
    ...(i.amount.shape === "signed" ? [i.amount.column] : [i.amount.debit, i.amount.credit]),
    ...(i.balance === null ? [] : [i.balance]),
  ];

  it("con exactamente seis columnas numéricas se miran las seis, aunque haya rotuladas", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Débito", "Crédito", "Saldo", "X1", "X2", "X3"],
        ["01/07/2026", "Pago a proveedor", "100,00", null, "900,00", "11,00", "12,00", "13,00"],
        ["02/07/2026", "Cobro de cliente", null, "50,00", "950,00", "21,00", "22,00", "23,00"],
        ["03/07/2026", "Pago a proveedor", "30,00", null, "920,00", "31,00", "32,00", "33,00"],
      ]),
    );
    const columns = new Set(t!.interpretations.flatMap(used));
    expect([...columns].sort()).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("con más de seis, quedan las más llenas, en el orden de las columnas", () => {
    const fill = [2, 3, 3, 3, 3, 3, 4];
    const t = readTable(grid(rowsOf(7, (r, c) => (r < fill[c] ? amountOf(c + 1, r) : null))));
    expect(t!.interpretations[0].amount).toEqual({ shape: "signed", column: 3 });
    const columns = new Set(t!.interpretations.flatMap(used));
    expect(columns.has(2)).toBe(false);
    expect([...columns].sort()).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it("con más de seis y una rotulada «Importe», solo se mira esa", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "X1", "X2", "Importe", "X4", "X5", "X6", "X7"],
        ...rowsOf(7, (r, c) => (c === 2 && r === 1 ? `-5${r},00` : amountOf(c + 1, r))),
      ]),
    );
    expect(shapes(t!.interpretations)).toEqual([{ amount: { shape: "signed", column: 4 }, balance: null }]);
  });
});

describe("readTable: las columnas vacías", () => {
  it("una columna de créditos vacía en todas las filas sigue siendo la de créditos", () => {
    const t = readTable(
      grid([
        ["Fecha", "Concepto", "Débito", "Crédito"],
        ["01/07/2026", "Pago a proveedor", "100,00", null],
        ["02/07/2026", "Pago a proveedor", "50,00", null],
      ]),
    );
    expect(shapes(t!.interpretations)).toContainEqual({ amount: { shape: "debit-credit", debit: 2, credit: 3 }, balance: null });
  });
});
