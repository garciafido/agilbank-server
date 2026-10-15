/// <reference path="./gutenye-ocr-node.d.ts" />
// Lo que el paquete publica. agilpost-motor lo reexporta en su propio índice con los mismos nombres.
// La referencia lleva los tipos de @gutenye/ocr-node a quien compile el paquete desde afuera.
export { runPaddleOcr, paddleDisponible } from "./paddleOcr";
export { agruparEnOrdenDeLectura } from "./ordenDeLectura";
export { herramientasDeLectura, programaDisponible } from "./herramientasDeLectura";
export type { HerramientasDeLectura } from "./herramientasDeLectura";
export { lineasDelXml, alinear } from "./pdfGeometry";
export { pdfTextGeometry } from "./pdfTextGeometry";
export type { PdfTextGeometry } from "./pdfTextGeometry";
export { pdfReparado, conIndiceReconstruido } from "./pdfReparado";
export { textoPorGeometria, filasPorGeometria } from "./textoPorGeometria";
export { pendienteDeLaPagina } from "./inclinacionDeLaPagina";
export { renderPdfPage, contarPaginasPdf, renderPdfFirstPage } from "./pdf";
export { isPdf } from "./paginasDePdf";
export { palabrasDelPdf, renderizarPaginas } from "./pdfPaginas";
export type { PaginaRenderizada } from "./pdfPaginas";
export { tamanoDelPng } from "./paginasDelPdf";
export { prepararFoto, girarPng, pixelesGrises } from "./foto";
export type { PaginaConPalabras, PalabraDelPdf } from "./paginasDelPdf";
export type { ApBoundingBox, PageSize, OcrWord } from "./tipos";
