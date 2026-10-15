// Lo que se lee de las salidas de poppler sin correr nada: las palabras del -bbox-layout por página,
// el número de página en el nombre de un render y el tamaño de un PNG.
import { lineasDelXml } from "./pdfGeometry";

export interface PalabraDelPdf {
  texto: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Las palabras de una página, en puntos del PDF desde arriba a la izquierda, con el tamaño de la página. */
export interface PaginaConPalabras {
  pagina: number;
  ancho: number;
  alto: number;
  palabras: PalabraDelPdf[];
}

/**
 * Las palabras del XML de `pdftotext -bbox-layout` agrupadas por página. `desde` es la página del
 * archivo con que empieza el XML: poppler numera desde la primera que se le pidió.
 */
export function paginasDelXml(xml: string, desde: number): PaginaConPalabras[] {
  const { lineas, pageSizes } = lineasDelXml(xml);
  const paginas: PaginaConPalabras[] = pageSizes.map((s, i) => ({ pagina: desde + i, ancho: s.width, alto: s.height, palabras: [] }));
  for (const l of lineas) paginas[l.pagina - 1]?.palabras.push(...l.palabras);
  return paginas;
}

/** pdftoppm nombra cada página `<raíz>-<n>.png`, con tantos ceros como pida la última. */
export function paginaDelNombre(nombre: string): number | null {
  const m = /-(\d+)\.png$/.exec(nombre);
  return m ? Number(m[1]) : null;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** El ancho y el alto del encabezado IHDR, que el formato pone siempre primero. */
export function tamanoDelPng(png: Buffer): { ancho: number; alto: number } | null {
  if (png.length < 24 || !FIRMA_PNG.every((b, i) => png[i] === b) || png.toString("latin1", 12, 16) !== "IHDR") return null;
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}
