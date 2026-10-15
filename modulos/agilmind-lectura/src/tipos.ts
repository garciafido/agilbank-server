// Las palabras y sus cajas, como las entregan el texto del PDF y el OCR. Los nombres son los que ya
// usaba agilpost-motor, que los reexporta desde `ocrExtract.ts`.

export interface ApBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * La página del archivo de la que sale la caja, desde 1, y el tamaño de esa página en la misma
   * unidad que x, y, w y h: puntos del PDF si la caja vino del texto, píxeles de la página
   * renderizada si vino del OCR. Sin los tres, la caja no se puede ubicar en el papel: sus
   * coordenadas no dicen de qué página ni contra qué tamaño se miden.
   */
  page?: number;
  pageWidth?: number;
  pageHeight?: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  box: ApBoundingBox;
  // Rango de caracteres de la palabra dentro del texto reconstruido.
  start: number;
  end: number;
  // Página de la que salió, 1-based. Solo la puebla la geometría del texto del
  // PDF (`pdfTextGeometry`), que lee cuatro páginas; el OCR renderiza una sola y
  // la deja sin poner.
  //
  // Importa porque la caja está en el espacio de SU página: dibujar una caja de
  // la página 3 sobre la imagen de la página 1 no es un error visual, es señalar
  // el lugar equivocado. Quien consuma las cajas filtra por página.
  page?: number;
}
