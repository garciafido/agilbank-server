import { AMOUNT, DATE, countDataRows, gridFromPages, splitGluedAmount, splitGluedDate, straightenOcrBoxes, type PageWords, type Word } from "../src/sources/words";
import { readTable } from "../src/columns";
import { buildRows } from "../src/rows";
import { judge } from "../src/judge";
import { catalog } from "../src/catalog/catalog";
import { parseCents } from "../src/values";

// Cada carácter mide 5 de ancho y las palabras de una frase van separadas por un espacio.
const CW = 5;
const at = (y: number, x: number, text: string): Word[] => {
  const out: Word[] = [];
  let cx = x;
  for (const t of text.split(" ")) {
    out.push({ text: t, x: cx, y, w: t.length * CW, h: 10 });
    cx += (t.length + 1) * CW;
  }
  return out;
};
const right = (y: number, xRight: number, text: string): Word[] => at(y, xRight - text.length * CW, text);
const page = (n: number, rows: Word[][], dx = 0, origin: "pdf" | "ocr" = "pdf"): PageWords => ({
  page: n,
  width: 1000,
  height: 1400,
  origin,
  words: rows.flat().map((w) => ({ ...w, x: w.x + dx })),
});

const header = (y: number) => [at(y, 50, "FECHA"), at(y, 150, "CONCEPTO"), right(y, 600, "DEBITO"), right(y, 750, "CREDITO"), right(y, 900, "SALDO")].flat();
const debit = (y: number, date: string, concept: string, amount: string, balance: string) =>
  [at(y, 50, date), at(y, 150, concept), right(y, 600, amount), right(y, 900, balance)].flat();
const credit = (y: number, date: string, concept: string, amount: string, balance: string) =>
  [at(y, 50, date), at(y, 150, concept), right(y, 750, amount), right(y, 900, balance)].flat();

describe("gridFromPages", () => {
  it("arma las columnas por alineación: los importes por su borde derecho, los textos por el izquierdo", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION MANTENIMIENTO", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "TRANSFERENCIA RECIBIDA", "500,00", "9.500,00"),
        debit(160, "03/07/2026", "IVA", "-21,00", "9.479,00"),
      ]),
    ]);
    expect(g.rows).toEqual([
      ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
      ["01/07/2026", "COMISION MANTENIMIENTO", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "TRANSFERENCIA RECIBIDA", null, "500,00", "9.500,00"],
      ["03/07/2026", "IVA", "-21,00", null, "9.479,00"],
    ]);
    expect(g.origin).toBe("pdf");
    expect(g.places).toEqual([1, 2, 3, 4].map((line) => ({ page: 1, line, origin: "pdf" })));
  });

  it("un importe pegado al concepto, como lo junta el OCR en una caja, va a su columna", () => {
    const glued = [at(180, 50, "04/07/2026"), right(180, 600, "TRANSF -2,00")].flat();
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "TRANSFERENCIA", "500,00", "9.500,00"),
        debit(160, "03/07/2026", "IVA", "-21,00", "9.479,00"),
        [...glued, ...right(180, 900, "9.477,00")],
      ]),
    ]);
    expect(g.rows[4]).toEqual(["04/07/2026", "TRANSF", "-2,00", null, "9.477,00"]);
  });

  it("dos páginas corridas en x dan las mismas columnas, el encabezado repetido queda y el pie repetido se va", () => {
    const pie = (y: number, n: number) => at(y, 400, `Pagina ${n} de 2`);
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "TRANSFERENCIA", "500,00", "9.500,00"), pie(1300, 1)]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), pie(1300, 2)], 20),
    ]);
    expect(g.rows).toEqual([
      ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
      ["01/07/2026", "COMISION", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "TRANSFERENCIA", null, "500,00", "9.500,00"],
      ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
      ["03/07/2026", "IVA", "-21,00", null, "9.479,00"],
      ["04/07/2026", "DEPOSITO", null, "21,00", "9.500,00"],
    ]);
    expect(g.places?.map((p) => `${p.page}:${p.line}`)).toEqual(["1:1", "1:2", "1:3", "2:1", "2:2", "2:3"]);
  });

  it("una línea repetida dentro de la tabla de cada página no se saca: completa el concepto", () => {
    const extra = (y: number) => at(y, 150, "Se acreditara en 5 cuentas");
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "TRANSF", "-1.000,00", "9.000,00"), extra(130), credit(140, "02/07/2026", "DEP", "500,00", "9.500,00")]),
      page(2, [header(100), debit(120, "03/07/2026", "TRANSF", "-21,00", "9.479,00"), extra(130), credit(140, "04/07/2026", "DEP", "21,00", "9.500,00")]),
    ]);
    expect(g.rows.filter((r) => r[1] === "Se acreditara en 5 cuentas")).toHaveLength(2);
  });

  it("las posiciones del OCR, en píxeles de una página más ancha, dan la misma grilla", () => {
    const px = (p: PageWords): PageWords => ({ ...p, width: 2000, origin: "ocr", words: p.words.map((w) => ({ ...w, x: w.x * 2, y: w.y * 2, w: w.w * 2, h: w.h * 2 })) });
    const pdf = page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "TRANSF", "500,00", "9.500,00")]);
    const g = gridFromPages([px(pdf)]);
    expect(g.rows).toEqual(gridFromPages([pdf]).rows);
    expect(g.origin).toBe("ocr");
  });

  it("sin filas de datos, cada fila trae sus frases en orden", () => {
    const g = gridFromPages([page(1, [at(100, 50, "Legales"), [...at(120, 50, "Texto"), ...at(120, 400, "aparte")]])]);
    expect(g.rows).toEqual([["Legales"], ["Texto", "aparte"]]);
  });

  it("sin páginas, una grilla vacía", () => {
    expect(gridFromPages([])).toEqual({ origin: "pdf", sheet: null, rows: [], places: [] });
  });
});

describe("splitGluedDate", () => {
  const w = (text: string): Word => ({ text, x: 0, y: 0, w: text.length * CW, h: 10 });
  it("separa la fecha de dos cifras de año del número que el OCR le pegó", () => {
    expect(splitGluedDate(w("05/08/26718293")).map((x) => [x.text, x.x, x.w])).toEqual([
      ["05/08/26", 0, 40],
      ["718293", 40, 30],
    ]);
  });
  it("con un año de cuatro cifras posible, toma las cuatro", () => {
    expect(splitGluedDate(w("2/6/202612345")).map((x) => x.text)).toEqual(["2/6/2026", "12345"]);
  });
  it("una fecha sola o un texto quedan como están", () => {
    expect(splitGluedDate(w("03/06/26")).map((x) => x.text)).toEqual(["03/06/26"]);
    expect(splitGluedDate(w("03/06/2026")).map((x) => x.text)).toEqual(["03/06/2026"]);
    expect(splitGluedDate(w("TRANSF")).map((x) => x.text)).toEqual(["TRANSF"]);
  });
});

describe("countDataRows", () => {
  it("cuenta las filas con una fecha y un importe", () => {
    expect(countDataRows({ origin: "ocr", sheet: null, rows: [["FECHA", "IMPORTE"], ["01/07/2026", "1,00"], ["01/07/2026", null], [null, "2,00"]] })).toBe(1);
  });
});

