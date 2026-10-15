/**
 * `agruparEnOrdenDeLectura` con cajas armadas a mano: cada comportamiento por separado, con la
 * entrada más chica que lo muestra. El caso de una factura entera está en `ordenDeLectura.test.ts`.
 *
 * La pendiente que el agrupador estima de la página no sale por ningún lado: se ve en el efecto.
 * Dos cajas angostas A y B —no entran en la estimación— están lejos en x; solo caen en la misma
 * fila si la página se enderezó con la pendiente que lleva de una a otra.
 */

import { agruparEnOrdenDeLectura } from "../src/index";

type Linea = { text: string; box: Array<[number, number]> };

/**
 * La caja de una línea con las esquinas en el orden del detector: arriba-izquierda, arriba-derecha,
 * abajo-derecha y abajo-izquierda. `subida` es cuánto más abajo queda el borde derecho que el
 * izquierdo.
 */
const caja = (text: string, x: number, y: number, w: number, h: number, subida = 0): Linea => ({
  text,
  box: [
    [x, y],
    [x + w, y + subida],
    [x + w, y + subida + h],
    [x, y + h],
  ],
});

const filas = (lineas: Linea[], escala?: number): string[] => agruparEnOrdenDeLectura(lineas, escala).text.split("\n");

describe("las filas", () => {
  it("sin líneas, o con líneas en blanco, no hay texto ni palabras", () => {
    expect(agruparEnOrdenDeLectura([])).toEqual({ text: "", words: [] });
    expect(agruparEnOrdenDeLectura([caja("   ", 0, 0, 100, 10), caja("", 0, 50, 100, 10)])).toEqual({ text: "", words: [] });
  });

  it("van de arriba hacia abajo y cada una de izquierda a derecha, venga como venga la entrada", () => {
    const entrada = [
      caja("cinco", 300, 200, 80, 10),
      caja("dos", 200, 100, 80, 10),
      caja("seis", 500, 200, 80, 10),
      caja("uno", 0, 100, 80, 10),
      caja("tres", 0, 300, 80, 10),
    ];
    expect(filas(entrada)).toEqual(["uno dos", "cinco seis", "tres"]);
  });

  it("una línea en blanco no abre una fila vacía", () => {
    expect(filas([caja("A1", 0, 0, 80, 10), caja("   ", 0, 100, 80, 10), caja("B1", 0, 200, 80, 10)])).toEqual(["A1", "B1"]);
  });

  it("dos cajas son de la misma fila si sus anclas distan hasta 8 puntos, y de filas distintas si más", () => {
    // Alto 10: medio renglón son 5,5, así que manda el piso de 8.
    expect(filas([caja("arriba", 0, 100, 80, 10), caja("abajo", 200, 108, 80, 10)])).toEqual(["arriba abajo"]);
    expect(filas([caja("arriba", 0, 100, 80, 10), caja("abajo", 200, 109, 80, 10)])).toEqual(["arriba", "abajo"]);
  });

  it("el umbral es 0,55 del alto mediano cuando pasa de 8", () => {
    // Alto 40: 0,55 · 40 = 22.
    expect(filas([caja("arriba", 0, 100, 80, 40), caja("abajo", 200, 121, 80, 40)])).toEqual(["arriba abajo"]);
    expect(filas([caja("arriba", 0, 100, 80, 40), caja("abajo", 200, 123, 80, 40)])).toEqual(["arriba", "abajo"]);
  });

  it("la fila es una cadena: cada ancla se compara con la anterior de la fila, no con la primera", () => {
    const cadena = [caja("a1", 0, 100, 80, 10), caja("b2", 100, 107, 80, 10), caja("c3", 200, 114, 80, 10)];
    expect(filas(cadena)).toEqual(["a1 b2 c3"]);
  });
});

describe("el texto de cada línea", () => {
  it("se recorta: los espacios de los bordes no entran al texto ni a las palabras", () => {
    const r = agruparEnOrdenDeLectura([caja("  ab cd  ", 0, 0, 90, 10)]);
    expect(r.text).toBe("ab cd");
    expect(r.words.map((w) => [w.text, w.start, w.end])).toEqual([
      ["ab", 0, 2],
      ["cd", 3, 5],
    ]);
  });

  it("se parte en palabras por cualquier espacio, repetido o no", () => {
    const r = agruparEnOrdenDeLectura([caja("uno   dos\tres", 0, 0, 130, 10)]);
    expect(r.words.map((w) => w.text)).toEqual(["uno", "dos", "res"]);
    expect(r.words.map((w) => r.text.slice(w.start, w.end))).toEqual(["uno", "dos", "res"]);
  });

  it("una palabra repetida toma cada vez su lugar", () => {
    const r = agruparEnOrdenDeLectura([caja("ab ab ab", 0, 0, 80, 10)]);
    expect(r.words.map((w) => w.start)).toEqual([0, 3, 6]);
  });
});

