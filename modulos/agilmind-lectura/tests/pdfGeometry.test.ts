// La geometría del texto del PDF: el tamaño de cada página y el alineamiento de las palabras con el
// texto. Son los casos puros del test del motor (agilpost-motor/tests/pdfGeometry.test.ts), que se
// queda allá probando el uso de AgilPost; acá cuidan la función en su casa, con su mutación.
//
// El alineamiento se prueba sin PDF: `alinear` es una función del texto y de las
// líneas con cajas, y armarlas a mano deja escribir los casos que rompieron las
// dos versiones anteriores. Lo que necesita un PDF de verdad —invocar pdftotext—
// se cubre en el banco, contra los 1.800 documentos congelados.

import { alinear, lineasDelXml } from "../src/index";
import type { OcrWord } from "../src/tipos";

/** Lo que hace `pdfTextGeometry` después de pdftotext, sobre un XML a mano. */
const alinearDesdeXml = (texto: string, xml: string): OcrWord[] =>
  alinear(texto, lineasDelXml(xml).lineas).words;

const palabra = (t: string, x: number, y: number) =>
  `<word xMin="${x}" yMin="${y}" xMax="${x + t.length * 5}" yMax="${y + 9}">${t}</word>`;

const linea = (palabras: string) => `<line>${palabras}</line>`;
const pagina = (lineas: string) => `<page width="595" height="842"><flow><block>${lineas}</block></flow></page>`;
const doc = (paginas: string) => `<doc>${paginas}</doc>`;

describe("el tamaño de cada página", () => {
  it("guarda el de todas, no solo el de la primera: la caja de una página se mide contra la suya", () => {
    const apaisada = `<page width="842" height="595"><flow><block>${linea(palabra("B", 10, 10))}</block></flow></page>`;
    const r = lineasDelXml(doc(pagina(linea(palabra("A", 10, 10))) + apaisada));
    expect(r.pageSizes).toEqual([
      { width: 595, height: 842 },
      { width: 842, height: 595 },
    ]);
    expect([r.pageWidth, r.pageHeight]).toEqual([595, 842]);
  });
});