describe("gridFromPages: frases", () => {
  it("las palabras de un concepto forman una frase: no arman columnas propias aunque se repitan", () => {
    const concept = "TRANSFERENCIA RECIBIDA DE TERCEROS";
    const g = gridFromPages([
      page(1, [
        debit(120, "01/07/2026", concept, "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", concept, "500,00", "9.500,00"),
        debit(160, "03/07/2026", concept, "-21,00", "9.479,00"),
      ]),
    ]);
    expect(g.rows).toEqual([
      ["01/07/2026", concept, "-1.000,00", null, "9.000,00"],
      ["02/07/2026", concept, null, "500,00", "9.500,00"],
      ["03/07/2026", concept, "-21,00", null, "9.479,00"],
    ]);
  });

  it("la fecha del principio es una frase sola aunque el concepto venga a un espacio", () => {
    const row = (y: number, date: string, concept: string, amount: string, balance: string) =>
      [at(y, 50, `${date} ${concept}`), right(y, 600, amount), right(y, 900, balance)].flat();
    const g = gridFromPages([
      page(1, [row(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), row(140, "02/07/2026", "IVA", "-210,00", "8.790,00"), row(160, "03/07/2026", "SELLOS", "-10,00", "8.780,00")]),
    ]);
    expect(g.rows).toEqual([
      ["01/07/2026", "COMISION", "-1.000,00", "9.000,00"],
      ["02/07/2026", "IVA", "-210,00", "8.790,00"],
      ["03/07/2026", "SELLOS", "-10,00", "8.780,00"],
    ]);
  });

  it("la fecha que sigue a la fecha del principio es una frase sola: la fecha valor no se pega al concepto", () => {
    const g = gridFromPages([
      page(1, [1, 2, 3].map((k) => [at(100 + 20 * k, 50, `0${k}/07/2026`), at(100 + 20 * k, 110, `0${k + 1}/07/2026 COMPRA`), right(100 + 20 * k, 600, "-1,00"), right(100 + 20 * k, 900, "9,00")].flat())),
    ]);
    expect(g.rows).toEqual([
      ["01/07/2026", "02/07/2026", "COMPRA", "-1,00", "9,00"],
      ["02/07/2026", "03/07/2026", "COMPRA", "-1,00", "9,00"],
      ["03/07/2026", "04/07/2026", "COMPRA", "-1,00", "9,00"],
    ]);
  });

  it("una fecha en medio del concepto es parte del concepto", () => {
    const g = gridFromPages([
      page(1, [
        debit(120, "01/07/2026", "VTO 15/07 CUOTA", "-1.000,00", "9.000,00"),
        debit(140, "02/07/2026", "VTO 15/07 CUOTA", "-21,00", "8.979,00"),
        debit(160, "03/07/2026", "VTO 15/07 CUOTA", "-9,00", "8.970,00"),
      ]),
    ]);
    expect(g.rows.map((r) => r[1])).toEqual(["VTO 15/07 CUOTA", "VTO 15/07 CUOTA", "VTO 15/07 CUOTA"]);
    expect(g.rows.every((r) => r.length === 4)).toBe(true);
  });

  it("a menos de un carácter y medio dos palabras son una frase; a uno y medio, ya son dos", () => {
    // AAA ocupa de 150 a 165 y BBB arranca después del hueco: 7 o 7,5, con caracteres de 5.
    const row = (y: number, date: string, gap: number) =>
      [at(y, 50, date), at(y, 150, "AAA"), at(y, 165 + gap, "BBB"), right(y, 600, "-1,00"), right(y, 900, "9,00")].flat();
    const rowsWith = (gap: number) =>
      gridFromPages([page(1, [row(120, "01/07/2026", gap), row(140, "02/07/2026", gap), row(160, "03/07/2026", gap)])]).rows;
    expect(rowsWith(7)[0]).toEqual(["01/07/2026", "AAA BBB", "-1,00", "9,00"]);
    expect(rowsWith(7.5)[0]).toEqual(["01/07/2026", "AAA", "BBB", "-1,00", "9,00"]);
  });

  it("el ancho de un carácter es el de la página entera: no lo cambian las cajas sin texto del OCR", () => {
    const base = page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]);
    const empty: Word[] = Array.from({ length: 40 }, (_, k) => ({ text: "", x: 10 * k, y: 1200, w: 8, h: 10 }));
    expect(gridFromPages([{ ...base, words: [...base.words, ...empty] }])).toEqual(gridFromPages([base]));
  });

  it("el orden en que llegan las palabras no cambia la grilla, aunque haya un título en letra grande", () => {
    const title = at(20, 50, "RESUMEN DE CUENTA").map((w) => ({ ...w, x: 50 + (w.x - 50) * 8, w: w.w * 8, h: 30 }));
    const rest = page(1, [
      header(100),
      debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
      credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"),
      debit(160, "03/07/2026", "IVA", "-21,00", "9.479,00"),
    ]);
    const inOrder = { ...rest, words: [...title, ...rest.words] };
    const shuffled = { ...rest, words: [...rest.words.slice(0, 9), ...title, ...rest.words.slice(9)] };
    expect(gridFromPages([shuffled])).toEqual(gridFromPages([inOrder]));
  });
});

