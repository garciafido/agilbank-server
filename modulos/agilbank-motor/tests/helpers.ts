import * as XLSX from "xlsx";
// La misma copia de sharp que usa el lector: una segunda cargaría otra libvips en el mismo proceso.
import sharp from "@agilmind/lectura/node_modules/sharp";
import type { StatementLine } from "../src/types";

/** Una fecha como la escribe Galicia: t="d" con la fecha ISO. */
export const isoDateCell = (iso: string): XLSX.CellObject => ({ t: "d", v: new Date(`${iso}T00:00:00.000Z`) });

/** Una fecha como número de serie con formato de fecha, como la mayoría de los bancos. */
export const serialDateCell = (iso: string, format = "dd/mm/yyyy", date1904 = false): XLSX.CellObject => ({
  t: "n",
  v: (Date.parse(`${iso}T00:00:00.000Z`) - (date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30))) / 86_400_000,
  z: format,
});

/**
 * Un libro armado en el test. Las filas aceptan valores sueltos o celdas de SheetJS ya armadas
 * (para las fechas). `merges` se aplica a la primera hoja; `date1904` marca el libro con el sistema de
 * fechas de 1904.
 */
export const xlsx = (
  sheets: Record<string, unknown[][]>,
  opts: { merges?: XLSX.Range[]; date1904?: boolean } = {},
): Buffer => {
  const book = XLSX.utils.book_new();
  if (opts.date1904) book.Workbook = { WBProps: { date1904: true } };
  Object.entries(sheets).forEach(([name, rows], i) => {
    const plain = rows.map((r) => r.map((v) => (v && typeof v === "object" && "t" in (v as object) ? null : v)));
    const ws = XLSX.utils.aoa_to_sheet(plain);
    rows.forEach((r, ri) =>
      r.forEach((v, ci) => {
        if (v && typeof v === "object" && "t" in (v as object)) ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = v;
      }),
    );
    if (i === 0 && opts.merges) ws["!merges"] = opts.merges;
    XLSX.utils.book_append_sheet(book, ws, name);
  });
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
};

/**
 * El mismo libro con el XML de cada hoja cambiado por `edit`: para armar lo que el escritor de SheetJS no
 * escribe, como filas desordenadas o una celda suelta lejana (el escritor recorre el rango entero).
 */
export const editSheetsXml = (file: Buffer, edit: (xml: string) => string): Buffer => {
  const zip = XLSX.CFB.read(file, { type: "buffer" });
  zip.FullPaths.forEach((path: string, k: number) => {
    if (!/worksheets\/sheet\d+\.xml$/.test(path)) return;
    const entry = zip.FileIndex[k];
    entry.content = Buffer.from(edit(Buffer.from(entry.content as Uint8Array).toString("utf8")));
    entry.size = entry.content.length;
  });
  return XLSX.CFB.write(zip, { type: "buffer", fileType: "zip" }) as Buffer;
};

/** Un libro de `sheets` hojas con «Fecha» en A1 y una sola celda suelta en `address` en cada una. */
export const sparseBook = (sheets: number, address = "IU49999"): Buffer => {
  const book = XLSX.utils.book_new();
  for (let i = 0; i < sheets; i++) XLSX.utils.book_append_sheet(book, { A1: { t: "s", v: "Fecha" }, "!ref": "A1" }, `H${i + 1}`);
  const row = XLSX.utils.decode_cell(address).r + 1;
  return editSheetsXml(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer, (xml) =>
    xml
      .replace("</sheetData>", `<row r="${row}"><c r="${address}" t="inlineStr"><is><t>x</t></is></c></row></sheetData>`)
      .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${address}"/>`),
  );
};

/** Un renglón mínimo, para probar lo que opera sobre renglones ya leídos. */
export const line = (over: Partial<StatementLine> = {}): StatementLine => ({
  id: "id", order: 1, date: "2026-07-02", valueDate: null, type: { code: "sin-clasificar", source: "none" },
  amountCents: 4000, balanceCents: null, reference: null, counterparty: null,
  bank: { code: null, text: "TRANSFERENCIA", extras: [] }, chains: null,
  provenance: { origin: "text", sheet: null, page: null, pageTo: null, fromRow: 1, toRow: 1 },
  ...over,
});

/**
 * Un PDF con texto en Helvetica de 10 puntos: cada página es una lista de textos con la posición
 * de su línea base, en puntos desde abajo a la izquierda, como los escribe el PDF.
 */
