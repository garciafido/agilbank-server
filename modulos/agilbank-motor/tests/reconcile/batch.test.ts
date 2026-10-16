import * as XLSX from "xlsx";
import { readBatch } from "../../src/reconcile/batch";

const HEADER = "Identificador;Tipo de Pago;Cuit Beneficiario;Razón Social Beneficiario;Número de pago;Medio de Pago;Fecha de emisión;Fecha de pago;Monto;Estado;Leyenda";
const row = (cuit: string, n: string, monto: string, estado: string) => `1;Proveedores;${cuit};EJEMPLO SA;${n};Transferencia;01/07/2026;02/07/2026;${monto};${estado};`;
const csv = (...lines: string[]) => Buffer.from(lines.join("\n"));
const UNREADABLE = "El archivo del lote no se puede leer: tiene que ser el CSV o la planilla que descarga el banco.";

const xlsx = (sheets: Array<[string, unknown[][]]>): Buffer => {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

describe("readBatch", () => {
  it("lee el CSV de descarga de pagos: CUIT, número, monto, fecha de pago y estado", () => {
    const r = readBatch(csv(HEADER, row("20-22222222-3", "77", "1.500,25", "PROCESADO"), row("27333333334", "78", "200,00", "ERROR")));
    expect(r).toEqual({ ok: true, transfers: [
      { cuit: "20222222223", number: "77", amountCents: 150025, failed: false, payDate: "2026-07-02" },
      { cuit: "27333333334", number: "78", amountCents: 20000, failed: true, payDate: "2026-07-02" },
    ] });
  });
  it.each(["ERROR", "Rechazado", "RECHAZADA", "error", "Error de forma", "Rechazada por el banco"])("el estado %s queda fuera (AC-19)", (estado) => {
    const r = readBatch(csv(HEADER, row("20222222223", "1", "10,00", estado)));
    expect(r.ok && r.transfers[0].failed).toBe(true);
  });
  it.each(["FINALIZADO", "Sin errores", "No rechazado", ""])("el estado «%s» no es un error", (estado) => {
    const r = readBatch(csv(HEADER, row("20222222223", "1", "10,00", estado)));
    expect(r.ok && r.transfers[0].failed).toBe(false);
  });
  it("columnas desconocidas: no se adivina", () => {
    expect(readBatch(Buffer.from("a;b;c\n1;2;3\n"))).toEqual({ ok: false, reason: "No se reconocen las columnas del lote: hacen falta al menos el monto y el estado." });
  });
  it.each(["Monto;Leyenda", "Estado;Leyenda"])("sin el monto o sin el estado no hay encabezado (%s)", (header) => {
    expect(readBatch(csv(header, "10,00;x")).ok).toBe(false);
  });
  it("más de 5.000 transferencias: se rechaza", () => {
    const lines = [HEADER, ...Array.from({ length: 5001 }, (_, i) => row("20222222223", String(i), "1,00", "OK"))];
    expect(readBatch(csv(...lines))).toEqual({ ok: false, reason: "El lote trae más de 5.000 transferencias." });
  });
  it("5.000 transferencias se leen", () => {
    const lines = [HEADER, ...Array.from({ length: 5000 }, (_, i) => row("20222222223", String(i), "1,00", "OK"))];
    const r = readBatch(csv(...lines));
    expect(r.ok && r.transfers.length).toBe(5000);
  });
  it("el formato del banco de BDL: importes con punto decimal y fechas ISO", () => {
    const r = readBatch(csv(HEADER, "1;Proveedores;20222222223;EJEMPLO SA;77;Transferencia;2026-07-01;2026-07-02;12345.67;FINALIZADO;-;"));
    expect(r).toEqual({ ok: true, transfers: [{ cuit: "20222222223", number: "77", amountCents: 1234567, failed: false, payDate: "2026-07-02" }] });
  });
  it("el encabezado puede venir después de unas líneas de título, y las líneas vacías no son transferencias", () => {
    const r = readBatch(csv("Descarga de pagos", "Empresa;EJEMPLO", HEADER, row("20222222223", "1", "10,00", "OK"), ";;;;;;;;;;", row("20222222223", "2", "20,00", "OK")));
    expect(r.ok && r.transfers.map((t) => t.number)).toEqual(["1", "2"]);
  });
  it("solo con el monto y el estado: CUIT, número y fecha quedan vacíos", () => {
    expect(readBatch(csv("Importe;Estado", "10,00;OK"))).toEqual({ ok: true, transfers: [{ cuit: null, number: null, amountCents: 1000, failed: false, payDate: null }] });
  });
  it("los rótulos «CUIT» y «Nro. de pago», y las celdas vacías de CUIT, número y fecha", () => {
    const r = readBatch(csv("CUIT;Nro. de pago;Fecha de pago;Importe;Estado", "20-22222222-3;9;02/07/2026;10,00;OK", ";;;20,00;OK"));
    expect(r).toEqual({ ok: true, transfers: [
      { cuit: "20222222223", number: "9", amountCents: 1000, failed: false, payDate: "2026-07-02" },
      { cuit: null, number: null, amountCents: 2000, failed: false, payDate: null },
    ] });
  });
  it("la primera columna que coincide con un rótulo es la que vale", () => {
    const r = readBatch(csv("Monto;Importe;Estado;Estado", "10,00;99,00;OK;ERROR"));
    expect(r).toEqual({ ok: true, transfers: [expect.objectContaining({ amountCents: 1000, failed: false })] });
  });
  it("un rótulo tiene que ser entero: «Monto total» o «Estado anterior» no son columnas", () => {
    expect(readBatch(csv("Monto total;Estado anterior", "10,00;OK")).ok).toBe(false);
    const header = "Total monto;Monto total;Monto;Estado anterior;Último estado;Estado;Ordenante CUIT;Cuit del ordenante;Último número de pago;Número de pago anterior;Próxima fecha de pago;Fecha de pago estimada";
    expect(readBatch(csv(header, "1,00;2,00;10,00;ERROR;ERROR;OK;20222222223;20222222223;5;5;02/07/2026;02/07/2026"))).toEqual({
      ok: true, transfers: [{ cuit: null, number: null, amountCents: 1000, failed: false, payDate: null }],
    });
  });
  it("un monto con signo se guarda positivo: los montos del lote no llevan signo", () => {
    const r = readBatch(csv("Monto;Estado", "-10,00;OK"));
    expect(r.ok && r.transfers[0].amountCents).toBe(1000);
  });
  it("un monto que no se lee rechaza el lote con el monto", () => {
    expect(readBatch(csv("Monto;Estado", "10,00;OK", "diez;OK"))).toEqual({ ok: false, reason: "Un monto del lote no se pudo leer: «diez»." });
  });
  it("una planilla: la hoja sin encabezado se saltea y se lee la que lo tiene", () => {
    const file = xlsx([["Resumen", [["Pagos del día"]]], ["Detalle", [["Cuit Beneficiario", "Monto", "Estado", "Fecha de pago"], ["20222222223", 1500.25, "PROCESADO", "02/07/2026"]]]]);
    expect(readBatch(file)).toEqual({ ok: true, transfers: [{ cuit: "20222222223", number: null, amountCents: 150025, failed: false, payDate: "2026-07-02" }] });
  });
  it("una planilla de Excel 97 (.xls)", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Monto", "Estado"], [200, "ERROR"]]), "Pagos");
    const file = XLSX.write(book, { type: "buffer", bookType: "biff8" }) as Buffer;
    expect(readBatch(file)).toEqual({ ok: true, transfers: [{ cuit: null, number: null, amountCents: 20000, failed: true, payDate: null }] });
  });
  it("una tabla HTML guardada como .xls", () => {
    const file = Buffer.from("<html><body><table><tr><td>Monto</td><td>Estado</td></tr><tr><td>1.500,25</td><td>RECHAZADO</td></tr></table></body></html>");
    expect(readBatch(file)).toEqual({ ok: true, transfers: [{ cuit: null, number: null, amountCents: 150025, failed: true, payDate: null }] });
  });
  it("un PDF o una imagen no son un lote", () => {
    expect(readBatch(Buffer.from("%PDF-1.4 Monto;Estado"))).toEqual({ ok: false, reason: UNREADABLE });
    expect(readBatch(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toEqual({ ok: false, reason: UNREADABLE });
  });
  it("un archivo binario no rompe la lectura: se rechaza con el motivo", () => {
    expect(readBatch(Buffer.from(Array.from({ length: 64 }, (_, i) => i % 8)))).toEqual({ ok: false, reason: UNREADABLE });
  });
});
