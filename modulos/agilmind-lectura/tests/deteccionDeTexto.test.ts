// Las cuentas de la detección de PaddleX 3.0 que no necesitan el modelo: el tamaño de entrada, la
// normalización, la caja mínima, su orden, el despliegue y la vuelta a la escala de la imagen.
// Los valores esperados salen de correr el código de PaddleX (processors.py) con los mismos datos.
import {
  DETECCION_OFICIAL,
  aEscalaOriginal,
  binarizar,
  distanciaDeDespliegue,
  limitesDeCaja,
  medidasDeEntrada,
  normalizarBgrChw,
  ordenarCaja,
  ordenarCajas,
  puntosDelRectangulo,
  redondeoPar,
} from "../src/deteccionDeTexto";

type P = [number, number];

describe("DETECCION_OFICIAL", () => {
  it("es la del inference.yml de PP-OCRv5 tal como la lee PaddleX: lado mayor 960, tope 4000, 0,3 / 0,6 / 1,5 / 1000", () => {
    expect(DETECCION_OFICIAL).toEqual({ lado: 960, tipo: "max", ladoMaximo: 4000, thresh: 0.3, boxThresh: 0.6, unclipRatio: 1.5, maxCandidates: 1000 });
  });
});

describe("redondeoPar", () => {
  it("redondea como Python 3: la mitad va al par", () => {
    expect([0.5, 1.5, 2.5, -0.5, 3.4999, 3.5000001].map((x) => redondeoPar(x) + 0)).toEqual([0, 2, 2, 0, 3, 4]);
  });
  it("lo que no es mitad, al más cercano", () => {
    expect([0.49, 0.51, 7, 7.2, 7.8].map(redondeoPar)).toEqual([0, 1, 7, 7, 8]);
  });
});

describe("medidasDeEntrada", () => {
  const op = (lado: number | null, tipo: "max" | "min", ladoMaximo: number | null = 4000) => ({ lado, tipo, ladoMaximo });
  it.each([
    [1654, 2339, op(960, "max"), 672, 960],
    [2339, 1654, op(960, "max"), 960, 672],
    [800, 600, op(960, "max"), 800, 608],
    [1000, 1000, op(960, "max"), 960, 960],
    [1654, 2339, op(1280, "max"), 896, 1280],
    [600, 1200, op(960, "max"), 480, 960],
    [1000, 300, op(736, "min"), 2464, 736],
    [1654, 2339, op(736, "min"), 1664, 2336],
    [500, 300, op(736, "min"), 1216, 736],
    [4000, 3000, op(null, "max"), 4000, 3008],
    [6000, 3000, op(null, "max"), 4000, 1984],
    [10, 10, op(960, "max"), 32, 32],
    [48, 16, op(null, "max"), 64, 32],
    [3000, 6000, op(736, "min", null), 3008, 6016],
  ])("%i×%i con %o → %i×%i", (w, h, o, ew, eh) => {
    expect(medidasDeEntrada(w, h, o)).toEqual({ w: ew, h: eh });
  });
  it("con «min» y el lado menor ya por encima del límite, no cambia la escala", () => {
    expect(medidasDeEntrada(1000, 2000, op(736, "min"))).toEqual({ w: 992, h: 1984 });
  });
  it("con «max» y el lado mayor justo en el límite, tampoco", () => {
    expect(medidasDeEntrada(960, 500, op(960, "max"))).toEqual({ w: 960, h: 512 });
  });
  it("el tope se aplica sobre el resultado del límite", () => {
    expect(medidasDeEntrada(300, 3000, op(4500, "min"))).toEqual({ w: 384, h: 4000 });
  });
});

describe("normalizarBgrChw", () => {
  it("pasa de RGB intercalado a tres planos en BGR, con la media y el desvío de ImageNet en ese orden", () => {
    // dos píxeles: (R,G,B) = (255, 0, 51) y (0, 128, 255)
    const t = normalizarBgrChw(new Uint8Array([255, 0, 51, 0, 128, 255]), 2, 1);
    const esperado = [
      (51 / 255 - 0.485) / 0.229, (255 / 255 - 0.485) / 0.229, // B
      (0 - 0.456) / 0.224, (128 / 255 - 0.456) / 0.224, // G
      (255 / 255 - 0.406) / 0.225, (0 - 0.406) / 0.225, // R
    ];
    expect(t).toHaveLength(6);
    esperado.forEach((v, i) => expect(t[i]).toBeCloseTo(v, 5));
  });
});

describe("puntosDelRectangulo", () => {
  it("da los cuatro puntos en el orden de cv2.boxPoints", () => {
    const p = puntosDelRectangulo(50, 20, 100, 10, -10);
    const esperado = [[1.6278533935546875, 33.6064453125], [-0.1086273193359375, 23.75836944580078], [98.37214660644531, 6.3935546875], [100.10862731933594, 16.24163055419922]];
    p.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(esperado[i][0], 4);
      expect(q[1]).toBeCloseTo(esperado[i][1], 4);
    });
  });
  it("con 90°, el ancho va en vertical", () => {
    const p = puntosDelRectangulo(10, 5, 4, 8, 90);
    const esperado = [[6, 3], [14, 3], [14, 7], [6, 7]];
    p.forEach((q, i) => {
      expect(q[0]).toBeCloseTo(esperado[i][0], 6);
      expect(q[1]).toBeCloseTo(esperado[i][1], 6);
    });
  });
});

