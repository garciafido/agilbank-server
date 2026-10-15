/**
 * `pendienteDeLaPagina` — cuánto viene inclinada la página, medida en sus propias palabras.
 *
 * Las páginas se arman a mano: renglones de palabras sobre rectas de pendiente conocida, con
 * alturas y anchos distintos para que el centro de cada caja importe. La pendiente que sale tiene
 * que ser la que se usó para armarlas.
 */

import { pendienteDeLaPagina } from "../src/inclinacionDeLaPagina";
import type { OcrWord } from "../src/tipos";
import { palabraEn } from "./helpers/palabras";

const ALTOS = [18, 20, 22, 24];
const ANCHOS = [60, 80, 100, 70];

/**
 * Un renglón de `n` palabras sobre la recta `cy = y0 + pendiente · (cx − 100)`, una cada 120 px.
 * Las alturas y los anchos rotan, así que la caja de arriba de una palabra no es la de su vecina.
 */
const renglon = (fila: number, pendiente: number, n = 5): OcrWord[] =>
  Array.from({ length: n }, (_, i) => {
    const cx = 100 + i * 120;
    const cy = 100 + fila * 60 + pendiente * (cx - 100);
    return palabraEn("palabra", cx, cy, ANCHOS[(i + 2 * fila) % 4], ALTOS[(i + fila) % 4]);
  });

/** Una página con un renglón por cada pendiente, en el orden en que se piden. */
const pagina = (pendientes: number[], n = 5): OcrWord[] => pendientes.flatMap((p, fila) => renglon(fila, p, n));

/** El orden en que el OCR entrega las palabras no es el del papel: acá, uno repetible que lo desordena. */
const desordenada = (words: OcrWord[]): OcrWord[] => {
  const paso = [7, 11, 13, 17].find((p) => words.length % p !== 0)!;
  return words.map((_, i) => words[(i * paso) % words.length]);
};

const CINCO = [0.01, 0.01, 0.01, 0.01, 0.01];

describe("la pendiente de una página", () => {
  it("es la de las rectas donde caen los renglones, con su signo", () => {
    expect(pendienteDeLaPagina(pagina(CINCO))).toBeCloseTo(0.01, 10);
    expect(pendienteDeLaPagina(pagina(CINCO.map((p) => -2 * p)))).toBeCloseTo(-0.02, 10);
  });

  it("es 0 en una página derecha", () => {
    expect(pendienteDeLaPagina(pagina([0, 0, 0, 0, 0, 0]))).toBe(0);
  });

  it("no depende del orden en que vienen las palabras", () => {
    expect(pendienteDeLaPagina(desordenada(pagina(CINCO)))).toBeCloseTo(0.01, 10);
  });

  it("es la MEDIANA de los renglones: uno desviado no inclina la página", () => {
    // Siete renglones; en el orden de entrada el cuarto es 0,004, pero ordenadas la mediana es 0,012.
    const pendientes = [0.02, 0.012, 0.016, 0.004, 0.008, -0.012, 0.018];
    expect(pendienteDeLaPagina(pagina(pendientes))).toBeCloseTo(0.012, 10);
  });

  it("con un número par de renglones toma el de arriba de la mitad", () => {
    expect(pendienteDeLaPagina(pagina([0.02, 0.01, 0.014, 0.006, 0.016, 0.012]))).toBeCloseTo(0.014, 10);
  });

  it("el centro de la caja es y + h/2 y x + w/2, no el borde", () => {
    // Misma recta por los centros; si el cálculo usara otra cosa que el centro, las alturas
    // distintas la torcerían.
    const sinTocar = pagina(CINCO);
    expect(pendienteDeLaPagina(sinTocar)).toBeCloseTo(0.01, 10);
    const tambienPorLaEsquina = sinTocar.map((w) => ({ ...w, box: { ...w.box, h: w.box.h + 6, y: w.box.y - 3 } }));
    expect(pendienteDeLaPagina(tambienPorLaEsquina)).toBeCloseTo(0.01, 10);
  });
});