describe("gridFromPages: columnas", () => {
  it("dos importes corridos dos caracteres caen en la misma columna; un poco más, en otra", () => {
    const rowsWith = (shift: number) =>
      gridFromPages([
        page(1, [
          debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
          [at(140, 50, "02/07/2026"), at(140, 150, "IVA"), right(140, 600 + shift, "-210,00"), right(140, 900, "8.790,00")].flat(),
          debit(160, "03/07/2026", "SELLOS", "-10,00", "8.780,00"),
        ]),
      ]).rows;
    expect(rowsWith(10)[1]).toEqual(["02/07/2026", "IVA", "-210,00", "8.790,00"]);
    expect(rowsWith(11)[1]).toEqual(["02/07/2026", "IVA", null, "-210,00", "8.790,00"]);
  });

  it("una columna de texto necesita el 15 % de las filas de datos: con 14 filas, tres", () => {
    const rows = (withRef: number) =>
      Array.from({ length: 14 }, (_, k) => {
        const y = 120 + 20 * k;
        return [...debit(y, `${String(k + 1).padStart(2, "0")}/07/2026`, "COMPRA", "-1,00", "9,00"), ...(k < withRef ? at(y, 300, "REF") : [])];
      });
    const three = gridFromPages([page(1, rows(3))]).rows;
    expect(three[0]).toEqual(["01/07/2026", "COMPRA", "REF", "-1,00", "9,00"]);
    expect(three[13]).toEqual(["14/07/2026", "COMPRA", null, "-1,00", "9,00"]);
    const two = gridFromPages([page(1, rows(2))]).rows;
    expect(two[0]).toEqual(["01/07/2026", "COMPRA REF", "-1,00", "9,00"]);
  });

  it("un rótulo que pisa el 80 % de su ancho una columna de importes va a esa columna; con menos, se descarta", () => {
    // Los débitos terminan en 600 y en 595: la columna va de 555 a 600. El rótulo mide 50.
    const headerWith = (labelX: number) =>
      gridFromPages([
        page(1, [
          [at(100, 50, "FECHA"), at(100, 150, "CONCEPTO"), at(100, labelX, "DEBITOS($)"), right(100, 900, "SALDO")].flat(),
          debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
          [at(140, 50, "02/07/2026"), at(140, 150, "IVA"), right(140, 595, "-21,00"), right(140, 900, "8.979,00")].flat(),
        ]),
      ]).rows[0];
    expect(headerWith(560)).toEqual(["FECHA", "CONCEPTO", "DEBITOS($)", "SALDO"]);
    expect(headerWith(561)).toEqual(["FECHA", "CONCEPTO", null, "SALDO"]);
  });

  it("las columnas quedan en el orden de la página aunque un texto venga después de los importes", () => {
    const row = (y: number, date: string, amount: string, concept: string, balance: string) =>
      [at(y, 50, date), right(y, 300, amount), at(y, 350, concept), right(y, 900, balance)].flat();
    const g = gridFromPages([page(1, [row(120, "01/07/2026", "-1.000,00", "COMISION", "9.000,00"), row(140, "02/07/2026", "500,00", "DEPOSITO", "9.500,00")])]);
    expect(g.rows).toEqual([
      ["01/07/2026", "-1.000,00", "COMISION", "9.000,00"],
      ["02/07/2026", "500,00", "DEPOSITO", "9.500,00"],
    ]);
  });

  it("un importe más ancho que los de su columna va igual a la columna de importes", () => {
    const g = gridFromPages([
      page(1, [
        debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"),
        [at(160, 150, "TOTAL"), right(160, 900, "-10.000.000,00")].flat(),
      ]),
    ]);
    expect(g.rows[2]).toEqual([null, "TOTAL", null, null, "-10.000.000,00"]);
  });

  it("un extracto de un solo movimiento tiene sus columnas: la fecha, el concepto y el importe quedan en las suyas", () => {
    const g = gridFromPages([page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00")])]);
    expect(g.rows[1]).toEqual(["01/07/2026", "COMISION", "-1.000,00", "9.000,00"]);
    expect(countDataRows(g)).toBe(1);
  });

  it("en una fila de datos, la cola de un concepto que cae sobre los débitos va al concepto y no toca el importe", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1.000.000,00", "9.000,00"),
        credit(140, "02/07/2026", "TRANSFERENCIA", "500,00", "9.500,00"),
        [at(160, 50, "03/07/2026"), at(160, 150, "PAGO TARJETA"), at(160, 540, "VISA"), right(160, 600, "-21,00"), right(160, 900, "9.479,00")].flat(),
        credit(180, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"),
      ]),
    ]);
    expect(g.rows[3]).toEqual(["03/07/2026", "PAGO TARJETA VISA", "-21,00", null, "9.479,00"]);
    expect(countDataRows(g)).toBe(4);
  });

  it("en una fila de datos, un comprobante suelto cerca de la fecha va al concepto y no toca la fecha", () => {
    const rows = Array.from({ length: 10 }, (_, k) => {
      const y = 120 + 20 * k;
      return [at(y, 50, `${String(k + 1).padStart(2, "0")}/07/2026`), k === 0 ? at(y, 110, "0001") : [], at(y, 200, "COMPRA"), right(y, 600, "-1,00"), right(y, 900, "9,00")].flat();
    });
    const g = gridFromPages([page(1, rows)]);
    expect(g.rows[0]).toEqual(["01/07/2026", "0001 COMPRA", "-1,00", "9,00"]);
    expect(countDataRows(g)).toBe(10);
  });

  it("un texto suelto en una fila de datos sin columna de concepto se pierde antes que la fecha o el importe", () => {
    const row = (y: number, date: string, extra: boolean) => [at(y, 50, date), extra ? at(y, 300, "ANULADO") : [], right(y, 600, "-1,00"), right(y, 900, "9,00")].flat();
    const g = gridFromPages([page(1, [row(120, "01/07/2026", true), row(140, "02/07/2026", false), row(160, "03/07/2026", false)])]);
    expect(g.rows[0]).toStrictEqual(["01/07/2026", "-1,00", "9,00"]);
    expect(countDataRows(g)).toBe(3);
  });

  it("en una fila con importe y sin fecha, un texto sobre una columna de importes no es su rótulo: va a la columna de texto más cercana", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"),
        [at(160, 50, "TRANSPORTE"), right(160, 900, "9.500,00")].flat(),
        [at(180, 565, "TOTAL"), right(180, 900, "9.500,00")].flat(),
      ]),
    ]);
    expect(g.rows.slice(3)).toEqual([
      ["TRANSPORTE", null, null, null, "9.500,00"],
      [null, "TOTAL", null, null, "9.500,00"],
    ]);
  });

  it("un importe con el más adelante o con la moneda pegada cae en su columna", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "DEPOSITO", "+500,00", "9.500,00"),
        credit(180, "04/07/2026", "DEPOSITO", "ARS1.000,00", "11.000,50"),
        debit(200, "05/07/2026", "COMPRA", "U$S10,00", "11.000,50"),
        debit(220, "06/07/2026", "COMPRA", "-USD7,25", "11.000,50"),
      ]),
    ]);
    expect(g.rows.slice(2)).toEqual([
      ["02/07/2026", "DEPOSITO", null, "+500,00", "9.500,00"],
      ["04/07/2026", "DEPOSITO", null, "ARS1.000,00", "11.000,50"],
      ["05/07/2026", "COMPRA", "U$S10,00", null, "11.000,50"],
      ["06/07/2026", "COMPRA", "-USD7,25", null, "11.000,50"],
    ]);
    expect(countDataRows(g)).toBe(5);
  });

  it("una cifra con un decimal en el concepto es parte del concepto: no arma una columna de importes", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "TASA 10,5", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "DEPOSITO 12,5", "500,00", "9.500,00"),
        debit(160, "03/07/2026", "TASA 10,5", "-21,00", "9.479,00"),
      ]),
    ]);
    expect(g.rows.slice(1)).toEqual([
      ["01/07/2026", "TASA 10,5", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "DEPOSITO 12,5", null, "500,00", "9.500,00"],
      ["03/07/2026", "TASA 10,5", "-21,00", null, "9.479,00"],
    ]);
    const t = readTable(g)!;
    for (const i of t.interpretations) {
      expect(buildRows(g, t, i, catalog.synonyms.nonMovements).movements.map((m) => Math.abs(m.amountCents))).not.toContain(1050);
    }
  });

  it("sin fechas, una fila con un importe no arma una tabla", () => {
    expect(gridFromPages([page(1, [[at(100, 50, "Total"), right(100, 900, "1,00")].flat()])]).rows).toEqual([["Total", "1,00"]]);
  });

  it("sin filas de datos, cada fila dice su página, su renglón y cómo se leyó", () => {
    const g = gridFromPages([page(1, [at(100, 50, "Legales")]), page(2, [at(100, 50, "Mas legales"), at(120, 50, "Fin")], 0, "ocr")]);
    expect(g.places).toEqual([
      { page: 1, line: 1, origin: "pdf" },
      { page: 2, line: 1, origin: "ocr" },
      { page: 2, line: 2, origin: "ocr" },
    ]);
    expect(g.origin).toBe("ocr");
  });
});

describe("gridFromPages: escala y corrimiento", () => {
  const p1 = page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]);
  const p2 = page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00")]);
  const scaled = (p: PageWords, f: number, origin: "pdf" | "ocr"): PageWords => ({
    ...p,
    width: p.width * f,
    origin,
    words: p.words.map((w) => ({ ...w, x: w.x * f, y: w.y * f, w: w.w * f, h: w.h * f })),
  });

  it("una página en puntos y otra en píxeles de otro ancho dan las mismas columnas", () => {
    expect(gridFromPages([p1, scaled(p2, 2, "ocr")]).rows).toEqual(gridFromPages([p1, p2]).rows);
  });

  it("una página A4 en puntos, de 595 de ancho, da la misma grilla", () => {
    expect(gridFromPages([scaled(p1, 0.595, "pdf")]).rows).toEqual(gridFromPages([p1]).rows);
  });

  it("un preámbulo largo en una sola página no corre las columnas de las otras", () => {
    const preamble = [10, 25, 40, 55, 70].map((y, k) => at(y, 400, `Dato ${k}`));
    const g = gridFromPages([
      page(1, [...preamble, header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00")], 30),
    ]);
    expect(g.rows.slice(-2)).toEqual([
      ["03/07/2026", "IVA", "-21,00", null, "9.479,00"],
      ["04/07/2026", "DEPOSITO", null, "21,00", "9.500,00"],
    ]);
    expect(g.rows[0]).toEqual([null, "Dato 0", null, null, null]);
  });

  it("las filas con importe y sin fecha no cuentan para correr la página", () => {
    const transport = (y: number) => [at(y, 400, "TRANSPORTE"), right(y, 900, "9.500,00")].flat();
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), transport(160), transport(180), transport(200)], 20),
    ]);
    expect(g.rows.slice(4, 6)).toEqual([
      ["03/07/2026", "IVA", "-21,00", null, "9.479,00"],
      ["04/07/2026", "DEPOSITO", null, "21,00", "9.500,00"],
    ]);
  });

  it("una página sin movimientos entre dos que tienen no se corre, y su pie repetido se va igual", () => {
    const pie = (y: number, n: number) => at(y, 400, `Pagina ${n} de 3`);
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"), pie(1300, 1)]),
      page(2, [at(100, 60, "Sin movimientos en este periodo"), pie(1300, 2)]),
      page(3, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), pie(1300, 3)], 20),
    ]);
    const head = ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"];
    expect(g.rows).toEqual([
      head,
      ["01/07/2026", "COMISION", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "DEPOSITO", null, "500,00", "9.500,00"],
      ["Sin movimientos en este periodo", null, null, null, null],
      head,
      ["03/07/2026", "IVA", "-21,00", null, "9.479,00"],
      ["04/07/2026", "DEPOSITO", null, "21,00", "9.500,00"],
    ]);
    expect(g.places?.map((p) => `${p.page}:${p.line}`)).toEqual(["1:1", "1:2", "1:3", "2:1", "3:1", "3:2", "3:3"]);
  });
});