describe("alineamiento de la geometría contra el texto del -layout", () => {
  it("ubica cada palabra en el offset que le corresponde", () => {
    const texto = "El Jumillano S.A.\nCUIT 30-53788287-1\n";
    const xml = doc(
      pagina(
        linea(palabra("El", 32, 55) + palabra("Jumillano", 44, 55) + palabra("S.A.", 89, 55)) +
          linea(palabra("CUIT", 32, 70) + palabra("30-53788287-1", 60, 70)),
      ),
    );
    const words = alinearDesdeXml(texto, xml);
    expect(words.map((w) => w.text)).toEqual(["El", "Jumillano", "S.A.", "CUIT", "30-53788287-1"]);
    // Los offsets tienen que indexar el texto REAL: es lo único que da sentido a
    // start/end, y un off-by-one pone la caja en la palabra de al lado.
    for (const w of words) {
      expect(texto.slice(w.start, w.end)).toBe(w.text);
    }
  });

  it("resuelve las dos columnas que el cursor perdía", () => {
    // El caso que hundió la segunda versión al 20%: el -bbox-layout emite el
    // bloque izquierdo completo y después el derecho, pero el -layout pone la
    // primera línea de los dos en el MISMO renglón. Un cursor que solo avanza
    // deja afuera la columna entera.
    const texto = "IZQ-UNO                RIGHT-UNO\nIZQ-DOS                RIGHT-DOS\n";
    const xml = doc(
      `<page width="595" height="842"><flow>` +
        `<block>${linea(palabra("IZQ-UNO", 32, 55))}${linea(palabra("IZQ-DOS", 32, 70))}</block>` +
        `<block>${linea(palabra("RIGHT-UNO", 300, 55))}${linea(palabra("RIGHT-DOS", 300, 70))}</block>` +
        `</flow></page>`,
    );
    const words = alinearDesdeXml(texto, xml);
    expect(words.map((w) => w.text).sort()).toEqual(
      ["IZQ-DOS", "IZQ-UNO", "RIGHT-DOS", "RIGHT-UNO"].sort(),
    );
    for (const w of words) expect(texto.slice(w.start, w.end)).toBe(w.text);
  });

  it("devuelve las palabras ordenadas por offset, no por bloque", () => {
    // El localizador recorre el texto de principio a fin y `boxForRange` filtra
    // por rango: con las palabras en orden de bloque, la caja de un campo de la
    // columna derecha se armaría con palabras de la izquierda.
    const texto = "AAA          ZZZ\n";
    const xml = doc(
      `<page width="595" height="842"><flow>` +
        `<block>${linea(palabra("ZZZ", 300, 55))}</block>` +
        `<block>${linea(palabra("AAA", 32, 55))}</block>` +
        `</flow></page>`,
    );
    const words = alinearDesdeXml(texto, xml);
    expect(words.map((w) => w.text)).toEqual(["AAA", "ZZZ"]);
    expect(words[0].start).toBeLessThan(words[1].start);
  });

  it("no reusa una línea del texto para dos líneas del bbox", () => {
    // Los encabezados de tabla se repiten en cada página. Si una línea del texto
    // pudiera servir dos veces, el encabezado de la página 2 se quedaría con las
    // cajas del de la página 1.
    const texto = "Cantidad Precio\notra cosa\nCantidad Precio\n";
    const unaLinea = linea(palabra("Cantidad", 32, 55) + palabra("Precio", 90, 55));
    const xml = doc(
      `<page width="595" height="842"><flow><block>${unaLinea}</block></flow></page>` +
        `<page width="595" height="842"><flow><block>${unaLinea}</block></flow></page>`,
    );
    const words = alinearDesdeXml(texto, xml);
    const arranques = [...new Set(words.map((w) => w.start))];
    expect(arranques.length).toBe(4);
    expect(words.filter((w) => w.page === 1).length).toBe(2);
    expect(words.filter((w) => w.page === 2).length).toBe(2);
  });

  it("saltea la línea que no está en el texto en vez de descolocar el resto", () => {
    const texto = "PRIMERA linea\nTERCERA linea\n";
    const xml = doc(
      pagina(
        linea(palabra("PRIMERA", 32, 55) + palabra("linea", 90, 55)) +
          linea(palabra("SEGUNDA", 32, 70) + palabra("linea", 90, 70)) +
          linea(palabra("TERCERA", 32, 85) + palabra("linea", 90, 85)),
      ),
    );
    const words = alinearDesdeXml(texto, xml);
    expect(words.map((w) => w.text)).toEqual(["PRIMERA", "linea", "TERCERA", "linea"]);
    for (const w of words) expect(texto.slice(w.start, w.end)).toBe(w.text);
  });

  it("deshace el escapado de XML, y el &amp; al final", () => {
    const texto = "MARTINEZ & CIA <SA>\n";
    const xml = doc(
      pagina(
        linea(
          palabra("MARTINEZ", 32, 55) +
            `<word xMin="100" yMin="55" xMax="110" yMax="64">&amp;</word>` +
            palabra("CIA", 120, 55) +
            `<word xMin="150" yMin="55" xMax="180" yMax="64">&lt;SA&gt;</word>`,
        ),
      ),
    );
    const words = alinearDesdeXml(texto, xml);
    expect(words.map((w) => w.text)).toEqual(["MARTINEZ", "&", "CIA", "<SA>"]);
  });
});

