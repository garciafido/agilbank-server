// Las cuentas del reconocimiento de renglones que no necesitan el modelo: el ancho del renglón, el
// tensor con cada pre-proceso, el CTC y la agrupación por línea media que hacía gutenye.
import {
  agruparComoGutenye,
  agruparPorLineaMedia,
  decodificarCtc,
  medidasDeRenglon,
  tensorDeRenglon,
} from "../src/reconocimientoDeRenglones";

type P = [number, number];
const caja = (x: number, y: number, w = 10, h = 10): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe("medidasDeRenglon (OCRReisizeNormImg de PaddleX)", () => {
  it.each([
    [100, 48, 100, 320],
    [321, 48, 321, 321],
    [1000, 48, 1000, 1000],
    [500, 47, 510, 510],
    [10, 48, 10, 320],
    [4000, 40, 3200, 3200],
    [3200, 48, 3200, 3200],
  ])("%i×%i → ancho %i, tensor %i", (w, h, ancho, anchoTensor) => {
    expect(medidasDeRenglon(w, h)).toEqual({ ancho, anchoTensor });
  });
});

describe("tensorDeRenglon", () => {
  // 2×48 en RGBA: la columna 0 es (255, 0, 51), la 1 es (0, 255, 102)
  const rgba = new Uint8Array(2 * 48 * 4);
  for (let y = 0; y < 48; y++) {
    rgba.set([255, 0, 51, 255], (y * 2) * 4);
    rgba.set([0, 255, 102, 255], (y * 2 + 1) * 4);
  }
  it("gutenye: x/255 en BGR, del ancho del renglón", () => {
    const t = tensorDeRenglon(rgba, 2, 2, "gutenye");
    expect(t).toHaveLength(3 * 48 * 2);
    const plano = 48 * 2;
    expect(Array.from(t.slice(0, 2))).toEqual([51 / 255, 102 / 255].map(Math.fround)); // B
    expect(Array.from(t.slice(plano, plano + 2))).toEqual([0, 1]); // G
    expect(Array.from(t.slice(2 * plano, 2 * plano + 2))).toEqual([1, 0]); // R
    expect(t[plano - 1]).toBeCloseTo(102 / 255, 6);
  });
  it("oficial: (x/255 − 0,5)/0,5 y ceros hasta el ancho del tensor", () => {
    const t = tensorDeRenglon(rgba, 2, 4, "oficial");
    const plano = 48 * 4;
    expect(t).toHaveLength(3 * plano);
    expect(t[0]).toBeCloseTo((51 / 255 - 0.5) / 0.5, 6);
    expect(t[1]).toBeCloseTo((102 / 255 - 0.5) / 0.5, 6);
    expect(Array.from(t.slice(2, 4))).toEqual([0, 0]);
    expect(t[plano]).toBeCloseTo(-1, 6);
    expect(t[plano + 1]).toBeCloseTo(1, 6);
    expect(t[2 * plano]).toBeCloseTo(1, 6);
    expect(t[2 * plano + 1]).toBeCloseTo(-1, 6);
    expect(t[plano + 4 * 47 + 1]).toBeCloseTo(1, 6); // última fila, columna 1, verde
    expect(t[3 * plano - 1]).toBe(0);
  });
});

