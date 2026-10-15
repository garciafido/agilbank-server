/**
 * `textoPorGeometria` — reordenar el texto por dónde está cada palabra.
 *
 * El OCR devuelve un `text` cuyo orden es el orden en que el motor ENCONTRÓ las
 * palabras, no el orden impreso. Sobre ese texto un parser de filas no puede trabajar:
 * un código que quedó solo en su línea no forma fila, y una línea que es solo números
 * tampoco.
 *
 * Los tests usan cajas armadas a mano —no el corpus— porque lo que se prueba es el
 * agrupamiento, y una caja inventada lo prueba igual que una real. El caso real vive en
 * `ocrExtractRenglones.test.ts`.
 */

import { textoPorGeometria, filasPorGeometria } from "../src/textoPorGeometria";
import type { OcrWord } from "../src/tipos";
import { palabraEn } from "./helpers/palabras";

/** Una palabra con caja, con la altura típica del OCR de estos comprobantes. */
const w = (text: string, x: number, y: number, h = 28) => ({
  text,
  box: { x, y, w: text.length * 12, h },
  start: 0,
  end: text.length,
});

describe("agrupa por fila impresa, no por orden de lectura", () => {
  it("junta en una fila las palabras que comparten la línea, aunque vengan desordenadas", () => {
    // El orden del array es el del OCR: el código LLEGA ÚLTIMO aunque esté a la
    // izquierda. Es exactamente lo que pasa en el caso testigo.
    const words = [
      w("HORMIGON", 200, 500),
      w("115,000", 600, 500),
      w("12340880,00", 800, 500),
      w("22007", 40, 500),
    ];
    expect(textoPorGeometria(words)).toBe("22007 HORMIGON 115,000 12340880,00");
  });

  it("separa filas distintas y las devuelve de arriba hacia abajo", () => {
    const words = [w("SEGUNDA", 40, 560), w("PRIMERA", 40, 500)];
    expect(textoPorGeometria(words)).toBe("PRIMERA\nSEGUNDA");
  });

  it("tolera el desalineado de un par de puntos dentro de la misma fila", () => {
    // Los dígitos no tienen descendentes, así que su caja se apoya distinto que la del
    // texto: dos palabras de la misma fila impresa difieren en unos puntos.
    const words = [w("CONCEPTO", 40, 500), w("1.000,00", 600, 504)];
    expect(filasPorGeometria(words)).toHaveLength(1);
  });

  it("NO funde dos filas apretadas", () => {
    // El error caro: dos renglones en uno, con seis números donde ninguna aritmética
    // cierra. Con altura 28 la tolerancia es ~17, así que 30 de separación debe cortar.
    const words = [w("FILA_A", 40, 500), w("FILA_B", 40, 530)];
    expect(filasPorGeometria(words)).toHaveLength(2);
  });

  it("la tolerancia sale de la altura de la palabra, no de una constante", () => {
    // El mismo comprobante escaneado al doble de resolución tiene el doble de altura y
    // el doble de separación: tiene que dar el MISMO agrupamiento. Con una tolerancia
    // fija, uno de los dos se rompe.
    const chico = [w("A", 40, 250, 14), w("B", 40, 265, 14)];
    const grande = [w("A", 80, 500, 28), w("B", 80, 530, 28)];
    expect(filasPorGeometria(chico)).toHaveLength(2);
    expect(filasPorGeometria(grande)).toHaveLength(2);
  });

  it("una fila larga no se estira absorbiendo la de abajo", () => {
    // La referencia es la PRIMERA palabra de la fila. Comparando contra la última, una
    // fila cuyas palabras bajan de a poco crece sin límite: acá las tres primeras están
    // dentro de tolerancia entre vecinas, pero la última está a 45 de la primera.
    const words = [w("a", 40, 500), w("b", 200, 512), w("c", 400, 524), w("d", 600, 545)];
    const filas = filasPorGeometria(words);
    expect(filas.length).toBeGreaterThan(1);
  });
});

describe("cuándo devuelve null", () => {
  it("sin palabras", () => {
    expect(textoPorGeometria([])).toBeNull();
    expect(textoPorGeometria(undefined)).toBeNull();
  });

  it("sin geometría usable", () => {
    // Devolver el texto suelto disfrazado de reconstruido sería mentir sobre la
    // procedencia del dato: quien llama tiene que poder caer al texto del OCR sabiendo
    // que lo hace.
    expect(textoPorGeometria([{ text: "HOLA", box: undefined as never, start: 0, end: 4 }])).toBeNull();
  });
});

const textos = (filas: Array<Array<{ text: string }>>): string[][] => filas.map((f) => f.map((w) => w.text));

