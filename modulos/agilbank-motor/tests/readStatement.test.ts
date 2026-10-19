import * as XLSX from "xlsx";
// La misma copia de sharp que usa el lector: una segunda cargaría otra libvips en el mismo proceso.
import sharp from "@agilmind/lectura/node_modules/sharp";
import * as spreadsheet from "../src/sources/spreadsheet";
import * as visual from "../src/sources/visual";
import { provenanceOf, readStatement } from "../src/readStatement";
import { assignIds } from "../src/identity";
import type { KnownAccount, StatementReading } from "../src/types";
import { pdfCifrado, pdfConTexto, rightAt, sparseBook, statementPdf, tiffDePaginas, xlsx } from "./helpers";

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
    expect(r.lines[2].provenance).toEqual({ origin: "cell", sheet: "saldos_y_movimientos", page: null, pageTo: null, fromRow: 4, toRow: 4 });
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

    it("con el saldo inicial impreso, un solo movimiento con saldo se controla, pero uno solo: avisa que se controla el total", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "Saldo anterior;;;1.000,00", "01/07/2026;Transf recibida;100,00;1.100,00"));
      expect(r.checks).toMatchObject({ linesWithBalance: 1, linesThatChain: 1 });
      expect(r.warnings.find((w) => w.code === "sin-saldos")?.detail).toBe("El archivo trae un solo saldo con qué controlar: se controla el total, no cada renglón.");
      expect(r.verdict).toBe("weak");
    });

    it("con dos movimientos controlados no avisa", async () => {
      const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "Saldo anterior;;;1.000,00", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00"));
      expect(r.checks).toMatchObject({ linesWithBalance: 2, linesThatChain: 2 });
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
    ["una foto JPG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    ["una foto PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0])],
  ])("%s, sin el OCR en el servidor: no disponible, sin lectura", async (_name, file) => {
    const off = process.env.AP_PADDLE_OCR;
    process.env.AP_PADDLE_OCR = "off";
    try {
      const r = await readStatement(file);
      expect(r).toMatchObject({ verdict: "unavailable", lines: [], header: null, checks: null, warnings: [] });
      expect(r.reason).toBe("No se pudo leer el archivo: el servidor no tiene el lector de imágenes. Avísennos; mientras tanto, manden el extracto en Excel, CSV o texto.");
      expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      if (off === undefined) delete process.env.AP_PADDLE_OCR;
      else process.env.AP_PADDLE_OCR = off;
    }
  });

  describe("un «XLS» que en realidad es HTML o XML 2003", () => {
    it("una tabla HTML sale leída, con los importes argentinos bien interpretados", async () => {
      const html = `<html><body><table>
        <tr><td>Fecha</td><td>Concepto</td><td>Débito</td><td>Crédito</td><td>Saldo</td></tr>
        <tr><td>01/07/2026</td><td>Transf recibida</td><td></td><td>100,00</td><td>1.100,00</td></tr>
        <tr><td>02/07/2026</td><td>Comision</td><td>10,00</td><td></td><td>1.090,00</td></tr>
        <tr><td>03/07/2026</td><td>IVA</td><td>2,10</td><td></td><td>1.087,90</td></tr>
      </table></body></html>`;
      const r = await readStatement(Buffer.from(html));
      // El primer saldo es el ancla: con tres renglones se controlan dos, lo que pide un verificado.
      expect(r.verdict).toBe("verified");
      expect(r.lines.map((l) => [l.date, l.amountCents, l.balanceCents])).toEqual([
        ["2026-07-01", 10000, 110000],
        ["2026-07-02", -1000, 109000],
        ["2026-07-03", -210, 108790],
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
<Row><Cell><Data ss:Type="String">03/07/2026</Data></Cell><Cell><Data ss:Type="String">IVA</Data></Cell><Cell><Data ss:Type="Number">-2.1</Data></Cell><Cell><Data ss:Type="Number">1087.9</Data></Cell></Row>
</Table></Worksheet></Workbook>`;
      const r = await readStatement(Buffer.from(xml));
      expect(r.verdict).toBe("verified");
      expect(r.lines.map((l) => [l.date, l.amountCents])).toEqual([
        ["2026-07-01", 10000],
        ["2026-07-02", -1000],
        ["2026-07-03", -210],
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

  it("un renglón de un texto no tiene página", async () => {
    const r = await readStatement(Buffer.from("Fecha;Concepto;Importe;Saldo\n01/07/2026;COMISION;-1,00;9,00\n02/07/2026;IVA;-1,00;8,00\n"));
    expect(r.lines[0].provenance).toMatchObject({ origin: "text", page: null, pageTo: null, fromRow: 2, toRow: 2 });
  });

  it("el CSV numera la procedencia desde la fila 1 del texto, sin hoja", async () => {
    const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;Transf recibida;100,00;1.100,00", "02/07/2026;Comision;-10,00;1.090,00"));
    expect(r.lines.map((l) => l.provenance)).toEqual([
      { origin: "text", sheet: null, page: null, pageTo: null, fromRow: 2, toRow: 2 },
      { origin: "text", sheet: null, page: null, pageTo: null, fromRow: 3, toRow: 3 },
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

    describe("si cierra con sus saldos", () => {
      const cierra = async (...filas: string[]) => (await readStatement(csv("Fecha;Concepto;Importe;Saldo", ...filas))).checks?.closesWithOwnBalances;

      it("con un solo saldo de renglón y ninguno impreso, las dos puntas salen de él: no se controló nada", async () => {
        const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;"));
        expect(r.header).toMatchObject({ openingBalanceCents: 100000, closingBalanceCents: 105000 });
        expect(r.checks).toMatchObject({ linesWithBalance: 1, closesWithOwnBalances: null, printedBalances: { openingCents: null, closingCents: null } });
        expect(r.warnings.map((w) => w.code)).not.toContain("no-cierra");
      });

      it("el veredicto de la lectura no cambia: lo decide el juez de saldos, no esta marca", async () => {
        const r = await readStatement(csv("Fecha;Concepto;Importe;Saldo", "01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;"));
        expect(r.verdict).toBe("weak");
        expect(r.warnings.map((w) => w.code)).toContain("sin-saldos");
      });

      it("con dos saldos de renglón, las puntas son distintas y la suma controla", async () => {
        expect(await cierra("01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;", "04/07/2026;D;10,00;1.060,00")).toBe(true);
      });

      it("con una punta impresa, la otra sale de su saldo de renglón y la suma controla", async () => {
        const filas = ["01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;"];
        expect(await cierra("Saldo anterior;;;1.000,00", ...filas)).toBe(true);
        expect(await cierra("Saldo anterior;;;1.000,00", ...filas, "Saldo final;;;1.000,00")).toBe(false);
        expect(await cierra(...filas, "Saldo final;;;1.050,00")).toBe(true);
        expect(await cierra(...filas, "Saldo final;;;1.000,00")).toBe(false);
      });

      it("con las dos puntas impresas y un solo saldo de renglón, la suma controla", async () => {
        const filas = ["Saldo anterior;;;1.000,00", "01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;"];
        expect(await cierra(...filas, "Saldo final;;;1.050,00")).toBe(true);
        expect(await cierra(...filas, "Saldo final;;;1.060,00")).toBe(false);
      });

      it("sin saldos de renglón y con los impresos, la suma controla", async () => {
        const r = await readStatement(csv("Fecha;Concepto;Importe", "Saldo anterior;;1.000,00", "01/07/2026;A;100,00", "02/07/2026;B;-30,00", "Saldo final;;1.070,00"));
        expect(r.checks?.closesWithOwnBalances).toBe(true);
      });
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

  it("un texto con fechas sin año se lee con el año del período de ProntoNet", async () => {
    const csv = Buffer.from("Fecha;Concepto;Importe;Saldo\n;Saldo anterior;;1.000,00\n02/07;COMISION;-10,00;990,00\n03/07;TRANSFERENCIA;100,00;1.090,00\n");
    const r = await readStatement(csv, { account: { periodFrom: "2026-07-01", periodTo: "2026-07-31" } });
    expect(r.lines.map((l) => l.date)).toEqual(["2026-07-02", "2026-07-03"]);
    expect(r.verdict).toBe("verified");
  });

  describe("fechas sin año sin el período ni una fecha completa", () => {
    const NO_YEAR = "El extracto trae las fechas sin año y no dice de qué período es: manden el período en la cuenta (periodoDesde y periodoHasta).";
    const csv = Buffer.from("Fecha;Concepto;Importe;Saldo\n;Saldo anterior;;1.000,00\n02/07;COMISION;-10,00;990,00\n03/07;TRANSFERENCIA;100,00;1.090,00\n");

    it("en un texto: sin lectura, con el motivo que dice qué falta", async () => {
      expect(await readStatement(csv)).toMatchObject({ verdict: "abstained", reason: NO_YEAR });
    });

    it("en un PDF, lo mismo", async () => {
      const pdf = pdfConTexto([[
        { x: 40, y: 780, texto: "FECHA" }, { x: 110, y: 780, texto: "CONCEPTO" }, { x: 400, y: 780, texto: "IMPORTE" }, { x: 500, y: 780, texto: "SALDO" },
        { x: 40, y: 760, texto: "01/07" }, { x: 110, y: 760, texto: "COMISION" }, { x: 400, y: 760, texto: "-10,00" }, { x: 500, y: 760, texto: "990,00" },
        { x: 40, y: 740, texto: "02/07" }, { x: 110, y: 740, texto: "IVA" }, { x: 400, y: 740, texto: "40,00" }, { x: 500, y: 740, texto: "1.030,00" },
      ]]);
      expect(await readStatement(pdf)).toMatchObject({ verdict: "abstained", reason: NO_YEAR });
    });

    it.each([[{ periodTo: "2026-07-31" }], [{ periodFrom: "2026-07-01" }]])("con un solo extremo del período alcanza para leerlo: %j", async (account) => {
      expect((await readStatement(csv, { account })).verdict).toBe("verified");
    });

    it("en un libro, basta una hoja con fechas sin año para dar el motivo", async () => {
      const book = xlsx({ Notas: [["Sin movimientos"]], Movimientos: [["Fecha", "Concepto", "Importe"], ["02/07", "COMISION", "-10,00"]] });
      expect(await readStatement(book)).toMatchObject({ verdict: "abstained", reason: NO_YEAR });
    });

    it("sin fechas sin año, el motivo de siempre", async () => {
      const r = await readStatement(Buffer.from("Fecha;Concepto\nayer;nada\n"));
      expect(r.reason).toBe("No se encontró una tabla de movimientos con fecha e importe.");
    });
  });
});

describe("provenanceOf", () => {
  const rows = [[], [], [], []];

  it("en una fuente tabular numera las filas desde 1 y no tiene página", () => {
    expect(provenanceOf({ origin: "cell", sheet: "H", rows }, 1, 3)).toEqual({ origin: "cell", sheet: "H", page: null, pageTo: null, fromRow: 2, toRow: 4 });
  });

  it("en una visual da la página y la línea dentro de ella, la de cada punta", () => {
    const places = [
      { page: 1, line: 1, origin: "pdf" as const },
      { page: 1, line: 2, origin: "pdf" as const },
      { page: 2, line: 1, origin: "ocr" as const },
      { page: 3, line: 5, origin: "ocr" as const },
    ];
    expect(provenanceOf({ origin: "ocr", sheet: null, rows, places }, 1, 3)).toEqual({ origin: "pdf", sheet: null, page: 1, pageTo: 3, fromRow: 2, toRow: 5 });
    expect(provenanceOf({ origin: "ocr", sheet: null, rows, places }, 2, 2)).toEqual({ origin: "ocr", sheet: null, page: 2, pageTo: 2, fromRow: 1, toRow: 1 });
  });
});

describe("readStatement: anexos", () => {
  it("un anexo no da renglones y completa el CUIT del movimiento que nombra (AC-06, AC-07)", async () => {
    const file = Buffer.from(
      [
        "Fecha;Concepto;Debito;Credito;Saldo",
        ";SALDO ANTERIOR;;;1.000,00",
        "01/07/2026;COMISION;-10,00;;990,00",
        "02/07/2026;TRANSFERENCIA;;40,00;1.030,00",
        ";;;;",
        "Fecha;Empresa;Referencia;Importe",
        "02/07/2026;30712345671 ACME SA;VARIOS;40,00",
        "05/08/2026;30712345671 ACME SA;VARIOS;50,00",
      ].join("\n"),
    );
    const r = await readStatement(file);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].counterparty).toEqual({ cuit: "30712345671", name: "ACME SA", cbu: null });
    expect(r.verdict).toBe("verified");
  });
});

describe("un PDF con texto", () => {
  it("se lee por su texto, con la página y la línea de cada renglón", async () => {
    const r = await readStatement(statementPdf());
    expect(r.verdict).toBe("verified");
    expect(r.lines.map((l) => [l.date, l.amountCents, l.balanceCents])).toEqual([
      ["2026-07-01", -1000, 99000], ["2026-07-02", 4000, 103000], ["2026-07-03", -210, 102790], ["2026-07-04", 210, 103000],
    ]);
    expect(r.lines.map((l) => [l.provenance.origin, l.provenance.page])).toEqual([["pdf", 1], ["pdf", 1], ["pdf", 2], ["pdf", 2]]);
    expect(r.lines.some((l) => /Pagina/.test(l.bank.text))).toBe(false);
  });

  describe("la línea sin fecha ni importe debajo del último movimiento", () => {
    const header = (y: number) => [{ x: 40, y, texto: "FECHA" }, { x: 110, y, texto: "CONCEPTO" }, rightAt(380, y, "DEBITO"), rightAt(460, y, "CREDITO"), rightAt(550, y, "SALDO")];
    const row = (y: number, date: string, concept: string, debit: string | null, credit: string | null, balance: string) => [
      { x: 40, y, texto: date }, { x: 110, y, texto: concept }, ...(debit ? [rightAt(380, y, debit)] : []), ...(credit ? [rightAt(460, y, credit)] : []), rightAt(550, y, balance),
    ];
    const statement = (below: { y: number; texto: string }) =>
      pdfConTexto([[
        ...header(780), { x: 110, y: 760, texto: "SALDO ANTERIOR" }, rightAt(550, 760, "1.000,00"),
        ...row(740, "01/07/2026", "COMISION", "-10,00", null, "990,00"), ...row(720, "02/07/2026", "TRANSFERENCIA", null, "40,00", "1.030,00"),
        ...row(700, "03/07/2026", "IVA", "-2,10", null, "1.027,90"),
        { x: 110, ...below },
      ]]);

    it("el pie de la página, en la columna del concepto, no se pega al último movimiento ni le da contraparte", async () => {
      const r = await readStatement(statement({ y: 100, texto: `BANCO EJEMPLO S.A. CUIT 30-71234567-1` }));
      expect(r.verdict).toBe("verified");
      expect(r.lines).toHaveLength(3);
      expect(r.lines[2].bank.text).toBe("IVA");
      expect(r.lines[2].counterparty).toBeNull();
    });

    it("la línea de abajo, pegada al movimiento, lo sigue completando: el CUIT de la contraparte", async () => {
      const r = await readStatement(statement({ y: 688, texto: `CUIT ${CUIT} ACME SA` }));
      expect(r.lines[2].bank.text).toBe(`IVA CUIT ${CUIT} ACME SA`);
      expect(r.lines[2].counterparty).toMatchObject({ cuit: CUIT });
    });
  });

  it("con más páginas que el tope, lee las primeras y avisa la lectura parcial", async () => {
    const r = await readStatement(statementPdf(), { visual: { maxPages: 1 } });
    expect(r.lines).toHaveLength(2);
    const w = r.warnings.find((x) => x.code === "lectura-parcial");
    expect(w).toMatchObject({ blocksProposals: true, data: { paginas: 2, paginasLeidas: 1, causa: "paginas" } });
    expect(w?.detail).toBe(
      "Se leyeron 1 de 2 páginas: el archivo pasa el tope de 1 páginas. Para leer el resto, manden el extracto partido en archivos más chicos. Los renglones de las otras páginas no están en esta lectura.",
    );
    expect(r.verdict).toBe("weak");
  });

  it("con la lectura parcial no avisa no-cierra: los renglones que faltan pueden ser la diferencia, y es weak por el aviso de la lectura parcial", async () => {
    // Los saldos de ProntoNet no son los de este extracto; el corte cae en los últimos cinco días del período.
    const account = { openingBalance: 1000, closingBalance: 1050, periodFrom: "2026-07-01", periodTo: "2026-07-04" };
    const entera = await readStatement(statementPdf(), { account });
    const cierre = (r: StatementReading) => r.warnings.map((w) => w.code).filter((c) => c === "no-cierra" || c === "lectura-parcial");
    expect(cierre(entera)).toEqual(["no-cierra"]);
    const parcial = await readStatement(statementPdf(), { account, visual: { maxPages: 1 } });
    expect(cierre(parcial)).toEqual(["lectura-parcial"]);
    expect(parcial.verdict).toBe("weak");
  });

  describe("el aviso de la lectura parcial dice la causa del corte", () => {
    const cutAt = async (cut: "tiempo" | "render" | "ocr") => {
      const whole = await visual.readPdf(statementPdf());
      if (whole.kind !== "read") throw new Error(whole.kind);
      const spy = jest.spyOn(visual, "readPdf").mockResolvedValueOnce({ ...whole, pages: 3, pagesRead: 2, cut });
      const r = await readStatement(statementPdf());
      spy.mockRestore();
      return r.warnings.find((x) => x.code === "lectura-parcial");
    };

    it.each([
      ["tiempo", "Se leyeron 2 de 3 páginas: se acabó el tiempo de la lectura. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer. Si vuelve a cortarse, manden el extracto partido en archivos más chicos. Los renglones de las otras páginas no están en esta lectura."],
      ["render", "Se leyeron 2 de 3 páginas: la página 3 no se pudo preparar para leerla. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer. Los renglones de las otras páginas no están en esta lectura."],
      ["ocr", "Se leyeron 2 de 3 páginas: el lector de imágenes falló en la página 3. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer. Los renglones de las otras páginas no están en esta lectura."],
    ] as const)("%s", async (cut, detail) => {
      const w = await cutAt(cut);
      expect(w).toMatchObject({ blocksProposals: true, data: { paginas: 3, paginasLeidas: 2, causa: cut } });
      expect(w?.detail).toBe(detail);
    });

    it("una lectura entera no trae el aviso", async () => {
      expect((await readStatement(statementPdf())).warnings.some((w) => w.code === "lectura-parcial")).toBe(false);
    });
  });
});

describe("un PDF que no se terminó de leer y en lo leído no está la tabla", () => {
  // Una portada con texto que sirve y sin movimientos.
  const cover = [{ x: 40, y: 780, texto: "RESUMEN DE CUENTA CORRIENTE" }, { x: 40, y: 760, texto: "SUCURSAL CENTRO" }, { x: 40, y: 740, texto: "EMITIDO EN JULIO" }];
  const table = (date: (day: number) => string) => [
    { x: 40, y: 780, texto: "FECHA" }, { x: 110, y: 780, texto: "CONCEPTO" }, { x: 400, y: 780, texto: "IMPORTE" }, { x: 500, y: 780, texto: "SALDO" },
    { x: 40, y: 760, texto: date(1) }, { x: 110, y: 760, texto: "COMISION" }, { x: 400, y: 760, texto: "-10,00" }, { x: 500, y: 760, texto: "990,00" },
    { x: 40, y: 740, texto: date(2) }, { x: 110, y: 740, texto: "IVA" }, { x: 400, y: 740, texto: "40,00" }, { x: 500, y: 740, texto: "1.030,00" },
  ];
  const withYear = table((d) => `0${d}/07/2026`);
  const withoutYear = table((d) => `0${d}/07`);
  const NO_YEAR = "El extracto trae las fechas sin año y no dice de qué período es: manden el período en la cuenta (periodoDesde y periodoHasta).";

  /** La lectura de `pages` cortada por `cut` después de `pagesRead`, con las páginas leídas que se pasan. */
  const cutAt = async (read: Array<typeof cover>, pages: number, cut: "tiempo" | "render" | "ocr") => {
    const whole = await visual.readPdf(pdfConTexto(read));
    if (whole.kind !== "read") throw new Error(whole.kind);
    const spy = jest.spyOn(visual, "readPdf").mockResolvedValueOnce({ ...whole, pages, pagesRead: read.length, cut });
    const r = await readStatement(statementPdf());
    spy.mockRestore();
    return r;
  };

  it("la página 1 en blanco, el OCR falla en la 2 y la tabla está en la 3: no disponible, y no una conclusión sobre el archivo", async () => {
    const white = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ffffff" } }).png().toBuffer();
    let calls = 0;
    const tools: Partial<visual.VisualTools> = {
      ocrReady: async () => true,
      render: async (_file, o) => Array.from({ length: o.hasta - o.desde + 1 }, (_, i) => ({ pagina: o.desde + i, png: white })),
      ocr: async () => (++calls === 1 ? { vacia: true } : { fallo: "sin memoria" }),
    };
    const original = visual.readPdf;
    const spy = jest.spyOn(visual, "readPdf").mockImplementationOnce((file, limits) => original(file, limits, tools));
    const r = await readStatement(pdfConTexto([[], [], withYear]));
    spy.mockRestore();
    expect(r).toMatchObject({
      verdict: "unavailable",
      reason: "Se leyeron 1 de 3 páginas y en ellas no está la tabla de movimientos: el lector de imágenes falló en la página 2. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer.",
      header: null,
      lines: [],
      warnings: [],
      checks: null,
    });
  });

  it.each([
    ["tiempo", "Se leyeron 2 de 5 páginas y en ellas no está la tabla de movimientos: se acabó el tiempo de la lectura. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer. Si vuelve a cortarse, manden el extracto partido en archivos más chicos."],
    ["render", "Se leyeron 2 de 5 páginas y en ellas no está la tabla de movimientos: la página 3 no se pudo preparar para leerla. Es una falla nuestra: envíen el archivo de nuevo y se vuelve a leer."],
  ] as const)("cortada por %s: no disponible, con el motivo del corte", async (cut, reason) => {
    expect(await cutAt([cover, cover], 5, cut)).toMatchObject({ verdict: "unavailable", reason, lines: [], warnings: [] });
  });

  it("cortada por nosotros, aunque lo leído traiga fechas sin año: no disponible, porque la fecha completa puede estar en lo que no se leyó", async () => {
    expect(await cutAt([withoutYear], 3, "ocr")).toMatchObject({ verdict: "unavailable" });
  });

  it("cortada por el tope de páginas: sin lectura, y el motivo dice que se miraron solo las primeras", async () => {
    const r = await readStatement(pdfConTexto([cover, cover, withYear]), { visual: { maxPages: 2 } });
    expect(r).toMatchObject({
      verdict: "abstained",
      reason: "Se leyeron 2 de 3 páginas y en ellas no está la tabla de movimientos: el archivo pasa el tope de 2 páginas. Para leer el resto, manden el extracto partido en archivos más chicos.",
      lines: [],
      warnings: [],
    });
  });

  it("cortada por el tope de páginas con fechas sin año: el motivo de las fechas, que dice qué mandar", async () => {
    expect(await readStatement(pdfConTexto([withoutYear, cover]), { visual: { maxPages: 1 } })).toMatchObject({ verdict: "abstained", reason: NO_YEAR });
  });
});

describe("los techos de la lectura visual", () => {
  const whole = async () => readStatement(statementPdf());

  it.each([
    ["maxPages sin valor", { maxPages: undefined }],
    ["maxPages en 0", { maxPages: 0 }],
  ])("%s vale como el techo de siempre: lee el PDF entero, sin aviso", async (_name, visual) => {
    const r = await readStatement(statementPdf(), { visual });
    expect(r.lines).toHaveLength(4);
    expect(r.warnings.some((w) => w.code === "lectura-parcial")).toBe(false);
    expect(r.verdict).toBe("verified");
  });

  it.each([
    ["budgetMs sin valor", { budgetMs: undefined }],
    ["dpi negativo", { dpi: -1 }],
    ["maxPages fraccionario", { maxPages: 1.5 }],
  ])("%s no cambia la lectura", async (_name, visual) => {
    expect(await readStatement(statementPdf(), { visual })).toEqual(await whole());
  });
});

describe("un PDF que hay que leer por OCR", () => {
  const off = process.env.AP_PADDLE_OCR;
  beforeEach(() => (process.env.AP_PADDLE_OCR = "off"));
  afterEach(() => (off === undefined ? delete process.env.AP_PADDLE_OCR : (process.env.AP_PADDLE_OCR = off)));

  it("sin el OCR en el servidor, no disponible y no una lectura a medias", async () => {
    const mixed = pdfConTexto([[{ x: 40, y: 780, texto: "01/07/2026 COMISION -10,00 990,00 02/07/2026 IVA -1,00 989,00" }], []]);
    const r = await readStatement(mixed);
    expect(r.verdict).toBe("unavailable");
    expect(r.reason).toBe("No se pudo leer el archivo: el servidor no tiene el lector de imágenes. Avísennos; mientras tanto, manden el extracto en Excel, CSV o texto.");
    expect(r.lines).toEqual([]);
  });
});

describe("un PDF que no se abre", () => {
  // Sin OCR: si poppler abriera el cifrado como una página en blanco, no hace falta leerla para el test.
  const off = process.env.AP_PADDLE_OCR;
  beforeEach(() => (process.env.AP_PADDLE_OCR = "off"));
  afterEach(() => (off === undefined ? delete process.env.AP_PADDLE_OCR : (process.env.AP_PADDLE_OCR = off)));

  it("roto: sin lectura, con el motivo", async () => {
    const r = await readStatement(Buffer.from("%PDF-1.4\nesto no sigue"));
    expect(r).toMatchObject({ verdict: "abstained", reason: "No se pudo abrir el PDF: está dañado o protegido con contraseña." });
  });

  it("cifrado: sin lectura, con el motivo, sin lanzar. No es no-disponible: el reenvío lo volvería a leer para siempre", async () => {
    const r = await readStatement(pdfCifrado());
    expect(r).toMatchObject({ verdict: "abstained", reason: "No se pudo abrir el PDF: está dañado o protegido con contraseña." });
  });
});

it("una foto HEIC no se lee, con el motivo", async () => {
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(16)]);
  expect(await readStatement(heic)).toMatchObject({ verdict: "abstained", reason: "Las fotos HEIC no se leen: manden la foto en JPG o PNG, o el extracto en PDF." });
});

it("un TIFF de varias páginas no se lee a medias: sin lectura, con el motivo", async () => {
  const r = await readStatement(await tiffDePaginas(30, 20, 2));
  expect(r).toMatchObject({ verdict: "abstained", reason: "La imagen tiene 2 páginas: manden el extracto en PDF.", lines: [], warnings: [] });
});

describe("readStatement: el saldo solo al cierre del día", () => {
  // Como el Credicoop en PDF: el saldo anterior arriba y el saldo impreso en el último movimiento de cada día.
  const daily = (wrong = false) =>
    csv(
      "Fecha;Concepto;Débito;Crédito;Saldo",
      "Saldo anterior;;;;1.000,00",
      "01/07/2026;Comision;10,00;;",
      "01/07/2026;Transf recibida;;200,00;",
      "01/07/2026;IVA;2,10;;1.187,90",
      "02/07/2026;Sellos;5,00;;",
      `02/07/2026;Transf emitida;${wrong ? "300,00" : "30,00"};;`,
      "02/07/2026;Deposito;;50,00;1.202,90",
      "03/07/2026;Comision;10,00;;",
      "03/07/2026;Transf recibida;;7,10;",
      "03/07/2026;IVA;2,10;;1.197,90",
    );

  it("encadena por tramos entre los saldos impresos: verificado, y los renglones del medio sin control", async () => {
    const r = await readStatement(daily());
    expect(r.verdict).toBe("verified");
    expect(r.lines.map((l) => l.chains)).toEqual([null, null, true, null, null, true, null, null, true]);
    expect(r.checks).toMatchObject({ linesWithBalance: 3, linesThatChain: 3 });
    expect(r.warnings.map((w) => w.code)).not.toContain("sin-saldos");
  });

  it("un importe mal en un tramo: débil, y no encadena el renglón que cierra ese tramo", async () => {
    const r = await readStatement(daily(true));
    expect(r.verdict).toBe("weak");
    expect(r.lines.map((l) => l.chains)).toEqual([null, null, true, null, null, false, null, null, true]);
    expect(r.warnings.find((w) => w.code === "no-encadena")?.lines).toEqual([6]);
  });
});

describe("readStatement: un solo control no verifica", () => {
  // El saldo anterior y un único saldo al final: se controla el total, no cada renglón.
  const rows = ["Fecha;Concepto;Débito;Crédito;Saldo", "Saldo anterior;;;;1.000,00"];
  [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach((a, k) => rows.push(`0${1 + Math.floor(k / 3)}/07/2026;Comision ${k};${a},00;;`));

  it("con un solo renglón controlado, aunque encadene, es débil", async () => {
    const r = await readStatement(csv(...rows, "04/07/2026;IVA;1,00;;549,00"));
    expect(r.checks).toMatchObject({ linesWithBalance: 1, linesThatChain: 1 });
    expect(r.verdict).toBe("weak");
    // El débil dice por qué: el mismo aviso que un saldo final rotulado.
    expect(r.warnings.find((w) => w.code === "sin-saldos")?.detail).toBe("El archivo trae un solo saldo con qué controlar: se controla el total, no cada renglón.");
  });

  it("con dos renglones controlados que encadenan, verificado", async () => {
    const r = await readStatement(csv(...rows.slice(0, -1), "03/07/2026;Comision 8;90,00;;550,00", "04/07/2026;IVA;1,00;;549,00"));
    expect(r.checks).toMatchObject({ linesWithBalance: 2, linesThatChain: 2 });
    expect(r.verdict).toBe("verified");
  });
});