describe("gridFromPages: adornos", () => {
  it("un movimiento que se repite al principio y al final de cada página no es un adorno; el membrete repetido queda solo en la primera", () => {
    const sheet = (n: number, dates: string[]) =>
      page(n, [
        at(80, 50, "BANCO EJEMPLO"),
        header(100),
        debit(120, dates[0], "COMISION", "-1,00", "9,00"),
        debit(140, dates[1], "IVA", "-2,00", "7,00"),
        debit(160, dates[2], "COMISION", "-1,00", "6,00"),
      ]);
    const g = gridFromPages([sheet(1, ["01/07/2026", "02/07/2026", "03/07/2026"]), sheet(2, ["04/07/2026", "05/07/2026", "06/07/2026"])]);
    expect(g.rows.map((r) => r[0])).toEqual(["BANCO EJEMPLO", "FECHA", "01/07/2026", "02/07/2026", "03/07/2026", "FECHA", "04/07/2026", "05/07/2026", "06/07/2026"]);
  });

  it("una fila con un importe nunca es un adorno: el saldo anterior de arriba de cada página queda en todas", () => {
    const previous = (y: number, amount: string) => [at(y, 150, "SALDO ANTERIOR"), right(y, 900, amount)].flat();
    const g = gridFromPages([
      page(1, [header(100), previous(110, "10.000,00"), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [header(100), previous(110, "9.500,00"), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00")]),
    ]);
    expect(g.rows.filter((r) => r[1] === "SALDO ANTERIOR")).toEqual([
      [null, "SALDO ANTERIOR", null, null, "10.000,00"],
      [null, "SALDO ANTERIOR", null, null, "9.500,00"],
    ]);
  });

  it("el membrete repetido arriba de cada página queda una vez, en la primera: trae el CBU", () => {
    const letterhead = (y: number) => at(y, 50, "CBU 01700015 00000123456784");
    const g = gridFromPages([
      page(1, [letterhead(80), header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [letterhead(80), header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00")]),
    ]);
    const at0 = g.rows.flatMap((r, k) => (r[0] === "CBU 01700015 00000123456784" ? [g.places?.[k]] : []));
    expect(at0).toEqual([{ page: 1, line: 1, origin: "pdf" }]);
  });

  it("un número de página suelto, sin letras ni importe, repetido al pie de cada página, se va", () => {
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"), at(1300, 500, "1/2")]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), at(1300, 500, "2/2")]),
    ]);
    expect(g.rows).toHaveLength(6);
    expect(g.rows.flat()).not.toContain("1/2");
  });

  it("la página es su lugar en la lista, no su número: dos páginas con el mismo número no se mezclan", () => {
    const foot = (y: number) => at(y, 400, "Resumen de cuenta");
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"), foot(1300)]),
      page(1, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), foot(1300)]),
    ]);
    expect(g.rows.flat()).not.toContain("Resumen de cuenta");
    expect(g.rows).toHaveLength(6);
  });

  it("una línea sin letras se compara con las cifras como comodines: el CBU y el CUIT de arriba quedan, los números de página se van", () => {
    const g = gridFromPages([
      page(1, [at(60, 50, "0170001500000123456784"), at(80, 50, "30-71234567-8"), header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00"), at(1300, 500, "1/2")]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), at(1300, 500, "2/2")]),
    ]);
    const cells = g.rows.flat();
    expect(cells.filter((c) => c === "0170001500000123456784" || c === "30-71234567-8")).toEqual(["0170001500000123456784", "30-71234567-8"]);
    expect(cells).not.toContain("1/2");
    expect(cells).not.toContain("2/2");
  });

  it("dos líneas sin letras con distinta cantidad de cifras no son la misma: las dos quedan", () => {
    const g = gridFromPages([
      page(1, [at(60, 50, "0170001500000123456784"), header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), at(1300, 500, "123456")]),
    ]);
    expect(g.rows.flat()).toEqual(expect.arrayContaining(["0170001500000123456784", "123456"]));
  });

  it("un número de página arriba de la primera no se lleva el CBU: queda su primera aparición y el resto se va", () => {
    const g = gridFromPages([
      page(1, [at(40, 500, "1/2"), at(60, 50, "0170001500000123456784"), header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "DEPOSITO", "500,00", "9.500,00")]),
      page(2, [at(40, 500, "2/2"), header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00")]),
    ]);
    const cells = g.rows.flat();
    expect(cells).toContain("0170001500000123456784");
    expect(cells.filter((c) => c === "1/2" || c === "2/2")).toEqual(["1/2"]);
  });

  it("una página que empieza con un movimiento también tiene su pie, aunque el pie tenga dos frases", () => {
    const pie = (y: number, n: number) => [...at(y, 50, "Resumen mensual"), ...at(y, 800, `Hoja ${n}`)];
    const g = gridFromPages([
      page(1, [debit(120, "01/07/2026", "COMISION", "-1,00", "9,00"), debit(140, "02/07/2026", "IVA", "-2,00", "7,00"), pie(1300, 1)]),
      page(2, [debit(120, "03/07/2026", "COMISION", "-1,00", "6,00"), debit(140, "04/07/2026", "IVA", "-2,00", "4,00"), pie(1300, 2)]),
    ]);
    expect(g.rows).toEqual([
      ["01/07/2026", "COMISION", "-1,00", "9,00"],
      ["02/07/2026", "IVA", "-2,00", "7,00"],
      ["03/07/2026", "COMISION", "-1,00", "6,00"],
      ["04/07/2026", "IVA", "-2,00", "4,00"],
    ]);
  });

  it("en una página que empieza con un movimiento, la línea repetida dentro de la tabla se queda", () => {
    const extra = (y: number) => at(y, 150, "Se acreditara en 5 cuentas");
    const sheet = (n: number) =>
      page(n, [debit(120, `0${n}/07/2026`, "TRANSF", "-1,00", "9,00"), extra(130), credit(140, `1${n}/07/2026`, "DEP", "5,00", "14,00")]);
    const g = gridFromPages([sheet(1), sheet(2)]);
    expect(g.rows.filter((r) => r[1] === "Se acreditara en 5 cuentas")).toHaveLength(2);
  });

  it("un encabezado de dos rótulos se repite en cada página y se queda", () => {
    const head = (y: number) => [...at(y, 50, "FECHA"), ...right(y, 900, "SALDO")];
    const g = gridFromPages([
      page(1, [head(100), debit(120, "01/07/2026", "COMISION", "-1,00", "9,00"), debit(140, "02/07/2026", "IVA", "-2,00", "7,00")]),
      page(2, [head(100), debit(120, "03/07/2026", "COMISION", "-1,00", "6,00"), debit(140, "04/07/2026", "IVA", "-2,00", "4,00")]),
    ]);
    expect(g.rows.filter((r) => r[0] === "FECHA")).toHaveLength(2);
  });

  it("el pie repetido se reconoce sin las cifras, sin los acentos, con otro espaciado y con la hoja de cualquier lado", () => {
    const sheet = (n: number, foot: Word[]) =>
      page(n, [header(100), debit(120, `0${n}/07/2026`, "COMISION", "-1.000,00", "9.000,00"), credit(140, `1${n}/07/2026`, "DEPOSITO", "500,00", "9.500,00"), foot]);
    const g = gridFromPages([
      sheet(1, [...at(1300, 400, "Página 9 de 10"), ...at(1320, 50, "Banco Ejemplo"), ...at(1340, 50, "1 Resumen mensual")]),
      sheet(2, [...at(1300, 400, "Pagina 10 de 10"), ...at(1320, 50, "Banco"), ...at(1320, 95, "Ejemplo"), ...at(1340, 50, "Resumen mensual 2")]),
    ]);
    expect(g.rows).toHaveLength(6);
  });

  it("una línea fuera de la tabla que no se repite en otra página se queda", () => {
    const g = gridFromPages([
      page(1, [at(80, 50, "Resumen de julio"), header(100), debit(120, "01/07/2026", "COMISION", "-1,00", "9,00"), debit(140, "02/07/2026", "IVA", "-2,00", "7,00")]),
      page(2, [at(80, 50, "Continuacion"), header(100), debit(120, "03/07/2026", "COMISION", "-1,00", "6,00"), debit(140, "04/07/2026", "IVA", "-2,00", "4,00")]),
    ]);
    expect(g.rows.map((r) => r[0])).toContain("Resumen de julio");
    expect(g.rows.map((r) => r[0])).toContain("Continuacion");
  });
});

describe("splitGluedDate: el año", () => {
  const w = (text: string): Word => ({ text, x: 0, y: 0, w: text.length * CW, h: 10 });
  const split = (text: string) => splitGluedDate(w(text)).map((x) => x.text);
  it("toma cuatro cifras de año entre 1990 y 2100, y dos fuera de ese rango", () => {
    expect(split("1/1/199012")).toEqual(["1/1/1990", "12"]);
    expect(split("1/1/210012")).toEqual(["1/1/2100", "12"]);
    expect(split("1/1/198912")).toEqual(["1/1/19", "8912"]);
    expect(split("1/1/210112")).toEqual(["1/1/21", "0112"]);
  });
  it("un texto que no empieza ni termina en cifras queda como está", () => {
    expect(split("A1/2/202612")).toEqual(["A1/2/202612"]);
    expect(split("1/2/202612A")).toEqual(["1/2/202612A"]);
  });
});

describe("AMOUNT y DATE", () => {
  it.each([
    "1.000,00", "12.345,00", "1.000.000,00", "-1.000,00", "1.000,00-", "(1.000,00)", "$1.000,00", "-$1.000,00", "$-1.000,00",
    "0,50", "1000,00", "-1000,00", "1000,00-", "(1000,00)", "$1000,00", "$-1000,00",
  ])("%s es un importe", (s) => expect(AMOUNT.test(s)).toBe(true));

  it.each(["+500,00", "ARS1.000,00", "U$S10,00", "USD7,25", "ars1,00", "-$21,50", "$-21,50", "(U$S10,00)", "+1.000,00-"])(
    "%s es un importe, como lo lee parseCents",
    (s) => {
      expect(AMOUNT.test(s)).toBe(true);
      expect(parseCents(s, "ar")).not.toBeNull();
    },
  );

  it.each(["1.000", "1000", "12.345.678", "1.000,0", "1000,0", "10,5", "1.000,5", "1.000,005", "x1.000,00", "1.000,00x", "x1000,00", "1000,00x", "12.34,00", "EUR1,00", "TRANSF"])(
    "%s no es un importe",
    (s) => expect(AMOUNT.test(s)).toBe(false),
  );

  it.each(["01/07/2026", "1/7/26", "01.07.2026", "01-07-26", "01/07"])("%s es una fecha", (s) => expect(DATE.test(s)).toBe(true));

  it.each(["123/07/2026", "01/07/20261", "01/07/2", "x01/07", "TRANSF"])("%s no es una fecha", (s) => expect(DATE.test(s)).toBe(false));
});

describe("countDataRows: el importe", () => {
  it("un número sin centavos no es un importe, ni uno que no se puede leer", () => {
    expect(countDataRows({ origin: "pdf", sheet: null, rows: [["01/07/2026", "1000"], ["01/07/2026", "(-1.000,00)"], ["01/07/2026", 5]] })).toBe(0);
  });
});

describe("gridFromPages hasta los renglones", () => {
  it.each(["CREDITO", "SALDO", "IMPORTE"])("un rótulo %s sin columna de importes debajo se descarta", (label) => {
    const g = gridFromPages([
      page(1, [
        [at(100, 50, "FECHA"), at(100, 150, "CONCEPTO"), right(100, 600, "DEBITO"), right(100, 750, label)].flat(),
        [at(120, 50, "01/07/2026"), at(120, 150, "COMISION"), right(120, 600, "-1.000,00")].flat(),
        [at(140, 50, "02/07/2026"), at(140, 150, "IVA"), right(140, 600, "-210,00")].flat(),
      ]),
    ]);
    expect(g.rows[0]).toEqual(["FECHA", "CONCEPTO", "DEBITO"]);
  });

  it("una continuación de concepto que empieza con un rótulo de importe no se descarta: llega al concepto del movimiento", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
        credit(140, "02/07/2026", "TRANSF RECIBIDA", "500,00", "9.500,00"),
        at(150, 150, "CREDITO INMEDIATO"),
        debit(170, "03/07/2026", "IVA", "-21,00", "9.479,00"),
      ]),
    ]);
    expect(g.rows[3]).toEqual([null, "CREDITO INMEDIATO", null, null, null]);
    const t = readTable(g)!;
    const debitCredit = t.interpretations.find((i) => i.amount.shape === "debit-credit" && i.amount.debit === 2)!;
    expect(buildRows(g, t, debitCredit, catalog.synonyms.nonMovements).movements.map((m) => m.concept)).toEqual(["COMISION", "TRANSF RECIBIDA CREDITO INMEDIATO", "IVA"]);
  });

  it("en un extracto sin créditos, el rótulo CREDITO se descarta: no le da a la columna del concepto el rol de crédito", () => {
    const head = [at(100, 50, "FECHA"), at(100, 150, "MOVIMIENTO"), right(100, 600, "DEBITO"), right(100, 750, "CREDITO"), right(100, 900, "SALDO")].flat();
    const g = gridFromPages([
      page(1, [head, debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), debit(140, "02/07/2026", "IVA", "-210,00", "8.790,00"), debit(160, "03/07/2026", "SELLOS", "-10,00", "8.780,00")]),
    ]);
    expect(g.rows[0]).toEqual(["FECHA", "MOVIMIENTO", "DEBITO", "SALDO"]);
    const t = readTable(g);
    expect(t).not.toBeNull();
    expect(buildRows(g, t!, t!.interpretations[0], catalog.synonyms.nonMovements).movements.map((m) => m.concept)).toEqual(["COMISION", "IVA", "SELLOS"]);
  });

  it("el encabezado repetido de la página siguiente no se pega al concepto del último movimiento de la anterior", () => {
    const pie = (y: number, n: number) => at(y, 400, `Pagina ${n} de 2`);
    const g = gridFromPages([
      page(1, [header(100), debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"), credit(140, "02/07/2026", "TRANSFERENCIA", "500,00", "9.500,00"), pie(1300, 1)]),
      page(2, [header(100), debit(120, "03/07/2026", "IVA", "-21,00", "9.479,00"), credit(140, "04/07/2026", "DEPOSITO", "21,00", "9.500,00"), pie(1300, 2)], 20),
    ]);
    const t = readTable(g)!;
    expect(t.interpretations.length).toBeGreaterThan(0);
    const concepts = (i: (typeof t.interpretations)[number]) => buildRows(g, t, i, catalog.synonyms.nonMovements).movements.map((m) => m.concept);
    for (const i of t.interpretations) expect(concepts(i).filter((c) => c.includes("CONCEPTO"))).toEqual([]);
    const debitCredit = t.interpretations.find((i) => i.amount.shape === "debit-credit" && i.amount.debit === 2)!;
    expect(concepts(debitCredit)).toEqual(["COMISION", "TRANSFERENCIA", "IVA", "DEPOSITO"]);
  });
});