describe("decodificarCtc", () => {
  const dic = ["a", "b", "c"];
  // pasos × clases, clases = blanco + a + b + c + espacio
  const salida = (pasos: Array<[number, number]>) => {
    const d = new Float32Array(pasos.length * 5);
    pasos.forEach(([k, p], t) => {
      for (let j = 0; j < 5; j++) d[t * 5 + j] = j === k ? p : (1 - p) / 4;
    });
    return d;
  };
  it("se queda con la clase más probable de cada paso, sin el blanco ni los repetidos", () => {
    const r = decodificarCtc(salida([[1, 0.9], [1, 0.8], [0, 0.99], [2, 0.7], [3, 0.6]]), 5, 5, [...dic, " "]);
    expect(r.text).toBe("abc");
    expect(r.mean).toBeCloseTo((0.9 + 0.7 + 0.6) / 3, 6);
  });
  it("una letra repetida separada por el blanco cuenta dos veces", () => {
    expect(decodificarCtc(salida([[1, 0.9], [0, 0.9], [1, 0.9]]), 3, 5, [...dic, " "]).text).toBe("aa");
  });
  it("la última clase es el espacio", () => {
    expect(decodificarCtc(salida([[1, 0.9], [4, 0.9], [2, 0.9]]), 3, 5, [...dic, " "]).text).toBe("a b");
  });
  it("todo blanco: texto vacío y confianza 0", () => {
    expect(decodificarCtc(salida([[0, 0.9], [0, 0.9]]), 2, 5, [...dic, " "])).toEqual({ text: "", mean: 0 });
  });
  it("a igual probabilidad gana la primera clase", () => {
    const d = new Float32Array([0, 0.5, 0.5, 0, 0]);
    expect(decodificarCtc(d, 1, 5, [...dic, " "]).text).toBe("a");
  });
});

describe("agruparPorLineaMedia (afAfRec de gutenye)", () => {
  it("junta las cajas con la línea media a menos de medio alto promedio y las ordena por x", () => {
    const r = agruparPorLineaMedia([
      { text: "der", mean: 0.8, box: caja(50, 2) },
      { text: "izq", mean: 0.6, box: caja(0, 0) },
      { text: "abajo", mean: 0.9, box: caja(0, 30) },
    ]);
    expect(r.map((l) => l.text)).toEqual(["izq der", "abajo"]);
    expect(r[0].mean).toBeCloseTo(0.7, 10);
    expect(r[0].box).toEqual([[0, 0], [60, 2], [60, 12], [0, 10]]);
  });
  it("a medio alto exacto ya es otra línea", () => {
    const r = agruparPorLineaMedia([
      { text: "a", mean: 1, box: caja(0, 0) },
      { text: "b", mean: 1, box: caja(20, 5) },
    ]);
    expect(r.map((l) => l.text)).toEqual(["a", "b"]);
  });
  it("cada caja se compara con la primera del grupo, no con la última", () => {
    const r = agruparPorLineaMedia([
      { text: "a", mean: 1, box: caja(0, 0) },
      { text: "b", mean: 1, box: caja(20, 4) },
      { text: "c", mean: 1, box: caja(40, 8) },
    ]);
    expect(r.map((l) => l.text)).toEqual(["a b", "c"]);
  });
  it("las líneas salen de arriba abajo por la y de su primera caja", () => {
    const r = agruparPorLineaMedia([
      { text: "3", mean: 1, box: caja(0, 60) },
      { text: "1", mean: 1, box: caja(0, 0) },
      { text: "2", mean: 1, box: caja(0, 30) },
    ]);
    expect(r.map((l) => l.text)).toEqual(["1", "2", "3"]);
  });
  it("sin líneas, nada", () => {
    expect(agruparPorLineaMedia([])).toEqual([]);
  });
});

describe("agruparComoGutenye", () => {
  it("descarta lo que tiene confianza menor a 0,5 y agrupa recorriendo al revés", () => {
    // Al revés, «c» siembra el grupo y «b» (a 4 px) entra; «a» queda a 8 px de «c» y arma otro.
    const r = agruparComoGutenye([
      { text: "a", mean: 0.9, box: caja(0, 0) },
      { text: "b", mean: 0.9, box: caja(20, 4) },
      { text: "c", mean: 0.9, box: caja(40, 8) },
      { text: "ruido", mean: 0.49, box: caja(60, 8) },
    ]);
    expect(r.map((l) => l.text)).toEqual(["a", "b c"]);
  });
  it("0,5 justo se conserva", () => {
    expect(agruparComoGutenye([{ text: "x", mean: 0.5, box: caja(0, 0) }]).map((l) => l.text)).toEqual(["x"]);
  });
  it("no modifica la lista que recibe", () => {
    const l = [{ text: "a", mean: 0.9, box: caja(0, 0) }, { text: "b", mean: 0.9, box: caja(0, 30) }];
    agruparComoGutenye(l);
    expect(l.map((x) => x.text)).toEqual(["a", "b"]);
  });
});
