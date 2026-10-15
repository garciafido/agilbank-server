import { contiguousBatches, pageTextUsable } from "../src/sources/pages";
import type { Word } from "../src/sources/words";

const ws = (...texts: string[]): Word[] => texts.map((text, i) => ({ text, x: i * 50, y: 10, w: 40, h: 10 }));

describe("pageTextUsable", () => {
  it("una página con fechas e importes sirve", () => {
    expect(pageTextUsable(ws("01/07", "COMISION", "-1.000,00", "02/07", "IVA", "-21,00"))).toBe(true);
  });
  it("una página legible sin tabla sirve: legales, publicidad", () => {
    expect(pageTextUsable(ws("Legales", "y", "avisos", "Usted", "puede", "solicitar", "la", "caja", "de", "ahorros"))).toBe(true);
  });
  it("la basura de una fuente sin mapa de caracteres no sirve", () => {
    expect(pageTextUsable(ws("v-/v+", "&", "V!UWEr:&&EVUU", "%W?=Q#f", "Ëhkg½£gÌ", "&&EV", "v+/~", "Q#f%"))).toBe(false);
  });
  it("los importes de los dos formatos cuentan: sin filas no hay de dónde sacar el de la página", () => {
    expect(pageTextUsable(ws("01/07", "02/07", "-1,00", "15.07", "V!UWEr:&&EVUU", "%W?=Q#f", "&&EV"))).toBe(true);
    expect(pageTextUsable(ws("01/07", "02/07", "-1.50", "15.07", "V!UWEr:&&EVUU", "%W?=Q#f", "&&EV"))).toBe(true);
  });
  it("una fecha y un importe sueltos entre basura no alcanzan", () => {
    expect(pageTextUsable(ws("01/07", "-1,00", "V!UWEr:&&EVUU", "%W?=Q#f", "Ëhkg½£gÌ", "&&EV"))).toBe(false);
  });
  it("con menos de cinco palabras no sirve: es una página escaneada con un sello de texto", () => {
    expect(pageTextUsable(ws("Página", "1", "de", "7"))).toBe(false);
    expect(pageTextUsable([])).toBe(false);
  });
  it("las palabras en blanco no cuentan para el mínimo", () => {
    expect(pageTextUsable(ws("uno", "", "dos", "  ", "tres"))).toBe(false);
  });
  it("con cinco palabras justas se juzga", () => {
    expect(pageTextUsable(ws("uno", "dos", "tres", "cuatro", "cinco"))).toBe(true);
  });
  it("el espacio alrededor de las palabras no cuenta", () => {
    expect(pageTextUsable(ws(" Legales ", " avisos ", " Usted ", " puede ", " solicitar "))).toBe(true);
    expect(pageTextUsable(ws(" 01/07 ", " 02/07 ", " -1,00 ", " -2,00 ", " 3,00 "))).toBe(true);
  });
  it("solo fechas o solo importes entre basura no alcanzan", () => {
    const basura = ["V!UWEr:&&EVUU", "%W?=Q#f", "Ëhkg½£gÌ", "&&EV"];
    expect(pageTextUsable(ws("01/07", "02/07", ...basura))).toBe(false);
    expect(pageTextUsable(ws("-1,00", "-2,00", ...basura))).toBe(false);
  });
  it("una palabra es legible entera: empieza con letra y sigue con letras o puntuación", () => {
    expect(pageTextUsable(ws("123abc", "456def", "789ghi", "012jkl", "345mno"))).toBe(false);
    expect(pageTextUsable(ws("abc#123", "def#456", "ghi#789", "jkl#012", "mno#345"))).toBe(false);
  });
  it("las palabras cortas no cuentan para la parte legible", () => {
    expect(pageTextUsable(ws("uno", "dos", "tres", "1", "2", "3", "4", "5"))).toBe(true);
    expect(pageTextUsable(ws("uno", "dos", "tre", "cua", "cin"))).toBe(true);
  });
  it("la parte legible se mide contra las palabras largas, con el 60 % como piso", () => {
    expect(pageTextUsable(ws("uno", "123", "456", "789", "012"))).toBe(false);
    expect(pageTextUsable(ws("uno", "dos", "tres", "123", "456"))).toBe(true);
    expect(pageTextUsable(ws("uno", "dos", "123", "456", "789"))).toBe(false);
  });
  it("sin palabras largas no se puede juzgar", () => {
    expect(pageTextUsable(ws("1", "2", "3", "4", "5"))).toBe(false);
  });
});

describe("contiguousBatches", () => {
  it("parte en tandas de páginas seguidas, de hasta `size`", () => {
    expect(contiguousBatches([1, 2, 3, 5, 6, 9], 2)).toEqual([[1, 2], [3], [5, 6], [9]]);
    expect(contiguousBatches([4, 5, 6, 7, 8], 4)).toEqual([[4, 5, 6, 7], [8]]);
    expect(contiguousBatches([], 4)).toEqual([]);
  });
});