describe("gridFromPages: las palabras giradas", () => {
  // Una leyenda impresa de costado en el margen: poppler y el OCR la dan como una caja angosta y alta.
  const vertical = (x: number, y: number, h: number, text = "Responsable"): Word => ({ text, x, y, w: 10, h });
  const rows = () => [
    header(100),
    debit(120, "01/07/2026", "COMISION", "-1.000,00", "9.000,00"),
    debit(140, "02/07/2026", "IVA", "-210,00", "8.790,00"),
    credit(160, "03/07/2026", "DEPOSITO", "500,00", "9.290,00"),
    debit(180, "04/07/2026", "SELLOS", "-10,00", "9.280,00"),
  ];

  it("una palabra vertical que cruza cuatro renglones no los funde: cuatro filas y cuatro movimientos", () => {
    const g = gridFromPages([page(1, [...rows(), [vertical(960, 115, 130)]])]);
    expect(g.rows).toEqual([
      ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
      ["01/07/2026", "COMISION", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "IVA", "-210,00", null, "8.790,00"],
      ["03/07/2026", "DEPOSITO", null, "500,00", "9.290,00"],
      ["04/07/2026", "SELLOS", "-10,00", null, "9.280,00"],
    ]);
    const t = readTable(g)!;
    const i = t.interpretations.find((x) => x.amount.shape === "debit-credit" && x.balance === 4)!;
    expect(buildRows(g, t, i, catalog.synonyms.nonMovements).movements).toHaveLength(4);
  });

  it("también en el OCR, y en el margen izquierdo", () => {
    const g = gridFromPages([page(1, [...rows(), [vertical(10, 115, 130, "Ëhkg½£gÌ")]], 0, "ocr")]);
    expect(g.rows).toHaveLength(5);
    expect(g.rows.flat()).not.toContain("Ëhkg½£gÌ");
  });

  it("se saca solo si es más alta que 2,5 renglones y que el doble de su ancho", () => {
    const kept = (w: Word): boolean => gridFromPages([page(1, [...rows(), [w]])]).rows.flat().some((c) => typeof c === "string" && c.includes("ZZ"));
    // 26 de alto con renglones de 10: pasa la mediana por 2,6 y su ancho por 2,6 veces.
    expect(kept({ text: "ZZ", x: 960, y: 118, w: 10, h: 26 })).toBe(false);
    // 24 de alto: no llega a 2,5 renglones.
    expect(kept({ text: "ZZ", x: 960, y: 118, w: 10, h: 24 })).toBe(true);
    // 30 de alto pero 15 de ancho: no es más que el doble de su ancho.
    expect(kept({ text: "ZZ", x: 960, y: 118, w: 15, h: 30 })).toBe(true);
    expect(kept({ text: "ZZ", x: 960, y: 118, w: 14, h: 30 })).toBe(false);
  });

  it("las palabras cortas de la misma leyenda, con la misma caja de costado, también se sacan", () => {
    // «S.A.» y el guion de la leyenda son más bajos que un renglón, pero tienen el borde izquierdo y el
    // ancho de «Responsable», que sí es girada: son la misma línea impresa de costado.
    const legend = [vertical(960, 60, 45), { text: "-", x: 960, y: 128, w: 10, h: 3 }, { text: "S.A.", x: 960, y: 145, w: 10, h: 14 }];
    const g = gridFromPages([page(1, [...rows(), legend])]);
    expect(g.rows).toEqual([
      ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
      ["01/07/2026", "COMISION", "-1.000,00", null, "9.000,00"],
      ["02/07/2026", "IVA", "-210,00", null, "8.790,00"],
      ["03/07/2026", "DEPOSITO", null, "500,00", "9.290,00"],
      ["04/07/2026", "SELLOS", "-10,00", null, "9.280,00"],
    ]);
  });

  it("una palabra con otro borde u otro ancho que la girada se queda", () => {
    const g = gridFromPages([page(1, [...rows(), [vertical(960, 300, 45), { text: "ZZ", x: 948, y: 145, w: 10, h: 10 }, { text: "YY", x: 960, y: 165, w: 12, h: 10 }]])]);
    const text = g.rows.flat().join(" ");
    expect(text).toContain("ZZ");
    expect(text).toContain("YY");
  });
});