describe("lo que sale del XML de pdftotext", () => {
  it("cada palabra lleva su caja: x, y, ancho y alto salen de las cuatro esquinas", () => {
    const xml = doc(
      pagina(linea(`<word xMin="32.5" yMin="55.25" xMax="44.75" yMax="64.5">Hola</word>`)) +
        pagina(linea(`<word xMin="10" yMin="20" xMax="25" yMax="38">Chau</word>`)),
    );
    const { lineas, pageWidth, pageHeight } = lineasDelXml(xml);
    expect(lineas).toEqual([
      { pagina: 1, palabras: [{ texto: "Hola", x: 32.5, y: 55.25, w: 12.25, h: 9.25 }] },
      { pagina: 2, palabras: [{ texto: "Chau", x: 10, y: 20, w: 15, h: 18 }] },
    ]);
    expect([pageWidth, pageHeight]).toEqual([595, 842]);
  });

  it("el tamaño de una página puede traer decimales", () => {
    const r = lineasDelXml(`<doc><page width="595.276" height="841.89"></page></doc>`);
    expect(r.pageSizes).toEqual([{ width: 595.276, height: 841.89 }]);
    expect([r.pageWidth, r.pageHeight]).toEqual([595.276, 841.89]);
  });

  it("sin páginas no hay tamaño", () => {
    expect(lineasDelXml("")).toEqual({ lineas: [], pageWidth: null, pageHeight: null, pageSizes: [] });
  });

  it("las líneas sin palabras no se devuelven, ni las que solo tienen palabras vacías", () => {
    const vacia = `<word xMin="1" yMin="1" xMax="2" yMax="2"></word>`;
    const xml = doc(pagina(`<line></line>` + linea(vacia) + linea(vacia + palabra("Queda", 10, 10))));
    const { lineas } = lineasDelXml(xml);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].palabras.map((p) => p.texto)).toEqual(["Queda"]);
  });

  it("una palabra que viene antes de abrirse una línea se ignora", () => {
    const xml = doc(`<page width="595" height="842">${palabra("Suelta", 5, 5)}${linea(palabra("Dentro", 10, 10))}</page>`);
    const { lineas } = lineasDelXml(xml);
    expect(lineas.map((l) => l.palabras.map((p) => p.texto))).toEqual([["Dentro"]]);
  });

  it("deshace las comillas y los apóstrofos, y no encadena el escapado", () => {
    // «&amp;lt;» es el texto «&lt;»: si el &amp; se deshiciera antes, saldría «<».
    const xml = doc(
      pagina(
        linea(
          `<word xMin="1" yMin="1" xMax="9" yMax="9">&quot;hola&quot;</word>` +
            `<word xMin="10" yMin="1" xMax="19" yMax="9">L&apos;Oreal</word>` +
            `<word xMin="20" yMin="1" xMax="29" yMax="9">&amp;lt;</word>`,
        ),
      ),
    );
    expect(lineasDelXml(xml).lineas[0].palabras.map((p) => p.texto)).toEqual(['"hola"', "L'Oreal", "&lt;"]);
  });
});

describe("alinear: qué devuelve", () => {
  it("cada palabra con su caja, su página y su rango dentro del texto", () => {
    const texto = "Hola mundo\n";
    const xml = doc(pagina(linea(palabra("Hola", 32, 55) + palabra("mundo", 60, 55))));
    const { words, noAlineadas } = alinear(texto, lineasDelXml(xml).lineas);
    expect(noAlineadas).toBe(0);
    expect(words).toEqual([
      { text: "Hola", box: { x: 32, y: 55, w: 20, h: 9 }, start: 0, end: 4, page: 1 },
      { text: "mundo", box: { x: 60, y: 55, w: 25, h: 9 }, start: 5, end: 10, page: 1 },
    ]);
  });

  it("cuenta las palabras de las líneas que no encontró", () => {
    const texto = "PRIMERA linea\n";
    const xml = doc(
      pagina(
        linea(palabra("PRIMERA", 32, 55) + palabra("linea", 90, 55)) +
          linea(palabra("SEGUNDA", 32, 70) + palabra("linea", 90, 70) + palabra("extra", 120, 70)),
      ),
    );
    const { words, noAlineadas } = alinear(texto, lineasDelXml(xml).lineas);
    expect(words).toHaveLength(2);
    expect(noAlineadas).toBe(3);
  });

  it("no hay nada que alinear sin líneas o sin texto", () => {
    expect(alinear("", [])).toEqual({ words: [], noAlineadas: 0 });
    const xml = doc(pagina(linea(palabra("A", 1, 1))));
    expect(alinear("", lineasDelXml(xml).lineas)).toEqual({ words: [], noAlineadas: 1 });
  });
});

