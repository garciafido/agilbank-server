import * as path from "path";
// La misma copia de sharp que usa el lector: una segunda cargaría otra libvips en el mismo proceso.
import sharp from "@agilmind/lectura/node_modules/sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readStatement } from "../../src/readStatement";
import { readPdf, VISUAL_LIMITS } from "../../src/sources/visual";
import { renderizarPaginas } from "@agilmind/lectura";
import type { Grid } from "../../src/types";
import { pdfConTexto } from "../helpers";

// Los modelos latinos viven en el módulo de lectura.
process.env.AP_PADDLE_MODELS_DIR ??= path.join(path.dirname(require.resolve("@agilmind/lectura/package.json")), "modelos/paddle-latin-v5");

const ROWS = [
  ["FECHA", "CONCEPTO", "DEBITO", "CREDITO", "SALDO"],
  ["", "SALDO ANTERIOR", "", "", "10.000,00"],
  ["01/07/2026", "COMISION", "-1.000,00", "", "9.000,00"],
  ["02/07/2026", "TRANSFERENCIA", "", "500,00", "9.500,00"],
  ["03/07/2026", "IVA", "-21,00", "", "9.479,00"],
  ["04/07/2026", "DEPOSITO", "", "21,00", "9.500,00"],
];
const X = [80, 330, 900, 1150, 1450];
const ANCHOR = ["start", "start", "end", "end", "end"];

/** Un extracto dibujado: lo que sale de un escáner, sin texto. */
const statementPng = async (rows: string[][] = ROWS): Promise<Buffer> => {
  const text = rows.flatMap((row, r) =>
    row.map((cell, c) => (cell ? `<text x="${X[c]}" y="${100 + r * 60}" text-anchor="${ANCHOR[c]}" font-family="Arial, DejaVu Sans, sans-serif" font-size="30">${cell}</text>` : "")),
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${200 + rows.length * 60}"><rect width="100%" height="100%" fill="white"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

/** Las fechas sin año, como el BBVA, y el período impreso abajo. */
const YEARLESS = [
  ...ROWS.slice(0, 2),
  ...ROWS.slice(2).map(([date, ...rest]) => [date.slice(0, 5), ...rest]),
  ["", "Periodo del 01/07/2026 al 31/07/2026", "", "", ""],
];

const expectTheStatement = (r: Awaited<ReturnType<typeof readStatement>>) => {
  expect(r.lines.map((l) => [l.date, l.amountCents])).toEqual([["2026-07-01", -100000], ["2026-07-02", 50000], ["2026-07-03", -2100], ["2026-07-04", 2100]]);
  expect(r.verdict).toBe("verified");
  expect(r.lines[0].provenance.origin).toBe("ocr");
};

describe("la lectura por OCR", () => {
  it("una foto de un extracto", async () => {
    expectTheStatement(await readStatement(await statementPng()));
  });

  it.each(["tiff", "webp"] as const)("una foto %s de un extracto", async (format) => {
    expectTheStatement(await readStatement(await sharp(await statementPng())[format]().toBuffer()));
  });

  it("una foto sacada de costado, sin EXIF: se prueba girada", async () => {
    expectTheStatement(await readStatement(await sharp(await statementPng()).rotate(90).png().toBuffer()));
  });

  it("una foto con fechas sin año, sacada de costado y sin EXIF: se prueba girada y se lee", async () => {
    expectTheStatement(await readStatement(await sharp(await statementPng(YEARLESS)).rotate(90).png().toBuffer()));
  });

  it("una foto JPG con los píxeles de costado y el EXIF que dice cómo girarla", async () => {
    const sideways = await sharp(await statementPng()).rotate(270).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
    expectTheStatement(await readStatement(sideways));
  });

  it("un PDF escaneado, sin texto", async () => {
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(await statementPng());
    doc.addPage([img.width * 0.48, img.height * 0.48]).drawImage(img, { x: 0, y: 0, width: img.width * 0.48, height: img.height * 0.48 });
    const r = await readStatement(Buffer.from(await doc.save()));
    expectTheStatement(r);
    expect(r.lines[0].provenance.page).toBe(1);
  });

  it("un PDF con una página de texto y una escaneada: los renglones de los dos caminos, cada uno con su origen", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // La primera página, con texto, en la misma escala que la escaneada: 0,48 puntos por píxel.
    const page1 = doc.addPage([1600 * 0.48, 500]);
    ROWS.slice(0, 4).forEach((row, r) =>
      row.forEach((cell, c) => {
        if (!cell) return;
        const w = font.widthOfTextAtSize(cell, 14);
        page1.drawText(cell, { x: ANCHOR[c] === "end" ? X[c] * 0.48 - w : X[c] * 0.48, y: 450 - r * 28, size: 14, font });
      }),
    );
    const img = await doc.embedPng(await statementPng([ROWS[0], ...ROWS.slice(4)]));
    doc.addPage([img.width * 0.48, img.height * 0.48]).drawImage(img, { x: 0, y: 0, width: img.width * 0.48, height: img.height * 0.48 });
    const r = await readStatement(Buffer.from(await doc.save()));
    expect(r.lines.map((l) => [l.date, l.amountCents, l.provenance.origin, l.provenance.page])).toEqual([
      ["2026-07-01", -100000, "pdf", 1],
      ["2026-07-02", 50000, "pdf", 1],
      ["2026-07-03", -2100, "ocr", 2],
      ["2026-07-04", 2100, "ocr", 2],
    ]);
    expect(r.verdict).toBe("verified");
  });

  it("una foto en blanco: sin tabla, después de probar los cuatro giros", async () => {
    const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const r = await readStatement(blank);
    expect(r.verdict).toBe("abstained");
    expect(r.reason).toMatch(/^No se encontró una tabla de movimientos/);
  });

  it("si se acaba el tiempo antes de la primera página, no disponible", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    let t = 0;
    const r = await readPdf(Buffer.from(await doc.save()), { ...VISUAL_LIMITS, budgetMs: 0 }, { now: () => (t += 1) });
    expect(r).toEqual({ kind: "unavailable", reason: "La lectura no llegó a leer ninguna página en el tiempo disponible: vuelvan a enviarlo más tarde." });
  });
});

