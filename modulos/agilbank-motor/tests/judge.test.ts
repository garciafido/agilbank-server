import { readTable } from "../src/columns";
import { buildRows } from "../src/rows";
import { chain, directionsFromDates, judge } from "../src/judge";
import { catalog } from "../src/catalog/catalog";
import type { Interpretation } from "../src/columns";
import type { Cell, Grid } from "../src/types";

const grid = (rows: Cell[][]): Grid => ({ origin: "cell", sheet: "H", rows });
const NON = catalog.synonyms.nonMovements;
const run = (g: Grid, known: { openingCents: number; closingCents: number } | null = null) => judge(g, readTable(g)!, NON, known)!;

/** Del más nuevo al más viejo, con la continuación combinada vacía, como Credicoop. */
const CREDICOOP = grid([
  [null, "Fecha", "Concepto", "Nro.Cpbte.", "Débito", "Crédito", "Saldo", "Cód."],
  [null, "31/07/2026", "IVA - Alicuota Inscripto", 0, 2100, 0, 1512345.6, "IVA08"],
  [null, "31/07/2026", "Transferencia por Pago de Haberes Cuenta:001", 100004, 40000, 0, 1514445.6, 110],
  [null, null, null, null, null, null, null, null],
  [null, "30/07/2026", "Transf. Interbanking - Distinto Titular", 100002, 0, 1000000, 1554445.6, 974],
  [null, "30/07/2026", "Com. mantenimiento cuenta", 100001, 10000, 0, 554445.6, 500],
]);

describe("buildRows", () => {
  it("arma un movimiento por fila con fecha e importe, y saltea las filas vacías", () => {
    const t = readTable(CREDICOOP)!;
    const i = t.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 4 && x.balance === 6)!;
    const r = buildRows(CREDICOOP, t, i, NON);
    expect(r.movements.map((m) => m.amountCents)).toEqual([-210000, -4000000, 100000000, -1000000]);
    expect(r.movements[1]).toMatchObject({ concept: "Transferencia por Pago de Haberes Cuenta:001", reference: "100004", code: "110" });
    expect(r.movements[0].reference).toBeNull();
  });

  it("une las filas de continuación al concepto y deja afuera los totales", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["Saldo anterior", null, null, null],
      ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      [null, "CUIT 30234567892 EMPRESA DOS SA", null, null],
      ["02/07/2026", "Comision", "-12,10", "10.987,90"],
      [null, "Total del período", "987,90", null],
    ]);
    const t = readTable(g)!;
    const i = t.interpretations.find((x) => x.balance === 3)!;
    const r = buildRows(g, t, i, NON);
    expect(r.movements).toHaveLength(2);
    expect(r.movements[0].concept).toBe("Transf. recibida CUIT 30234567892 EMPRESA DOS SA");
    expect(r.movements[0].toRow).toBe(3);
    expect(r.excludedRows).toBe(1);
  });

  it("marca como «top» la fila de saldo sin rótulo ni fecha antes del primer movimiento", () => {
    const g = grid([
      ["Concepto", "Fecha", "Importe", "Saldo"],
      [null, null, null, "5.000.000,00"],
      ["FA.DATANET", "05/08/2025", "-100.000,00", null],
      ["IMPUESTO AL DEBITO", "05/08/2025", "-600,00", null],
      ["TRANS P PR", "07/08/2025", "20.000.000,00", "4.899.400,00"],
    ]);
    const t = readTable(g)!;
    const r = buildRows(g, t, t.interpretations.find((x) => x.balance === 3)!, NON);
    expect(r.checkpoints).toEqual([{ row: 1, balanceCents: 500000000, kind: "top" }]);
  });

  it("un movimiento con fecha cuyo concepto empieza con «Total» es un movimiento", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe"],
      ["01/07/2026", "TOTAL AUSTRAL SA - Debito automatico", "-100,00"],
      ["02/07/2026", "Transf recibida", "50,00"],
    ]);
    const t = readTable(g)!;
    expect(buildRows(g, t, t.interpretations[0], NON).movements).toHaveLength(2);
  });
});