describe("AMOUNT: el punto decimal", () => {
  it.each(["1234.56", "-1234567890.12", "1,234.56", "-1,234,567.89", "12.34", "0.50", "1234.56-", "(1,234.56)", "$1234.56"])("%s es un importe", (s) => {
    expect(AMOUNT.test(s)).toBe(true);
    expect(parseCents(s, "us")).not.toBeNull();
  });

  it.each(["1234", "1234.5", "1.234", "1,234", "1,23.45", "1234.567", "1.234.56", "12,34.56"])("%s no es un importe", (s) => expect(AMOUNT.test(s)).toBe(false));

  it("el menos tipográfico del OCR (U+2212) es un menos", () => {
    const g = gridFromPages([page(1, [header(100), debit(120, "01/07/2026", "COMISION", "−1.000,00", "−9.000,00"), debit(140, "02/07/2026", "IVA", "-210,00", "-9.210,00")], 0, "ocr")]);
    expect(g.rows[1]).toEqual(["01/07/2026", "COMISION", "-1.000,00", "-9.000,00"]);
  });

  it("de punta a punta: una grilla con importes con punto decimal da los centavos", () => {
    // Letra de ancho fijo: el importe y el saldo, alineados a la derecha, a un espacio uno del otro.
    const line = (y: number, date: string, concept: string, amount: string, balance: string) =>
      [at(y, 50, date), at(y, 110, concept), right(y, 305, amount), right(y, 380, balance)].flat();
    const g = gridFromPages([
      page(1, [
        [at(100, 50, "Fecha"), at(100, 110, "Descripcion"), right(100, 305, "Importe"), right(100, 380, "Saldo")].flat(),
        line(120, "1/7/2026", "IMP.DEBITOS BANCARIOS", "-123.45", "-1000000123.45"),
        line(140, "1/7/2026", "SEGURO LEASING", "-1000.00", "-1000001123.45"),
        line(160, "2/7/2026", "TRANSFERENCIA RECIBIDA", "1,500.00", "-999999623.45"),
      ]),
    ]);
    const t = readTable(g)!;
    const signed = t.interpretations.find((x) => x.amount.shape === "signed" && x.balance !== null)!;
    const ms = buildRows(g, t, signed, catalog.synonyms.nonMovements).movements;
    expect(ms.map((m) => [m.amountCents, m.balanceCents])).toEqual([
      [-12345, -100000012345],
      [-100000, -100000112345],
      [150000, -99999962345],
    ]);
  });
});

describe("countDataRows: el punto decimal", () => {
  it("una fila con un importe con punto decimal cuenta", () => {
    expect(countDataRows({ origin: "ocr", sheet: null, rows: [["1/7/2026", "IMP", "-123.45"]] })).toBe(1);
  });
});

describe("gridFromPages: la caja del OCR estirada por un hueco", () => {
  // El OCR detecta un renglón como una caja y reparte su ancho entre las palabras por la cantidad de
  // letras: un hueco grande adentro de la caja, leído como un espacio, corre a la derecha todo lo que
  // está antes. Solo los bordes de la caja son ciertos.
  const box = (y: number, words: Word[]): Word[] => {
    const text = words.map((w) => w.text).join(" ");
    const x0 = words[0].x;
    const width = words[words.length - 1].x + words[words.length - 1].w - x0;
    let at = 0;
    return words.map((w) => {
      const out = { text: w.text, x: x0 + (at / text.length) * width, y, w: (w.text.length / text.length) * width, h: 12 };
      at += w.text.length + 1;
      return out;
    });
  };
  const row = (y: number, date: string, concept: string, cells: Array<[number, string]>) =>
    box(y, [at(y, 50, date), at(y, 150, concept), ...cells.map(([edge, t]) => right(y, edge, t))].flat());
  const deb = (y: number, d: string, c: string, a: string) => row(y, d, c, [[600, a]]);
  const cre = (y: number, d: string, c: string, a: string) => row(y, d, c, [[750, a]]);
  // El cierre del día: el débito y el saldo en la misma caja, con el hueco entre los dos. Como en un
  // extracto, los débitos son la mayoría: la caja típica es la de un débito.
  const close = (y: number, d: string, c: string, a: string, b: string) => row(y, d, c, [[600, a], [900, b]]);

  const pageOf = () =>
    page(
      1,
      [
        header(100),
        deb(120, "01/07/2026", "COMISION MANTENIMIENTO CUENTA", "-1.000,00"),
        cre(140, "01/07/2026", "TRANSFERENCIA RECIBIDA OTRO BANCO", "5.000,00"),
        close(160, "01/07/2026", "IMPUESTO LEY 25413 S/DEBITOS", "-1.000,00", "13.000,00"),
        deb(180, "02/07/2026", "COMISION MANTENIMIENTO CUENTA", "-2.000,00"),
        deb(200, "02/07/2026", "PERCEPCION IVA RG 2408 GASTOS", "-100,00"),
        deb(220, "02/07/2026", "SERVICIO ACREDITACIONES AUTOM", "-50,00"),
        deb(240, "02/07/2026", "DEBITO AUTOMATICO SEGURO VARIO", "-50,00"),
        close(260, "02/07/2026", "IMPUESTO LEY 25413 S/DEBITOS", "-1.000,00", "9.800,00"),
      ],
      0,
      "ocr",
    );

  it("el débito del cierre del día va a la columna de débitos, no a la de créditos ni a una propia", () => {
    const g = gridFromPages([pageOf()]);
    expect(g.rows[0]).toEqual(["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"]);
    expect(g.rows[3]).toEqual(["01/07/2026", "IMPUESTO LEY 25413 S/DEBITOS", "-1.000,00", null, "13.000,00"]);
    expect(g.rows[8]).toEqual(["02/07/2026", "IMPUESTO LEY 25413 S/DEBITOS", "-1.000,00", null, "9.800,00"]);
  });

  it("una letra suelta pegada al final de la caja (un resto de la leyenda del margen) no corre el saldo", () => {
    const p = pageOf();
    const tail = box(280, [at(280, 50, "03/07/2026"), at(280, 150, "IMPUESTO LEY 25413 S/DEBITOS"), right(280, 600, "-1.000,00"), right(280, 900, "8.800,00"), at(280, 915, "A")].flat());
    const g = gridFromPages([{ ...p, words: [...p.words, ...tail] }]);
    expect(g.rows[9]).toEqual(["03/07/2026", "IMPUESTO LEY 25413 S/DEBITOS A", "-1.000,00", null, "8.800,00"]);
  });

  it("el texto legal de la página no cambia el ancho típico: la tabla sale y encadena igual", () => {
    // Diez movimientos con su saldo en la misma caja, y doce renglones de texto legal, más densos.
    let balance = 100000;
    const fmt = (n: number) => `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, "0")},00`;
    const data = Array.from({ length: 10 }, (_, k) => {
      const amount = (k + 1) * 100;
      const isCredit = k % 3 === 1;
      balance += isCredit ? amount : -amount;
      const d = `0${1 + (k % 9)}/07/2026`;
      return isCredit ? row(120 + k * 20, d, "TRANSFERENCIA", [[750, fmt(amount)], [900, fmt(balance)]]) : row(120 + k * 20, d, "COMISION", [[600, `-${fmt(amount)}`], [900, fmt(balance)]]);
    });
    const legal = Array.from({ length: 12 }, (_, k) => box(400 + k * 20, at(400 + k * 20, 50, "LOS DEPOSITOS EN PESOS Y EN MONEDA EXTRANJERA CUENTAN CON LA GARANTIA DE HASTA")));
    const read = (rows: Word[][]) => {
      const g = gridFromPages([page(1, [header(100), ...rows], 0, "ocr")]);
      const t = readTable(g)!;
      const j = judge(g, t, catalog.synonyms.nonMovements, null)!;
      return { amounts: j.rows.movements.map((m) => m.amountCents), checked: j.checked, chained: j.chained };
    };
    const alone = read(data);
    expect(alone).toMatchObject({ checked: 9, chained: 9 });
    expect(read([...data, ...legal])).toEqual(alone);
  });

  it("de punta a punta, el saldo de cada cierre encadena su día", () => {
    const g = gridFromPages([pageOf()]);
    const t = readTable(g)!;
    const i = t.interpretations.find((x) => x.amount.shape === "debit-credit" && x.amount.debit === 2 && x.amount.credit === 3 && x.balance === 4)!;
    const ms = buildRows(g, t, i, catalog.synonyms.nonMovements).movements;
    expect(ms.map((m) => m.amountCents)).toEqual([-100000, 500000, -100000, -200000, -10000, -5000, -5000, -100000]);
  });
});

