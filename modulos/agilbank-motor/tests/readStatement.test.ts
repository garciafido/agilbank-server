import * as XLSX from "xlsx";
import * as spreadsheet from "../src/sources/spreadsheet";
import { readStatement } from "../src/readStatement";
import { assignIds } from "../src/identity";
import type { KnownAccount } from "../src/types";
import { sparseBook, xlsx } from "./helpers";

const CBU_CREDICOOP = "1910018600001234567891";
const CBU_PROVINCIA = "0140007600009876543219";
const CUIT = "30123456781";

/** Credicoop en Excel: del más nuevo al más viejo, con su saldo. */
const credicoop = () =>
  xlsx({
    saldos_y_movimientos: [
      [null, "Fecha", "Concepto", "Nro.Cpbte.", "Débito", "Crédito", "Saldo", "Cód."],
      [null, "31/07/2026", "IVA - Alicuota Inscripto", 0, 2100, 0, 1512345.6, "IVA08"],
      [null, "31/07/2026", "Com. mantenimiento cuenta", 100001, 10000, 0, 1514445.6, 500],
      [null, "30/07/2026", `Transf. Interbanking - Distinto Titular Ord.:${CUIT}-ACME`, 100002, 0, 1000000, 1524445.6, 974],
      [null, "30/07/2026", "Suscripcion al Periodico Semanal", 100003, 5000, 0, 524445.6, 990],
    ],
  });

const csv = (...lines: string[]) => Buffer.from(lines.join("\n") + "\n");

