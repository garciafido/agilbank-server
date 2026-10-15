import { amountOrGlued, boxesOf, darkestRow, inkColumns, measureAmounts, placeByInk } from "../src/sources/ink";
import { splitGluedAmount } from "../src/sources/words";

// Un perfil de tinta por columna: «#» es una columna con tinta, «.» una sin.
const profile = (s: string): number[] => [...s].map((c) => (c === "#" ? 3 : 0));
const box = { x: 100, y: 10, w: 0, h: 12 };
const at = (s: string) => ({ ...box, w: s.length });

describe("inkColumns", () => {
  // Una imagen de 10×4: tinta en las columnas 2, 3 y 7, en distintas filas.
  const ancho = 10;
  const alto = 4;
  const datos = new Uint8Array(ancho * alto).fill(255);
  const ink = (x: number, y: number, v = 0) => (datos[y * ancho + x] = v);
  ink(2, 0);
  ink(2, 1);
  ink(3, 2);
  ink(7, 3, 127);
  ink(8, 3, 128);
  const gray = { ancho, alto, datos };

  it("cuenta los píxeles oscuros de cada columna dentro de la caja", () => {
    expect(inkColumns(gray, { x: 1, y: 0, w: 8, h: 4 })).toEqual([0, 2, 1, 0, 0, 0, 1, 0]);
  });
  it("solo mira las filas de la caja", () => {
    expect(inkColumns(gray, { x: 1, y: 1, w: 8, h: 2 })).toEqual([0, 1, 1, 0, 0, 0, 0, 0]);
  });
  it("una línea fina no cuenta como tinta; el trazo bajo y angosto de una letra o de un punto, sí", () => {
    const ancho = 40;
    const alto = 12;
    const datos = new Uint8Array(ancho * alto).fill(255);
    for (let y = 0; y < 12; y++) datos[y * ancho + 2] = 0; // una letra: todo el alto
    for (let x = 4; x < 6; x++) for (let y = 9; y < 11; y++) datos[y * ancho + x] = 0; // un punto: bajo y angosto
    for (let x = 8; x < 24; x++) datos[5 * ancho + x] = 0; // una línea de un píxel de alto y 16 de ancho
    for (let x = 26; x < 32; x++) datos[3 * ancho + x] = 0; // un trazo bajo de 6 de ancho: menos de 8 veces su alto
    for (let x = 34; x < 38; x++) for (let y = 0; y < 3; y++) datos[y * ancho + x] = 0; // un cuarto del alto: es tinta aunque sea ancho
    const cols = inkColumns({ ancho, alto, datos }, { x: 0, y: 0, w: 40, h: 12 });
    expect(cols.slice(0, 8)).toEqual([0, 0, 12, 0, 2, 2, 0, 0]);
    expect(cols.slice(8, 24).every((c) => c === 0)).toBe(true);
    expect(cols.slice(26, 32)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(cols.slice(34, 38)).toEqual([3, 3, 3, 3]);
  });

  it("el umbral se puede pedir: más claro que él no es tinta", () => {
    expect(inkColumns(gray, { x: 7, y: 0, w: 2, h: 4 }, 129)).toEqual([1, 1]);
    expect(inkColumns(gray, { x: 7, y: 0, w: 2, h: 4 })).toEqual([1, 0]);
  });
  it("una caja que se sale de la imagen se recorta, y las posiciones fraccionarias se redondean hacia afuera", () => {
    expect(inkColumns(gray, { x: 6.5, y: -2, w: 2, h: 10 })).toEqual([0, 1, 0]);
    expect(inkColumns(gray, { x: -3, y: 0, w: 6, h: 4 })).toEqual([0, 0, 2]);
  });
});

describe("placeByInk", () => {
  // Cada «#» es una columna con tinta, cada «.» una sin. Las letras van pegadas y las palabras de un
  // texto a una columna: los huecos de columna son los de varios caracteres.
  it("corta en los huecos de columna: el texto queda sin ubicar y cada importe solo en su tramo, con su rango", () => {
    //            01/07 IVA        1,00          9,00
    const ink = "#####.###........####..........####";
    expect(placeByInk(["01/07", "IVA", "1,00", "9,00"], at(ink), profile(ink))).toEqual([null, null, { x: 117, w: 4, measured: true }, { x: 131, w: 4, measured: true }]);
  });

  it("un débito y un crédito con el mismo texto quedan en columnas distintas", () => {
    const debit = "#####.###....####...............####";
    const credit = "#####.###...............####....####";
    expect(placeByInk(["01/07", "IVA", "1,00", "9,00"], at(debit), profile(debit))![2]).toEqual({ x: 113, w: 4, measured: true });
    expect(placeByInk(["01/07", "IVA", "1,00", "9,00"], at(credit), profile(credit))![2]).toEqual({ x: 124, w: 4, measured: true });
  });

  it("un hueco ancho adentro de un texto que no deja repartir las palabras: se prueba con huecos de columna más anchos", () => {
    // «TRANSFERENCIA» tiene un hueco de 3 columnas después de «TR»: con huecos de columna de dos
    // caracteres queda partida en dos tramos y no hay reparto; con tres, cierra.
    const ink = `#####${".".repeat(10)}#.###${".".repeat(10)}##...###########.###${".".repeat(10)}####${".".repeat(10)}####`;
    expect(placeByInk(["01/07", "D", "584", "TRANSFERENCIA", "REF", "1,00", "9,00"], at(ink), profile(ink))).toEqual([
      { x: 100, w: 5, measured: true }, null, null, null, null, { x: 160, w: 4, measured: true }, { x: 174, w: 4, measured: true },
    ]);
  });

  it("un tramo de puros importes, impresos pegados, los reparte por sus caracteres; con texto adentro, no", () => {
    // «1,00» y «19,00» impresos sin espacio: un solo tramo de 9 columnas.
    const ink = "#####.###........#########";
    const amount = (t: string) => /\d,\d\d$/.test(t);
    // Repartir por caracteres no es medir: el primero queda sin medir; el último tiene medido su borde derecho.
    expect(placeByInk(["01/07", "IVA", "1,00", "19,00"], at(ink), profile(ink), amount)).toEqual([null, null, { x: 117, w: 4, measured: false }, { x: 121, w: 5, measured: true }]);
    expect(placeByInk(["01/07", "IVA", "1,00", "19,00"], at(ink), profile(ink))).toEqual([null, null, null, null]);
    expect(placeByInk(["01/07", "IVA", "X", "19,00"], at(ink), profile(ink), amount)).toEqual([null, null, null, null]);
    // Dos importes a un espacio uno del otro, en el mismo tramo: se cortan en el espacio, no por caracteres.
    const spaced = "#####.###........####.#####";
    expect(placeByInk(["01/07", "IVA", "1,00", "19,00"], at(spaced), profile(spaced), amount)).toEqual([null, null, { x: 117, w: 4, measured: true }, { x: 122, w: 5, measured: true }]);
    // Si un pedazo del corte por espacios no mide lo que sus caracteres (aquí «1.000,00» en una columna),
    // el tramo entero queda sin medir.
    for (const air of ["#####.###........#.###########", "#####.###........##.##########"]) {
      expect(placeByInk(["01/07", "IVA", "1.000,00", "5,00"], at(air), profile(air), amount)).toEqual([null, null, null, null]);
    }
    // Con más huecos de un espacio que cortes (el aire de un punto, por ejemplo), no se sabe cuál es el corte.
    const doubt = "#####.###........####.##.##";
    expect(placeByInk(["01/07", "IVA", "1,00", "19,00"], at(doubt), profile(doubt), amount)).toEqual([null, null, null, null]);
  });

  it("dos importes que un hueco de columna más ancho juntó en un tramo no se reparten: entre ellos había un hueco", () => {
    // Con dos caracteres de hueco no hay reparto (el texto queda partido); con tres, «1,00» y «9,00»
    // quedan juntos aunque los separan tres columnas: no son importes impresos pegados.
    const ink = `#####${".".repeat(10)}#.###${".".repeat(10)}##...###########.###${".".repeat(10)}####...####`;
    const amount = (t: string) => /\d,\d\d$/.test(t);
    expect(placeByInk(["01/07", "D", "584", "TRANSFERENCIA", "REF", "1,00", "9,00"], at(ink), profile(ink), amount)).toEqual([
      { x: 100, w: 5, measured: true }, null, null, null, null, null, null,
    ]);
  });

  it("una palabra sola en un tramo de menos de la mitad de sus caracteres no se ubica: es una mancha", () => {
    // El concepto pegado al débito (a menos de dos caracteres) y una mancha de 3 columnas en el hueco.
    const blob = "#####" + ".".repeat(12) + "#".repeat(13) + "." + "#".repeat(8) + ".".repeat(14) + "###" + ".".repeat(14) + "########";
    const amount = (t: string) => /,\d\d$/.test(t);
    const out = placeByInk(["01/07", "TRANSFERENCIAS", "1.500,00", "9.000,00"], at(blob), profile(blob), amount);
    expect(out?.[2] ?? null).toBeNull();
  });

  it("una palabra sola en un tramo más ancho que sus caracteres no se ubica: el tramo tiene tinta de otra", () => {
    // «1,00» queda sola en un tramo de 6 columnas: la tinta de una palabra vecina se le juntó.
    //            01/07 IVA        1,00             9,00
    const ink = "#####.###........######..........####";
    expect(placeByInk(["01/07", "IVA", "1,00", "9,00"], at(ink), profile(ink))).toEqual([null, null, null, { x: 133, w: 4, measured: true }]);
  });

  it("un importe más angosto que sus caracteres sí se ubica: los puntos y las comas son angostos", () => {
    //            01/07 IVA        1,00          9,00
    const ink = "#####.###........###...........####";
    expect(placeByInk(["01/07", "IVA", "1,00", "9,00"], at(ink), profile(ink))).toEqual([null, null, { x: 117, w: 3, measured: true }, { x: 131, w: 4, measured: true }]);
  });

  it("los huecos entre las letras y entre las palabras no son de columna", () => {
    const ink = "#.#.#.#.##.#.#";
    expect(placeByInk(["ABCD", "EFG"], at(ink), profile(ink))).toEqual([null, null]);
  });

  it("una caja de una sola palabra toma su rango de tinta, sin las columnas vacías de los bordes", () => {
    const ink = "..####..";
    expect(placeByInk(["1,00"], at(ink), profile(ink))).toEqual([{ x: 102, w: 4, measured: true }]);
  });

  it("más tramos que palabras con todos los huecos de columna probados: ninguna queda ubicada", () => {
    const ink = "####......####......####";
    expect(placeByInk(["ABCD", "EFGH"], at(ink), profile(ink))).toEqual([null, null]);
    // Si ningún hueco de columna da tan pocos tramos, null.
    const wide = `####${".".repeat(60)}####${".".repeat(60)}####`;
    expect(placeByInk(["ABCD", "EFGH"], at(wide), profile(wide))).toBeNull();
  });

  it("si un tramo queda con un ancho que no corresponde a sus caracteres, no es el de sus palabras: ninguna queda ubicada", () => {
    // «AB» en 2 columnas y «CDEFGHIJ» en 30: por carácter, 1 contra 3,75. Con huecos más anchos queda un solo tramo.
    const ink = "##..........##############################";
    expect(placeByInk(["AB", "CDEFGHIJ"], at(ink), profile(ink))).toEqual([null, null]);
    // Con el hueco demasiado ancho para juntarlos, null.
    const wide = `##${".".repeat(60)}${"#".repeat(30)}`;
    expect(placeByInk(["AB", "CDEFGHIJ"], at(wide), profile(wide))).toBeNull();
  });

  it("sin tinta o sin palabras, null", () => {
    expect(placeByInk(["A"], at("...."), profile("...."))).toBeNull();
    expect(placeByInk([], at("##"), profile("##"))).toBeNull();
  });

  it("la caja puede empezar en una posición fraccionaria: el perfil empieza en su columna entera", () => {
    const ink = "#####.###........####";
    expect(placeByInk(["01/07", "IVA", "1,00"], { x: 100.6, y: 0, w: 21, h: 12 }, profile(ink))).toEqual([null, null, { x: 117, w: 4, measured: true }]);
  });
});

describe("boxesOf", () => {
  const w = (text: string, x: number, y: number, h = 12) => ({ text, x, y, w: text.length * 10, h });
  it("las palabras seguidas con la misma altura y el mismo alto son una caja", () => {
    const words = [w("01/07", 10, 100), w("COMISION", 70, 100), w("1,00", 160, 100), w("SALDO", 10, 120), w("9,00", 70, 120)];
    expect(boxesOf(words)).toEqual([[0, 1, 2], [3, 4]]);
  });
  it("otro alto, otra altura o una palabra que vuelve hacia la izquierda empiezan otra caja", () => {
    const words = [w("A", 10, 100), w("B", 30, 100, 13), w("C", 50, 101), w("D", 20, 101)];
    expect(boxesOf(words)).toEqual([[0], [1], [2], [3]]);
  });
  it("sin palabras, ninguna caja", () => {
    expect(boxesOf([])).toEqual([]);
  });
});

describe("measureAmounts", () => {
  // Una página en grises con tinta en los rangos dados, en las filas 100 a 111; letra de 6 de ancho.
  const CHAR = 6;
  const grayWith = (ranges: Array<[number, number]>) => {
    const ancho = 600;
    const alto = 200;
    const datos = new Uint8Array(ancho * alto).fill(255);
    for (const [a, b] of ranges) for (let y = 100; y < 112; y++) for (let x = a; x < b; x++) datos[y * ancho + x] = 0;
    return { ancho, alto, datos };
  };
  // Lo que imprime el renglón: cada palabra donde empieza; las letras de una palabra se tocan.
  const printed = (parts: Array<[number, string]>) => parts.map(([x, t]) => [x, x + t.length * CHAR] as [number, number]);
  // La caja del OCR: de la primera a la última palabra, repartida por caracteres.
  const ocrBox = (parts: Array<[number, string]>) => {
    const text = parts.map(([, t]) => t).join(" ");
    const left = parts[0][0];
    const [lx, lt] = parts[parts.length - 1];
    const width = lx + lt.length * CHAR - left;
    let at = 0;
    return parts.map(([, t]) => {
      const w = { text: t, x: left + (at / text.length) * width, y: 100, w: (t.length / text.length) * width, h: 12 };
      at += t.length + 1;
      return w;
    });
  };

  it("un débito y un crédito con el mismo texto toman su posición medida; el texto queda como estaba", () => {
    const debit: Array<[number, string]> = [[10, "1/7/2026"], [70, "COMISION"], [300, "100.00"], [500, "900.00"]];
    const credit: Array<[number, string]> = [[10, "1/7/2026"], [70, "COMISION"], [400, "100.00"], [500, "900.00"]];
    const isAmount = (t: string) => /^\d+\.\d\d$/.test(t);
    for (const [line, x] of [[debit, 300], [credit, 400]] as const) {
      const words = ocrBox([...line]);
      const out = measureAmounts(words, grayWith(printed([...line])), isAmount);
      expect(out[2]).toEqual({ ...words[2], x, w: 36, measured: true, ocr: { x: words[2].x, w: words[2].w } });
      expect(out[3]).toEqual({ ...words[3], x: 500, w: 36, measured: true, ocr: { x: words[3].x, w: words[3].w } });
      expect(out.slice(0, 2)).toEqual(words.slice(0, 2));
    }
  });

  it("un importe que comparte su tramo con texto sigue como estaba", () => {
    const line: Array<[number, string]> = [[10, "1/7/2026"], [70, "IVA"], [94, "21.00"], [500, "900.00"]];
    const words = ocrBox(line);
    const out = measureAmounts(words, grayWith(printed(line)), (t) => /^\d+\.\d\d$/.test(t));
    expect(out[2]).toEqual(words[2]);
    expect(out[3]).toMatchObject({ x: 500, w: 36, measured: true });
  });

  it("dos importes pegados, solos en su tramo, toman el rango medido y se separan por sus caracteres", () => {
    const line: Array<[number, string]> = [[10, "1/7/2026"], [70, "TRANSF"], [400, "100.00900.00"]];
    const words = ocrBox(line);
    const isAmount = (t: string) => /^\d+\.\d\d$/.test(t) || splitGluedAmount({ text: t, x: 0, y: 0, w: 1, h: 1 }, null).length > 1;
    const out = measureAmounts(words, grayWith(printed(line)), isAmount);
    expect(out[2]).toEqual({ ...words[2], x: 400, w: 72, measured: true, ocr: { x: words[2].x, w: words[2].w } });
    // Cortar por caracteres no es medir: el primero queda estimado; el segundo conserva su borde derecho medido.
    expect(splitGluedAmount(out[2], null).map((w) => [w.text, w.x, w.w, w.estimated === true, w.measured === true])).toEqual([
      ["100.00", 400, 36, true, false],
      ["900.00", 436, 36, false, true],
    ]);
  });

  it("una caja con el fondo oscuro o cruzada por una línea no se mide", () => {
    const line: Array<[number, string]> = [[10, "1/7/2026"], [70, "COMISION"], [300, "100.00"], [500, "900.00"]];
    const words = ocrBox(line);
    const isAmount = (t: string) => /^\d+\.\d\d$/.test(t);
    const dark = grayWith(printed(line));
    dark.datos.fill(60);
    expect(measureAmounts(words, dark, isAmount)).toEqual(words);
    const crossed = grayWith(printed(line));
    for (let x = 0; x < crossed.ancho; x++) crossed.datos[105 * crossed.ancho + x] = 0;
    expect(measureAmounts(words, crossed, isAmount)).toEqual(words);
  });

  it("un fragmento de línea fina en el hueco no recibe un importe; una línea vertical pegada al importe queda dentro del techo", () => {
    const line: Array<[number, string]> = [[10, "1/7/2026"], [70, "COMISION"], [300, "100.00"], [500, "900.00"]];
    const words = ocrBox(line);
    const isAmount = (t: string) => /^\d+\.\d\d$/.test(t);
    const frag = grayWith(printed(line));
    for (let x = 354; x < 378; x++) frag.datos[105 * frag.ancho + x] = 0;
    const out = measureAmounts(words, frag, isAmount);
    expect(out[2]).toMatchObject({ x: 300, w: 36, measured: true });
    const vertical = grayWith([...printed(line), [336, 338]]);
    expect(measureAmounts(words, vertical, isAmount)[2]).toMatchObject({ x: 300, w: 38, measured: true });
  });

  it("las cajas de una sola palabra y las que no se pueden cortar quedan como estaban", () => {
    const alone = ocrBox([[300, "100.00"]]);
    expect(measureAmounts(alone, grayWith([[300, 336]]), () => true)).toEqual(alone);
    const words = ocrBox([[10, "1/7/2026"], [300, "100.00"]]);
    expect(measureAmounts(words, grayWith([]), () => true)).toEqual(words);
  });
});

describe("amountOrGlued", () => {
  it.each(["1.000,00", "-1.000,00", "\u22121.000,00", "1234.56", "1,00-9.000,00", "100.00900.00"])("%s tiene forma de importe", (t) => expect(amountOrGlued(t)).toBe(true));
  it.each(["COMISION", "1.000", "01/07", "1,00X"])("%s no", (t) => expect(amountOrGlued(t)).toBe(false));
});

describe("darkestRow", () => {
  // 10 × 6: la fila 2 oscura en las columnas 0 a 5 y la fila 4 en las 0 a 2; un píxel en 127 y otro en 128.
  const ancho = 10;
  const alto = 6;
  const datos = new Uint8Array(ancho * alto).fill(255);
  for (let x = 0; x < 6; x++) datos[2 * ancho + x] = 0;
  for (let x = 0; x < 3; x++) datos[4 * ancho + x] = 0;
  datos[5 * ancho + 8] = 127;
  datos[5 * ancho + 9] = 128;
  const gray = { ancho, alto, datos };
  it("la parte del ancho que ocupa la fila más oscura", () => {
    expect(darkestRow(gray, { x: 0, y: 0, w: 10, h: 6 })).toBeCloseTo(0.6);
    expect(darkestRow(gray, { x: 0, y: 3, w: 10, h: 2 })).toBeCloseTo(0.3);
    expect(darkestRow(gray, { x: 0, y: 3, w: 6, h: 3 })).toBeCloseTo(0.5);
  });
  it("más claro que el umbral no cuenta, y la caja se recorta a la imagen", () => {
    expect(darkestRow(gray, { x: 8, y: 5, w: 2, h: 1 })).toBeCloseTo(0.5);
    expect(darkestRow(gray, { x: 8, y: 5, w: 2, h: 1 }, 129)).toBeCloseTo(1);
    expect(darkestRow(gray, { x: -4, y: -2, w: 8, h: 5 })).toBeCloseTo(1);
    expect(darkestRow(gray, { x: 4, y: 4, w: 40, h: 40 })).toBeCloseTo(1 / 6);
  });
  it("una caja sin ancho adentro de la imagen da 0", () => {
    expect(darkestRow(gray, { x: 20, y: 0, w: 5, h: 6 })).toBe(0);
  });
});

describe("inkColumns: los bordes de la línea fina", () => {
  const draw = (w: number, h: number, marks: Array<[number, number, number, number]>, imgH = 12) => {
    const ancho = 60;
    const datos = new Uint8Array(ancho * imgH).fill(255);
    for (const [x0, x1, y0, y1] of marks) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) datos[y * ancho + x] = 0;
    return inkColumns({ ancho, alto: imgH, datos }, { x: 0, y: 0, w, h });
  };
  it("ocho veces más ancho que alto ya es línea; siete, no", () => {
    expect(draw(40, 12, [[0, 8, 5, 6]]).slice(0, 8).every((c) => c === 0)).toBe(true);
    expect(draw(40, 12, [[0, 7, 5, 6]]).slice(0, 7).every((c) => c === 1)).toBe(true);
  });
  it("un trazo con alguna columna de un cuarto del alto es tinta aunque sea largo", () => {
    expect(draw(40, 12, [[0, 30, 5, 6], [10, 11, 0, 3]])[0]).toBe(1);
  });
  it("una línea al final del perfil también se saca", () => {
    expect(draw(20, 12, [[4, 6, 0, 12], [8, 20, 5, 6]])).toEqual([0, 0, 0, 0, 12, 12, ...new Array(14).fill(0)]);
  });
  it("el alto que cuenta es el de la caja dentro de la imagen", () => {
    // La caja pide 48 de alto pero la imagen tiene 12: un trazo de 3 es un cuarto del alto visible.
    expect(draw(40, 48, [[0, 30, 0, 3]])[0]).toBe(3);
  });
});