/** Una página con texto que sirve: fechas e importes, marcados con `tag` para saber de qué página vino cada palabra. */
const textPage = (tag: string) => [
  { x: 40, y: 780, texto: "FECHA" }, { x: 110, y: 780, texto: "CONCEPTO" }, { x: 400, y: 780, texto: "IMPORTE" }, { x: 500, y: 780, texto: "SALDO" },
  { x: 40, y: 760, texto: "01/07/2026" }, { x: 110, y: 760, texto: tag }, { x: 400, y: 760, texto: "-10,00" }, { x: 500, y: 760, texto: "990,00" },
  { x: 40, y: 740, texto: "02/07/2026" }, { x: 110, y: 740, texto: tag }, { x: 400, y: 740, texto: "40,00" }, { x: 500, y: 740, texto: "1.030,00" },
];
const texts = (g: Grid) => g.rows.flat().map((c) => String(c ?? ""));
/** Un reloj que avanza 1 ms cada vez que se lo mira. */
const ticking = () => {
  let t = 0;
  return () => (t += 1);
};

describe("el corte de la lectura de un PDF", () => {
  it("cortada antes de la tanda de la página 2, no trae la página 3 aunque tenga texto", async () => {
    const pdf = pdfConTexto([textPage("PRIMERA"), [], textPage("TERCERA")]);
    // started = 1; antes de la tanda de la página 2 el reloj marca 2: pasó 1 ms y el techo es 1.
    const r = await readPdf(pdf, { ...VISUAL_LIMITS, budgetMs: 1 }, { now: ticking() });
    expect(r).toMatchObject({ kind: "read", pages: 3, pagesRead: 1, cut: "tiempo" });
    if (r.kind !== "read") throw new Error(r.kind);
    expect(texts(r.grid).some((t) => t.includes("PRIMERA"))).toBe(true);
    expect(texts(r.grid).some((t) => t.includes("TERCERA"))).toBe(false);
    expect(r.grid.places?.every((p) => p.page === 1)).toBe(true);
  });

  it("el reloj se mira antes de cada página de la tanda: la que llega pasado el techo no se lee", async () => {
    const pdf = pdfConTexto([textPage("PRIMERA"), [], []]);
    // started = 1; la tanda [2, 3] mira en 2, la página 2 en 3 y la página 3 en 4: pasados 3 ms, se corta.
    const r = await readPdf(pdf, { ...VISUAL_LIMITS, budgetMs: 3 }, { now: ticking() });
    expect(r).toMatchObject({ kind: "read", pages: 3, pagesRead: 2, cut: "tiempo" });
  });

  it("una página de la tanda que no sale del render corta la lectura ahí: se leyeron 2 de 4, y las que siguen no entran", async () => {
    const pdf = pdfConTexto([textPage("PRIMERA"), [], [], textPage("CUARTA")]);
    const withoutPage3: typeof renderizarPaginas = async (file, o) => ((await renderizarPaginas(file, o)) ?? []).filter((p) => p.pagina !== 3);
    const r = await readPdf(pdf, VISUAL_LIMITS, { render: withoutPage3 });
    expect(r).toMatchObject({ kind: "read", pages: 4, pagesRead: 2, cut: "render" });
    if (r.kind !== "read") throw new Error(r.kind);
    expect(texts(r.grid).some((t) => t.includes("CUARTA"))).toBe(false);
  });

  it("si el render no devuelve nada y la primera página lo necesitaba, no disponible", async () => {
    const pdf = pdfConTexto([[], textPage("SEGUNDA")]);
    const r = await readPdf(pdf, VISUAL_LIMITS, { render: async () => null });
    expect(r).toEqual({
      kind: "unavailable",
      reason: "No se pudo leer el archivo: no se pudieron preparar sus páginas para el OCR. Vuelvan a enviarlo más tarde.",
    });
  });
});