describe("straightenOcrBoxes", () => {
  // Una caja del OCR repartida como la reparte el módulo: cada palabra por su lugar en el texto.
  const split = (y: number, left: number, right: number, tokens: string[], h = 12): Word[] => {
    const text = tokens.join(" ");
    const width = right - left;
    let at = 0;
    return tokens.map((t) => {
      const w = { text: t, x: left + (at / text.length) * width, y, w: (t.length / text.length) * width, h };
      at += t.length + 1;
      return w;
    });
  };
  // Tres cajas típicas de 10 por carácter.
  const typical = [100, 120, 140].flatMap((y) => split(y, 50, 240, ["01/07", "COMISION", "1,00"]));

  it("en una caja estirada, lo anterior al último importe va desde la izquierda y es estimado; el importe y lo que sigue, desde la derecha", () => {
    const stretched = split(160, 50, 450, ["01/07", "IMPUESTO", "5,00", "900,00", "A"]);
    const out = straightenOcrBoxes([...typical, ...stretched]).slice(typical.length);
    expect(out).toEqual([
      { text: "01/07", x: 50, y: 160, w: 50, h: 12, estimated: true },
      { text: "IMPUESTO", x: 110, y: 160, w: 80, h: 12, estimated: true },
      { text: "5,00", x: 200, y: 160, w: 40, h: 12, estimated: true },
      { text: "900,00", x: 370, y: 160, w: 60, h: 12 },
      { text: "A", x: 440, y: 160, w: 10, h: 12 },
    ]);
  });

  it("el menos tipográfico cuenta como importe para elegir el último", () => {
    const stretched = split(160, 50, 450, ["01/07", "IMPUESTO", "5,00", "−900,00", "A"]);
    const out = straightenOcrBoxes([...typical, ...stretched]).slice(typical.length);
    expect(out.map((w) => w.estimated === true)).toEqual([true, true, true, false, false]);
  });

  it("una caja apenas más ancha que la típica, por menos de dos caracteres, queda como está", () => {
    // 19 caracteres en 209: 1,9 caracteres de más.
    const wide = split(160, 50, 259, ["01/07", "COMISION", "1,00"]);
    expect(straightenOcrBoxes([...typical, ...wide]).slice(typical.length)).toEqual(wide);
    // 19 caracteres en 211: 2,1 de más, y el importe es el último: lo anterior se estima.
    const wider = split(160, 50, 261, ["01/07", "COMISION", "1,00"]);
    expect(straightenOcrBoxes([...typical, ...wider]).slice(typical.length).map((w) => w.estimated === true)).toEqual([true, true, false]);
  });

  it("sin un importe después de la primera palabra, una caja estirada queda como está", () => {
    const text = split(160, 50, 450, ["SALDO", "ANTERIOR", "AL", "CIERRE"]);
    const first = split(180, 50, 450, ["1,00", "IMPUESTO", "LEY", "VARIOS"]);
    expect(straightenOcrBoxes([...typical, ...text, ...first]).slice(typical.length)).toEqual([...text, ...first]);
  });

  it("dos cajas de un renglón con la misma altura no se toman por una: otro ancho por carácter u otro hueco", () => {
    // La fecha y el concepto en una caja de 10 por carácter; el importe en otra, de 12, lejos.
    const row = [...split(160, 50, 190, ["01/07", "COMISION"]), ...split(160, 400, 448, ["1,00"])];
    expect(straightenOcrBoxes([...typical, ...row]).slice(typical.length)).toEqual(row);
    // Mismo ancho por carácter, pero separadas por más de un carácter.
    const apart = [...split(160, 50, 190, ["01/07", "COMISION"]), ...split(160, 400, 440, ["1,00"])];
    expect(straightenOcrBoxes([...typical, ...apart]).slice(typical.length)).toEqual(apart);
  });

  it("se endereza por fila de datos: la fecha en su propia caja y el resto en otra, estirada", () => {
    const date = split(160, 50, 100, ["06/07"]);
    const rest = split(160, 120, 630, ["IMPUESTO", "-5,00", "895,00"]);
    expect(straightenOcrBoxes([...typical, ...date, ...rest]).slice(typical.length)).toEqual([
      ...date,
      { text: "IMPUESTO", x: 120, y: 160, w: 80, h: 12, estimated: true },
      { text: "-5,00", x: 210, y: 160, w: 50, h: 12, estimated: true },
      { text: "895,00", x: 570, y: 160, w: 60, h: 12 },
    ]);
  });

  it("una caja estirada que no está en una fila de datos queda como está", () => {
    const loose = split(300, 120, 630, ["IMPUESTO", "-5,00", "895,00"]);
    expect(straightenOcrBoxes([...typical, ...loose]).slice(typical.length)).toEqual(loose);
  });

  it("las palabras de cajas con otra altura no se mezclan, aunque estén en el mismo renglón", () => {
    const a = split(160, 50, 190, ["01/07", "COMISION"], 12);
    const b = split(160, 200, 450, ["02/07", "5,00", "900,00"], 13);
    expect(straightenOcrBoxes([...typical, ...a, ...b]).slice(typical.length).filter((w) => w.estimated)).toEqual([
      { text: "02/07", x: 200, y: 160, w: 50, h: 13, estimated: true },
      { text: "5,00", x: 260, y: 160, w: 40, h: 13, estimated: true },
    ]);
  });

  it("el orden de las palabras de entrada no cambia nada: la caja se arma por su posición", () => {
    const stretched = split(160, 50, 450, ["01/07", "IMPUESTO", "5,00", "900,00", "A"]);
    const forward = straightenOcrBoxes([...typical, ...stretched]);
    const backward = straightenOcrBoxes([...typical, ...[...stretched].reverse()]);
    expect(backward.slice(typical.length).reverse()).toEqual(forward.slice(typical.length));
  });

  it("una palabra marcada como medida sin la caja del OCR no se toma como medida", () => {
    const row = split(160, 50, 650, ["01/07", "IMPUESTO", "5,00", "900,00"]);
    // @ts-expect-error: el tipo no deja marcar una palabra medida sin la caja del OCR.
    const careless: Word = { ...row[3], x: 590, w: 60, measured: true };
    const out = straightenOcrBoxes([...typical, ...row.slice(0, 3), careless]).slice(typical.length);
    expect(out[3].measured).toBeUndefined();
  });

  it("lo medido no se mueve, y lo que está antes del último importe de la caja sigue estimado", () => {
    // El saldo se midió y el débito no: la caja se arma con su geometría del OCR, y el débito sigue
    // estimado porque está antes del último importe de la caja.
    const row = split(160, 50, 650, ["01/07", "IMPUESTO", "5,00", "900,00"]);
    const measured = row.map((w, i): Word => (i === 3 ? { ...w, x: 590, w: 60, measured: true, ocr: { x: w.x, w: w.w } } : w));
    const out = straightenOcrBoxes([...typical, ...measured]).slice(typical.length);
    expect(out.map((w) => [w.text, w.x, w.estimated === true, w.measured === true])).toEqual([
      ["01/07", 50, true, false],
      ["IMPUESTO", 110, true, false],
      ["5,00", 200, true, false],
      ["900,00", 590, false, true],
    ]);
  });

  it("sin palabras, nada", () => {
    expect(straightenOcrBoxes([])).toEqual([]);
  });
});

