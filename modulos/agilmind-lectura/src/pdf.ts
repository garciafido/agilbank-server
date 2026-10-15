// El PDF con poppler: render de una página y cuántas páginas tiene. Nada de esto sabe qué documento es.
import { conIndiceReconstruido } from "./pdfReparado";
import { declaraPaginas, paginasDeLaSalida } from "./paginasDePdf";

/**
 * PDF → PNG de la primera página a 200dpi vía pdftoppm (poppler). A esa
 * resolución el QR de ARCA siempre sale nítido — es el camino preferido
 * frente a screenshots. Sin poppler en el entorno, se devuelve null y la
 * carga sigue manual (el deploy debe instalar poppler-utils en el contenedor).
 */
export async function renderPdfPage(buffer: Buffer, page: number): Promise<Buffer | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const fs = await import("fs/promises");
  const os = await import("os");
  const path = await import("path");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ap-scan-"));
  const pdfPath = path.join(dir, "in.pdf");
  try {
    await fs.writeFile(pdfPath, buffer);
    // El índice roto no es un archivo roto: se reconstruye y se reintenta. Ver `pdfReparado.ts`.
    await conIndiceReconstruido(
      pdfPath,
      buffer,
      () => promisify(execFile)("pdftoppm", ["-r", "200", "-png", "-f", String(page), "-l", String(page), pdfPath, path.join(dir, "out")]),
      () => true,
    );
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".png"));
    if (!files.length) return null;
    return await fs.readFile(path.join(dir, files[0]));
  } catch (error) {
    // El motivo REAL, no solo null: un render que falla en silencio apaga el
    // OCR y el barrido de QR aguas arriba, y eso se diagnostica a ciegas.
    // Excepción: pedir una página que no existe es la SONDA normal del
    // relleno secuencial («¿hay página N?») — ese fallo no se loguea o cada
    // PDF de una página canta en el log del server.
    if (!/Wrong page range/i.test((error as Error).message)) {
      console.warn(
        `[renderPdfPage] falló la página ${page}:`,
        (error as NodeJS.ErrnoException).code ?? "",
        (error as Error).message.slice(0, 200),
      );
    }
    return null; // pdftoppm ausente o PDF ilegible
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Cuántas páginas tiene el PDF. `null` si no se pudo saber.
 *
 * Devuelve `null` y no un default de 1 a propósito: es el dato con el que la
 * descomposición decide si puede afirmar que vio el documento entero. Un default
 * mentiría —diría «leí 1 de 1» sobre un archivo de 30 páginas— y esa mentira es
 * exactamente la que el veredicto `unavailable` existe para no decir.
 *
 * `pdfinfo` viene con poppler, igual que `pdftotext` y `pdftoppm`.
 */
export async function contarPaginasPdf(buffer: Buffer): Promise<number | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const fs = await import("fs/promises");
  const os = await import("os");
  const path = await import("path");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ap-pags-"));
  const pdfPath = path.join(dir, "in.pdf");
  try {
    await fs.writeFile(pdfPath, buffer);
    const stdout =
      (await conIndiceReconstruido(
        pdfPath,
        buffer,
        async () => (await promisify(execFile)("pdfinfo", [pdfPath], { maxBuffer: 4 * 1024 * 1024 })).stdout,
        declaraPaginas,
      )) ?? "";
    return paginasDeLaSalida(stdout);
  } catch {
    return null; // pdfinfo ausente o PDF ilegible
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function renderPdfFirstPage(buffer: Buffer): Promise<Buffer | null> {
  return renderPdfPage(buffer, 1);
}
