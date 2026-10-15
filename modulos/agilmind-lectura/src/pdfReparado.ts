/**
 * EL PDF CON EL ÍNDICE ROTO — el archivo está entero, lo que falta es la tabla que dice
 * dónde está cada objeto.
 *
 * Un PDF termina con una tabla de referencias cruzadas: la lista de posiciones de cada
 * objeto del archivo. Si esa tabla quedó mal escrita —un generador que la calcula sobre
 * un tamaño distinto al que después escribe— poppler avisa que va a reconstruirla, se
 * rinde, y el documento no tiene ni texto ni render. No se lee mal: no se lee.
 *
 * El contenido, mientras tanto, está intacto. Volver a armar el archivo objeto por objeto
 * reconstruye el índice, y lo que sale se lee entero — en marcalba-00518, la factura con
 * su número, su CUIT y su fecha.
 *
 * No es un rescate de datos rotos ni una heurística: es reescribir el mismo documento con
 * su índice bien puesto. Si el archivo no es un PDF —pesa cero, o empieza con bytes que no
 * son la cabecera del formato— acá no hay nada que hacer y se devuelve null, que es la
 * respuesta honesta.
 */
export async function pdfReparado(buffer: Buffer): Promise<Buffer | null> {
  // La carga es cara y solo vale la pena sobre algo que dice ser un PDF.
  if (buffer.length < 32 || buffer.subarray(0, 1024).indexOf("%PDF") === -1) return null;
  try {
    const { PDFDocument } = await import("pdf-lib");
    // `ignoreEncryption`: un PDF protegido contra impresión —común en los que emite un
    // portal— se puede leer igual, y rechazarlo por eso sería perder el comprobante.
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    if (doc.getPageCount() === 0) return null;
    return Buffer.from(await doc.save());
  } catch {
    return null;
  }
}

/**
 * Corre algo que lee un PDF y, si no sirvió, lo reintenta UNA vez con el índice
 * reconstruido.
 *
 * El reintento mira el RESULTADO y no solo la excepción: con el índice roto poppler a
 * veces no falla, devuelve la nada. Un `null` de acá significa que tampoco con el índice
 * bien puesto se pudo — o que el archivo no era un PDF.
 */
export async function conIndiceReconstruido<T>(
  pdfPath: string,
  buffer: Buffer,
  correr: () => Promise<T>,
  sirve: (resultado: T) => boolean,
): Promise<T | null> {
  const primera = await correr().catch(() => null);
  if (primera !== null && sirve(primera)) return primera;
  const reparado = await pdfReparado(buffer);
  if (!reparado) return primera;
  const fs = await import("fs/promises");
  await fs.writeFile(pdfPath, reparado);
  const segunda = await correr().catch(() => null);
  return segunda !== null && sirve(segunda) ? segunda : primera;
}