describe("measureAmounts y placeByInk: los bordes", () => {
  const profile = (s: string): number[] => [...s].map((c) => (c === "#" ? 3 : 0));
  const at = (s: string) => ({ x: 100, y: 10, w: s.length, h: 12 });
  const amount = (t: string) => /,\d\d$/.test(t);
  it("un pedazo del corte por espacios de exactamente el techo o el piso se mide", () => {
    // c = 1: «1,00» (4) en 5 columnas es el techo justo; «10,00» (5) en 3 columnas, apenas más que el piso.
    const ceil = "#####.###........#####.#####";
    expect(placeByInk(["01/07", "IVA", "1,00", "10,00"], at(ceil), profile(ceil), amount)?.slice(2).every((p) => p?.measured)).toBe(true);
  });
  it("una caja de dos palabras se mide, y una fila oscura en justo la mitad del ancho no la apaga", () => {
    const ancho = 200;
    const alto = 20;
    const datos = new Uint8Array(ancho * alto).fill(255);
    for (const [a, b] of [[0, 30], [100, 112]]) for (let y = 4; y < 16; y++) for (let x = a; x < b; x++) datos[y * ancho + x] = 0;
    const words = [
      { text: "01/07/2026", x: 0, y: 4, w: 50, h: 12 },
      { text: "1,00", x: 60, y: 4, w: 52, h: 12 },
    ];
    expect(measureAmounts(words, { ancho, alto, datos }, amount)[1]).toMatchObject({ x: 100, w: 12, measured: true });
    // Con la tinta del importe en esa fila, 44 + 12 = 56 de 112: la mitad justa.
    for (let x = 0; x < 44; x++) datos[10 * ancho + x] = 0;
    expect(measureAmounts(words, { ancho, alto, datos }, amount)[1]).toMatchObject({ measured: true });
  });
});
