// La orientación de la página por el voto de sus renglones: el tamaño con que cada renglón entra al
// clasificador (ch_ppocr_mobile_v2.0_cls) y la decisión de girarla.
import { ORIENTACION, estaDadaVuelta, fraccionGirada, medidasDeOrientacion } from "../src/orientacionDeLaPagina";

describe("medidasDeOrientacion (predict_cls de PaddleOCR 2.x)", () => {
  it.each([
    [100, 48, 100],
    [400, 48, 192],
    [192, 48, 192],
    [50, 25, 96],
    [10, 47, 11],
  ])("%i×%i → ancho %i, tensor de 192", (w, h, ancho) => {
    expect(medidasDeOrientacion(w, h)).toEqual({ ancho, anchoTensor: 192 });
  });
});

describe("fraccionGirada", () => {
  it("la parte de los renglones donde «180» supera a «0»", () => {
    expect(fraccionGirada([[0.9, 0.1], [0.2, 0.8], [0.3, 0.7], [0.6, 0.4]])).toBe(0.5);
  });
  it("el empate no cuenta como girado", () => {
    expect(fraccionGirada([[0.5, 0.5]])).toBe(0);
  });
  it("sin renglones, 0", () => {
    expect(fraccionGirada([])).toBe(0);
  });
});

describe("estaDadaVuelta", () => {
  it("con la mayoría de los renglones girados y renglones suficientes, sí", () => {
    expect(estaDadaVuelta({ renglones: 30, fraccion: ORIENTACION.umbral + 0.01 })).toBe(true);
  });
  it("en el umbral justo, no: hace falta superarlo", () => {
    expect(estaDadaVuelta({ renglones: 30, fraccion: ORIENTACION.umbral })).toBe(false);
  });
  it("con pocos renglones no decide, aunque todos voten girado", () => {
    expect(estaDadaVuelta({ renglones: ORIENTACION.minimoDeRenglones - 1, fraccion: 1 })).toBe(false);
    expect(estaDadaVuelta({ renglones: ORIENTACION.minimoDeRenglones, fraccion: 1 })).toBe(true);
  });
  it("el umbral y el mínimo viajan en la llamada", () => {
    expect(estaDadaVuelta({ renglones: 3, fraccion: 0.4 }, { umbral: 0.3, minimoDeRenglones: 2 })).toBe(true);
    expect(estaDadaVuelta({ renglones: 3, fraccion: 0.4 }, { umbral: 0.5 })).toBe(false);
  });
});