describe("alinear: dentro de una línea", () => {
  it("la misma palabra repetida toma cada vez un lugar nuevo", () => {
    const texto = "1 1 1\n";
    const xml = doc(pagina(linea(palabra("1", 10, 10) + palabra("1", 30, 10) + palabra("1", 50, 10))));
    const { words } = alinear(texto, lineasDelXml(xml).lineas);
    expect(words.map((w) => w.start)).toEqual([0, 2, 4]);
  });

  it("las palabras tienen que ir en el orden del texto: otro orden es otra línea", () => {
    const xml = doc(pagina(linea(palabra("beta", 10, 10) + palabra("alfa", 50, 10))));
    expect(alinear("alfa beta\n", lineasDelXml(xml).lineas)).toEqual({ words: [], noAlineadas: 2 });
  });
});

describe("alinear: tramos que se tocan sin pisarse", () => {
  // Dos líneas del bbox reparten la misma línea del texto. Una palabra que arranca donde otra
  // termina no la pisa: el texto no tiene el espacio que las separe.
  const cadaPalabraEnSuLinea = (texto: string, palabras: string[]): Array<[string, number]> => {
    const xml = doc(pagina(palabras.map((p, i) => linea(palabra(p, 10, 10 + 15 * i))).join("")));
    return alinear(texto, lineasDelXml(xml).lineas).words.map((w) => [w.text, w.start]);
  };

  it("la segunda empieza donde termina la primera", () => {
    expect(cadaPalabraEnSuLinea("ABAB\n", ["AB", "AB"])).toEqual([
      ["AB", 0],
      ["AB", 2],
    ]);
  });

  it("la segunda termina donde empieza la primera", () => {
    expect(cadaPalabraEnSuLinea("ABCD\n", ["CD", "AB"])).toEqual([
      ["AB", 0],
      ["CD", 2],
    ]);
  });

  it("pero una palabra no sale dos veces del mismo lugar", () => {
    expect(cadaPalabraEnSuLinea("ABC\n", ["ABC", "BC"])).toEqual([["ABC", 0]]);
  });
});

describe("alinear: líneas repetidas en el texto", () => {
  // H aparece en las líneas 0, 2 y 4 del texto; `aa`, `bb` y `cc` son únicas y fijan dónde quedó
  // la última línea aceptada.
  const texto = "H\naa\nH\nbb\nH\ncc";
  const OFFSETS = { 0: 0, 2: 5, 4: 10 };
  const dondeCaeLaH = (...anteriores: string[]): number => {
    const lineas = [...anteriores, "H"].map((t, i) => linea(palabra(t, 10, 10 + 15 * i)));
    const { words } = alinear(texto, lineasDelXml(doc(pagina(lineas.join("")))).lineas);
    return words.find((w) => w.text === "H")!.start;
  };

  it("la que queda más cerca de la última aceptada", () => {
    expect(dondeCaeLaH("cc")).toBe(OFFSETS[4]);
    expect(dondeCaeLaH("bb")).toBe(OFFSETS[2]);
  });

  it("sin una anterior, la primera", () => {
    expect(dondeCaeLaH()).toBe(OFFSETS[0]);
  });

  it("a igual distancia, la de antes", () => {
    expect(dondeCaeLaH("aa")).toBe(OFFSETS[0]);
  });

  it("la distancia se mide en líneas con texto: las en blanco no cuentan", () => {
    // Entre la H de arriba y `aa` hay líneas en blanco. Si contaran, la H de abajo quedaría más
    // cerca de `aa` que la de arriba.
    const conBlancos = "H\n\n  \n\naa\nH\nbb";
    const lineas = [linea(palabra("aa", 10, 10)), linea(palabra("H", 10, 25))].join("");
    const { words } = alinear(conBlancos, lineasDelXml(doc(pagina(lineas))).lineas);
    expect(words.find((w) => w.text === "H")!.start).toBe(0);
  });
});