describe("buildRows: los bordes", () => {
  const rowsOf = (g: Grid, pick?: (i: Interpretation) => boolean) => {
    const t = readTable(g)!;
    const i = pick ? t.interpretations.find(pick)! : t.interpretations[0];
    return buildRows(g, t, i, NON);
  };

  it("los importes en formato inglés se leen con el formato de su columna", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf. recibida", "1,000.00", "11,000.00"],
      ["02/07/2026", "Comision", "-12.10", "10,987.90"],
    ]);
    const r = rowsOf(g, (i) => i.balance === 3);
    expect(r.movements.map((m) => [m.amountCents, m.balanceCents])).toEqual([[100000, 1100000], [-1210, 1098790]]);
  });

  it("una fila con importe cero no es un movimiento y no deja rastro", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", "Sin importe", "0,00", "11.000,00"],
      ["03/07/2026", "Comision", "-12,10", "10.987,90"],
    ]);
    const r = rowsOf(g, (i) => i.balance === 3);
    expect(r.movements.map((m) => m.concept)).toEqual(["Transf. recibida", "Comision"]);
    expect(r.excludedRows).toBe(0);
    expect(r.checkpoints).toEqual([]);
  });

  it("la referencia, el código y la cuenta vacíos o de puros ceros son null; con otro valor, tal cual", () => {
    const g = grid([
      ["Fecha", "Concepto", "Nro", "Cód.", "Cuenta", "Importe"],
      ["01/07/2026", "Transf. recibida", "007", "00", "0012345", "1.000,00"],
      ["02/07/2026", "Comision", null, "0", "000", "-12,10"],
      ["03/07/2026", "Comision", "000", "500", "0001", "-12,10"],
    ]);
    const r = rowsOf(g);
    expect(r.movements.map((m) => [m.reference, m.code, m.account])).toEqual([
      ["007", null, "0012345"],
      [null, null, null],
      [null, "500", "0001"],
    ]);
  });

  it("lo que está arriba del encabezado no es parte de la tabla: ni sus saldos ni sus rótulos de saldo", () => {
    const g = grid([
      ["Saldo anterior", null, null, "5.000,00"],
      [null, "Resumen", null, "7.000,00"],
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", "Comision", "-12,10", "10.987,90"],
    ]);
    const r = rowsOf(g, (i) => i.balance === 3);
    expect(r.movements).toHaveLength(2);
    expect(r.checkpoints).toEqual([]);
    expect(r.excludedRows).toBe(0);
  });

  it("sin encabezado la primera fila ya es un movimiento", () => {
    const g = grid([
      ["01/07/2026", "Transferencia recibida", "1.000,00"],
      ["02/07/2026", "Comision por transferencia", "-12,10"],
    ]);
    expect(rowsOf(g).movements.map((m) => m.fromRow)).toEqual([0, 1]);
  });

  it("la fecha de valor de cada movimiento, o null si la fila no la trae", () => {
    const g = grid([
      ["Fecha", "Fecha valor", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "02/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ["02/07/2026", null, "Comision", "-12,10", "10.987,90"],
      ["03/07/2026", "04/07/2026", "Comision", "-12,10", "10.975,80"],
    ]);
    expect(rowsOf(g, (i) => i.balance === 4).movements.map((m) => m.valueDate)).toEqual(["2026-07-02", null, "2026-07-04"]);
  });

  describe("los saldos sueltos", () => {
    const cabecera: Cell[] = ["Fecha", "Concepto", "Importe", "Saldo", "Obs"];
    const mov = (d: string, concept: string, amount: string, balance: string | null, obs: string | null = "x"): Cell[] => [d, concept, amount, balance, obs];
    const read = (rows: Cell[][]) => rowsOf(grid([cabecera, ...rows]), (i) => i.balance === 3);

    it("el rótulo de saldo puede estar en cualquier columna, detrás de celdas vacías", () => {
      const r = read([[null, null, null, "10.000,00", "Saldo anterior"], mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00")]);
      expect(r.checkpoints).toEqual([{ row: 1, balanceCents: 1000000, kind: "opening" }]);
    });

    it("«Saldo final» y «Saldo actual» son el saldo final", () => {
      const r = read([
        mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"),
        [null, "Saldo final", null, "11.000,00", null],
        [null, "Saldo actual", null, "12.000,00", null],
      ]);
      expect(r.checkpoints.map((c) => c.kind)).toEqual(["closing", "closing"]);
    });

    it("«Saldo al» no dice cuál es: vale por su posición, como un saldo sin rótulo", () => {
      const r = read([
        [null, "Saldo al 30/06", null, "10.000,00", null],
        mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"),
        [null, "Saldo al 01/07", null, "11.000,00", null],
        mov("02/07/2026", "Comision", "-12,10", "10.987,90"),
        [null, "Saldo al 02/07", null, "10.987,90", null],
      ]);
      expect(r.checkpoints.map((c) => [c.row, c.kind])).toEqual([[1, "top"], [3, "loose"], [5, "bottom"]]);
      expect(r.excludedRows).toBe(0);
    });

    it("un saldo rotulado con fecha sigue siendo un saldo, no un movimiento", () => {
      const r = read([["30/06/2026", "Saldo anterior", null, "10.000,00", null], mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00")]);
      expect(r.checkpoints).toEqual([{ row: 1, balanceCents: 1000000, kind: "opening" }]);
      expect(r.movements).toHaveLength(1);
    });

    it("un rótulo de saldo sin ningún número no deja un saldo vacío", () => {
      const r = read([[null, "Saldo anterior", null, null, null], mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"), [null, "Saldo final", null, null, null]]);
      expect(r.checkpoints).toEqual([]);
    });

    it("un total o un transporte sin número no cuenta como fila excluida", () => {
      const r = read([mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"), [null, "Total del período", null, null, null]]);
      expect(r.excludedRows).toBe(0);
    });

    it("un transporte con saldo y sin fecha es una fila excluida, no un saldo suelto", () => {
      const r = read([mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"), [null, "Viene de pagina anterior", null, "11.000,00", null], mov("02/07/2026", "Comision", "-12,10", "10.987,90")]);
      expect(r.excludedRows).toBe(1);
      expect(r.checkpoints).toEqual([]);
    });

    it("una fila en blanco no es un saldo", () => {
      const r = read([mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"), [null, null, null, null, null], mov("02/07/2026", "Comision", "-12,10", "10.987,90")]);
      expect(r.checkpoints).toEqual([]);
      expect(r.excludedRows).toBe(0);
    });

    it("un total con importe y con saldo es una fila excluida, no un saldo suelto", () => {
      const r = read([mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"), [null, "Ajuste", "50,00", "11.050,00", null]]);
      expect(r.excludedRows).toBe(1);
      expect(r.checkpoints).toEqual([]);
    });

    it("sin rótulo, arriba del primero es «top», debajo del último «bottom» y en el medio «loose»", () => {
      const r = read([
        [null, null, null, "10.000,00", null],
        mov("01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"),
        [null, null, null, "11.000,00", null],
        mov("02/07/2026", "Comision", "-12,10", "10.987,90"),
        [null, null, null, "10.987,90", null],
      ]);
      expect(r.checkpoints.map((c) => [c.row, c.kind])).toEqual([[1, "top"], [3, "loose"], [5, "bottom"]]);
    });

    it("sin ningún movimiento no se rompe", () => {
      const g = grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Sin importe", "0,00", "0,00"],
      ]);
      const t = readTable(g)!;
      const i = t.interpretations.find((x) => x.balance === 3)!;
      expect(buildRows(g, t, i, NON).movements).toEqual([]);
    });
  });

  describe("la tabla de no-movimientos que se le pasa", () => {
    const read = (label: string, nonMovements: string[]) => {
      const g = grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["30/06/2026", "Transporte saldo anterior", "-50,00", "10.000,00"],
        [null, label, null, "10.000,00"],
        ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
      ]);
      const t = readTable(g)!;
      return buildRows(g, t, t.interpretations.find((x) => x.balance === 3)!, nonMovements);
    };

    it("con fecha, solo un patrón que empieza con «saldo» saca la fila de los movimientos", () => {
      const r = read("Texto libre", ["transporte saldo anterior"]);
      expect(r.movements.map((m) => m.concept)).toEqual(["Transporte saldo anterior", "Transf. recibida"]);
    });

    it("«saldo anterior» o «saldo inicial» son el saldo inicial solo si el patrón empieza con eso", () => {
      const r = read("Nuevo saldo anterior", ["nuevo saldo anterior"]);
      expect(r.checkpoints).toEqual([]);
      expect(r.excludedRows).toBe(1);
    });

    it("«saldo final», «saldo al» y «saldo actual» son el saldo final solo si el patrón empieza con eso", () => {
      const r = read("Nuevo saldo al cierre", ["nuevo saldo al cierre"]);
      expect(r.checkpoints).toEqual([]);
      expect(r.excludedRows).toBe(1);
    });
  });

  describe("las filas siguientes sin fecha ni importe completan el concepto", () => {
    const base = (...tail: Cell[][]): Grid =>
      grid([["Fecha", "Concepto", "Importe", "Saldo"], ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"], ...tail, ["05/07/2026", "Comision", "-12,10", "10.987,90"]]);
    const first = (g: Grid) => rowsOf(g, (i) => i.balance === 3);

    it("una fila con fecha y sin importe no es una continuación ni un movimiento", () => {
      const r = first(base(["03/07/2026", "Cierre del dia", null, null]));
      expect(r.movements.map((m) => m.concept)).toEqual(["Transf. recibida", "Comision"]);
      expect(r.movements[0].toRow).toBe(1);
    });

    it("una fila con importe y sin fecha es un total: no completa el concepto", () => {
      const r = first(base([null, "Cargo extra", "50,00", null]));
      expect(r.movements[0].concept).toBe("Transf. recibida");
      expect(r.excludedRows).toBe(1);
    });

    it("una fila de texto que no está pegada al movimiento no lo completa", () => {
      const r = first(base([null, null, null, null], [null, "Texto suelto", null, null]));
      expect(r.movements[0].concept).toBe("Transf. recibida");
      expect(r.movements[0].toRow).toBe(1);
    });

    it("la continuación de un movimiento sin concepto no deja un espacio de más", () => {
      const g = grid([
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", null, "1.000,00", "11.000,00"],
        [null, "CUIT 30123456781 ACME SA", null, null],
        ["02/07/2026", "Comision", "-12,10", "10.987,90"],
      ]);
      expect(first(g).movements[0].concept).toBe("CUIT 30123456781 ACME SA");
    });
  });

  describe("las columnas de texto sueltas", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo", "Obs", "CUIT"],
      ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00", "Proveedor Ejemplo Srl", "30123456781"],
      [null, "continúa", null, null, "Segunda línea", null],
      ["02/07/2026", "Comision", "-12,10", "10.987,90", null, "30123456781"],
    ]);

    it("van al movimiento, sin los vacíos, con su columna", () => {
      const r = rowsOf(g, (i) => i.balance === 3);
      expect(r.movements[0].extras).toEqual([
        { column: 4, text: "Proveedor Ejemplo Srl" },
        { column: 5, text: "30123456781" },
        { column: 4, text: "Segunda línea" },
      ]);
      expect(r.movements[1].extras).toEqual([{ column: 5, text: "30123456781" }]);
    });
  });
});

describe("directionsFromDates y chain", () => {
  it("las fechas que bajan dicen que el más nuevo está arriba; iguales, no dicen nada", () => {
    const m = (date: string) => ({ fromRow: 0, toRow: 0, date, valueDate: null, amountCents: 1, balanceCents: null, concept: "", reference: null, code: null, account: null, extras: [] });
    expect(directionsFromDates([m("2026-07-31"), m("2026-07-30")])).toEqual(["reverse"]);
    expect(directionsFromDates([m("2026-07-01"), m("2026-07-02")])).toEqual(["chronological"]);
    expect(directionsFromDates([m("2026-07-01"), m("2026-07-01")])).toEqual(["chronological", "reverse"]);
  });

  it("encadena con el saldo de apertura, también cuando el saldo de la fila es el de antes", () => {
    const m = (amountCents: number, balanceCents: number | null) => ({ fromRow: 0, toRow: 0, date: "2026-07-01", valueDate: null, amountCents, balanceCents, concept: "", reference: null, code: null, account: null, extras: [] });
    expect(chain([m(-100, 900), m(50, 950)], "chronological", "after", 1000)).toEqual({ checked: 2, chained: 2, chains: [true, true] });
    expect(chain([m(-100, 1000), m(50, 900)], "chronological", "before", 1000)).toEqual({ checked: 2, chained: 2, chains: [true, true] });
    expect(chain([m(-100, 900), m(50, 999)], "chronological", "after", null)).toEqual({ checked: 1, chained: 0, chains: [null, false] });
  });
});

describe("judge", () => {
  it("Credicoop: el más nuevo arriba, saldo después del movimiento, todo encadena", () => {
    const j = run(CREDICOOP);
    expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 3, chained: 3 });
    expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 4, credit: 5 });
  });

  it("Galicia por otro canal: el saldo es el de apertura del día y las columnas están invertidas respecto de los rótulos", () => {
    const g = grid([
      ["Concepto/Cod.Op.", "Fecha", "Debito", "Credito", "Importe", "Saldo"],
      [null, null, null, null, null, 5000000],
      ["FA.DATANET", "05/08/2025", 0, 100000, -100000, null],
      ["IMPUESTO AL DEBITO", "05/08/2025", 0, 600, -600, null],
      ["TRANS P PR", "07/08/2025", 20000000, 0, 20000000, 4899400],
      ["IMPUESTO AL CREDITO", "07/08/2025", 0, 120000, -120000, null],
      ["DB.AUT.VS", "08/08/2025", 0, 1000000, -1000000, 24779400],
      [null, null, null, 777777.77, 777777.77, null],
    ]);
    const j = run(g);
    expect(j).toMatchObject({ direction: "chronological", balanceIs: "before", openingCents: 500000000, closingCents: null });
    expect(j.chained).toBe(j.checked);
    expect(j.checked).toBeGreaterThanOrEqual(2);
    expect(j.rows.movements.map((m) => m.amountCents)).toEqual([-10000000, -60000, 2000000000, -12000000, -100000000]);
    expect(j.rows.excludedRows).toBe(1);
  });

  it("más nuevo arriba: el saldo sin rótulo sobre el primer movimiento es el final, no el inicial", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      [null, null, null, "1.050,00"],
      ["03/07/2026", "Transf recibida", "50,00", "1.050,00"],
      ["02/07/2026", "Comision", "-10,00", "1.000,00"],
      ["01/07/2026", "Transf recibida", "100,00", "1.010,00"],
    ]);
    const j = run(g);
    expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 2, chained: 2, openingCents: null, closingCents: 105000 });
    expect(j.chains).toEqual([true, true, null]);
    expect(j.chains).not.toContain(false);
  });

  it("más nuevo arriba: «Saldo anterior» rotulado abajo es el inicial en cualquier sentido", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["03/07/2026", "Transf recibida", "50,00", "1.050,00"],
      ["02/07/2026", "Comision", "-10,00", "1.000,00"],
      ["01/07/2026", "Transf recibida", "100,00", "1.010,00"],
      [null, "Saldo anterior", null, "910,00"],
    ]);
    const j = run(g);
    expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 3, chained: 3, openingCents: 91000, closingCents: null });
  });

  describe("una columna casual no le gana a la lectura verdadera", () => {
    /** Tres días con cuatro transferencias recibidas cada uno, cada una seguida de su impuesto, como Galicia por otro canal. */
    const busyMonth = (withBalance: boolean): Grid => {
      const days: Array<[string, number[]]> = [
        ["05/08/2025", [123456789, 98765432, 45678901, 67890123]],
        ["07/08/2025", [234567890, 12345678, 87654321, 54321098]],
        ["08/08/2025", [345678901, 23456789, 76543210, 65432109]],
      ];
      let balance = 500000000;
      const rows: Cell[][] = [];
      if (withBalance) rows.push([null, null, null, null, null, balance / 100]);
      for (const [date, inflows] of days) {
        let first = true;
        for (const inflow of inflows) {
          const tax = Math.round(inflow * 0.006);
          const shown = withBalance && first ? balance / 100 : null;
          rows.push(["TRANS P PR", date, inflow / 100, 0, inflow / 100, ...(withBalance ? [shown] : [])]);
          rows.push(["IMPUESTO AL CREDITO", date, 0, tax / 100, -tax / 100, ...(withBalance ? [null] : [])]);
          balance += inflow - tax;
          first = false;
        }
      }
      const header: Cell[] = ["Concepto/Cod.Op.", "Fecha", "Debito", "Credito", "Importe", ...(withBalance ? ["Saldo"] : [])];
      return grid([header, ...rows]);
    };

    it("con el saldo de apertura de cada día, gana el importe con signo y el saldo de antes", () => {
      const j = run(busyMonth(true));
      expect(j.interpretation.amount).toEqual({ shape: "signed", column: 4 });
      expect(j).toMatchObject({ direction: "chronological", balanceIs: "before", checked: 3, chained: 3 });
    });

    it("sin la columna de saldo, ninguna columna de importes se toma por saldo", () => {
      const j = run(busyMonth(false));
      expect(j.balanceIs).toBeNull();
      expect(j.checked).toBe(0);
    });
  });

  describe("con todas las fechas iguales, un saldo sin rótulo no arranca la cadena", () => {
    it("más nuevo arriba, con el saldo actual sin rótulo sobre el primer movimiento, no se invierten los signos", () => {
      const g = grid([
        ["Fecha", "Concepto", "Débito", "Crédito", "Saldo"],
        [null, null, null, null, "1.050,00"],
        ["10/07/2026", "Transf recibida", null, "50,00", "1.050,00"],
        ["10/07/2026", "Comision", "10,00", null, "1.000,00"],
        ["10/07/2026", "Transf recibida", null, "100,00", "1.010,00"],
        ["10/07/2026", "Transf enviada", "40,00", null, "910,00"],
      ]);
      const j = run(g);
      expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 2, credit: 3 });
      expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 3, chained: 3, closingCents: 105000 });
      expect(j.rows.movements.map((m) => m.amountCents)).toEqual([5000, -1000, 10000, -4000]);
    });

    it("más viejo arriba, con el saldo sin rótulo debajo, gana la lectura que cierra con los saldos de ProntoNet", () => {
      const g = grid([
        ["Fecha", "Concepto", "A", "B", "Saldo"],
        ["10/07/2026", "Transf enviada", "40,00", null, "910,00"],
        ["10/07/2026", "Transf recibida", null, "100,00", "1.010,00"],
        ["10/07/2026", "Comision", "10,00", null, "1.000,00"],
        ["10/07/2026", "Transf recibida", null, "50,00", "1.050,00"],
        [null, null, null, null, "1.050,00"],
      ]);
      const j = run(g, { openingCents: 95000, closingCents: 105000 });
      expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 2, credit: 3 });
      expect(j).toMatchObject({ direction: "chronological", balanceIs: "after", closesWithKnown: true, closingCents: 105000 });
    });
  });

  it("un extracto diario, con todas las fechas iguales, se juzga en los dos sentidos", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["10/07/2026", "Comision", "-10,00", "1.090,00"],
      ["10/07/2026", "Transf recibida", "100,00", "1.100,00"],
      ["10/07/2026", "Transf recibida", "100,00", "1.000,00"],
    ]);
    const j = run(g);
    expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 2, chained: 2 });
  });

  it("una columna que no es el saldo pierde contra leer sin saldo", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Otra"],
      ["01/07/2026", "Transf recibida", "100,00", "5,00"],
      ["02/07/2026", "Comision", "-10,00", "7,00"],
      ["03/07/2026", "Transf recibida", "50,00", "9,00"],
    ]);
    const j = run(g);
    expect(j.balanceIs).toBeNull();
    expect(j.checked).toBe(0);
  });

  it("sin saldos, elige la orientación que cierra con los saldos que manda ProntoNet", () => {
    const g = grid([
      ["Fecha", "Concepto", "A", "B"],
      ["01/07/2026", "uno", "100,00", null],
      ["02/07/2026", "dos", null, "30,00"],
    ]);
    const cierraSiAEsCredito = run(g, { openingCents: 100000, closingCents: 107000 });
    expect(cierraSiAEsCredito.interpretation.amount).toEqual({ shape: "debit-credit", debit: 3, credit: 2 });
    expect(cierraSiAEsCredito.closesWithKnown).toBe(true);
  });
});