describe("la posición medida en la tinta", () => {
  // La forma del BPN: letra de ancho fijo, un renglón entero por caja del OCR, y el débito y el crédito
  // con el mismo texto en columnas distintas, a pocos caracteres uno del otro y del saldo. Cifras inventadas,
  // y saldos positivos: el OCR pierde a veces el menos, y eso es otra prueba.
  const pad = (s: string, n: number, right = false) => (right ? s.padStart(n) : s.padEnd(n));
  const line = (date: string, concept: string, debit: string, credit: string, balance: string) =>
    `${pad(date, 10)}  ${pad(concept, 20)}${pad(debit, 14, true)}${pad(credit, 13, true)}${pad(balance, 16, true)}`;
  const LINES = [
    line("Fecha", "Descripcion", "Debito", "Credito", "Saldo"),
    line("", "SALDO ANTERIOR", "", "", "10000.00"),
    line("1/7/2026", "TRANSFERENCIA", "1500.00", "", "8500.00"),
    line("2/7/2026", "TRANSFERENCIA", "", "1500.00", "10000.00"),
    line("3/7/2026", "COMISION", "21.00", "", "9979.00"),
    line("4/7/2026", "DEPOSITO", "", "321.00", "10300.00"),
    line("5/7/2026", "TRANSFERENCIA", "300.00", "", "10000.00"),
  ];
  const png = async (): Promise<Buffer> => {
    const text = LINES.map((l, r) => `<text x="40" y="${80 + r * 48}" xml:space="preserve" font-family="Menlo, DejaVu Sans Mono, Courier New, monospace" font-size="26">${l}</text>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="440"><rect width="100%" height="100%" fill="white"/>${text}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  };

  it("débitos y créditos con el mismo texto, en una caja por renglón, van cada uno a su columna", async () => {
    const r = await readStatement(await png());
    expect(r.lines.map((l) => [l.date, l.amountCents])).toEqual([
      ["2026-07-01", -150000],
      ["2026-07-02", 150000],
      ["2026-07-03", -2100],
      ["2026-07-04", 32100],
      ["2026-07-05", -30000],
    ]);
    expect(r.verdict).toBe("verified");
  });
});
