// Lo que el paquete publica y las versiones del PP-OCR. Los dos motores dependen de estos nombres,
// y la 1.4.9 de @gutenye apaga el PP-OCR sin avisar: las versiones van fijas, exactas.
import * as lectura from "../src/index";
import * as paquete from "../package.json";

describe("el paquete de lectura", () => {
  it.each([
    "runPaddleOcr", "paddleDisponible", "agruparEnOrdenDeLectura",
    "herramientasDeLectura", "programaDisponible",
    "pdfTextGeometry", "lineasDelXml", "alinear",
    "pdfReparado", "conIndiceReconstruido",
    "textoPorGeometria", "filasPorGeometria", "pendienteDeLaPagina",
    "renderPdfPage", "contarPaginasPdf", "renderPdfFirstPage", "isPdf",
  ])("publica %s", (nombre) => {
    expect(typeof (lectura as Record<string, unknown>)[nombre]).toBe("function");
  });

  it.each(["coordinar", "controlDeSuma", "controlesDeCompletitud", "masDebil", "acotar", "indice"])("publica el juez común: %s", (nombre) => {
    expect(typeof (lectura as Record<string, unknown>)[nombre]).toBe("function");
  });

  it("publica las constantes del juez común", () => {
    expect(typeof lectura.VERSION_DEL_MODULO).toBe("string");
    expect(lectura.TOPE_POR_DEFECTO).toEqual(expect.objectContaining({ candidatosPorCampo: expect.any(Number) }));
  });

  it("fija el PP-OCR en 1.4.8 exacto", () => {
    expect(paquete.dependencies["@gutenye/ocr-common"]).toBe("1.4.8");
    expect(paquete.dependencies["@gutenye/ocr-node"]).toBe("1.4.8");
  });

  it("fija onnxruntime-node en 1.21.0: la última con binario para darwin/x64, y la de transformers.js", () => {
    // Sin el override, npm resuelve la más nueva que pide @gutenye, sin binario para este Mac, y el
    // PP-OCR queda no disponible sin que ningún test lo vea: los tests simulan @gutenye.
    expect((paquete as { overrides?: Record<string, string> }).overrides?.["onnxruntime-node"]).toBe("1.21.0");
  });

  it("declara onnxruntime-common: @gutenye/ocr-common lo importa sin declararlo", () => {
    expect((paquete.dependencies as Record<string, string>)["onnxruntime-common"]).toBe("^1.21.0");
  });
});