describe("readStatement", () => {
  it("un Excel de Credicoop sale verificado, con su encabezado, sus tipos y sus contrapartes", async () => {
    const r = await readStatement(credicoop(), {
      account: { cbu: CBU_CREDICOOP, openingBalance: 529445.6, closingBalance: 1512345.6, periodFrom: "2026-07-30", periodTo: "2026-07-31" },
    });
    expect(r.verdict).toBe("verified");
    expect(r.reason).toBeNull();
    expect(r.header).toMatchObject({
      bankCode: "191",
      cbu: CBU_CREDICOOP,
      periodFrom: "2026-07-30",
      periodTo: "2026-07-31",
      openingBalanceCents: 52944560,
      closingBalanceCents: 151234560,
    });
    expect(r.lines.map((l) => l.order)).toEqual([1, 2, 3, 4]);
    expect(r.lines.map((l) => l.type.code)).toEqual(["iva", "comision", "transferencia-recibida", "sin-clasificar"]);
    expect(r.lines[2].counterparty).toEqual({ cuit: CUIT, name: "ACME", cbu: null });
    expect(r.lines[2].provenance).toEqual({ origin: "cell", sheet: "saldos_y_movimientos", fromRow: 4, toRow: 4 });
    expect(r.checks).toMatchObject({ direction: "reverse", balanceIs: "after", closesWithOwnBalances: true, closesWithProntoNet: true });
    expect(r.warnings.map((w) => w.code)).toEqual(["concepto-nuevo"]);
    expect(r.lines.every((l) => /^r-[0-9a-f]{20}$/.test(l.id))).toBe(true);
  });

  it("la fila más vieja es el punto de partida: tiene saldo pero no se controla, y las demás encadenan", async () => {
    const r = await readStatement(credicoop());
    expect(r.checks).toMatchObject({ linesWithBalance: 4, linesThatChain: 3 });
    expect(r.lines.map((l) => l.chains)).toEqual([true, true, true, null]);
  });

  it("el CBU y el banco salen del archivo cuando ProntoNet no mandó la cuenta", async () => {
    const file = xlsx({
      H: [
        [`Cuenta CBU ${CBU_PROVINCIA}`],
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
        ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      ],
    });
    const r = await readStatement(file);
    expect(r.header).toMatchObject({ cbu: CBU_PROVINCIA, bankCode: "014", bankName: "Banco de la Provincia de Buenos Aires" });
    expect(r.warnings.map((w) => w.code)).not.toContain("cuenta-distinta");
  });

  it("el código del banco sale del CBU aunque el banco no esté en la tabla, y el nombre queda vacío", async () => {
    const file = xlsx({
      H: [
        ["Cuenta CBU 0110001300001234567891"],
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
        ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      ],
    });
    const r = await readStatement(file, { account: { bank: "Banco Credicoop Central" } });
    expect(r.header).toMatchObject({ cbu: "0110001300001234567891", bankCode: "011", bankName: null });
  });

  it("sin CBU en el archivo ni en lo que mandó ProntoNet, el banco sale de su nombre", async () => {
    const r = await readStatement(
      csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00"),
      { account: { bank: "BANCO CREDICOOP CENTRAL", number: "CTA CTE 1", currency: "Pesos" } },
    );
    expect(r.header).toMatchObject({ bankCode: "191", cbu: null, account: "CTA CTE 1", currency: "Pesos" });
  });

  it("un archivo armado a mano sin saldos, que no cierra con ProntoNet: avisa y frena", async () => {
    const file = Buffer.from(
      `Fecha;Descripción Extendida;debitos;creditos\n04/05/2026;IMPUESTO DEBITO - LEY 25413;12.345,67;\n04/05/2026;TRANSF DE EMPRESA EJEMPLO SA (${CUIT}) FAC;;234.567,89\n`,
    );
    const r = await readStatement(file, {
      account: { cbu: CBU_PROVINCIA, openingBalance: 100, closingBalance: 50, periodFrom: "2026-05-01", periodTo: "2026-05-05" },
    });
    expect(r.verdict).toBe("weak");
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["sin-saldos", "no-cierra"]));
    expect(r.warnings.find((w) => w.code === "no-cierra")?.blocksProposals).toBe(true);
    expect(r.checks?.closesWithProntoNet).toBe(false);
  });

  describe("el aviso sin-saldos", () => {
    it("un archivo que no trae saldos lo dice así", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"));
      const w = r.warnings.find((x) => x.code === "sin-saldos");
      expect(w).toEqual({
        code: "sin-saldos",
        detail: "El archivo no trae saldos: no se puede controlar la lectura renglón por renglón.",
        blocksProposals: false,
      });
      expect(r.checks).toMatchObject({ balanceIs: null, linesWithBalance: 0, linesThatChain: 0 });
      expect(r.verdict).toBe("weak");
    });

    it("un archivo con una columna de saldo que no encadena con los importes no dice que no trae saldos", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Transf recibida;100,00;777,00",
          "02/07/2026;Comision;-10,00;5,00",
          "03/07/2026;Transf recibida;50,00;9.999,00",
        ),
      );
      const w = r.warnings.find((x) => x.code === "sin-saldos");
      expect(w?.code).toBe("sin-saldos");
      expect(w?.blocksProposals).toBe(false);
      expect(w?.detail).toBe("El archivo tiene una columna de saldo que no encadena con los importes: no se puede controlar la lectura renglón por renglón.");
      expect(w?.detail).not.toMatch(/no trae saldos/);
      expect(r.checks?.balanceIs).toBeNull();
      expect(r.lines.every((l) => l.balanceCents === null)).toBe(true);
    });

    it("una columna rotulada de otra manera que no encadena no cuenta como columna de saldo", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Otra",
          "01/07/2026;Transf recibida;100,00;777,00",
          "02/07/2026;Comision;-10,00;5,00",
          "03/07/2026;Transf recibida;50,00;9.999,00",
        ),
      );
      expect(r.warnings.find((x) => x.code === "sin-saldos")?.detail).toMatch(/no trae saldos/);
    });

    it("con solo los saldos inicial y final impresos avisa que se controla el total, no cada renglón, y no frena", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00", "Saldo final;;1.090,00"),
      );
      expect(r.warnings.find((w) => w.code === "sin-saldos")).toEqual({
        code: "sin-saldos",
        detail: "El archivo trae solo los saldos inicial y final: se controla el total, no cada renglón.",
        blocksProposals: false,
      });
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 109000 });
      expect(r.checks).toMatchObject({ balanceIs: null, linesWithBalance: 0, linesThatChain: 0, closesWithOwnBalances: true });
      expect(r.verdict).toBe("weak");
    });

    it("con un solo saldo impreso, el inicial, avisa que no alcanza para controlar nada", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"),
      );
      expect(r.warnings.find((w) => w.code === "sin-saldos")).toEqual({
        code: "sin-saldos",
        detail: "El archivo trae un solo saldo: no alcanza para controlar la lectura renglón por renglón.",
        blocksProposals: false,
      });
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: null });
      expect(r.verdict).toBe("weak");
    });

    it("un archivo de un solo movimiento con su saldo y sin saldo inicial: ese saldo es el punto de partida y no controla nada", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00"));
      expect(r.checks).toMatchObject({ linesWithBalance: 1, linesThatChain: 0 });
      expect(r.lines[0].chains).toBeNull();
      expect(r.warnings.find((w) => w.code === "sin-saldos")).toEqual({
        code: "sin-saldos",
        detail: "El archivo trae un solo saldo: no alcanza para controlar la lectura renglón por renglón.",
        blocksProposals: false,
      });
      expect(r.verdict).toBe("weak");
    });

    it("con el saldo inicial impreso, un solo movimiento con saldo sí se controla: no avisa", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "Saldo anterior;;;1.000,00", "01/07/2026;Transf recibida;100,00;1.100,00"));
      expect(r.checks).toMatchObject({ linesWithBalance: 1, linesThatChain: 1 });
      expect(r.warnings.map((w) => w.code)).not.toContain("sin-saldos");
    });

    it("un saldo de fila y un saldo suelto que no se controlan entre sí: avisa que los saldos no alcanzan", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe;Saldo", ";;;1.050,00", "10/07/2026;Transf recibida;100,00;1.100,00", "10/07/2026;Comision;-10,00;"),
      );
      expect(r.checks).toMatchObject({ linesWithBalance: 1, linesThatChain: 0 });
      expect(r.warnings.find((w) => w.code === "sin-saldos")).toEqual({
        code: "sin-saldos",
        detail: "Los saldos que trae el archivo no alcanzan para controlar la lectura renglón por renglón.",
        blocksProposals: false,
      });
    });

    it("una lectura sin ningún renglón controlado nunca sale verificada y siempre avisa sin-saldos", async () => {
      const files = [
        csv("Fecha;Concepto;Importe", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"),
        csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"),
        csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00"),
        csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;777,00", "02/07/2026;Comision;-10,00;5,00", "03/07/2026;Comision;-10,00;9,00"),
      ];
      for (const file of files) {
        const r = await readStatement(file);
        expect(r.checks?.linesThatChain).toBe(0);
        expect(r.warnings.map((w) => w.code)).toContain("sin-saldos");
        expect(r.verdict).toBe("weak");
      }
    });

    it("una lectura con renglones controlados no avisa sin-saldos", async () => {
      expect((await readStatement(credicoop())).warnings.map((w) => w.code)).not.toContain("sin-saldos");
    });
  });

  it("una sola columna de importes positivos sin saldo: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from("Fecha de pago;Razón Social;Monto\n2025-10-02;Proveedor Uno S.R.L;1500.50\n2025-10-02;Proveedor Dos S.A;2750.25\n"));
    expect(r).toMatchObject({ verdict: "abstained", lines: [], header: null, checks: null, warnings: [] });
    expect(r.reason).toMatch(/signo de los importes/);
  });

  it("un texto sin tabla de movimientos: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from("Esto no es un extracto\nni tiene fechas ni importes\n"));
    expect(r).toMatchObject({ verdict: "abstained", lines: [], header: null });
    expect(r.reason).toBe("No se encontró una tabla de movimientos con fecha e importe.");
  });

  it("un archivo binario que no es planilla: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x00, 0x01]));
    expect(r.verdict).toBe("abstained");
    expect(r.reason).toBe("El archivo no es una planilla ni un texto: no se puede leer como extracto.");
  });

  it.each([
    ["un PDF", Buffer.from("%PDF-1.7\n...")],
    ["una foto JPG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    ["una foto PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0])],
  ])("%s no se lee por esta vía: sin lectura, con el motivo", async (_name, file) => {
    const r = await readStatement(file);
    expect(r).toMatchObject({ verdict: "abstained", lines: [], header: null, checks: null });
    expect(r.reason).toBe("Este formato no se lee por esta vía: manden el extracto en Excel, CSV o texto.");
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  describe("un «XLS» que en realidad es HTML o XML 2003", () => {
    it("una tabla HTML sale leída, con los importes argentinos bien interpretados", async () => {
      const html = `<html><body><table>
        <tr><td>Fecha</td><td>Concepto</td><td>Débito</td><td>Crédito</td><td>Saldo</td></tr>
        <tr><td>01/07/2026</td><td>Transf recibida</td><td></td><td>100,00</td><td>1.100,00</td></tr>
        <tr><td>02/07/2026</td><td>Comision</td><td>10,00</td><td></td><td>1.090,00</td></tr>
      </table></body></html>`;
      const r = await readStatement(Buffer.from(html));
      expect(r.verdict).toBe("verified");
      expect(r.lines.map((l) => [l.date, l.amountCents, l.balanceCents])).toEqual([
        ["2026-07-01", 10000, 110000],
        ["2026-07-02", -1000, 109000],
      ]);
      expect(r.lines[0].provenance.origin).toBe("cell");
    });

    it("una planilla XML 2003 sale leída, con su hoja", async () => {
      const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Movimientos"><Table>
<Row><Cell><Data ss:Type="String">Fecha</Data></Cell><Cell><Data ss:Type="String">Concepto</Data></Cell><Cell><Data ss:Type="String">Importe</Data></Cell><Cell><Data ss:Type="String">Saldo</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">01/07/2026</Data></Cell><Cell><Data ss:Type="String">Transf recibida</Data></Cell><Cell><Data ss:Type="Number">100</Data></Cell><Cell><Data ss:Type="Number">1100</Data></Cell></Row>
<Row><Cell><Data ss:Type="DateTime">2026-07-02T00:00:00.000</Data></Cell><Cell><Data ss:Type="String">Comision</Data></Cell><Cell><Data ss:Type="Number">-10</Data></Cell><Cell><Data ss:Type="Number">1090</Data></Cell></Row>
</Table></Worksheet></Workbook>`;
      const r = await readStatement(Buffer.from(xml));
      expect(r.verdict).toBe("verified");
      expect(r.lines.map((l) => [l.date, l.amountCents])).toEqual([
        ["2026-07-01", 10000],
        ["2026-07-02", -1000],
      ]);
      expect(r.lines[0].provenance).toMatchObject({ origin: "cell", sheet: "Movimientos", fromRow: 2 });
    });
  });

  it("un HTML de 1.500 renglones y 8 columnas con 2.000 combinadas se lee en menos de 2 s", async () => {
    const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    const rows = ["<tr><td>Fecha</td><td>Concepto</td><td>Referencia</td><td>Sucursal</td><td>Débito</td><td>Crédito</td><td>Saldo</td><td>Obs</td></tr>"];
    let balance = 100000;
    for (let k = 0; k < 1500; k++) {
      const amount = k % 3 === 0 ? 1500 : -700;
      balance += amount;
      // 1.250 conceptos sobre dos columnas y 750 observaciones sobre dos filas: 2.000 combinadas.
      const concept = k < 1250 ? `<td colspan="2">Concepto ${k}</td>` : `<td>Concepto ${k}</td><td>R${k}</td>`;
      const obs = k % 2 === 0 ? '<td rowspan="2">obs</td>' : "";
      const day = String((k % 28) + 1).padStart(2, "0");
      rows.push(`<tr><td>${day}/07/2026</td>${concept}<td>1</td><td>${amount < 0 ? money(-amount) : ""}</td><td>${amount > 0 ? money(amount) : ""}</td><td>${money(balance)}</td>${obs}</tr>`);
    }
    const file = Buffer.from(`<html><body><table>${rows.join("\n")}</table></body></html>`);
    const start = Date.now();
    const r = await readStatement(file);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(r.verdict).toBe("verified");
    expect(r.lines).toHaveLength(1500);
  });

  it("un HTML con más de 2.000 combinadas: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from(`<table>${'<tr><td rowspan="2">a</td></tr>'.repeat(2001)}</table>`));
    expect(r.verdict).toBe("abstained");
    expect(r.reason).toBe("La planilla es demasiado grande: tiene más de 2.000 celdas combinadas.");
  });

  it("una planilla rota: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]));
    expect(r.verdict).toBe("abstained");
    expect(r.reason).toMatch(/planilla/);
    expect(r.reason).toMatch(/dañado/);
  });

  it("una planilla con contraseña: sin lectura, y el motivo pide mandarla sin contraseña", async () => {
    const read = jest.spyOn(spreadsheet, "gridsFromSpreadsheet").mockImplementationOnce(() => {
      throw new Error("File is password-protected: ECMA-376 Extensible");
    });
    try {
      const r = await readStatement(Buffer.from([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]));
      expect(r.verdict).toBe("abstained");
      expect(r.reason).toBe("La planilla está protegida con contraseña: hay que mandarla sin contraseña.");
    } finally {
      read.mockRestore();
    }
  });

  it("una planilla con celdas fuera de todo extracto: sin lectura, con el motivo de la planilla", async () => {
    const book = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = { A1: { t: "s", v: "Fecha" }, A200000: { t: "s", v: "x" }, "!ref": "A1:A200000" };
    XLSX.utils.book_append_sheet(book, ws, "H");
    const r = await readStatement(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
    expect(r).toMatchObject({ verdict: "abstained", lines: [], header: null, checks: null, warnings: [] });
    expect(r.reason).toMatch(/demasiado grande/);
    expect(r.reason).toMatch(/fila 200000/);
    expect(r.reason).not.toMatch(/dañado/);
  });

  it("un texto de más de 200.000 líneas: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from("Fecha;Concepto;Importe\n" + "01/07/2026;Comision;-1,00\n".repeat(200_000)));
    expect(r).toMatchObject({ verdict: "abstained", lines: [], header: null, checks: null, warnings: [] });
    expect(r.reason).toBe("El archivo es demasiado grande: tiene más de 200.000 líneas.");
  });

  it("un libro chico con celdas sueltas lejanas en varias hojas: sin lectura, con el motivo", async () => {
    const r = await readStatement(sparseBook(3));
    expect(r.verdict).toBe("abstained");
    expect(r.reason).toBe("La planilla es demasiado grande: sus hojas ocupan 38.249.235 celdas, y un extracto entra en 5.000.000.");
  });

  it("un archivo con movimientos de dos cuentas: avisa, identifica cada una y frena", async () => {
    const file = Buffer.from(
      "Fecha;Cuenta;Concepto;Importe\n01/07/2026;191-001-012345/6;Transf recibida;100,00\n01/07/2026;191-001-099999/1;Comision;-10,00\n",
    );
    const r = await readStatement(file);
    const w = r.warnings.find((x) => x.code === "varias-cuentas");
    expect(w?.blocksProposals).toBe(true);
    expect(w?.data?.cuentas).toBe("191-001-012345/6, 191-001-099999/1");
    expect(r.verdict).toBe("weak");
  });

  describe("el aviso varias-cuentas", () => {
    const hoja = (...rows: unknown[][]) => xlsx({ H: rows });
    const aviso = (r: Awaited<ReturnType<typeof readStatement>>) => r.warnings.find((w) => w.code === "varias-cuentas");

    it("un archivo de una sola cuenta con una columna Cuenta y el CBU en el título no avisa", async () => {
      const r = await readStatement(
        hoja(
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          ["Fecha", "Cuenta", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "191-001-012345/6", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "191-001-012345/6", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)).toBeUndefined();
      expect(r.header?.cbu).toBe(CBU_CREDICOOP);
    });

    it("el CBU de una contraparte en un bloque de detalle entre los movimientos no cuenta como otra cuenta", async () => {
      const r = await readStatement(
        hoja(
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          [`CBU ORIGEN ${CBU_PROVINCIA}`],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)).toBeUndefined();
      expect(r.header?.cbu).toBe(CBU_CREDICOOP);
    });

    it("una columna Cuenta con palabras y sin cifras no cuenta como cuentas distintas", async () => {
      const r = await readStatement(
        hoja(
          ["Fecha", "Cuenta", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "CUENTA CORRIENTE", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "CAJA DE AHORRO", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)).toBeUndefined();
    });

    it("dos valores de la columna Cuenta, uno con palabras y uno con cifras, son una sola cuenta", async () => {
      const r = await readStatement(
        hoja(
          ["Fecha", "Cuenta", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "CUENTA CORRIENTE", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "191-001-012345/6", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)).toBeUndefined();
    });

    it("dos CBU distintos en el título avisan, y los lista", async () => {
      const r = await readStatement(
        hoja(
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          [`Cuenta CBU ${CBU_PROVINCIA}`],
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)).toMatchObject({
        blocksProposals: true,
        detail: `El archivo trae movimientos de 2 cuentas: ${CBU_CREDICOOP}, ${CBU_PROVINCIA}.`,
        data: { cuentas: `${CBU_CREDICOOP}, ${CBU_PROVINCIA}` },
      });
    });

    it("el mismo CBU repetido en el título y en el pie es una sola cuenta", async () => {
      const r = await readStatement(
        hoja(
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
          [`CBU ${CBU_CREDICOOP}`],
        ),
      );
      expect(aviso(r)).toBeUndefined();
    });

    it("si avisan los dos conjuntos, la lista trae los dos", async () => {
      const r = await readStatement(
        hoja(
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          [`Cuenta CBU ${CBU_PROVINCIA}`],
          ["Fecha", "Cuenta", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "191-001-012345/6", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "191-001-099999/1", "Comision", "-10,00", "1.090,00"],
        ),
      );
      expect(aviso(r)?.data?.cuentas).toBe(`191-001-012345/6, 191-001-099999/1, ${CBU_CREDICOOP}, ${CBU_PROVINCIA}`);
      expect(aviso(r)?.detail).toMatch(/^El archivo trae movimientos de 4 cuentas: /);
    });
  });

  it("un CBU suelto entre los movimientos no cambia la cuenta ni el banco que mandó ProntoNet", async () => {
    const r = await readStatement(
      csv(
        "Fecha;Concepto;Importe;Saldo",
        "01/07/2026;Transf recibida;100,00;1.100,00",
        `CBU ORIGEN ${CBU_PROVINCIA}`,
        "02/07/2026;Comision;-10,00;1.090,00",
      ),
      { account: { cbu: CBU_CREDICOOP } },
    );
    expect(r.header).toMatchObject({ cbu: CBU_CREDICOOP, bankCode: "191" });
    expect(r.warnings.map((w) => w.code)).not.toContain("cuenta-distinta");
    expect(r.lines).toHaveLength(2);
  });

  it("el CBU de un pie de página sí es el de la cuenta del archivo", async () => {
    const r = await readStatement(
      xlsx({
        H: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
          [`Cuenta CBU ${CBU_PROVINCIA}`],
        ],
      }),
      { account: { cbu: CBU_CREDICOOP } },
    );
    expect(r.header).toMatchObject({ cbu: CBU_PROVINCIA, bankCode: "014" });
    expect(r.warnings.map((w) => w.code)).toContain("cuenta-distinta");
  });

  describe("el CBU que manda ProntoNet", () => {
    const CON_GUIONES = "191-0018600001234567891";
    const archivo = () =>
      xlsx({
        H: [
          [`Cuenta CBU ${CBU_CREDICOOP}`],
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ],
      });

    it("se compara por sus cifras: con guiones o espacios no es otra cuenta", async () => {
      for (const sent of [CON_GUIONES, ` ${CBU_CREDICOOP.slice(0, 11)} ${CBU_CREDICOOP.slice(11)} `]) {
        const r = await readStatement(archivo(), { account: { cbu: sent } });
        expect(r.warnings.map((w) => w.code)).not.toContain("cuenta-distinta");
        expect(r.header?.cbu).toBe(CBU_CREDICOOP);
      }
    });

    it("sale en el encabezado con sus cifras cuando el archivo no trae CBU, y da los mismos ids", async () => {
      const file = csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00");
      const guiones = await readStatement(file, { account: { cbu: CON_GUIONES } });
      const plano = await readStatement(file, { account: { cbu: CBU_CREDICOOP } });
      expect(guiones.header).toMatchObject({ cbu: CBU_CREDICOOP, bankCode: "191" });
      expect(guiones.lines.map((l) => l.id)).toEqual(plano.lines.map((l) => l.id));
    });

    it("un CBU de ProntoNet sin ninguna cifra es como no haberlo mandado", async () => {
      const r = await readStatement(archivo(), { account: { cbu: "sin dato" } });
      expect(r.warnings.map((w) => w.code)).not.toContain("cuenta-distinta");
      expect(r.header?.cbu).toBe(CBU_CREDICOOP);
    });

    it("otro CBU, aunque venga con guiones, sigue siendo otra cuenta", async () => {
      const r = await readStatement(archivo(), { account: { cbu: "014-0007600009876543219" } });
      expect(r.warnings.find((w) => w.code === "cuenta-distinta")?.data).toEqual({
        cbuDelArchivo: CBU_CREDICOOP,
        cbuDeProntoNet: CBU_PROVINCIA,
      });
    });
  });

  it("el CBU del título no es el que mandó ProntoNet: cuenta distinta", async () => {
    const file = xlsx({
      H: [
        [`Cuenta CBU ${CBU_PROVINCIA}`],
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
        ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      ],
    });
    const r = await readStatement(file, { account: { cbu: CBU_CREDICOOP } });
    expect(r.warnings.map((w) => w.code)).toContain("cuenta-distinta");
    const w = r.warnings.find((x) => x.code === "cuenta-distinta");
    expect(w?.blocksProposals).toBe(true);
    expect(w?.data).toEqual({ cbuDelArchivo: CBU_PROVINCIA, cbuDeProntoNet: CBU_CREDICOOP });
    expect(r.verdict).toBe("weak");
    expect(r.header).toMatchObject({ cbu: CBU_PROVINCIA, bankCode: "014" });
  });

  it("en un libro con varias hojas, lee la de movimientos", async () => {
    const file = xlsx({
      Conciliacion: [["Resumen"], ["Total conciliado", 100]],
      Movimientos: [
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
        ["02/07/2026", "Comision", "-10,00", "1.090,00"],
      ],
    });
    const r = await readStatement(file);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].provenance.sheet).toBe("Movimientos");
  });

  it("de dos hojas con movimientos lee la que tiene más", async () => {
    const file = xlsx({
      Chica: [["Fecha", "Concepto", "Importe", "Saldo"], ["01/07/2026", "Transf recibida", "100,00", "1.100,00"]],
      Grande: [
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
        ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ["03/07/2026", "Comision", "-10,00", "1.080,00"],
      ],
    });
    const r = await readStatement(file);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0].provenance.sheet).toBe("Grande");
  });

  describe("en un libro con varias hojas gana la que mejor encadena", () => {
    it("una conciliación del cliente con fechas e importes, más larga, no le gana al extracto con saldo", async () => {
      const file = xlsx({
        Conciliacion: [
          ["Fecha", "Detalle", "Importe"],
          ["01/07/2026", "Cobro factura 1", "100,00"],
          ["02/07/2026", "Pago proveedor", "-40,00"],
          ["03/07/2026", "Cobro factura 2", "60,00"],
          ["04/07/2026", "Pago servicio", "-15,00"],
        ],
        Movimientos: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ],
      });
      const r = await readStatement(file);
      expect(r.lines.map((l) => l.provenance.sheet)).toEqual(["Movimientos", "Movimientos"]);
      expect(r.checks?.linesThatChain).toBe(1);
    });

    it("una hoja cuyo saldo se rompe pierde contra otra con menos movimientos que encadenan", async () => {
      const file = xlsx({
        Rota: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "5.000,00"],
          ["03/07/2026", "Comision", "-10,00", "7.000,00"],
          ["04/07/2026", "Comision", "-10,00", "9.000,00"],
        ],
        Buena: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
          ["02/07/2026", "Comision", "-10,00", "1.090,00"],
        ],
      });
      expect((await readStatement(file)).lines[0].provenance.sheet).toBe("Buena");
      const buenaPrimero = xlsx({ Buena: [["Fecha", "Concepto", "Importe", "Saldo"], ["01/07/2026", "Transf recibida", "100,00", "1.100,00"], ["02/07/2026", "Comision", "-10,00", "1.090,00"]], Rota: [["Fecha", "Concepto", "Importe", "Saldo"], ["01/07/2026", "Transf recibida", "100,00", "1.100,00"], ["02/07/2026", "Comision", "-10,00", "5.000,00"], ["03/07/2026", "Comision", "-10,00", "7.000,00"], ["04/07/2026", "Comision", "-10,00", "9.000,00"]] });
      expect((await readStatement(buenaPrimero)).lines[0].provenance.sheet).toBe("Buena");
    });

    it("con el mismo encadenado gana la de más movimientos, y si empatan, la primera", async () => {
      const sinSaldo = (n: number) => [["Fecha", "Concepto", "Importe"], ...Array.from({ length: n }, (_, k) => [`0${k + 1}/07/2026`, "Comision", "-10,00"])];
      expect((await readStatement(xlsx({ Chica: sinSaldo(1), Grande: sinSaldo(3) }))).lines[0].provenance.sheet).toBe("Grande");
      expect((await readStatement(xlsx({ Primera: sinSaldo(2), Segunda: sinSaldo(2) }))).lines[0].provenance.sheet).toBe("Primera");
    });
  });

  it("el CSV numera la procedencia desde la fila 1 del texto, sin hoja", async () => {
    const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00"));
    expect(r.lines.map((l) => l.provenance)).toEqual([
      { origin: "text", sheet: null, fromRow: 2, toRow: 2 },
      { origin: "text", sheet: null, fromRow: 3, toRow: 3 },
    ]);
  });

  it("un renglón con continuación abarca todas sus filas y la contraparte sale de la continuación", async () => {
    const file = xlsx({
      H: [
        ["Fecha", "Concepto", "Importe", "Saldo"],
        ["01/07/2026", "Transf. recibida", "1.000,00", "11.000,00"],
        [null, `CUIT ${CUIT} ACME SA`, null, null],
        ["02/07/2026", "Comision", "-12,10", "10.987,90"],
      ],
    });
    const r = await readStatement(file);
    expect(r.lines[0].provenance).toMatchObject({ fromRow: 2, toRow: 3 });
    expect(r.lines[0].counterparty).toMatchObject({ cuit: CUIT });
    expect(r.lines[1].provenance).toMatchObject({ fromRow: 4, toRow: 4 });
  });

  it("el código de operación que el banco imprime adelante del texto pasa a su campo", async () => {
    const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;907213 - DEB. AUTOM. DE SERV.;-100,00;900,00", "02/07/2026;Transf recibida;50,00;950,00"));
    expect(r.lines[0].bank).toEqual({ code: "907213", text: "DEB. AUTOM. DE SERV.", extras: [] });
  });

  it("las correcciones de la empresa mandan sobre la tabla", async () => {
    const r = await readStatement(credicoop(), {
      account: { cbu: CBU_CREDICOOP },
      corrections: [{ bankCode: "191", operationCode: "990", type: "sellos" }],
    });
    expect(r.lines[3].type).toEqual({ code: "sellos", source: "company" });
    expect(r.warnings.map((w) => w.code)).not.toContain("concepto-nuevo");
  });

  describe("los saldos impresos y los de los renglones, por separado", () => {
    it("con el saldo anterior y el final impresos, los dos pares quedan a la vista aunque no coincidan", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo anterior;;;900,00",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "02/07/2026;Comision;-10,00;1.090,00",
          "Saldo final;;;1.500,00",
        ),
      );
      expect(r.checks?.printedBalances).toEqual({ openingCents: 90000, closingCents: 150000 });
      expect(r.checks?.lineBalances).toEqual({ openingCents: 100000, closingCents: 109000 });
      expect(r.header).toMatchObject({ openingBalanceCents: 90000, closingBalanceCents: 150000 });
    });

    it("sin saldos impresos, los impresos son null y el encabezado lleva los de los renglones", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00"));
      expect(r.checks?.printedBalances).toEqual({ openingCents: null, closingCents: null });
      expect(r.checks?.lineBalances).toEqual({ openingCents: 100000, closingCents: 109000 });
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 109000 });
    });

    it("sin saldos de renglón, los de los renglones son null", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"));
      expect(r.checks?.printedBalances).toEqual({ openingCents: 100000, closingCents: null });
      expect(r.checks?.lineBalances).toEqual({ openingCents: null, closingCents: null });
    });
  });

  describe("los saldos del encabezado", () => {
    it("el saldo anterior impreso manda sobre el que sale de la primera fila", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo anterior;;;900,00",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "02/07/2026;Comision;-10,00;1.090,00",
        ),
      );
      expect(r.header).toMatchObject({ openingBalanceCents: 90000, closingBalanceCents: 109000 });
      expect(r.lines[0].chains).toBe(false);
      expect(r.warnings.find((w) => w.code === "no-encadena")).toMatchObject({ blocksProposals: false, lines: [1] });
      expect(r.verdict).toBe("weak");
    });

    it("un saldo sin rótulo arriba es el final si el más nuevo está arriba", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe;Saldo", ";;;1.200,00", "02/07/2026;Comision;-10,00;1.090,00", "01/07/2026;Transf recibida;100,00;1.100,00"),
      );
      expect(r.checks?.direction).toBe("reverse");
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 120000 });
      expect(r.warnings.map((w) => w.code)).toContain("no-cierra");
    });

    it("sin saldos impresos salen de la primera y la última fila con saldo, aunque haya filas sin saldo en las puntas", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Uno;100,00;",
          "02/07/2026;Dos;50,00;1.150,00",
          "03/07/2026;Tres;-10,00;1.140,00",
          "04/07/2026;Cuatro;-20,00;",
        ),
      );
      expect(r.checks).toMatchObject({ balanceIs: "after", linesWithBalance: 2 });
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 112000 });
    });

    it("con el saldo de antes, el inicial es el de la primera fila y el final suma su movimiento", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Uno;100,00;1.000,00",
          "01/07/2026;Dos;-30,00;1.100,00",
          "02/07/2026;Tres;-20,00;1.070,00",
        ),
      );
      expect(r.checks?.balanceIs).toBe("before");
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 105000 });
      expect(r.checks?.closesWithOwnBalances).toBe(true);
    });

    it("saldos que no encadenan en el medio avisan sin frenar, pero la lectura queda a revisar aunque cierre", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "02/07/2026;Comision;-10,00;1.090,00",
          "03/07/2026;Comision;-10,00;1.085,00",
          "04/07/2026;Comision;-10,00;1.070,00",
          "05/07/2026;Comision;-10,00;1.060,00",
          "06/07/2026;Comision;-10,00;1.050,00",
        ),
      );
      expect(r.warnings.some((w) => w.blocksProposals)).toBe(false);
      expect(r.warnings.find((w) => w.code === "no-encadena")).toEqual({
        code: "no-encadena",
        detail: "2 renglones no encadenan con el saldo anterior.",
        blocksProposals: false,
        lines: [3, 4],
      });
      expect(r.checks).toMatchObject({ linesWithBalance: 6, linesThatChain: 3, closesWithOwnBalances: true });
      expect(r.lines.map((l) => l.chains)).toEqual([null, true, false, false, true, true]);
      expect(r.verdict).toBe("weak");
    });

    it("un solo renglón que no encadena lo dice en singular", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo anterior;;;1.000,00",
          "01/07/2026;Transf recibida;100,00;1.150,00",
          "02/07/2026;Comision;-10,00;1.140,00",
          "03/07/2026;Comision;-10,00;1.130,00",
        ),
      );
      expect(r.warnings.find((w) => w.code === "no-encadena")).toMatchObject({ detail: "1 renglón no encadena con el saldo anterior.", lines: [1] });
    });

    it("un «Saldo al» después de cada día no es el cierre del extracto: la lectura que encadena sale verificada", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "01/07/2026;Comision;-10,00;1.090,00",
          "Saldo al 01/07/2026;;;1.090,00",
          "02/07/2026;Transf recibida;50,00;1.140,00",
          "Saldo al 02/07/2026;;;1.140,00",
          "03/07/2026;Comision;-20,00;1.120,00",
          "Saldo al 03/07/2026;;;1.120,00",
        ),
      );
      expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      expect(r.header).toMatchObject({ closingBalanceCents: 112000 });
      expect(r.checks?.closesWithOwnBalances).toBe(true);
      expect(r.verdict).toBe("verified");
    });

    it("un «Saldo al» arriba del primer movimiento es el saldo inicial de un extracto cronológico", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo al 30/06/2026;;;1.000,00",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "02/07/2026;Comision;-10,00;1.090,00",
          "Saldo al 02/07/2026;;;1.090,00",
        ),
      );
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 109000 });
      expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      expect(r.verdict).toBe("verified");
    });

    it("con el más nuevo arriba, el «Saldo al» de arriba es el final y el de abajo el inicial", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo al 02/07/2026;;;1.090,00",
          "02/07/2026;Comision;-10,00;1.090,00",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "Saldo al 30/06/2026;;;1.000,00",
        ),
      );
      expect(r.checks?.direction).toBe("reverse");
      expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 109000 });
      expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
    });

    it("el saldo final impreso que no es la suma de los renglones frena", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "Saldo anterior;;;1.000,00",
          "01/07/2026;Transf recibida;100,00;1.100,00",
          "02/07/2026;Comision;-10,00;1.090,00",
          "Saldo final;;;1.500,00",
        ),
      );
      const w = r.warnings.find((x) => x.code === "no-cierra");
      expect(w?.blocksProposals).toBe(true);
      expect(w?.detail).toBe("El saldo inicial más los renglones da $ 1.090,00, y el saldo final es $ 1.500,00: hay una diferencia de $ 410,00.");
      expect(r.checks?.closesWithOwnBalances).toBe(false);
      expect(r.verdict).toBe("weak");
    });
  });

  describe("el control contra lo que sabe ProntoNet", () => {
    it("un extracto diario contra el resumen del mes no se compara: no avisa ni frena", async () => {
      const r = await readStatement(credicoop(), {
        account: { openingBalance: 1, closingBalance: 2, periodFrom: "2026-07-01", periodTo: "2026-07-31" },
      });
      expect(r.checks?.closesWithProntoNet).toBeNull();
      expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      expect(r.verdict).toBe("verified");
    });

    it("un archivo que cubre el período y trae otros saldos que los de ProntoNet: avisa y frena", async () => {
      const r = await readStatement(credicoop(), {
        account: { openingBalance: 1, closingBalance: 2, periodFrom: "2026-07-30", periodTo: "2026-07-31" },
      });
      expect(r.checks?.closesWithProntoNet).toBe(false);
      const w = r.warnings.find((x) => x.code === "no-cierra");
      expect(w?.blocksProposals).toBe(true);
      expect(w?.detail).toBe("Los saldos del archivo ($ 529.445,60 y $ 1.512.345,60) no son los del resumen de ProntoNet ($ 1,00 y $ 2,00).");
      expect(r.verdict).toBe("weak");
    });

    it("con el período, unos saldos de ProntoNet que coinciden cierran", async () => {
      const r = await readStatement(credicoop(), {
        account: { openingBalance: 529445.6, closingBalance: 1512345.6, periodFrom: "2026-07-30", periodTo: "2026-07-31" },
      });
      expect(r.checks?.closesWithProntoNet).toBe(true);
    });

    it("sin el período, los saldos de ProntoNet no se comparan: un extracto diario con los saldos del mes no frena", async () => {
      for (const account of [
        { openingBalance: 1, closingBalance: 2 },
        { openingBalance: 1, closingBalance: 2, periodFrom: "2026-07-30" },
        { openingBalance: 1, closingBalance: 2, periodTo: "2026-07-31" },
      ]) {
        const r = await readStatement(credicoop(), { account });
        expect(r.checks?.closesWithProntoNet).toBeNull();
        expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
        expect(r.verdict).toBe("verified");
      }
    });

    it("sin el período completo, ni siquiera unos saldos de ProntoNet que coinciden dicen que cierra", async () => {
      const saldos = { openingBalance: 529445.6, closingBalance: 1512345.6 };
      for (const account of [saldos, { ...saldos, periodFrom: "2026-07-30" }, { ...saldos, periodTo: "2026-07-31" }]) {
        const r = await readStatement(credicoop(), { account });
        expect(r.checks?.closesWithProntoNet).toBeNull();
      }
    });

    it("con el período pero uno solo de los saldos de ProntoNet, no se compara", async () => {
      const period = { periodFrom: "2026-07-30", periodTo: "2026-07-31" };
      for (const account of [{ ...period, openingBalance: 1 }, { ...period, closingBalance: 2 }]) {
        const r = await readStatement(credicoop(), { account });
        expect(r.checks?.closesWithProntoNet).toBeNull();
        expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      }
    });

    it("si coincide uno solo de los dos saldos, no cierra y frena", async () => {
      const period = { periodFrom: "2026-07-30", periodTo: "2026-07-31" };
      for (const saldos of [{ openingBalance: 529445.6, closingBalance: 1 }, { openingBalance: 1, closingBalance: 1512345.6 }]) {
        const r = await readStatement(credicoop(), { account: { ...period, ...saldos } });
        expect(r.checks?.closesWithProntoNet).toBe(false);
        expect(r.warnings.find((w) => w.code === "no-cierra")?.blocksProposals).toBe(true);
      }
    });

    describe("un archivo que no trae los dos saldos se controla con el inicial de ProntoNet más los renglones", () => {
      const period = { periodFrom: "2026-07-01", periodTo: "2026-07-02" };
      const sinSaldos = () => csv("Fecha;Concepto;Importe", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00");
      const soloInicial = () => csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00");
      const soloFinal = () => csv("Fecha;Concepto;Importe", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00", "Saldo final;;1.090,00");

      it("si da el final, cierra", async () => {
        for (const file of [sinSaldos(), soloInicial(), soloFinal()]) {
          const r = await readStatement(file, { account: { ...period, openingBalance: 1000, closingBalance: 1090 } });
          expect(r.checks?.closesWithProntoNet).toBe(true);
          expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
        }
      });

      it("si no da el final, frena y dice la diferencia", async () => {
        const r = await readStatement(sinSaldos(), { account: { ...period, openingBalance: 1000, closingBalance: 1100 } });
        expect(r.checks?.closesWithProntoNet).toBe(false);
        expect(r.warnings.find((w) => w.code === "no-cierra")?.detail).toBe(
          "Partiendo del saldo inicial de ProntoNet y sumando los renglones se llega a $ 1.090,00, no a $ 1.100,00: hay una diferencia de $ 10,00.",
        );
      });

      it("si el archivo no cubre el período, no se compara", async () => {
        const r = await readStatement(sinSaldos(), { account: { periodFrom: "2026-06-01", periodTo: "2026-06-30", openingBalance: 1000, closingBalance: 1100 } });
        expect(r.checks?.closesWithProntoNet).toBeNull();
        expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      });
    });

    it("sin el período tampoco se comparan contra los renglones de un archivo sin saldos", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe", "01/07/2026;Transf recibida;100,00", "02/07/2026;Comision;-10,00"), {
        account: { openingBalance: 1, closingBalance: 2 },
      });
      expect(r.checks?.closesWithProntoNet).toBeNull();
      expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
    });
  });

  describe("el aviso concepto-nuevo", () => {
    it("agrupa los renglones con el mismo texto y dice qué se propuso", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;Pago raro de la casa;-100,00;900,00",
          "02/07/2026;Pago raro de la casa;-50,00;850,00",
          "03/07/2026;Intereses por descubierto;-20,00;830,00",
        ),
        { account: { cbu: CBU_CREDICOOP } },
      );
      const news = r.warnings.filter((w) => w.code === "concepto-nuevo");
      expect(news).toHaveLength(2);
      expect(news[0]).toMatchObject({
        blocksProposals: false,
        lines: [1, 2],
        data: { texto: "Pago raro de la casa", codigo: null, tipo: "sin-clasificar" },
      });
      expect(news[0].detail).toBe("El concepto «Pago raro de la casa» no está en la tabla de Banco Credicoop Cooperativo Limitado: quedó sin clasificar.");
      expect(news[1].detail).toBe(
        "El concepto «Intereses por descubierto» no está en la tabla de Banco Credicoop Cooperativo Limitado: se clasificó como intereses por una regla general.",
      );
      expect(news[1].lines).toEqual([3]);
    });

    it("el mismo texto con códigos de operación distintos son dos conceptos nuevos, cada uno con su código", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;901 - Pago raro de la casa;-100,00;900,00", "02/07/2026;902 - Pago raro de la casa;-50,00;850,00"),
      );
      const news = r.warnings.filter((w) => w.code === "concepto-nuevo");
      expect(news).toHaveLength(2);
      expect(news.map((w) => w.data)).toEqual([
        { texto: "Pago raro de la casa", codigo: "901", tipo: "sin-clasificar" },
        { texto: "Pago raro de la casa", codigo: "902", tipo: "sin-clasificar" },
      ]);
      expect(news.map((w) => w.lines)).toEqual([[1], [2]]);
    });

    it("el mismo texto con tipos distintos son dos conceptos nuevos, cada uno con su tipo", async () => {
      const r = await readStatement(
        csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Movimiento transf especial;100,00;1.100,00", "02/07/2026;Movimiento transf especial;-50,00;1.050,00"),
      );
      const news = r.warnings.filter((w) => w.code === "concepto-nuevo");
      expect(news.map((w) => w.data?.tipo)).toEqual(["transferencia-recibida", "transferencia-enviada"]);
      expect(news.map((w) => w.lines)).toEqual([[1], [2]]);
      expect(news[0].detail).toMatch(/se clasificó como transferencia-recibida/);
      expect(news[1].detail).toMatch(/se clasificó como transferencia-enviada/);
    });

    it("el mismo texto con el mismo código y el mismo tipo en renglones separados es un solo aviso", async () => {
      const r = await readStatement(
        csv(
          "Fecha;Concepto;Importe;Saldo",
          "01/07/2026;901 - Pago raro de la casa;-100,00;900,00",
          "02/07/2026;Otro cargo raro;-10,00;890,00",
          "03/07/2026;901 - Pago raro de la casa;-50,00;840,00",
        ),
      );
      const news = r.warnings.filter((w) => w.code === "concepto-nuevo");
      expect(news.map((w) => w.lines)).toEqual([[1, 3], [2]]);
    });
  });

  it("un cargo que es la alícuota de su vecino se clasifica por proporción, sea cual sea el sentido del archivo", async () => {
    const chronological = await readStatement(
      csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Comision mantenimiento de cuenta;-1.000,00;9.000,00", "01/07/2026;Cargo raro;-210,00;8.790,00"),
    );
    const reverse = await readStatement(
      csv("Fecha;Concepto;Importe;Saldo", "02/07/2026;Cargo raro;-210,00;8.790,00", "01/07/2026;Comision mantenimiento de cuenta;-1.000,00;9.000,00"),
    );
    expect(chronological.lines.map((l) => l.type.code)).toEqual(["comision", "iva"]);
    expect(reverse.lines.map((l) => l.type.code)).toEqual(["iva", "comision"]);
    expect(reverse.lines[0].type.source).toBe("rule");
  });

  it("el mismo movimiento tiene el mismo id en el Excel del más nuevo al más viejo y en el CSV cronológico", async () => {
    const excel = xlsx({
      H: [
        ["Fecha", "Concepto", "Nro.Cpbte.", "Importe", "Saldo"],
        ["02/07/2026", "Comision", "0", "-2,10", "1.195,80"],
        ["02/07/2026", "Comision", "0", "-2,10", "1.197,90"],
        ["01/07/2026", "Transf. Inmediata e/Ctas. Di", "123457", "200,00", "1.200,00"],
      ],
    });
    const file = Buffer.from(
      "Fecha;Concepto;Nro.Cpbte.;Importe;Saldo\n01/07/2026;Transf. Inmediata e/Ctas. Dist. Titular 30123;123457;200,00;1.200,00\n02/07/2026;Comision por transferencia;0;-2,10;1.197,90\n02/07/2026;Comision por transferencia;0;-2,10;1.195,80\n",
    );
    const account = { cbu: CBU_CREDICOOP };
    const a = await readStatement(excel, { account });
    const b = await readStatement(file, { account });
    expect(new Set(a.lines.map((l) => l.id))).toEqual(new Set(b.lines.map((l) => l.id)));
    expect(new Set(a.lines.map((l) => l.id)).size).toBe(3);
  });

  it("los mismos movimientos dan los mismos ids en un archivo con columna de referencia y en otro sin ella", async () => {
    const withReference = xlsx({
      H: [
        ["Fecha", "Concepto", "Nro.Cpbte.", "Importe", "Saldo"],
        ["01/07/2026", "Transf recibida", "5001", "200,00", "1.200,00"],
        ["02/07/2026", "Comision", "5003", "-2,10", "1.197,90"],
        ["02/07/2026", "Comision", "5002", "-2,10", "1.195,80"],
        ["03/07/2026", "Transf recibida", "5004", "10,00", "1.205,80"],
      ],
    });
    const without = csv(
      "Fecha;Concepto;Importe;Saldo",
      "01/07/2026;Transferencia recibida;200,00;1.200,00",
      "02/07/2026;Comision por transferencia;-2,10;1.197,90",
      "02/07/2026;Comision por transferencia;-2,10;1.195,80",
      "03/07/2026;Transferencia recibida;10,00;1.205,80",
    );
    const account = { cbu: CBU_CREDICOOP };
    const a = await readStatement(withReference, { account });
    const b = await readStatement(without, { account });
    expect(a.lines.map((l) => l.reference)).toEqual(["5001", "5003", "5002", "5004"]);
    expect(b.lines.map((l) => l.reference)).toEqual([null, null, null, null]);
    expect(new Set(a.lines.map((l) => l.id))).toEqual(new Set(b.lines.map((l) => l.id)));
    expect(new Set(a.lines.map((l) => l.id)).size).toBe(4);
  });

  describe("la cuenta de la clave del id", () => {
    const rows = [
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["01/07/2026", "Transf recibida", "100,00", "1.100,00"],
      ["02/07/2026", "Comision", "-10,00", "1.090,00"],
    ];
    const withCbu = () => xlsx({ H: [[`Cuenta CBU ${CBU_CREDICOOP}`], ...rows] });
    const withoutCbu = () => xlsx({ H: rows });
    const ids = async (file: Buffer, account?: KnownAccount) =>
      (await readStatement(file, account ? { account } : {})).lines.map((l) => l.id);

    it("con ProntoNet mandando solo el número, un archivo con el CBU en el título y otro sin él dan los mismos ids", async () => {
      const account = { number: "CTA CTE 191-001-012345/6" };
      expect(await ids(withCbu(), account)).toEqual(await ids(withoutCbu(), account));
    });

    it("el número se compara por sus cifras y sus letras, sin espacios ni signos ni mayúsculas", async () => {
      expect(await ids(withoutCbu(), { number: "CTA CTE 191-001-012345/6" })).toEqual(await ids(withoutCbu(), { number: "cta cte 191001012345 6" }));
    });

    it("el CBU de ProntoNet manda sobre el número y sobre el CBU del archivo", async () => {
      const byCbu = await ids(withoutCbu(), { cbu: CBU_CREDICOOP });
      expect(await ids(withoutCbu(), { cbu: CBU_CREDICOOP, number: "CTA CTE 1" })).toEqual(byCbu);
      expect(await ids(withCbu(), { cbu: CBU_CREDICOOP, number: "CTA CTE 1" })).toEqual(byCbu);
    });

    it("sin nada de ProntoNet, el CBU del archivo; sin ninguno de los dos, otra clave", async () => {
      expect(await ids(withCbu())).toEqual(await ids(withoutCbu(), { cbu: CBU_CREDICOOP }));
      expect(await ids(withoutCbu())).not.toEqual(await ids(withCbu()));
    });

    it("cuentas distintas dan ids distintos, y un número sin cifras ni letras es como no haberlo mandado", async () => {
      expect(await ids(withoutCbu(), { number: "CTA CTE 1" })).not.toEqual(await ids(withoutCbu(), { number: "CTA CTE 2" }));
      expect(await ids(withoutCbu(), { number: "CTA CTE 1" })).not.toEqual(await ids(withoutCbu(), { cbu: CBU_CREDICOOP }));
      expect(await ids(withoutCbu(), { number: " - / " })).toEqual(await ids(withoutCbu()));
      expect(await ids(withoutCbu(), { number: "CA 1" })).not.toEqual(await ids(withoutCbu(), { number: "CC 1" }));
    });

    it("sin ninguna cuenta, la clave es «sin-cuenta»", async () => {
      const r = await readStatement(withoutCbu());
      const chronological = r.lines.map((_, k) => k);
      expect(r.lines.map((l) => l.id)).toEqual(assignIds("sin-cuenta", r.lines, chronological));
    });
  });

  it("el mismo archivo da la misma huella y la misma lectura", async () => {
    const file = credicoop();
    expect(await readStatement(file)).toEqual(await readStatement(file));
    expect((await readStatement(file)).fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
