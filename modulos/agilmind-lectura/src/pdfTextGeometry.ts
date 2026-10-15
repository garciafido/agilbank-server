// La geometría del texto de un PDF con poppler: corre pdftotext -bbox-layout y alinea las palabras
// contra el texto del `-layout`. El alineamiento y la lectura del XML están en `pdfGeometry.ts`.

import { alinear, lineasDelXml } from "./pdfGeometry";
import { conIndiceReconstruido } from "./pdfReparado";
import type { OcrWord, PageSize } from "./tipos";

/**
 * Hasta qué página se piden cajas.
 *
 * Es MENOS que el tope del texto (`pdfTextLayout`, 40) y eso es deliberado: los dos
 * caminos no deciden lo mismo. El texto decide qué se lee; la geometría solo agrega
 * cajas, y quien las consume —el visor de la mesa de entrada— muestra la primera
 * página, así que el localizador recibe únicamente las palabras de la página 1. Una
 * palabra sin caja se lee igual; una palabra sin texto no existe.
 *
 * El número se queda en 4 porque `alinear` es cuadrática en líneas de texto × líneas
 * del bbox, y el XML del bbox es varias veces más grande que el texto.
 */
const ULTIMA_PAGINA = 4;

export interface PdfTextGeometry {
  /** Las palabras alineadas al texto del `-layout`, con su caja y su página. */
  words: OcrWord[];
  /** Ancho de la página 1, en puntos PDF. Es el espacio de las cajas. */
  pageWidth: number | null;
  /** Alto de la página 1, en puntos PDF. */
  pageHeight: number | null;
  /** El tamaño de cada página, en puntos PDF; la página n es `pageSizes[n - 1]`. */
  pageSizes: PageSize[];
  /** Palabras que el alineamiento no pudo ubicar en el texto. */
  noAlineadas: number;
  /** Palabras totales que trajo el `-bbox-layout`. */
  total: number;
}

/**
 * La geometría del texto de un PDF, alineada a `textoDelLayout`.
 *
 * `textoDelLayout` tiene que ser EXACTAMENTE lo que devolvió
 * `extractPdfTextLayout` para este mismo buffer: los offsets no significan nada
 * contra otro texto.
 */
export async function pdfTextGeometry(
  buffer: Buffer,
  textoDelLayout: string,
): Promise<PdfTextGeometry> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const fs = await import("fs/promises");
  const os = await import("os");
  const path = await import("path");

  const vacio: PdfTextGeometry = { words: [], pageWidth: null, pageHeight: null, pageSizes: [], noAlineadas: 0, total: 0 };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ap-bbox-"));
  const pdfPath = path.join(dir, "in.pdf");
  try {
    await fs.writeFile(pdfPath, buffer);
    const stdout =
      (await conIndiceReconstruido(
        pdfPath,
        buffer,
        async () =>
          (
            await promisify(execFile)("pdftotext", ["-bbox-layout", "-f", "1", "-l", String(ULTIMA_PAGINA), pdfPath, "-"], {
              maxBuffer: 256 * 1024 * 1024,
            })
          ).stdout,
        (salida) => salida.includes("<word"),
      )) ?? "";
    const { lineas, pageWidth, pageHeight, pageSizes } = lineasDelXml(stdout);
    const { words, noAlineadas } = alinear(textoDelLayout, lineas);
    const total = lineas.reduce((s, l) => s + l.palabras.length, 0);
    return { words, pageWidth, pageHeight, pageSizes, noAlineadas, total };
  } catch {
    // Sin geometría se sigue igual que antes: campos sin caja. No es motivo
    // para perder la lectura.
    return vacio;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
