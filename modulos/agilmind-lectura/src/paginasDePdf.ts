// Lo que se decide mirando bytes o texto de un PDF, sin correr ningún programa.

/** ¿La salida de `pdfinfo` trae la línea de páginas? Sin ella el índice está roto y vale reconstruirlo. */
export const declaraPaginas = (salida: string): boolean => /^Pages:\s*\d+/m.test(salida);

/** Las páginas que dice la salida de `pdfinfo`; `null` si no dice un entero positivo. */
export function paginasDeLaSalida(salida: string): number | null {
  const n = Number(/^Pages:\s+(\d+)/m.exec(salida)?.[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const PDF_MAGIC = Buffer.from("%PDF");

export const isPdf = (buffer: Buffer): boolean => buffer.subarray(0, 4).equals(PDF_MAGIC);