describe("cuándo no se pronuncia", () => {
  it("bajo la pendiente mínima (~0,1°) la página se declara derecha", () => {
    expect(pendienteDeLaPagina(pagina(CINCO.map(() => 0.0016)))).toBe(0);
    expect(pendienteDeLaPagina(pagina(CINCO.map(() => -0.0016)))).toBe(0);
    expect(pendienteDeLaPagina(pagina(CINCO.map(() => 0.0018)))).toBeCloseTo(0.0018, 10);
    expect(pendienteDeLaPagina(pagina(CINCO.map(() => -0.0018)))).toBeCloseTo(-0.0018, 10);
  });

  it("justo en la pendiente mínima ya es una página inclinada", () => {
    // Centros en −24, −7, 7 y 24 de la media, y alturas −1/16, +1/16 (al revés de un lado a otro):
    // todo exacto en binario, así que la pendiente es 17/10000 sin el error de redondeo que el
    // empate necesita para ocurrir.
    const exacto = (fila: number): OcrWord[] =>
      [
        [-24, 0.0625],
        [-7, -0.0625],
        [7, 0.0625],
        [24, -0.0625],
      ].map(([dx, dy]) => palabraEn("palabra", 1000 + dx, 100 + fila * 60 + dy, 8, 20));
    const cinco = Array.from({ length: 5 }, (_, fila) => exacto(fila)).flat();
    expect(pendienteDeLaPagina(cinco)).toBe(-0.0017);
  });

  it("sin cinco renglones medibles no hay mediana que valga", () => {
    expect(pendienteDeLaPagina(pagina([0.01, 0.01, 0.01, 0.01]))).toBe(0);
    expect(pendienteDeLaPagina(pagina(CINCO))).toBeCloseTo(0.01, 10);
  });

  it("un renglón de menos de cuatro palabras no cuenta", () => {
    // Seis de tres palabras con otra pendiente correrían la mediana si contaran.
    const cuatroPalabras = pagina(CINCO, 4);
    const deTres = Array.from({ length: 6 }, (_, i) => renglon(10 + i, 0.02, 3)).flat();
    expect(pendienteDeLaPagina([...cuatroPalabras, ...deTres])).toBeCloseTo(0.01, 10);
    expect(pendienteDeLaPagina(pagina(CINCO, 4))).toBeCloseTo(0.01, 10);
  });

  it("veinte palabras alcanzan; con menos no hay renglones suficientes", () => {
    expect(pagina(CINCO, 4)).toHaveLength(20);
    expect(pendienteDeLaPagina(pagina(CINCO, 4))).toBeCloseTo(0.01, 10);
    expect(pendienteDeLaPagina(pagina(CINCO, 3))).toBe(0);
  });

  it("un renglón angosto en x no define una recta: su pendiente es ruido", () => {
    // Cuatro centros a −20, −10, 10 y 20 de la media: Σ(x − x̄)² = 1000 justo, que todavía vale.
    const angosto = (fila: number, anchoRelativo: number, pendiente: number): OcrWord[] =>
      [-2, -1, 1, 2].map((k, i) =>
        palabraEn("palabra", 1000 + k * 10 * anchoRelativo, 100 + fila * 60 + pendiente * k * 10 * anchoRelativo, 8, ALTOS[i]),
      );
    const justo = Array.from({ length: 5 }, (_, fila) => angosto(fila, 1, 0.01)).flat();
    expect(pendienteDeLaPagina(justo)).toBeCloseTo(0.01, 10);

    const apenasMenos = Array.from({ length: 5 }, (_, fila) => angosto(fila, 0.99, 0.01)).flat();
    expect(pendienteDeLaPagina(apenasMenos)).toBe(0);
  });
});

describe("qué palabras entran", () => {
  /** Veinte palabras que dan 0,01, con la última del último renglón reemplazada por `intrusa`. */
  const conLaUltimaCambiada = (intrusa: Partial<OcrWord> & { box?: OcrWord["box"] }): OcrWord[] => {
    const words = pagina(CINCO, 4);
    words[words.length - 1] = { ...words[words.length - 1], ...intrusa };
    return words;
  };

  it("una palabra de un solo carácter no cuenta", () => {
    expect(pendienteDeLaPagina(conLaUltimaCambiada({ text: "a" }))).toBe(0);
  });

  it("los espacios no hacen largo a un carácter", () => {
    expect(pendienteDeLaPagina(conLaUltimaCambiada({ text: " a " }))).toBe(0);
    expect(pendienteDeLaPagina(conLaUltimaCambiada({ text: "ab" }))).toBeCloseTo(0.01, 10);
  });

  it("una caja sin altura no cuenta, aunque caiga en el renglón", () => {
    // A la altura de la primera palabra del renglón, que es donde una caja de alto cero se une.
    const words = pagina(CINCO, 4);
    const primera = words[words.length - 4].box;
    const sinAltura = { ...words[words.length - 1].box, h: 0, y: primera.y + primera.h / 2 };
    expect(pendienteDeLaPagina(conLaUltimaCambiada({ box: sinAltura }))).toBe(0);
  });

  it("una palabra sin caja se saltea en vez de romper la medición", () => {
    const sana = pagina(CINCO, 4);
    const conHuerfana = [...sana, { text: "huerfana", start: 0, end: 8 } as OcrWord];
    expect(pendienteDeLaPagina(conHuerfana)).toBeCloseTo(0.01, 10);
  });
});

describe("qué palabras forman un renglón", () => {
  /**
   * Cinco renglones de tres palabras sobre una misma altura y una cuarta palabra `desfase` más
   * abajo. Si la cuarta se une al renglón, hay cuatro palabras y la recta tiene pendiente; si no,
   * el renglón queda en tres y no cuenta.
   */
  const conCuartaDesfasada = (desfase: number, altura = 10): OcrWord[] =>
    Array.from({ length: 5 }, (_, fila) => {
      const y = 100 + fila * 30;
      return [0, 1, 2, 3].map((i) => palabraEn("palabra", 100 + i * 120, y + (i === 3 ? desfase : 0), 60, altura));
    }).flat();

  it("se une a la primera del renglón si está a menos de 0,6 de su altura", () => {
    expect(pendienteDeLaPagina(conCuartaDesfasada(5))).toBeGreaterThan(0.0017);
  });

  it("y también si está justo a 0,6 de su altura", () => {
    expect(pendienteDeLaPagina(conCuartaDesfasada(6))).toBeGreaterThan(0.0017);
  });

  it("pero no si está más lejos: es el renglón de abajo", () => {
    expect(pendienteDeLaPagina(conCuartaDesfasada(7))).toBe(0);
  });

  it("la tolerancia sale de la altura de la palabra que llega", () => {
    expect(pendienteDeLaPagina(conCuartaDesfasada(11, 20))).toBeGreaterThan(0.0017);
    expect(pendienteDeLaPagina(conCuartaDesfasada(13, 20))).toBe(0);
  });
});
