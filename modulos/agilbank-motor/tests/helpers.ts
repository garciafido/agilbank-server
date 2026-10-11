import * as XLSX from "xlsx";

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
