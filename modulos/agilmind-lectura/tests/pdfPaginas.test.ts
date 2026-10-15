// Corre poppler de verdad, sobre PDF generados en el test.
import { palabrasDelPdf, renderizarPaginas } from "../src/pdfPaginas";
import { tamanoDelPng } from "../src/paginasDelPdf";
import { pdfConTexto, pdfDe } from "./helpers/pdfSintetico";

describe("palabrasDelPdf", () => {
  it("las palabras del rango pedido, cada una en su página y con su caja desde arriba", async () => {
    const pdf = pdfConTexto([[{ x: 50, y: 800, texto: "uno" }], [{ x: 60, y: 700, texto: "dos" }], [{ x: 70, y: 600, texto: "tres" }]]);
    const paginas = await palabrasDelPdf(pdf, { desde: 2, hasta: 3 });
    expect(paginas!.map((p) => [p.pagina, p.palabras.map((w) => w.texto)])).toEqual([[2, ["dos"]], [3, ["tres"]]]);
    expect(paginas![0]).toMatchObject({ ancho: 595, alto: 842 });
    const dos = paginas![0].palabras[0];
    expect(dos.x).toBeCloseTo(60, 0);
    // La línea base está a 842 - 700 = 142 desde arriba: la caja empieza por encima de ella.
    expect(dos.y).toBeGreaterThan(125);
    expect(dos.y).toBeLessThan(142);
  });

  it("las páginas sin texto vuelven sin palabras", async () => {
    const paginas = await palabrasDelPdf(pdfDe(2), { desde: 1, hasta: 2 });
    expect(paginas).toEqual([
      { pagina: 1, ancho: 595, alto: 842, palabras: [] },
      { pagina: 2, ancho: 595, alto: 842, palabras: [] },
    ]);
  });

  it("null si no es un PDF", async () => {
    expect(await palabrasDelPdf(Buffer.from("no es un pdf"), { desde: 1, hasta: 1 })).toBeNull();
  });
});

describe("renderizarPaginas", () => {
  it("un PNG por página del rango, en orden y al tamaño de la resolución pedida", async () => {
    const paginas = await renderizarPaginas(pdfDe(3), { dpi: 72, desde: 2, hasta: 3 });
    expect(paginas!.map((p) => p.pagina)).toEqual([2, 3]);
    expect(tamanoDelPng(paginas![0].png)).toEqual({ ancho: 595, alto: 842 });
    const doble = await renderizarPaginas(pdfDe(1), { dpi: 144, desde: 1, hasta: 1 });
    expect(tamanoDelPng(doble![0].png)).toEqual({ ancho: 1190, alto: 1684 });
  });

  it("con diez páginas o más, el orden sigue siendo el de las páginas", async () => {
    const paginas = await renderizarPaginas(pdfDe(11), { dpi: 10, desde: 1, hasta: 11 });
    expect(paginas!.map((p) => p.pagina)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("null si no es un PDF", async () => {
    expect(await renderizarPaginas(Buffer.from("no es un pdf"), { dpi: 72, desde: 1, hasta: 1 })).toBeNull();
  });
});