describe("qué palabras cuentan", () => {
  it("descarta las que no tienen y, las de alto no numérico, cero o negativo, y las sin texto", () => {
    const buenas = [w("UNO", 40, 500), w("DOS", 200, 500)];
    const sinY = { ...w("SINY", 100, 500), box: { x: 100, y: undefined as never, w: 48, h: 28 } };
    const altoDeTexto = { ...w("ALTO", 300, 500), box: { x: 300, y: 500, w: 48, h: "28" as never } };
    const altoCero = w("CERO", 400, 500, 0);
    const altoNegativo = w("NEG", 500, 500, -5);
    const sinTexto = w("", 600, 500);
    expect(textoPorGeometria([...buenas, sinY, altoDeTexto, altoCero, altoNegativo, sinTexto])).toBe("UNO DOS");
  });

  it("si ninguna sirve no hay filas ni texto", () => {
    expect(filasPorGeometria([w("", 40, 500), w("CERO", 40, 500, 0)])).toEqual([]);
    expect(textoPorGeometria([w("", 40, 500)])).toBeNull();
  });
});

describe("el solape que junta dos palabras en una fila", () => {
  it("se mide contra la altura de la MÁS BAJA de las dos", () => {
    // Un dígito de 10 de alto metido 3 puntos en una palabra de 40: 3/10 supera el mínimo, 3/40 no.
    expect(filasPorGeometria([w("12", 40, 100, 10), w("CONCEPTO", 200, 107, 40)])).toHaveLength(1);
    expect(filasPorGeometria([w("CONCEPTO", 200, 107, 40), w("12", 40, 100, 10)])).toHaveLength(1);
  });

  it("es una FRACCIÓN: dos palabras que apenas se tocan no son de la misma fila", () => {
    // 2 puntos de 20 es el 10 %. Si el solape se multiplicara por la altura en vez de dividirla,
    // cualquier roce juntaría las filas.
    expect(filasPorGeometria([w("ARRIBA", 40, 100, 20), w("ABAJO", 40, 118, 20)])).toHaveLength(2);
  });

  it("el 25 % justo ya es la misma fila; un poco menos, no", () => {
    expect(filasPorGeometria([w("A", 40, 100, 20), w("B", 200, 115, 20)])).toHaveLength(1);
    expect(filasPorGeometria([w("A", 40, 100, 20), w("B", 200, 116, 20)])).toHaveLength(2);
  });
});

describe("el orden dentro de la geometría", () => {
  it("cada fila sale de izquierda a derecha, aunque la palabra de la derecha esté un punto más arriba", () => {
    // Ordenadas por altura, la de la derecha va primero. Las dos filas: la que se cierra al llegar
    // la siguiente y la última.
    const words = [w("DER1", 600, 500), w("IZQ1", 40, 504), w("DER2", 600, 600), w("IZQ2", 40, 604)];
    expect(textoPorGeometria(words)).toBe("IZQ1 DER1\nIZQ2 DER2");
  });

  it("a igual altura abre la fila la de más a la izquierda, venga en el orden que venga", () => {
    // A y B empatan en altura; C solo se solapa con A. Si abriera B, C quedaría en otra fila.
    const A = w("AAA", 10, 100, 20);
    const B = w("BBB", 500, 100, 4);
    const C = w("CCC", 300, 103.5, 20);
    const ordenes = [
      [A, B, C],
      [B, A, C],
      [C, B, A],
      [C, A, B],
      [A, C, B],
      [B, C, A],
    ];
    for (const orden of ordenes) {
      expect(textos(filasPorGeometria(orden))).toEqual([["AAA", "CCC", "BBB"]]);
    }
  });
});

describe("la página inclinada", () => {
  /**
   * Cinco filas sobre rectas de pendiente 0,015. Cada una trae cuatro palabras sobre la recta, que
   * son las que miden la pendiente, y dos más ("b" ancha, "c" angosta) 14,9 puntos más abajo de la
   * recta, ya enderezadas: el solape con la primera es de 5,1 sobre 20, apenas por encima del
   * mínimo. Ahí se nota si el enderezado usa el centro de cada caja y no otro punto de ella: un
   * corrimiento de un punto o dos las deja afuera de la fila.
   */
  const PENDIENTE = 0.015;
  const fila = (n: number): OcrWord[] => {
    const linea = (cx: number) => 100 + n * 100 + PENDIENTE * (cx - 100);
    return [
      palabraEn(`f${n}-a`, 100, linea(100), 80, 20),
      palabraEn(`f${n}-b`, 220, linea(220), 80, 20),
      palabraEn(`f${n}-c`, 340, linea(340), 80, 20),
      palabraEn(`f${n}-d`, 460, linea(460), 80, 20),
      palabraEn(`f${n}-e`, 580, linea(580) + 14.9, 160, 20),
      palabraEn(`f${n}-f`, 700, linea(700) + 14.9, 20, 20),
    ];
  };
  const pagina = Array.from({ length: 5 }, (_, n) => fila(n)).flat();
  const esperado = Array.from({ length: 5 }, (_, n) => ["a", "b", "c", "d", "e", "f"].map((l) => `f${n}-${l}`));

  it("junta cada fila entera pese a que el renglón baja de izquierda a derecha", () => {
    expect(textos(filasPorGeometria(pagina))).toEqual(esperado);
  });

  it("no depende del orden en que el OCR entrega las palabras", () => {
    expect(textos(filasPorGeometria([...pagina].reverse()))).toEqual(esperado);
  });

  it("el texto sale una línea por fila", () => {
    expect(textoPorGeometria(pagina)).toBe(esperado.map((f) => f.join(" ")).join("\n"));
  });
});