export const pdfConTexto = (paginas: Array<Array<{ x: number; y: number; texto: string }>>): Buffer => {
  const objetos: string[] = [];
  const kids = paginas.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objetos.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>\nendobj\n`);
  objetos.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  paginas.forEach((textos, i) => {
    const escapar = (t: string) => t.replace(/([()\\])/g, "\\$1");
    const contenido = textos.map((t) => `BT /F1 10 Tf ${t.x} ${t.y} Td (${escapar(t.texto)}) Tj ET`).join("\n");
    objetos.push(
      `${4 + 2 * i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>\nendobj\n`,
    );
    objetos.push(`${5 + 2 * i} 0 obj\n<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream\nendobj\n`);
  });
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += o;
  }
  const xref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(cuerpo, "latin1");
};

/**
 * Un PDF de una página vacía con un diccionario `/Encrypt` en el trailer, como los PDF protegidos que
 * emiten los portales. El diccionario es de mentira: alcanza para que el archivo se declare cifrado.
 */
export const pdfCifrado = (): Buffer => {
  const objetos = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n",
    "4 0 obj\n<< /Filter /Standard /V 1 /R 2 /P -4 /O (0123456789012345678901234567890) /U (0123456789012345678901234567890) >>\nendobj\n",
  ];
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += o;
  }
  const xref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Encrypt 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(cuerpo, "latin1");
};

/** Anchos de Helvetica a 10 puntos de lo que lleva un importe. */
const HELVETICA_10: Record<string, number> = { ".": 2.78, ",": 2.78, "-": 3.33 };
const widthOf = (t: string): number => [...t].reduce((s, c) => s + (HELVETICA_10[c] ?? 5.56), 0);
/** Un texto que termina en `xRight`: así se alinean a la derecha los importes de un PDF de prueba. */
export const rightAt = (xRight: number, y: number, texto: string) => ({ x: Number((xRight - widthOf(texto)).toFixed(2)), y, texto });

/** Un extracto de dos páginas, con texto, encabezado repetido y pie de página. */
export const statementPdf = (): Buffer => {
  const header = (y: number) => [
    { x: 40, y, texto: "FECHA" }, { x: 110, y, texto: "CONCEPTO" }, rightAt(380, y, "DEBITO"), rightAt(460, y, "CREDITO"), rightAt(550, y, "SALDO"),
  ];
  const row = (y: number, date: string, concept: string, debit: string | null, credit: string | null, balance: string) => [
    { x: 40, y, texto: date }, { x: 110, y, texto: concept },
    ...(debit ? [rightAt(380, y, debit)] : []), ...(credit ? [rightAt(460, y, credit)] : []), rightAt(550, y, balance),
  ];
  const foot = (n: number) => [{ x: 250, y: 30, texto: `Pagina ${n} de 2` }];
  return pdfConTexto([
    [...header(780), { x: 110, y: 760, texto: "SALDO ANTERIOR" }, rightAt(550, 760, "1.000,00"),
     ...row(740, "01/07/2026", "COMISION", "-10,00", null, "990,00"), ...row(720, "02/07/2026", "TRANSFERENCIA", null, "40,00", "1.030,00"), ...foot(1)],
    [...header(780), ...row(760, "03/07/2026", "IVA", "-2,10", null, "1.027,90"), ...row(740, "04/07/2026", "DEPOSITO", null, "2,10", "1.030,00"), ...foot(2)],
  ]);
};

/**
 * Un TIFF de varias páginas en blanco, como el de un escáner con alimentador. sharp no arma uno desde
 * cero: se le da un GIF animado de esas páginas, que sí abre como varias. Cada píxel del GIF va
 * después del código de limpieza, así todos los códigos LZW son de 3 bits.
 */
export const tiffDePaginas = (ancho: number, alto: number, paginas: number): Promise<Buffer> => {
  const u16 = (n: number) => [n & 255, n >> 8];
  const gif = [...Buffer.from("GIF89a"), ...u16(ancho), ...u16(alto), 0x80, 0, 0, 255, 255, 255, 0, 0, 0];
  for (let p = 0; p < paginas; p++) {
    gif.push(0x2c, 0, 0, 0, 0, ...u16(ancho), ...u16(alto), 0, 2);
    const bytes: number[] = [];
    let acc = 0;
    let bits = 0;
    for (const c of [...Array.from({ length: ancho * alto }, () => [4, 0]).flat(), 5]) {
      acc |= c << bits;
      for (bits += 3; bits >= 8; bits -= 8, acc >>= 8) bytes.push(acc & 255);
    }
    if (bits > 0) bytes.push(acc & 255);
    for (let i = 0; i < bytes.length; i += 255) gif.push(Math.min(255, bytes.length - i), ...bytes.slice(i, i + 255));
    gif.push(0);
  }
  gif.push(0x3b);
  return sharp(Buffer.from(gif), { animated: true }).tiff().toBuffer();
};
