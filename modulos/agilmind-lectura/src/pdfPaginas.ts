// E/S: corre pdftotext y pdftoppm sobre un rango de páginas. Queda fuera de la mutación, como pdf.ts;
// lo que se puede probar sin poppler vive en paginasDelPdf.ts.
import { conIndiceReconstruido } from "./pdfReparado";
import { paginaDelNombre, paginasDelXml } from "./paginasDelPdf";
import type { PaginaConPalabras } from "./paginasDelPdf";

export interface PaginaRenderizada {
  pagina: number;
  png: Buffer;
}

/** Corre `trabajo` con el PDF escrito una sola vez en un directorio temporal, que se borra al terminar. */
async function conElPdfEnDisco<T>(buffer: Buffer, trabajo: (pdf: string, dir: string) => Promise<T>): Promise<T> {
  const fs = await import("fs/promises");
  const os = await import("os");
  const path = await import("path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ab-pdf-"));
  try {
    const pdf = path.join(dir, "in.pdf");
    await fs.writeFile(pdf, buffer);
    return await trabajo(pdf, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Las palabras con su caja de las páginas `desde` a `hasta`, con un solo `pdftotext -bbox-layout`.
 * `null` si poppler no está o el PDF no se puede leer: no distingue las dos, y quien llama pregunta
 * por las herramientas si le importa.
 */
export async function palabrasDelPdf(buffer: Buffer, { desde, hasta }: { desde: number; hasta: number }): Promise<PaginaConPalabras[] | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  try {
    return await conElPdfEnDisco(buffer, async (pdf) => {
      const xml = await conIndiceReconstruido(
        pdf,
        buffer,
        async () =>
          (await promisify(execFile)("pdftotext", ["-bbox-layout", "-f", String(desde), "-l", String(hasta), pdf, "-"], { maxBuffer: 256 * 1024 * 1024 })).stdout,
        (salida) => salida.includes("<page"),
      );
      return xml === null || !xml.includes("<page") ? null : paginasDelXml(xml, desde);
    });
  } catch {
    return null;
  }
}

/**
 * Las páginas `desde` a `hasta` en PNG a `dpi`, con un solo `pdftoppm`: el PDF se escribe una vez
 * aunque sean muchas páginas (el resumen de Credicoop pesa 50 MB). `null` si poppler no está o el
 * PDF no se puede leer.
 */
export async function renderizarPaginas(
  buffer: Buffer,
  { dpi, desde, hasta }: { dpi: number; desde: number; hasta: number },
): Promise<PaginaRenderizada[] | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const fs = await import("fs/promises");
  const path = await import("path");
  try {
    return await conElPdfEnDisco(buffer, async (pdf, dir) => {
      const ok = await conIndiceReconstruido(
        pdf,
        buffer,
        async () => {
          await promisify(execFile)("pdftoppm", ["-r", String(dpi), "-png", "-f", String(desde), "-l", String(hasta), pdf, path.join(dir, "p")], {
            maxBuffer: 16 * 1024 * 1024,
          });
          return true;
        },
        () => true,
      );
      if (ok === null) return null;
      const archivos = (await fs.readdir(dir))
        .map((nombre) => ({ nombre, pagina: paginaDelNombre(nombre) }))
        .filter((a): a is { nombre: string; pagina: number } => a.pagina !== null)
        .sort((a, b) => a.pagina - b.pagina);
      if (archivos.length === 0) return null;
      return Promise.all(archivos.map(async (a) => ({ pagina: a.pagina, png: await fs.readFile(path.join(dir, a.nombre)) })));
    });
  } catch {
    return null;
  }
}
