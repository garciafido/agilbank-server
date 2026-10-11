import * as XLSX from "xlsx";
import { formatOf } from "../src/sources/format";
import {
  SpreadsheetTooLarge, cellValue, clipMerges, gridsFromMarkup, gridsFromSpreadsheet, markupSizeProblem, mergedArea, spreadsheetSizeProblem,
} from "../src/sources/spreadsheet";
import { NotText, TextTooLarge, chooseSeparator, decodeText, gridFromText, lineCount, mode, textSizeProblem } from "../src/sources/text";
import { editSheetsXml, isoDateCell, serialDateCell, sparseBook, xlsx } from "./helpers";

/** Un libro de una sola hoja con una celda suelta en `address`, sin nada entre ella y la A1. */
const sheetWithCell = (address: string): Buffer => {
  const book = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = { A1: { t: "s", v: "Fecha" }, [address]: { t: "s", v: "x" }, "!ref": `A1:${address}` };
  XLSX.utils.book_append_sheet(book, ws, "H");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

/** Cuánto tarda y cuánta memoria pide `run`, aunque lance. */
const measure = (run: () => unknown): { ms: number; heapMb: number } => {
  const heap = process.memoryUsage().heapUsed;
  const start = Date.now();
  try {
    run();
  } catch {
    // Lo que lanza lo mira cada test.
  }
  return { ms: Date.now() - start, heapMb: (process.memoryUsage().heapUsed - heap) / 1024 / 1024 };
};

/** Una tabla HTML como la que muchos home banking guardan con extensión .xls. */
const HTML_XLS = `<html><head><meta charset="utf-8"></head><body><table>
<tr><td>Fecha</td><td>Concepto</td><td>Débito</td><td>Crédito</td><td>Saldo</td></tr>
<tr><td>01/07/2026</td><td>Transf recibida</td><td></td><td>100,00</td><td>1.100,00</td></tr>
<tr><td>02/07/2026</td><td>Comisión</td><td>10,00</td><td></td><td>1.090,00</td></tr>
</table></body></html>`;

/** Una planilla XML 2003 (SpreadsheetML), con celdas de texto, de número y de fecha. */
const XML_2003 = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Movimientos"><Table>
<Row><Cell><Data ss:Type="String">Fecha</Data></Cell><Cell><Data ss:Type="String">Concepto</Data></Cell><Cell><Data ss:Type="String">Importe</Data></Cell><Cell><Data ss:Type="String">Saldo</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">01/07/2026</Data></Cell><Cell><Data ss:Type="String">Transf recibida</Data></Cell><Cell><Data ss:Type="Number">100</Data></Cell><Cell><Data ss:Type="Number">1100</Data></Cell></Row>
<Row><Cell><Data ss:Type="DateTime">2026-07-02T00:00:00.000</Data></Cell><Cell><Data ss:Type="String">Comisión</Data></Cell><Cell><Data ss:Type="String">-10,00</Data></Cell><Cell><Data ss:Type="Number">1090</Data></Cell></Row>
</Table></Worksheet></Workbook>`;

describe("formatOf", () => {
  it("reconoce cada formato por sus primeros bytes", () => {
    expect(formatOf(xlsx({ H: [["a"]] }))).toBe("xlsx");
    expect(formatOf(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe("xls");
    expect(formatOf(Buffer.from("%PDF-1.7\n"))).toBe("pdf");
    expect(formatOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image");
    expect(formatOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe("image");
    expect(formatOf(Buffer.from("Fecha;Concepto\n"))).toBe("text");
  });

  it("una tabla HTML o una planilla XML 2003 son marcado, aunque vengan con espacios o la marca de orden de bytes adelante", () => {
    expect(formatOf(Buffer.from(HTML_XLS))).toBe("markup");
    expect(formatOf(Buffer.from(XML_2003))).toBe("markup");
    expect(formatOf(Buffer.from("\uFEFF \r\n\t" + HTML_XLS))).toBe("markup");
    expect(formatOf(Buffer.from("<TABLE border=1><TR><TD>Fecha</TD></TR></TABLE>"))).toBe("markup");
  });

  it("un texto que no empieza con «<», o un marcado sin tabla ni planilla de Office, es texto", () => {
    expect(formatOf(Buffer.from("Fecha;Concepto <table>\n"))).toBe("text");
    expect(formatOf(Buffer.from("<html><body><p>Sin tabla</p><tablero></tablero></body></html>"))).toBe("text");
    expect(formatOf(Buffer.from('<?xml version="1.0"?><Otro xmlns="urn:otra-cosa"/>'))).toBe("text");
    expect(formatOf(Buffer.from(""))).toBe("text");
    expect(formatOf(Buffer.from("   "))).toBe("text");
  });
});

describe("gridsFromMarkup", () => {
  it("una tabla HTML deja fechas e importes como texto, para que los interprete el motor", () => {
    const [g] = gridsFromMarkup(Buffer.from(HTML_XLS));
    expect(g.origin).toBe("cell");
    expect(g.rows[1]).toEqual(["01/07/2026", "Transf recibida", null, "100,00", "1.100,00"]);
    expect(g.rows[2]).toEqual(["02/07/2026", "Comisión", "10,00", null, "1.090,00"]);
  });

  it("una tabla HTML en Windows-1252 conserva los acentos", () => {
    const [g] = gridsFromMarkup(Buffer.from(HTML_XLS.replace(' charset="utf-8"', ""), "latin1"));
    expect(g.rows[2][1]).toBe("Comisión");
  });

  it("una planilla XML 2003 conserva el nombre de la hoja, los números y las fechas", () => {
    const [g] = gridsFromMarkup(Buffer.from(XML_2003));
    expect(g.sheet).toBe("Movimientos");
    expect(g.rows[1]).toEqual(["01/07/2026", "Transf recibida", 100, 1100]);
    expect(g.rows[2]).toEqual(["2026-07-02", "Comisión", "-10,00", 1090]);
  });
});

describe("gridsFromSpreadsheet", () => {
  it("lee la fecha ISO de Galicia y la de número de serie como AAAA-MM-DD, sin correr el día", () => {
    const [g] = gridsFromSpreadsheet(xlsx({ M: [["Fecha"], [isoDateCell("2025-06-02")], [serialDateCell("2026-07-31")]] }));
    expect(g.rows[1][0]).toBe("2025-06-02");
    expect(g.rows[2][0]).toBe("2026-07-31");
  });

  it("una celda combinada vale solo en la de arriba a la izquierda", () => {
    const [g] = gridsFromSpreadsheet(
      xlsx(
        { H: [["Concepto", "Importe"], ["Transferencia por Pago de Haberes", 10], [null, 20]] },
        { merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }] },
      ),
    );
    expect(g.rows[1][0]).toBe("Transferencia por Pago de Haberes");
    expect(g.rows[2]).toEqual([null, 20]);
  });

  it("conserva las coordenadas de la hoja aunque la columna A esté vacía", () => {
    const [g] = gridsFromSpreadsheet(xlsx({ H: [[null, "Fecha", "Importe"], [null, "31/07/2026", 10]] }));
    expect(g.rows[0]).toEqual([null, "Fecha", "Importe"]);
    expect(g.rows[1]).toEqual([null, "31/07/2026", 10]);
  });

  it("deja el texto como texto, aunque parezca un importe", () => {
    const [g] = gridsFromSpreadsheet(xlsx({ H: [["1.234,56"], ["  "]] }));
    expect(g.rows[0][0]).toBe("1.234,56");
    expect(g.rows[1][0]).toBeNull();
  });

  it("devuelve una grilla por hoja, con su nombre", () => {
    const grids = gridsFromSpreadsheet(xlsx({ Movimientos: [["a"]], Resumen: [["b"]] }));
    expect(grids.map((g) => g.sheet)).toEqual(["Movimientos", "Resumen"]);
    expect(grids.every((g) => g.origin === "cell")).toBe(true);
  });

  it("en un libro con fechas de 1904 da la misma fecha que muestra la planilla", () => {
    const file = xlsx({ M: [["Fecha"], [serialDateCell("2026-07-31", "dd/mm/yyyy", true)]] }, { date1904: true });
    expect(XLSX.read(file, { type: "buffer", cellNF: true }).Sheets.M.A2.w).toBe("31/07/2026");
    const [g] = gridsFromSpreadsheet(file);
    expect(g.rows[1][0]).toBe("2026-07-31");
  });

  it("una hora sin fecha queda como el texto de la hora, no como una fecha", () => {
    const [g] = gridsFromSpreadsheet(
      xlsx({ H: [[{ t: "n", v: 0.5, z: "hh:mm" }], [{ t: "n", v: 46234.5, z: "dd/mm/yyyy hh:mm" }]] }),
    );
    expect(g.rows[0][0]).toBe("12:00");
    expect(g.rows[1][0]).toBe("2026-07-31");
  });

  it("una celda suelta más allá del tope lanza SpreadsheetTooLarge con un mensaje para el usuario", () => {
    expect(() => gridsFromSpreadsheet(sheetWithCell("A200000"))).toThrow(SpreadsheetTooLarge);
    expect(() => gridsFromSpreadsheet(sheetWithCell("A200000"))).toThrow(/fila 200000/);
    expect(() => gridsFromSpreadsheet(sheetWithCell("A50001"))).toThrow(SpreadsheetTooLarge);
    expect(() => gridsFromSpreadsheet(sheetWithCell("IW1"))).toThrow(/columna IW/);
  });

  it("acepta una celda justo dentro del tope de filas y de columnas", () => {
    const [rowsEdge] = gridsFromSpreadsheet(sheetWithCell("A50000"));
    expect(rowsEdge.rows).toHaveLength(50_000);
    const [colsEdge] = gridsFromSpreadsheet(sheetWithCell("IV1"));
    expect(colsEdge.rows[0]).toHaveLength(256);
  });

  it("una combinada cuya esclava trae un valor escrito se resuelve a la de arriba a la izquierda", () => {
    const [g] = gridsFromSpreadsheet(
      xlsx(
        { H: [["Concepto", "Importe"], ["Transferencia por Pago de Haberes", 10], ["duplicado", 20]] },
        { merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }] },
      ),
    );
    expect(g.rows[1]).toEqual(["Transferencia por Pago de Haberes", 10]);
    expect(g.rows[2]).toEqual([null, 20]);
  });

  it.each([1, 3])("un libro de %i hojas con una celda suelta lejana en cada una se rechaza rápido y sin armar la grilla", (sheets) => {
    const file = sparseBook(sheets);
    expect(file.length).toBeLessThan(sheets * 20_000);
    expect(() => gridsFromSpreadsheet(file)).toThrow(SpreadsheetTooLarge);
    expect(() => gridsFromSpreadsheet(file)).toThrow(/demasiado grande/);
    const { ms, heapMb } = measure(() => gridsFromSpreadsheet(file));
    expect(ms).toBeLessThan(2000);
    expect(heapMb).toBeLessThan(256);
  });

  it("una hoja sin celdas es una grilla sin filas", () => {
    const grids = gridsFromSpreadsheet(xlsx({ Vacia: [], Movimientos: [["a"]] }));
    expect(grids.map((g) => [g.sheet, g.rows])).toEqual([
      ["Vacia", []],
      ["Movimientos", [["a"]]],
    ]);
  });

  it("las filas pueden venir desordenadas en el archivo: la grilla llega hasta la más lejana", () => {
    const file = editSheetsXml(xlsx({ H: [["uno"], [null], ["tres"]] }), (xml) => {
      const rows = xml.match(/<row [^>]*>.*?<\/row>/g) ?? [];
      return xml.replace(rows.join(""), [...rows].reverse().join(""));
    });
    const [g] = gridsFromSpreadsheet(file);
    expect(g.rows).toEqual([["uno"], [null], ["tres"]]);
  });

  it("una combinada que se pasa de la última fila con datos no se rompe", () => {
    const [g] = gridsFromSpreadsheet(xlsx({ H: [["Concepto", "Importe"], ["Transferencia", 10]] }, { merges: [{ s: { r: 1, c: 0 }, e: { r: 9, c: 0 } }] }));
    expect(g.rows).toEqual([["Concepto", "Importe"], ["Transferencia", 10]]);
  });

  it("una combinada en la misma fila deja vacía la esclava de la derecha", () => {
    const [g] = gridsFromSpreadsheet(xlsx({ H: [["Concepto largo", "duplicado", 10]] }, { merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }] }));
    expect(g.rows).toEqual([["Concepto largo", null, 10]]);
  });

  it("lanza si el archivo no es una planilla", () => {
    expect(() => gridsFromSpreadsheet(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow();
  });
});

describe("spreadsheetSizeProblem", () => {
  const sheet = (lastRow: number, lastCol: number) => ({ lastRow, lastCol });

  it("dentro de los topes no hay problema; una hoja vacía no ocupa nada", () => {
    expect(spreadsheetSizeProblem([])).toBeNull();
    expect(spreadsheetSizeProblem([sheet(-1, -1), sheet(9, 3)])).toBeNull();
  });

  it("el tope por hoja: 50.000 filas y 256 columnas", () => {
    expect(spreadsheetSizeProblem([sheet(49_999, 0)])).toBeNull();
    expect(spreadsheetSizeProblem([sheet(0, 255)])).toBeNull();
    expect(spreadsheetSizeProblem([sheet(50_000, 0)])).toBe(
      "La planilla es demasiado grande: tiene celdas hasta la fila 50001 y la columna A; un extracto entra en 50.000 filas y 256 columnas.",
    );
    expect(spreadsheetSizeProblem([sheet(0, 256)])).toMatch(/hasta la fila 1 y la columna IW;/);
  });

  it("las celdas combinadas cuentan contra el mismo presupuesto", () => {
    expect(spreadsheetSizeProblem([{ lastRow: 49_999, lastCol: 49, mergedCells: 2_500_000 }])).toBeNull();
    expect(spreadsheetSizeProblem([{ lastRow: 49_999, lastCol: 49, mergedCells: 2_500_001 }])).toBe(
      "La planilla es demasiado grande: sus hojas ocupan 5.000.001 celdas, contando las combinadas, y un extracto entra en 5.000.000.",
    );
    expect(spreadsheetSizeProblem([{ lastRow: 0, lastCol: 0, mergedCells: 3_000_000 }, { lastRow: 0, lastCol: 0, mergedCells: 3_000_000 }])).toMatch(
      /ocupan 6\.000\.002 celdas, contando las combinadas/,
    );
  });

  it("el presupuesto es del libro entero: 5.000.000 de celdas entre todas las hojas", () => {
    expect(spreadsheetSizeProblem([sheet(49_999, 99)])).toBeNull();
    expect(spreadsheetSizeProblem([sheet(24_999, 99), sheet(24_999, 99)])).toBeNull();
    expect(spreadsheetSizeProblem([sheet(49_999, 99), sheet(0, 0)])).toBe(
      "La planilla es demasiado grande: sus hojas ocupan 5.000.001 celdas, y un extracto entra en 5.000.000.",
    );
    expect(spreadsheetSizeProblem([sheet(29_999, 99), sheet(29_999, 99)])).toMatch(/ocupan 6\.000\.000 celdas/);
  });
});

describe("clipMerges", () => {
  const range = (s: [number, number], e: [number, number]) => ({ s: { r: s[0], c: s[1] }, e: { r: e[0], c: e[1] } });

  it("recorta cada combinada a la hoja y deja afuera las que empiezan fuera de ella", () => {
    expect(clipMerges([range([1, 1], [9, 9])], 4, 3)).toEqual([range([1, 1], [4, 3])]);
    expect(clipMerges([range([1, 1], [2, 2])], 4, 3)).toEqual([range([1, 1], [2, 2])]);
    expect(clipMerges([range([5, 0], [9, 0]), range([0, 4], [0, 9])], 4, 3)).toEqual([]);
    expect(clipMerges([range([4, 3], [9, 9])], 4, 3)).toEqual([range([4, 3], [4, 3])]);
    expect(clipMerges([range([-1, 0], [2, 2]), range([0, -1], [2, 2])], 4, 3)).toEqual([]);
    expect(clipMerges([range([0, 0], [1, 1])], -1, -1)).toEqual([]);
  });

  it("descarta las repetidas, también las que quedan iguales después de recortar", () => {
    expect(clipMerges([range([0, 0], [1, 1]), range([0, 0], [1, 1]), range([0, 0], [9, 9]), range([0, 0], [8, 8])], 3, 3)).toEqual([
      range([0, 0], [1, 1]),
      range([0, 0], [3, 3]),
    ]);
  });
});

describe("mergedArea", () => {
  it("cuenta las celdas de cada combinada, de punta a punta", () => {
    expect(mergedArea([])).toBe(0);
    expect(mergedArea([{ s: { r: 1, c: 2 }, e: { r: 3, c: 5 } }])).toBe(12);
    expect(mergedArea([{ s: { r: 4, c: 4 }, e: { r: 4, c: 4 } }, { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } }])).toBe(4);
  });
});

describe("markupSizeProblem", () => {
  const cells = (n: number, td: string) => Buffer.from(`<table><tr>${td.repeat(n)}</tr></table>`);

  it("hasta 20 MB no hay problema; más, es demasiado grande", () => {
    expect(markupSizeProblem(Buffer.alloc(20 * 1024 * 1024, 0x20))).toBeNull();
    expect(markupSizeProblem(Buffer.alloc(20 * 1024 * 1024 + 1, 0x20))).toBe(
      "La planilla es demasiado grande: pesa más de 20 MB, y un extracto entra en 20 MB.",
    );
  });

  it("hasta 2.000 celdas combinadas no hay problema; más, es demasiado grande", () => {
    expect(markupSizeProblem(cells(2000, '<td rowspan="2">x</td>'))).toBeNull();
    expect(markupSizeProblem(cells(2001, '<td rowspan="2">x</td>'))).toBe("La planilla es demasiado grande: tiene más de 2.000 celdas combinadas.");
  });

  it("en HTML cuenta cada celda con rowspan o colspan mayor que 1, se escriba como se escriba", () => {
    for (const td of ["<td colspan=2>x</td>", "<TD ROWSPAN='3'>x</TD>", '<th rowspan="2" colspan="2">x</th>', '<td class="a" colspan = "12">x</td>']) {
      expect(markupSizeProblem(cells(2001, td))).not.toBeNull();
    }
  });

  it("cuenta la combinada aunque el valor traiga espacios adentro de las comillas, como la lee SheetJS", () => {
    for (const td of ['<td rowspan=" 2">x</td>', "<td colspan='  3'>x</td>", '<ss:Cell ss:MergeDown=" 3">x</ss:Cell>']) {
      expect(markupSizeProblem(cells(2001, td))).not.toBeNull();
    }
  });

  it("en HTML, un rowspan o colspan de 1, o un atributo que no es de la celda, no es una combinada", () => {
    for (const td of ['<td rowspan="1" colspan="1">x</td>', "<td>colspan=2</td>", '<tr rowspan="2"><td>x</td>', '<td data-colspan="2">x</td>']) {
      expect(markupSizeProblem(cells(2001, td))).toBeNull();
    }
  });

  it("más de 100.000 celdas es demasiado grande", () => {
    expect(markupSizeProblem(cells(100_000, "<td>x</td>"))).toBeNull();
    expect(markupSizeProblem(cells(100_001, "<td>x</td>"))).toBe("La planilla es demasiado grande: tiene más de 100.000 celdas.");
  });

  it("el trabajo del lector de HTML, las combinadas por las celdas más las filas tapadas, tiene un tope", () => {
    const spread = (plain: number) => Buffer.from(`<table><tr>${'<td colspan="2">x</td>'.repeat(2000)}${"<td>x</td>".repeat(plain)}</tr></table>`);
    expect(markupSizeProblem(spread(48_000))).toBeNull();
    expect(markupSizeProblem(spread(48_001))).toBe("La planilla es demasiado grande: tiene demasiadas celdas combinadas para leerla.");
  });

  it("un rowspan de 0 o negativo no tapa filas aunque la celda combine columnas", () => {
    const spread = (plain: number) => Buffer.from(`<table><tr>${'<td rowspan="0" colspan="2">x</td>'.repeat(2000)}${"<td>x</td>".repeat(plain)}</tr></table>`);
    expect(markupSizeProblem(spread(48_000))).toBeNull();
    expect(markupSizeProblem(spread(48_001))).not.toBeNull();
  });

  it("en una planilla XML 2003, las filas tapadas por MergeDown cuentan hasta la última Row", () => {
    const xml = (rows: number) =>
      Buffer.from(`<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Table><Row>${'<Cell ss:MergeDown="100000"><Data>a</Data></Cell>'.repeat(2000)}</Row>${"<Row><Cell><Data>b</Data></Cell></Row>".repeat(rows)}</Table></Workbook>`);
    expect(markupSizeProblem(xml(0))).toBeNull();
    expect(markupSizeProblem(xml(1000))).toBe("La planilla es demasiado grande: tiene demasiadas celdas combinadas para leerla.");
  });

  it("las filas tapadas por un rowspan cuentan hasta la última fila de la tabla", () => {
    const tall = '<td rowspan="100000">a</td>'.repeat(2000);
    expect(markupSizeProblem(Buffer.from(`<table><tr>${tall}</tr></table>`))).toBeNull();
    expect(markupSizeProblem(Buffer.from(`<table><tr>${tall}</tr>${"<tr><td>b</td></tr>".repeat(1000)}</table>`))).toBe(
      "La planilla es demasiado grande: tiene demasiadas celdas combinadas para leerla.",
    );
  });

  it("en una planilla XML 2003 cuenta cada celda con ss:MergeAcross o ss:MergeDown", () => {
    const xml = (n: number, cell: string) => Buffer.from(`<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Table><Row>${cell.repeat(n)}</Row></Table></Workbook>`);
    expect(markupSizeProblem(xml(2001, '<Cell ss:MergeAcross="1"><Data>x</Data></Cell>'))).not.toBeNull();
    expect(markupSizeProblem(xml(2001, '<ss:Cell ss:MergeDown="3"><Data>x</Data></ss:Cell>'))).not.toBeNull();
    expect(markupSizeProblem(xml(2000, '<Cell ss:MergeAcross="1" ss:MergeDown="1"><Data>x</Data></Cell>'))).toBeNull();
    expect(markupSizeProblem(xml(2001, '<Cell ss:MergeAcross="0"><Data>x</Data></Cell>'))).toBeNull();
    expect(markupSizeProblem(xml(2001, "<Cell><Data>MergeDown=2</Data></Cell>"))).toBeNull();
  });
});

describe("las sondas de combinadas de la re-revisión se rechazan rápido", () => {
  const html = (body: string) => Buffer.from(`<html><body><table>${body}</table></body></html>`);

  it("un HTML de 1,5 MB con un rowspan en cada fila", () => {
    const file = html('<tr><td rowspan="2">a</td><td>b</td></tr>'.repeat(37_000));
    expect(file.length).toBeGreaterThan(1_400_000);
    const { ms } = measure(() => gridsFromMarkup(file));
    expect(() => gridsFromMarkup(file)).toThrow(/más de 2\.000 celdas combinadas/);
    expect(ms).toBeLessThan(2000);
  });

  it("un HTML de unos 300 KB con 6.000 combinadas grandes y una celda lejana", () => {
    const file = html('<tr><td rowspan="19000" colspan="250">x</td></tr>'.repeat(6000) + `<tr>${"<td></td>".repeat(10)}<td>lejos</td></tr>`);
    const { ms } = measure(() => gridsFromMarkup(file));
    expect(() => gridsFromMarkup(file)).toThrow(SpreadsheetTooLarge);
    expect(ms).toBeLessThan(2000);
  });

  it("un HTML de 70 KB con 2.000 rowspan altos sobre mil filas, que pasa los topes de bytes y de combinadas", () => {
    const file = html(`<tr>${'<td rowspan="100000">a</td>'.repeat(2000)}</tr>${"<tr><td>b</td></tr>".repeat(1000)}`);
    const { ms } = measure(() => gridsFromMarkup(file));
    expect(() => gridsFromMarkup(file)).toThrow(/demasiadas celdas combinadas/);
    expect(ms).toBeLessThan(2000);
  });

  it("un xlsx chico con 2.000 combinadas grandes", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, { A1: { t: "s", v: "Fecha" }, "!ref": "A1" }, "H");
    const merges = Array.from({ length: 2000 }, (_, k) => `<mergeCell ref="A${k + 1}:IU19000"/>`).join("");
    const file = editSheetsXml(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer, (xml) =>
      xml
        .replace("</sheetData>", `<row r="19000"><c r="IU19000" t="inlineStr"><is><t>x</t></is></c></row></sheetData><mergeCells count="2000">${merges}</mergeCells>`)
        .replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:IU19000"/>'),
    );
    expect(file.length).toBeLessThan(100_000);
    const { ms } = measure(() => gridsFromSpreadsheet(file));
    expect(() => gridsFromSpreadsheet(file)).toThrow(/contando las combinadas/);
    expect(ms).toBeLessThan(2000);
  });
});

describe("textSizeProblem", () => {
  it("hasta 60 MB y 200.000 líneas no hay problema", () => {
    expect(textSizeProblem(60 * 1024 * 1024, 200_000)).toBeNull();
    expect(textSizeProblem(0, 0)).toBeNull();
  });

  it("más de 60 MB o más de 200.000 líneas es demasiado grande, con un mensaje para el usuario", () => {
    expect(textSizeProblem(60 * 1024 * 1024 + 1, 1)).toBe("El archivo es demasiado grande: pesa más de 60 MB, y un extracto entra en 60 MB.");
    expect(textSizeProblem(10, 200_001)).toBe("El archivo es demasiado grande: tiene más de 200.000 líneas.");
  });
});

/** Encabezados alineados a la izquierda sobre importes alineados a la derecha, como los de un home banking. */
const FIXED_WIDTH = [
  "Fecha       Concepto         Debito     Credito",
  "31/07/2026  Transf recibida              1.000,00",
  "31/07/2026  Comision             12,10",
];

describe("gridFromText", () => {
  it("parte un CSV con punto y coma y comillas, y saca la marca de orden de bytes", () => {
    const g = gridFromText(Buffer.from('\uFEFFFecha;Concepto;Importe\n31/07/2026;"Transf; varias";-1.234,56\n'));
    expect(g.rows).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["31/07/2026", "Transf; varias", "-1.234,56"],
    ]);
    expect(g.origin).toBe("text");
  });

  it("lee un archivo en Windows-1252", () => {
    expect(decodeText(Buffer.from([0x44, 0xe9, 0x62, 0x69, 0x74, 0x6f]))).toBe("Débito");
  });

  it("parte por tabulaciones", () => {
    expect(gridFromText(Buffer.from("Fecha\tImporte\n31/07/2026\t10,00\n")).rows[1]).toEqual(["31/07/2026", "10,00"]);
  });

  it("no toma la coma como separador cuando es la coma decimal de importes sin comillas", () => {
    const texto = "31/07/2026  Transf recibida        1.234,56   10.000,00\n30/07/2026  Comision              12,10      8.765,44\n";
    const g = gridFromText(Buffer.from(texto));
    expect(g.rows[0]).toContain("1.234,56");
  });

  it("en un TXT de ancho fijo conserva la posición: una columna de débito vacía queda vacía", () => {
    const texto = [
      "Fecha       Concepto          Debito      Credito",
      "31/07/2026  Transf recibida              1.000,00",
      "31/07/2026  Comision            12,10            ",
    ].join("\n");
    const g = gridFromText(Buffer.from(texto));
    expect(g.rows[1]).toEqual(["31/07/2026", "Transf recibida", null, "1.000,00"]);
    expect(g.rows[2]).toEqual(["31/07/2026", "Comision", "12,10", null]);
  });

  it("un campo entre comillas con un salto de línea sigue siendo un solo registro", () => {
    const g = gridFromText(
      Buffer.from('Fecha;Concepto;Importe\r\n31/07/2026;"Pago a\r\nproveedor";-1.000,00\r\n30/07/2026;Otro;5,00\r\n'),
    );
    expect(g.rows).toEqual([
      ["Fecha", "Concepto", "Importe"],
      ["31/07/2026", "Pago a\nproveedor", "-1.000,00"],
      ["30/07/2026", "Otro", "5,00"],
    ]);
  });

  it("en un TXT de ancho fijo un encabezado alineado distinto que los importes queda entero en su columna", () => {
    const g = gridFromText(Buffer.from(FIXED_WIDTH.join("\n")));
    expect(g.rows[0]).toEqual(["Fecha", "Concepto", "Debito", "Credito"]);
    expect(g.rows[1]).toEqual(["31/07/2026", "Transf recibida", null, "1.000,00"]);
    expect(g.rows[2]).toEqual(["31/07/2026", "Comision", "12,10", null]);
  });

  it("en un TXT de ancho fijo un renglón sin fecha más ancho que la columna conserva el importe entero", () => {
    const saldo = "Saldo anterior".padEnd(36) + "12.345.678,90";
    const g = gridFromText(Buffer.from([FIXED_WIDTH[0], saldo, ...FIXED_WIDTH.slice(1)].join("\n")));
    expect(g.rows[1]).toEqual(["Saldo anterior", null, null, "12.345.678,90"]);
  });

  it("en un TXT de ancho fijo de más de cien mil renglones no desborda la pila", () => {
    const renglones = Array.from({ length: 150_000 }, (_, i) => FIXED_WIDTH[1 + (i % 2)]);
    const g = gridFromText(Buffer.from(renglones.join("\n")));
    expect(g.rows).toHaveLength(150_000);
    expect(g.rows[149_999]).toEqual(["31/07/2026", "Comision", "12,10", null]);
  });

  it("un texto de más de 200.000 líneas lanza TextTooLarge; uno de 200.000, no", () => {
    const lines = (n: number) => Buffer.from("Fecha;Importe\n" + "01/07/2026;1,00\n".repeat(n - 1));
    expect(() => gridFromText(lines(200_001))).toThrow(TextTooLarge);
    expect(() => gridFromText(lines(200_001))).toThrow(/tiene más de 200\.000 líneas/);
    expect(gridFromText(lines(200_000)).rows).toHaveLength(200_000);
  });

  it("las líneas en blanco también cuentan para el tope de líneas", () => {
    expect(() => gridFromText(Buffer.from("Fecha;Importe\n01/07/2026;1,00\n" + "\n".repeat(199_999)))).toThrow(/tiene más de 200\.000 líneas/);
    expect(gridFromText(Buffer.from("Fecha;Importe\n01/07/2026;1,00\n" + "\n".repeat(199_998))).rows).toHaveLength(2);
  });

  it("60 MB de saltos de línea, solos o detrás de una letra, se rechazan rápido y sin partir el texto", () => {
    for (const fill of ["\n", "a\n", "\r\n"]) {
      const file = Buffer.alloc(60 * 1024 * 1024, fill);
      const heap = process.memoryUsage().heapUsed;
      const { ms } = measure(() => gridFromText(file));
      expect(() => gridFromText(file)).toThrow(/tiene más de 200\.000 líneas/);
      expect(ms).toBeLessThan(1000);
      expect((process.memoryUsage().heapUsed - heap) / 1024 / 1024).toBeLessThan(256);
    }
  });

  it("un texto de más de 60 MB lanza TextTooLarge antes de leerlo, aunque además sea binario", () => {
    const file = Buffer.alloc(60 * 1024 * 1024 + 1, 0x01);
    expect(() => gridFromText(file)).toThrow(TextTooLarge);
    expect(() => gridFromText(file)).toThrow(/pesa más de 60 MB/);
  });

  it("un texto de 200.000 líneas que terminan en saltos de Windows o de Mac viejo se cuenta igual", () => {
    const lines = (n: number, eol: string) => Buffer.from(("01/07/2026;1,00" + eol).repeat(n));
    expect(() => gridFromText(lines(200_001, "\r\n"))).toThrow(/tiene más de 200\.000 líneas/);
    expect(() => gridFromText(lines(200_001, "\r"))).toThrow(/tiene más de 200\.000 líneas/);
    expect(gridFromText(lines(200_000, "\r\n")).rows).toHaveLength(200_000);
  });

  it("un TXT de ancho fijo de 40 KB en una sola línea se lee en menos de un segundo", () => {
    let line = "01/07/2026";
    while (line.length < 40 * 1024) line += " ab";
    const { ms } = measure(() => gridFromText(Buffer.from(line)));
    expect(gridFromText(Buffer.from(line)).rows[0][0]).toBe("01/07/2026");
    expect(ms).toBeLessThan(1000);
  });

  it("en un TXT de ancho fijo, una línea sin fecha muy larga no vuelve lento el cálculo de las columnas", () => {
    const text = [..."x".repeat(5000)].map((_, i) => FIXED_WIDTH[1 + (i % 2)]);
    text.push("Nota " + "palabra ".repeat(25_000));
    const { ms } = measure(() => gridFromText(Buffer.from(text.join("\n"))));
    expect(ms).toBeLessThan(1000);
    expect(gridFromText(Buffer.from(text.join("\n"))).rows[4999]).toEqual(["31/07/2026", "Comision", "12,10", null]);
  });

  it("en un TXT de ancho fijo, una palabra a la misma distancia de dos columnas va a la de la izquierda", () => {
    const datos = ["31/07/2026  Uno       -1,00", "31/07/2026  Dos       -2,00"];
    expect(gridFromText(Buffer.from([...datos, " ".repeat(17) + "xyz"].join("\n"))).rows[2]).toEqual([null, "xyz", null]);
    expect(gridFromText(Buffer.from([...datos, " ".repeat(18) + "xyz"].join("\n"))).rows[2]).toEqual([null, null, "xyz"]);
    expect(gridFromText(Buffer.from([...datos, "xyz" + " ".repeat(40) + "xyz"].join("\n"))).rows[2]).toEqual(["xyz", null, "xyz"]);
  });

  it("lanza NotText con un archivo binario", () => {
    expect(() => gridFromText(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 1]))).toThrow(NotText);
  });
});

describe("lineCount", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2],
    ["a\r\nb\r\n", 2],
    ["a\r\nb", 2],
    ["a\rb\r", 2],
    ["a\rb", 2],
    ["\r", 1],
    ["\n", 1],
    ["\n\n\n", 3],
    ["a\r\n\r\nb", 3],
    ["a\r\rb", 3],
  ])("%j tiene %i líneas", (text, lines) => {
    expect(lineCount(Buffer.from(text), 10)).toBe(lines);
  });

  it("deja de contar apenas pasa el tope", () => {
    expect(lineCount(Buffer.from("\n".repeat(10)), 3)).toBe(4);
    expect(lineCount(Buffer.from("\r".repeat(10)), 3)).toBe(4);
    expect(lineCount(Buffer.from("\n".repeat(3)), 3)).toBe(3);
    expect(lineCount(Buffer.from("\r".repeat(3)), 3)).toBe(3);
  });
});

describe("mode", () => {
  it("el valor más repetido; entre empatados, el mayor; sin valores, 0", () => {
    expect(mode([2, 2, 3])).toBe(2);
    expect(mode([3, 2, 2])).toBe(2);
    expect(mode([5, 2, 2, 2, 5])).toBe(2);
    expect(mode([2, 3])).toBe(3);
    expect(mode([3, 2])).toBe(3);
    expect(mode([4])).toBe(4);
    expect(mode([])).toBe(0);
  });
});

describe("chooseSeparator", () => {
  it("cada separador, cuando parte las líneas en la misma cantidad de campos", () => {
    expect(chooseSeparator(["a;b;c", "1;2;3"])).toBe(";");
    expect(chooseSeparator(["a\tb", "1\t2"])).toBe("\t");
    expect(chooseSeparator(["a|b|c", "1|2|3"])).toBe("|");
    expect(chooseSeparator(["a,b,c", "1,2,3"])).toBe(",");
    expect(chooseSeparator(["sin separador", "otra linea"])).toBeNull();
  });

  it("gana el que parte más líneas igual, no el que más campos da", () => {
    const lines = ["x;y\tz", "x;y\tz", "x;y;w\tz", "x;y;w\tz", "x;y;w\tz", "x;y;w"];
    expect(chooseSeparator(lines)).toBe("\t");
  });

  it("si empatan, el primero de la lista", () => {
    expect(chooseSeparator(["a;b\tc", "a;b\tc", "a;b\tc"])).toBe(";");
  });

  it("las líneas en blanco no cuentan", () => {
    expect(chooseSeparator(["", "   ", "\t", "a;b;c", "", "  ", "1;2;3", " ", ""])).toBe(";");
  });

  it("mira solo las primeras 200 líneas con texto", () => {
    const lines = [...Array.from({ length: 200 }, () => "a;b;c"), ...Array.from({ length: 300 }, () => "a|b|c|d")];
    expect(chooseSeparator(lines)).toBe(";");
  });

  it("la coma no es separador si la mitad o más de las líneas trae la coma decimal argentina sin comillas", () => {
    expect(chooseSeparator(["Fecha,Importe", "01/07/2026,1,50"])).toBeNull();
    expect(chooseSeparator(["Fecha,Importe", "Otra,cosa", "01/07/2026,1,50"])).toBe(",");
  });

  it("entre comillas, la coma decimal argentina no impide que la coma sea el separador", () => {
    expect(chooseSeparator(["01/07/2026,Transf,\"1.234,56\"", "02/07/2026,Comision,\"-12,10\""])).toBe(",");
    expect(chooseSeparator(["01/07/2026,\"Transf, varias\",\"1.234,56\"", "02/07/2026,Comision,\"-12,10\""])).toBe(",");
  });
});

describe("gridFromText: los bordes", () => {
  it("un CSV con comas y con barras se parte por su separador", () => {
    expect(gridFromText(Buffer.from("Fecha,Concepto,Importe\n01/07/2026,Transf,100.50\n")).rows[1]).toEqual(["01/07/2026", "Transf", "100.50"]);
    expect(gridFromText(Buffer.from("Fecha|Concepto|Importe\n01/07/2026|Transf|-1,00\n")).rows[1]).toEqual(["01/07/2026", "Transf", "-1,00"]);
  });

  it("dos comillas seguidas dentro de un campo entre comillas son una comilla", () => {
    expect(gridFromText(Buffer.from('Fecha;Concepto\n01/07/2026;"Pago ""especial"" de julio"\n')).rows[1]).toEqual(["01/07/2026", 'Pago "especial" de julio']);
  });

  it("una comilla en el medio de un campo no abre nada; con espacios antes, sí", () => {
    expect(gridFromText(Buffer.from('Fecha;Concepto;Importe\n01/07/2026;Caño 5" pulgadas;-1,00\n')).rows[1]).toEqual(["01/07/2026", 'Caño 5" pulgadas', "-1,00"]);
    expect(gridFromText(Buffer.from('Fecha;Concepto;Importe\n01/07/2026; "Transf; varias";-1,00\n')).rows[1]).toEqual(["01/07/2026", "Transf; varias", "-1,00"]);
  });

  it("los campos se recortan, y uno de puros espacios queda vacío", () => {
    expect(gridFromText(Buffer.from("Fecha;Concepto;Ref;Importe\n01/07/2026 ;  Transf  ;   ;-1,00\n")).rows[1]).toEqual(["01/07/2026", "Transf", null, "-1,00"]);
  });

  it("las líneas en blanco del final no son filas", () => {
    expect(gridFromText(Buffer.from("Fecha;Importe\n01/07/2026;1,00\n   \n\t\n\n")).rows).toEqual([
      ["Fecha", "Importe"],
      ["01/07/2026", "1,00"],
    ]);
  });

  it("un archivo vacío es una grilla sin filas, no un binario", () => {
    expect(gridFromText(Buffer.alloc(0)).rows).toEqual([]);
  });

  it("un texto que no es UTF-8 se lee en Windows-1252, y uno que sí lo es no", () => {
    expect(decodeText(Buffer.from("Débito", "utf8"))).toBe("Débito");
    expect(decodeText(Buffer.from("\uFEFFDébito", "utf8"))).toBe("Débito");
  });

  it("binario es más del 1 % de caracteres de control en los primeros 4.096", () => {
    const withControls = (n: number, length: number) => Buffer.from("\u0001".repeat(n) + "a".repeat(length - n));
    expect(() => gridFromText(withControls(1, 100))).not.toThrow();
    expect(() => gridFromText(withControls(2, 100))).toThrow(NotText);
    expect(() => gridFromText(withControls(2, 100))).toThrow("El archivo no es una planilla ni un texto.");
    expect(() => gridFromText(Buffer.from("a".repeat(4096) + "\u0001".repeat(500)))).not.toThrow();
  });

  it("sin separador ni fechas, cada línea se parte por dos o más espacios, sin los de las puntas", () => {
    expect(gridFromText(Buffer.from("Resumen de cuenta   Julio\n  Otro texto  libre")).rows).toEqual([
      ["Resumen de cuenta", "Julio"],
      ["Otro texto", "libre"],
    ]);
  });

  it("en un TXT de ancho fijo, una fecha de una cifra con espacios adelante también marca una fila con fecha", () => {
    const texto = ["  Fecha     Concepto          Debito      Credito", "  1/7/26    Transf recibida              1.000,00", "  2/7/26    Comision            12,10"].join("\n");
    expect(gridFromText(Buffer.from(texto)).rows).toEqual([
      ["Fecha", "Concepto", "Debito", "Credito"],
      ["1/7/26", "Transf recibida", null, "1.000,00"],
      ["2/7/26", "Comision", "12,10", null],
    ]);
  });

  it("en un TXT de ancho fijo, la fecha ISO también marca una fila con fecha", () => {
    const texto = ["Fecha       Concepto          Debito      Credito", "2026-07-01  Transf recibida              1.000,00", "2026-07-02  Comision            12,10"].join("\n");
    expect(gridFromText(Buffer.from(texto)).rows).toEqual([
      ["Fecha", "Concepto", "Debito", "Credito"],
      ["2026-07-01", "Transf recibida", null, "1.000,00"],
      ["2026-07-02", "Comision", "12,10", null],
    ]);
  });

  it("en un TXT de ancho fijo, una palabra que pisa lo mismo dos columnas va a la de la izquierda, también desde la columna 0", () => {
    const texto = ["31/07/2026  abcdefghij", "31/07/2026  klmnopqrst", "W".repeat(22)].join("\n");
    expect(gridFromText(Buffer.from(texto)).rows[2]).toEqual(["W".repeat(22), null]);
  });

  it("en un TXT de ancho fijo, una fila con fecha más corta no ocupa la columna que sigue a su final", () => {
    const texto = ["31/07/2026  Uno -1,00", "31/07/2026  Dos"].join("\n");
    expect(gridFromText(Buffer.from(texto)).rows).toEqual([
      ["31/07/2026", "Uno", "-1,00"],
      ["31/07/2026", "Dos", null],
    ]);
  });
});

describe("cellValue", () => {
  it("un número sin formato de fecha es el número", () => {
    expect(cellValue({ t: "n", v: 46234, z: "General" }, false)).toBe(46234);
    expect(cellValue({ t: "n", v: -12.5 }, false)).toBe(-12.5);
  });

  it("un número con formato de fecha: desde 1 es la fecha, entre 0 y 1 la hora como texto, negativo nada", () => {
    expect(cellValue({ t: "n", v: 1, z: "dd/mm/yyyy" }, false)).toBe("1900-01-01");
    expect(cellValue({ t: "n", v: 0, z: "hh:mm" }, false)).toBe("00:00");
    expect(cellValue({ t: "n", v: 0.5, z: " hh:mm " }, false)).toBe("12:00");
    expect(cellValue({ t: "n", v: -1, z: "dd/mm/yyyy" }, false)).toBeNull();
  });

  it("una fecha como Date, la que traen algunos formatos, se lee en UTC", () => {
    expect(cellValue({ t: "d", v: new Date(Date.UTC(2026, 6, 31)) }, false)).toBe("2026-07-31");
    expect(cellValue({ t: "d", v: new Date(Date.UTC(2026, 0, 5)) }, false)).toBe("2026-01-05");
  });

  it("el texto se recorta, y uno vacío es nada", () => {
    expect(cellValue({ t: "s", v: "  Transf  " }, false)).toBe("Transf");
    expect(cellValue({ t: "s", v: "   " }, false)).toBeNull();
  });

  it("una celda mal formada, sin valor o con un valor que no es de su tipo, no es nada", () => {
    expect(cellValue({ t: "s" } as XLSX.CellObject, false)).toBeNull();
    expect(cellValue({ t: "s", v: null } as unknown as XLSX.CellObject, false)).toBeNull();
    expect(cellValue({ t: "n", v: "12" } as XLSX.CellObject, false)).toBeNull();
  });

  it("un error, un booleano, una celda vacía o una fecha que no es Date no son nada", () => {
    expect(cellValue({ t: "e", v: 0x2a }, false)).toBeNull();
    expect(cellValue({ t: "b", v: true }, false)).toBeNull();
    expect(cellValue({ t: "z" }, false)).toBeNull();
    expect(cellValue({ t: "d", v: "2026-07-31" }, false)).toBeNull();
    expect(cellValue(undefined, false)).toBeNull();
  });
});