describe("judge: los desempates", () => {
  it("sin rótulos ni saldos, los cargos del banco son los que salen: gana la lectura en que son negativos", () => {
    const g = grid([
      ["01/07/2026", "Transferencia recibida", "1.000,00", null],
      ["02/07/2026", "Comision mantenimiento", null, "12,10"],
      ["03/07/2026", "Transferencia recibida", "500,00", null],
      ["04/07/2026", "Comision mantenimiento", null, "65,00"],
    ]);
    const j = run(g);
    expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 3, credit: 2 });
    expect(j.rows.movements.map((m) => m.amountCents)).toEqual([100000, -1210, 50000, -6500]);
  });

  it("el mismo extracto con las columnas al revés da los mismos importes", () => {
    const g = grid([
      ["01/07/2026", "Transferencia recibida", null, "1.000,00"],
      ["02/07/2026", "Comision mantenimiento", "12,10", null],
      ["03/07/2026", "Transferencia recibida", null, "500,00"],
      ["04/07/2026", "Comision mantenimiento", "65,00", null],
    ]);
    const j = run(g);
    expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 2, credit: 3 });
    expect(j.rows.movements.map((m) => m.amountCents)).toEqual([100000, -1210, 50000, -6500]);
  });

  it("un día entero, más nuevo arriba y con saldo de después, sin rótulos: gana esa lectura y no su espejo", () => {
    const g = grid([
      ["10/07/2026", "Operacion", null, "50,00", "1.120,00"],
      ["10/07/2026", "Operacion", "30,00", null, "1.070,00"],
      ["10/07/2026", "Operacion", null, "100,00", "1.100,00"],
    ]);
    const j = run(g);
    expect(j.interpretation.amount).toEqual({ shape: "debit-credit", debit: 2, credit: 3 });
    expect(j).toMatchObject({ direction: "reverse", balanceIs: "after", checked: 2, chained: 2 });
    expect(j.rows.movements.map((m) => m.amountCents)).toEqual([5000, -3000, 10000]);
  });

  it("si nada más decide, el saldo es el de después y el sentido es el cronológico", () => {
    const g = grid([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["10/07/2026", "Transf recibida", "100,00", "1.100,00"],
    ]);
    const j = run(g);
    expect(j).toMatchObject({ balanceIs: "after", direction: "chronological", checked: 0 });
  });

  it("si dos interpretaciones empatan en todo, gana la primera: el importe a la izquierda del saldo", () => {
    const g = grid([["10/07/2026", "Transferencia recibida", "100,00", "1.100,00"]]);
    const j = run(g);
    expect(j.interpretation).toMatchObject({ amount: { shape: "signed", column: 2 }, balance: 3 });
  });

  it("sin ninguna fila con importe no hay lectura", () => {
    const g = grid([
      ["01/07/2026", "Sin movimiento", "0,00", "0,00"],
      ["02/07/2026", "Sin movimiento", "0,00", "0,00"],
    ]);
    expect(readTable(g)!.interpretations.length).toBeGreaterThan(0);
    expect(judge(g, readTable(g)!, NON, null)).toBeNull();
  });

  it("sin columna de saldo, ningún renglón tiene qué controlar", () => {
    const g = grid([
      ["01/07/2026", "Transferencia recibida", "1.000,00"],
      ["02/07/2026", "Comision por transferencia", "-12,10"],
    ]);
    expect(run(g).chains).toEqual([null, null]);
  });
});