describe("las palabras", () => {
  it("cada una lleva su rango en el texto de toda la página, filas y separadores incluidos", () => {
    const r = agruparEnOrdenDeLectura([
      caja("uno dos", 0, 100, 70, 10),
      caja("tres", 200, 100, 40, 10),
      caja("cuatro", 0, 300, 60, 10),
    ]);
    expect(r.text).toBe("uno dos tres\ncuatro");
    expect(r.words.map((w) => [w.text, w.start, w.end])).toEqual([
      ["uno", 0, 3],
      ["dos", 4, 7],
      ["tres", 8, 12],
      ["cuatro", 13, 19],
    ]);
    for (const w of r.words) expect(r.text.slice(w.start, w.end)).toBe(w.text);
  });

  it("la caja de cada una es la parte de la caja de la línea que le toca por sus caracteres", () => {
    // Esquinas inclinadas: la caja de la línea es el rectángulo que las contiene, 100 × 26 desde (10, 20).
    const linea: Linea = {
      text: "ab cde f",
      box: [
        [10, 20],
        [110, 26],
        [110, 46],
        [10, 40],
      ],
    };
    const { words } = agruparEnOrdenDeLectura([linea]);
    expect(words.map((w) => ({ t: w.text, ...w.box }))).toEqual([
      { t: "ab", x: 10, y: 20, w: 25, h: 26 },
      { t: "cde", x: 48, y: 20, w: 38, h: 26 },
      { t: "f", x: 98, y: 20, w: 13, h: 26 },
    ]);
  });

  it("ninguna es más angosta que cuatro píxeles", () => {
    const { words } = agruparEnOrdenDeLectura([caja("a " + "b".repeat(50), 0, 0, 50, 10)]);
    expect(words[0].box.w).toBe(4);
    expect(words[1].box.w).toBe(48);
  });

  it("las coordenadas vuelven divididas por el aumento con que se leyó la imagen", () => {
    const { words } = agruparEnOrdenDeLectura([caja("ab cd", 40, 80, 200, 20, 10)], 2);
    expect(words.map((w) => ({ t: w.text, ...w.box }))).toEqual([
      { t: "ab", x: 20, y: 40, w: 40, h: 15 },
      { t: "cd", x: 80, y: 40, w: 40, h: 15 },
    ]);
  });
});

describe("la pendiente del escaneo", () => {
  // Tres líneas (o las que se pidan) que fijan la pendiente: están en x = 0 y bien separadas, así
  // que su fila no depende de ella. A está en (0, 100) y B en (1000, 100 + dB).
  const juntas = (fijan: Linea[], dB: number, h = 10): boolean => {
    const a = caja("AA", 0, 100, 30, h);
    const b = caja("BB", 1000, 100 + dB, 30, h);
    return filas([...fijan, a, b]).includes("AA BB");
  };
  const fijando = (cuantas: number, w: number, h: number, subida: number, desde = 0): Linea[] =>
    Array.from({ length: cuantas }, (_, i) => caja(`fija${desde + i}`, 0, 5000 + 300 * (desde + i), w, h, subida));

  it("con tres líneas anchas inclinadas la página se endereza con esa pendiente", () => {
    const fijan = fijando(3, 100, 10, 5); // 0,05
    expect(juntas(fijan, 50)).toBe(true);
    expect(juntas(fijan, 0)).toBe(false);
  });

  it("también hacia el otro lado", () => {
    const fijan = fijando(3, 100, 10, -5);
    expect(juntas(fijan, -50)).toBe(true);
    expect(juntas(fijan, 0)).toBe(false);
  });

  it("con menos de tres no se corrige nada", () => {
    expect(juntas(fijando(2, 100, 10, 5), 50)).toBe(false);
    expect(juntas(fijando(2, 100, 10, 5), 0)).toBe(true);
    expect(juntas([], 0)).toBe(true);
  });

  it("solo miden las cajas anchas: más de 40 puntos", () => {
    expect(juntas(fijando(3, 40, 8, 2), 50)).toBe(false);
    expect(juntas(fijando(3, 41, 8, 2), 50)).toBe(true);
  });

  it("y alargadas: cinco veces más anchas que altas, justo incluido", () => {
    expect(juntas(fijando(3, 100, 20, 5), 50, 20)).toBe(true);
    expect(juntas(fijando(3, 100, 21, 5), 50, 21)).toBe(false);
  });

  it("una pendiente de más de 0,1 es un error de lectura y se descarta; 0,1 justo, no", () => {
    expect(juntas(fijando(3, 100, 10, 20), 5)).toBe(true);
    expect(juntas(fijando(3, 100, 10, 20), 200)).toBe(false);
    expect(juntas(fijando(3, 100, 10, 10), 100)).toBe(true);
    expect(juntas(fijando(3, 100, 10, 10), 0)).toBe(false);
  });

  it("la pendiente de la página es la mediana, no el promedio", () => {
    // Cinco líneas: 0,05 · 3 y 0,2 · 2 (que sumadas harían un promedio de 0,11).
    const fijan = [...fijando(3, 100, 10, 5), ...fijando(2, 100, 10, 20, 3)];
    expect(juntas(fijan, 50)).toBe(true);
  });
});
