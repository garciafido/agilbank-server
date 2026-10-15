// Cuántas páginas tiene el PDF: el dato con el que la descomposición decide si puede
// afirmar que vio el documento entero.
//
// El fixture se GENERA (`helpers/pdfSintetico.ts`): no hace falta meter binarios al repo.
//
// Es la única parte de los helpers de poppler con test propio, y la razón es que su
// valor de retorno NO es un dato del documento: es una afirmación sobre si podemos
// hablar de él. Un `null` que se confunda con un 1 hace que un archivo de 30 páginas
// se declare completo.

import { contarPaginasPdf } from "../src/pdf";
import { declaraPaginas, isPdf, paginasDeLaSalida } from "../src/paginasDePdf";
import { pdfDe } from "./helpers/pdfSintetico";

describe("contarPaginasPdf", () => {
  it("cuenta las páginas de un PDF de una, de dos y de siete", async () => {
    expect(await contarPaginasPdf(pdfDe(1))).toBe(1);
    expect(await contarPaginasPdf(pdfDe(2))).toBe(2);
    expect(await contarPaginasPdf(pdfDe(7))).toBe(7);
  });

  it("devuelve null —no 1— cuando el buffer no es un PDF", async () => {
    // La distinción que sostiene el veredicto: `null` es «no pude saber», y hace que
    // la completitud sea `unavailable`. Un default de 1 diría «leí 1 de 1» sobre
    // cualquier archivo ilegible, que es la mentira que el veredicto evita.
    expect(await contarPaginasPdf(Buffer.from("esto no es un pdf"))).toBeNull();
    expect(await contarPaginasPdf(Buffer.alloc(0))).toBeNull();
  });

  it("devuelve null con un PDF truncado a la mitad", async () => {
    const roto = pdfDe(7).subarray(0, 120);
    expect(await contarPaginasPdf(roto)).toBeNull();
  });
});

// Lo que se decide con la salida de `pdfinfo` se prueba sobre el texto, sin correr poppler:
// los formatos raros —cero páginas, un título que dice «Pages:», un renglón pegado— no se
// consiguen a pedido con un PDF de verdad.
const salidaDe = (renglones: string[]): string => renglones.join("\n") + "\n";

describe("paginasDeLaSalida", () => {
  it("lee el número de la línea Pages, con el relleno que pone pdfinfo", () => {
    expect(paginasDeLaSalida(salidaDe(["Producer:       x", "Pages:          7", "Encrypted:      no"]))).toBe(7);
    expect(paginasDeLaSalida(salidaDe(["Pages:          12"]))).toBe(12);
    expect(paginasDeLaSalida("Pages: 3")).toBe(3);
  });

  it("la línea Pages es la que empieza con Pages, no un título que lo nombra", () => {
    const salida = salidaDe(["Title:          ver Pages: 99 del anexo", "Pages:          7"]);
    expect(paginasDeLaSalida(salida)).toBe(7);
  });

  it("sin la línea, o sin un número, no se sabe", () => {
    expect(paginasDeLaSalida("")).toBeNull();
    expect(paginasDeLaSalida(salidaDe(["Producer: x", "Encrypted: no"]))).toBeNull();
    expect(paginasDeLaSalida("Pages: muchas")).toBeNull();
    expect(paginasDeLaSalida("Pages:7")).toBeNull();
  });

  it("cero páginas no es un dato: es no saber", () => {
    expect(paginasDeLaSalida("Pages:          0")).toBeNull();
  });
});

describe("declaraPaginas", () => {
  it("es cierto si la salida trae la línea Pages con un número", () => {
    expect(declaraPaginas("Pages:          7")).toBe(true);
    expect(declaraPaginas(salidaDe(["Title: x", "Pages:    1"]))).toBe(true);
    expect(declaraPaginas("Pages:7")).toBe(true);
  });

  it("es falso sin la línea, sin número o con la línea metida en otra", () => {
    expect(declaraPaginas("")).toBe(false);
    expect(declaraPaginas("Pages:")).toBe(false);
    expect(declaraPaginas("Pages: x")).toBe(false);
    expect(declaraPaginas("Title: Pages: 7")).toBe(false);
  });
});

describe("isPdf", () => {
  it("lo es si empieza con %PDF", () => {
    expect(isPdf(Buffer.from("%PDF"))).toBe(true);
    expect(isPdf(pdfDe(1))).toBe(true);
  });

  it("no lo es si la cabecera está más adelante, incompleta o no está", () => {
    expect(isPdf(Buffer.from("\n%PDF-1.4"))).toBe(false);
    expect(isPdf(Buffer.from("%PD"))).toBe(false);
    expect(isPdf(Buffer.from("%PDX-1.4"))).toBe(false);
    expect(isPdf(Buffer.alloc(0))).toBe(false);
  });
});