describe("el formato de los importes de la página", () => {
  it("en una página con coma decimal, «VTO 15.07» es parte del concepto", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        [at(120, 50, "01/07/2026"), at(120, 150, "CUOTA PRESTAMO VTO 15.07"), right(120, 600, "-1.000,00"), right(120, 900, "9.000,00")].flat(),
        credit(140, "02/07/2026", "TRANSFERENCIA", "500,00", "9.500,00"),
        debit(160, "03/07/2026", "IVA", "-21,00", "9.479,00"),
      ]),
    ]);
    expect(g.rows[1]).toEqual(["01/07/2026", "CUOTA PRESTAMO VTO 15.07", "-1.000,00", null, "9.000,00"]);
  });

  it("en una página con punto decimal, «1,000.00» es un importe y «1.000,00» no", () => {
    const g = gridFromPages([
      page(1, [
        header(100),
        debit(120, "01/07/2026", "COMISION", "-1,000.00", "9,000.00"),
        credit(140, "02/07/2026", "TRANSFERENCIA", "500.00", "9,500.00"),
        debit(160, "03/07/2026", "IVA 1.000,00", "-21.00", "9,479.00"),
      ]),
    ]);
    expect(g.rows.slice(1)).toEqual([
      ["01/07/2026", "COMISION", "-1,000.00", null, "9,000.00"],
      ["02/07/2026", "TRANSFERENCIA", null, "500.00", "9,500.00"],
      ["03/07/2026", "IVA 1.000,00", "-21.00", null, "9,479.00"],
    ]);
  });

  it("con empate entre los dos formatos, la página es de coma decimal", () => {
    const g = gridFromPages([page(1, [header(100), debit(120, "01/07/2026", "VTO 15.07", "-1.000,00", "9.000,00")])]);
    expect(g.rows[1]).toEqual(["01/07/2026", "VTO 15.07", "-1.000,00", "9.000,00"]);
  });
});

describe("splitGluedAmount", () => {
  const w = (text: string): Word => ({ text, x: 0, y: 0, w: text.length * CW, h: 10 });
  it("separa dos importes con coma decimal que el OCR pegó sin espacio, con la caja repartida por los caracteres", () => {
    expect(splitGluedAmount(w("123,451.234.567.890,12"), "ar").map((x) => [x.text, x.x, x.w, x.estimated === true])).toEqual([
      ["123,45", 0, 30, true],
      ["1.234.567.890,12", 30, 80, false],
    ]);
    expect(splitGluedAmount(w("-11.000.000,00-2.345.678.901,23"), "ar").map((x) => x.text)).toEqual(["-11.000.000,00", "-2.345.678.901,23"]);
  });
  it("con punto decimal, en una página de punto decimal", () => {
    expect(splitGluedAmount(w("123.451,234,567,890.12"), "us").map((x) => x.text)).toEqual(["123.45", "1,234,567,890.12"]);
    expect(splitGluedAmount(w("123.451,234,567,890.12"), "ar").map((x) => x.text)).toEqual(["123.451,234,567,890.12"]);
  });
  it("un importe solo, un texto, o un pegado que no da dos importes quedan como están", () => {
    for (const t of ["1.234.567.890,12", "TRANSF", "123,45X", "123,451", "123,45-"]) expect(splitGluedAmount(w(t), "ar").map((x) => x.text)).toEqual([t]);
  });
  it("en la grilla, el crédito y el saldo pegados van cada uno a su columna", () => {
    // El crédito termina a un carácter del saldo: el OCR los lee como una palabra.
    const head = [at(100, 50, "FECHA"), at(100, 150, "CONCEPTO"), right(100, 600, "DEBITO"), right(100, 855, "CREDITO"), right(100, 900, "SALDO")].flat();
    const row = (y: number, d: string, c: string, cells: Array<[number, string]>) => [at(y, 50, d), at(y, 150, c), ...cells.map(([e, t]) => right(y, e, t))].flat();
    const g = gridFromPages([
      page(1, [
        head,
        row(120, "01/07/2026", "COMISION", [[600, "-1.000,00"], [900, "9.000,00"]]),
        row(140, "02/07/2026", "TRANSFERENCIA", [[900, "500,009.500,00"]]),
        row(160, "03/07/2026", "DEPOSITO", [[855, "21,00"], [900, "9.521,00"]]),
      ]),
    ]);
    expect(g.rows[2]).toEqual(["02/07/2026", "TRANSFERENCIA", null, "500,00", "9.500,00"]);
  });
});

describe("el formato de los importes sale de las filas de datos", () => {
  // Un pie con horarios y tasas trae números con punto decimal: no decide el formato de la página.
  const fmt = (c: number) => `${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(c % 100).padStart(2, "0")}`;
  const statement = (footer: Word[][]) => {
    let balance = 50000000;
    const mov = (y: number, d: string, cents: number) => {
      balance -= cents;
      return [at(y, 50, d), at(y, 150, "COMISION"), right(y, 600, `-${fmt(cents)}`), right(y, 900, fmt(balance))].flat();
    };
    const first = page(1, [header(100), ...[1, 2, 3, 4, 5, 6].map((k) => mov(100 + k * 20, `0${k}/07/2026`, 1111 * k))]);
    const second = page(2, [header(100), mov(120, "07/07/2026", 4321), mov(140, "08/07/2026", 12345678), ...footer]);
    const g = gridFromPages([first, second]);
    const t = readTable(g)!;
    const j = judge(g, t, catalog.synonyms.nonMovements, null)!;
    return { movements: j.rows.movements.length, checked: j.checked, chained: j.chained };
  };

  it("los ocho movimientos salen igual con un pie de horarios y tasas en la segunda página", () => {
    const footer = [at(400, 50, "HORARIO DE ATENCION DE 10.00 A 15.00 HS"), at(420, 50, "TNA 45.50 TEA 55.30 CFT 60.12")];
    expect(statement([])).toEqual({ movements: 8, checked: 7, chained: 7 });
    expect(statement(footer)).toEqual({ movements: 8, checked: 7, chained: 7 });
  });

  it("sin filas de datos en la página, se aceptan los importes de los dos formatos", () => {
    // Un importe es siempre una frase sola: pegado a un texto, se separa de él.
    const g = gridFromPages([page(1, [at(100, 50, "TOTAL 1.000,00 2,000.00 FIN")])]);
    expect(g.rows).toEqual([["TOTAL", "1.000,00", "2,000.00", "FIN"]]);
  });
});