describe("ordenarCaja", () => {
  it("arriba a la izquierda, arriba a la derecha, abajo a la derecha, abajo a la izquierda", () => {
    expect(ordenarCaja([[10, 20], [0, 20], [10, 0], [0, 0]])).toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
  });
  it("en cada mitad decide la y, no el orden de llegada", () => {
    expect(ordenarCaja([[0, 0], [0, 20], [10, 20], [10, 0]])).toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
    expect(ordenarCaja([[1, 30], [0, 2], [9, 31], [10, 1]])).toEqual([[0, 2], [10, 1], [9, 31], [1, 30]]);
  });
  it("a igual y en una mitad, el segundo por x va primero (como get_mini_boxes)", () => {
    expect(ordenarCaja([[0, 0], [1, 0], [5, 10], [6, 10]])).toEqual([[1, 0], [6, 10], [5, 10], [0, 0]]);
  });
  it("no modifica la lista que recibe", () => {
    const p: P[] = [[10, 20], [0, 20], [10, 0], [0, 0]];
    ordenarCaja(p);
    expect(p).toEqual([[10, 20], [0, 20], [10, 0], [0, 0]]);
  });
});

describe("distanciaDeDespliegue", () => {
  it("es área × ratio / perímetro, como unclip", () => {
    // 100×20: área 2000, perímetro 240
    expect(distanciaDeDespliegue([[0, 0], [100, 0], [100, 20], [0, 20]], 1.5)).toBeCloseTo((2000 * 1.5) / 240, 10);
  });
  it("el área no depende del sentido del recorrido", () => {
    expect(distanciaDeDespliegue([[0, 20], [100, 20], [100, 0], [0, 0]], 2)).toBeCloseTo((2000 * 2) / 240, 10);
  });
  it("un cuadrilátero inclinado", () => {
    const caja: P[] = [[0, 0], [3, 4], [-1, 7], [-4, 3]]; // lados 5, 5, 5, 5; área 25
    expect(distanciaDeDespliegue(caja, 1)).toBeCloseTo(25 / 20, 10);
  });
});

describe("limitesDeCaja", () => {
  it("piso y techo de la caja, recortados a la imagen", () => {
    expect(limitesDeCaja([[1.2, 2.7], [8.5, 2.1], [8.9, 6.01], [0.9, 6.5]], 100, 100)).toEqual({ xmin: 0, xmax: 9, ymin: 2, ymax: 7 });
  });
  it("lo que se sale queda en el borde: entre 0 y el lado − 1", () => {
    expect(limitesDeCaja([[-5, -3], [120, -3], [120, 80], [-5, 80]], 100, 50)).toEqual({ xmin: 0, xmax: 99, ymin: 0, ymax: 49 });
  });
});

describe("aEscalaOriginal", () => {
  it("multiplica por la escala, redondea como Python y recorta a [0, destino]", () => {
    const c = aEscalaOriginal([[10.25, 5], [20, 5], [20, 9.5], [-3, 400]], 2, 3, 30, 100);
    expect(c).toEqual([[20, 15], [30, 15], [30, 28], [0, 100]]);
  });
  it("la mitad exacta va al par", () => {
    expect(aEscalaOriginal([[1.25, 0.75], [0, 0], [0, 0], [0, 0]], 2, 2, 10, 10)[0]).toEqual([2, 2]);
  });
});

describe("binarizar", () => {
  it("255 donde la probabilidad supera el umbral, 0 en el resto", () => {
    expect(Array.from(binarizar([0.1, 0.29, 0.31, 0.9], 0.3))).toEqual([0, 0, 255, 255]);
  });
  it("como numpy, compara en float32: el 0,3 del mapa no supera al umbral 0,3", () => {
    expect(Array.from(binarizar(new Float32Array([0.3, 0.30001]), 0.3))).toEqual([0, 255]);
  });
});

describe("ordenarCajas", () => {
  const caja = (x: number, y: number) => ({ caja: [[x, y], [x + 10, y], [x + 10, y + 5], [x, y + 5]] as P[] });
  it("de arriba abajo por el primer punto", () => {
    expect(ordenarCajas([caja(0, 50), caja(0, 10), caja(0, 30)]).map((c) => c.caja[0][1])).toEqual([10, 30, 50]);
  });
  it("en la misma franja (menos de 10 px), de izquierda a derecha aunque una esté un poco más arriba", () => {
    expect(ordenarCajas([caja(100, 12), caja(5, 18), caja(50, 15)]).map((c) => c.caja[0][0])).toEqual([5, 50, 100]);
  });
  it("a 10 px o más ya son renglones distintos", () => {
    expect(ordenarCajas([caja(100, 10), caja(5, 20)]).map((c) => c.caja[0][0])).toEqual([100, 5]);
  });
  it("en la misma franja y con la misma x, sigue mandando la y", () => {
    expect(ordenarCajas([caja(5, 15), caja(5, 12)]).map((c) => c.caja[0][1])).toEqual([12, 15]);
  });
  it("a igual y, por x", () => {
    expect(ordenarCajas([caja(30, 0), caja(10, 0)]).map((c) => c.caja[0][0])).toEqual([10, 30]);
  });
  it("no modifica la lista que recibe", () => {
    const l = [caja(0, 50), caja(0, 10)];
    ordenarCajas(l);
    expect(l.map((c) => c.caja[0][1])).toEqual([50, 10]);
  });
});
