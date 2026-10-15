import { paginaDelNombre, paginasDelXml, tamanoDelPng } from "../src/paginasDelPdf";

const palabra = (x1: number, y1: number, x2: number, y2: number, t: string) =>
  `<word xMin="${x1}.000000" yMin="${y1}.000000" xMax="${x2}.000000" yMax="${y2}.000000">${t}</word>`;

describe("paginasDelXml", () => {
  it("agrupa las palabras por página, con el tamaño de cada una y la página del archivo", () => {
    const xml =
      `<doc><page width="595.000000" height="842.000000"><flow><block><line>` +
      palabra(50, 30, 90, 40, "01/07/2026") + palabra(100, 30, 140, 40, "A&amp;B") +
      `</line></block></flow></page><page width="842.000000" height="1191.000000"><flow><block><line>` +
      palabra(10, 20, 20, 30, "x") +
      `</line></block></flow></page></doc>`;
    expect(paginasDelXml(xml, 3)).toEqual([
      { pagina: 3, ancho: 595, alto: 842, palabras: [{ texto: "01/07/2026", x: 50, y: 30, w: 40, h: 10 }, { texto: "A&B", x: 100, y: 30, w: 40, h: 10 }] },
      { pagina: 4, ancho: 842, alto: 1191, palabras: [{ texto: "x", x: 10, y: 20, w: 10, h: 10 }] },
    ]);
  });

  it("una página sin texto vuelve con su tamaño y sin palabras", () => {
    const xml = `<doc><page width="595.000000" height="842.000000"><flow></flow></page></doc>`;
    expect(paginasDelXml(xml, 1)).toEqual([{ pagina: 1, ancho: 595, alto: 842, palabras: [] }]);
  });

  it("sin páginas, una lista vacía", () => {
    expect(paginasDelXml("<doc></doc>", 1)).toEqual([]);
  });

  it("una palabra suelta antes de la primera página no es de ninguna", () => {
    const xml = `<doc><line>${palabra(1, 2, 3, 4, "huérfana")}</line><page width="595.000000" height="842.000000"></page></doc>`;
    expect(paginasDelXml(xml, 1)).toEqual([{ pagina: 1, ancho: 595, alto: 842, palabras: [] }]);
  });
});

describe("paginaDelNombre", () => {
  it("lee el número que pdftoppm le pone al archivo, con o sin ceros", () => {
    expect(paginaDelNombre("p-1.png")).toBe(1);
    expect(paginaDelNombre("p-07.png")).toBe(7);
    expect(paginaDelNombre("p-120.png")).toBe(120);
  });
  it("otro nombre no es una página", () => {
    expect(paginaDelNombre("p.png")).toBeNull();
    expect(paginaDelNombre("p-1.txt")).toBeNull();
    expect(paginaDelNombre("p-1.png.txt")).toBeNull();
  });
});

describe("tamanoDelPng", () => {
  const cabecera = (ancho: number, alto: number, { firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], bloque = "IHDR" } = {}): Buffer => {
    const b = Buffer.alloc(24);
    Buffer.from(firma).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write(bloque, 12, "latin1");
    b.writeUInt32BE(ancho, 16);
    b.writeUInt32BE(alto, 20);
    return b;
  };
  it("lee el ancho y el alto del encabezado", () => {
    expect(tamanoDelPng(cabecera(640, 480))).toEqual({ ancho: 640, alto: 480 });
  });
  it("null si no es un PNG o si está cortado", () => {
    expect(tamanoDelPng(Buffer.from("no es un png, pero tiene más de veinticuatro bytes"))).toBeNull();
    expect(tamanoDelPng(cabecera(640, 480).subarray(0, 20))).toBeNull();
  });
  it("null si la firma está incompleta o el primer bloque no es el IHDR", () => {
    expect(tamanoDelPng(cabecera(640, 480, { firma: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b] }))).toBeNull();
    expect(tamanoDelPng(cabecera(640, 480, { firma: [0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0] }))).toBeNull();
    expect(tamanoDelPng(cabecera(640, 480, { bloque: "IDAT" }))).toBeNull();
  });
});
