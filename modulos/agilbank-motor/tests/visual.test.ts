// La lectura visual con el render y el OCR inyectados: lo que hace con lo que le devuelven, sin PP-OCR.
// poppler sí corre: cuenta las páginas y saca el texto de las que lo traen. PP-OCR, apagado.
// La misma copia de sharp que usa el lector: una segunda cargaría otra libvips en el mismo proceso.
import sharp from "@agilmind/lectura/node_modules/sharp";
import { tamanoDelPng, type LecturaPaddle } from "@agilmind/lectura";
import { readImage, readPdf, VISUAL_LIMITS, type VisualTools } from "../src/sources/visual";
import type { Grid } from "../src/types";
import { pdfConTexto, tiffDePaginas } from "./helpers";

process.env.AP_PADDLE_OCR = "off";

const textPage = (tag: string) => [
  { x: 40, y: 780, texto: "FECHA" }, { x: 110, y: 780, texto: "CONCEPTO" }, { x: 400, y: 780, texto: "IMPORTE" }, { x: 500, y: 780, texto: "SALDO" },
  { x: 40, y: 760, texto: "01/07/2026" }, { x: 110, y: 760, texto: tag }, { x: 400, y: 760, texto: "-10,00" }, { x: 500, y: 760, texto: "990,00" },
  { x: 40, y: 740, texto: "02/07/2026" }, { x: 110, y: 740, texto: tag }, { x: 400, y: 740, texto: "40,00" }, { x: 500, y: 740, texto: "1.030,00" },
];
const texts = (g: Grid) => g.rows.flat().map((c) => String(c ?? ""));

const white = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();

/** Un render que da una página blanca de 100 × 100 por cada página pedida. */
const blankRender: VisualTools["render"] = async (_file, o) =>
  Promise.all(Array.from({ length: o.hasta - o.desde + 1 }, async (_, i) => ({ pagina: o.desde + i, png: await white(100, 100) })));

/** Un OCR que da lo que diga `byCall`, una respuesta por llamada, y anota el tamaño de cada PNG. */
const scriptedOcr = (...byCall: LecturaPaddle[]) => {
  const sizes: Array<{ ancho: number; alto: number } | null> = [];
  const ocr: VisualTools["ocr"] = async (png) => {
    sizes.push(tamanoDelPng(png));
    return byCall[Math.min(sizes.length - 1, byCall.length - 1)];
  };
  return { ocr, sizes };
};

const tools = (over: Partial<VisualTools>): Partial<VisualTools> => ({ ocrReady: async () => true, render: blankRender, ...over });

describe("los techos de la lectura visual", () => {
  // El paso corre en el worker sin transacción envolvente: el techo lo pone la reserva del evento (30 min),
  // no los 5 minutos de una transacción. Un Credicoop mensual escaneado tarda de 230 a 280 s con la máquina cargada.
  it("el tiempo es de 10 minutos; las páginas, 60; la resolución, 150 dpi", () => {
    expect(VISUAL_LIMITS).toEqual({ budgetMs: 600_000, maxPages: 60, dpi: 150 });
  });
});

describe("la falla del OCR en un PDF", () => {
  it("en la primera página que la necesita, sin nada leído antes: no disponible, no una conclusión sobre el archivo", async () => {
    const { ocr } = scriptedOcr({ fallo: "sin memoria" });
    const r = await readPdf(pdfConTexto([[], textPage("SEGUNDA")]), VISUAL_LIMITS, tools({ ocr }));
    expect(r).toEqual({
      kind: "unavailable",
      reason: "No se pudo leer el archivo: el lector de imágenes falló al leer sus páginas. Vuelvan a enviarlo más tarde.",
    });
  });

  it("después de páginas leídas, corta ahí como el render: lo anterior, con la causa, y nada de lo que sigue", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true }, { fallo: "sin memoria" });
    const r = await readPdf(pdfConTexto([textPage("PRIMERA"), [], [], textPage("CUARTA")]), VISUAL_LIMITS, tools({ ocr }));
    expect(r).toMatchObject({ kind: "read", pages: 4, pagesRead: 2, cut: "ocr" });
    if (r.kind !== "read") throw new Error(r.kind);
    expect(texts(r.grid).some((t) => t.includes("PRIMERA"))).toBe(true);
    expect(texts(r.grid).some((t) => t.includes("CUARTA"))).toBe(false);
    expect(sizes).toHaveLength(2);
  });

  it("una página vacía no es una falla: se lee entera, sin corte", async () => {
    const { ocr } = scriptedOcr({ vacia: true });
    const r = await readPdf(pdfConTexto([textPage("PRIMERA"), [], textPage("TERCERA")]), VISUAL_LIMITS, tools({ ocr }));
    expect(r).toMatchObject({ kind: "read", pages: 3, pagesRead: 3, cut: null });
  });

  it("sin el OCR, una página escaneada da no disponible antes de mirar", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    const r = await readPdf(pdfConTexto([[]]), VISUAL_LIMITS, tools({ ocr, ocrReady: async () => false }));
    expect(r.kind).toBe("unavailable");
    expect(sizes).toHaveLength(0);
  });
});

describe("la falla del OCR en una foto", () => {
  it("no disponible: no se pudo mirar", async () => {
    const { ocr } = scriptedOcr({ fallo: "sin memoria" });
    const r = await readImage(await white(200, 100), tools({ ocr }));
    expect(r).toEqual({
      kind: "unavailable",
      reason: "No se pudo leer el archivo: el lector de imágenes falló al leer sus páginas. Vuelvan a enviarlo más tarde.",
    });
  });

  it("también si falla en una de las vueltas", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true }, { fallo: "sin memoria" });
    expect((await readImage(await white(200, 100), tools({ ocr }))).kind).toBe("unavailable");
    expect(sizes).toHaveLength(2);
  });

  it("si girarla falla, la imagen no se pudo abrir: no lanza", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    const rotate: VisualTools["rotate"] = async () => {
      throw new Error("sharp: imagen corrupta");
    };
    expect(await readImage(await white(200, 100), tools({ ocr, rotate }))).toEqual({ kind: "unreadable", reason: "No se pudo abrir la imagen: el archivo está dañado." });
    expect(sizes).toHaveLength(1);
  });

  it.each(["tiff", "webp"] as const)("una foto %s llega al OCR como PNG", async (format) => {
    const photo = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ffffff" } })[format]().toBuffer();
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    expect((await readImage(photo, tools({ ocr }))).kind).toBe("read");
    expect(sizes[0]).toEqual({ ancho: 300, alto: 200 });
  });

  it("un TIFF de dos páginas no se lee a medias: sin lectura, con el motivo, y nada va al OCR", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    expect(await readImage(await tiffDePaginas(30, 20, 2), tools({ ocr }))).toEqual({
      kind: "unreadable",
      reason: "La imagen tiene 2 páginas: manden el extracto en PDF.",
    });
    expect(sizes).toHaveLength(0);
  });

  it("el TIFF de varias páginas es una conclusión sobre el archivo: también sin el OCR en el servidor", async () => {
    expect((await readImage(await tiffDePaginas(30, 20, 3), tools({ ocrReady: async () => false }))).kind).toBe("unreadable");
  });

  it("un TIFF de una página se lee", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    expect((await readImage(await tiffDePaginas(30, 20, 1), tools({ ocr }))).kind).toBe("read");
    expect(sizes[0]).toEqual({ ancho: 30, alto: 20 });
  });

  it("vacía en las cuatro vueltas: se lee, sin renglones", async () => {
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    expect(await readImage(await white(200, 100), tools({ ocr }))).toMatchObject({ kind: "read", pages: 1, pagesRead: 1, cut: null });
    expect(sizes).toHaveLength(4);
  });
});

describe("el tope de píxeles de una página para el OCR", () => {
  // Una foto pasada a PDF por una app que le da a la página el tamaño en píxeles de la foto, a 72 dpi.
  const POINTS = { width: 4000, height: 3000 };
  const at150 = (pt: number) => Math.round((pt / 72) * 150);
  const renderOf = (png: Buffer): VisualTools["render"] => async (_file, o) => [{ pagina: o.desde, png }];

  it("una página de 4000 × 3000 pt llega al OCR con 12 MP como mucho, sin deformarse", async () => {
    const big = await white(at150(POINTS.width), at150(POINTS.height));
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    const r = await readPdf(pdfConTexto([[]]), VISUAL_LIMITS, tools({ ocr, render: renderOf(big) }));
    expect(r).toMatchObject({ kind: "read", pagesRead: 1, cut: null });
    const [size] = sizes;
    expect(size!.ancho * size!.alto).toBeLessThanOrEqual(12_000_000);
    expect(size!.ancho * size!.alto).toBeGreaterThan(11_900_000);
    expect(size!.ancho / size!.alto).toBeCloseTo(POINTS.width / POINTS.height, 2);
  });

  it("las posiciones del OCR, en los píxeles del PNG achicado, dan la misma grilla que la página chica", async () => {
    // Un OCR que pone cada palabra en la misma fracción del ancho y del alto del PNG que recibe.
    const TABLE = [["FECHA", "CONCEPTO", "IMPORTE", "SALDO"], ["01/07/2026", "COMISION", "-10,00", "990,00"], ["02/07/2026", "DEPOSITO", "40,00", "1.030,00"]];
    const ocr: VisualTools["ocr"] = async (png) => {
      const { ancho, alto } = tamanoDelPng(png)!;
      const words = TABLE.flatMap((row, r) =>
        row.map((text, c) => ({ text, box: { x: (0.05 + 0.22 * c) * ancho, y: (0.1 + 0.03 * r) * alto, w: 0.012 * text.length * ancho, h: 0.015 * alto } })),
      );
      return { palabras: { text: "", words: words as never } };
    };
    const gridAt = async (width: number, height: number) => {
      const r = await readPdf(pdfConTexto([[]]), VISUAL_LIMITS, tools({ ocr, render: renderOf(await white(width, height)) }));
      if (r.kind !== "read") throw new Error(r.kind);
      return r.grid.rows;
    };
    const small = await gridAt(400, 300);
    expect(small).toEqual(TABLE);
    expect(await gridAt(at150(POINTS.width), at150(POINTS.height))).toEqual(small);
  });

  it("una página dentro del tope llega como salió del render", async () => {
    const page = await white(at150(595), at150(842));
    const seen: Buffer[] = [];
    const r = await readPdf(pdfConTexto([[]]), VISUAL_LIMITS, tools({ ocr: async (png) => (seen.push(png), { vacia: true }), render: renderOf(page) }));
    expect(r.kind).toBe("read");
    expect(seen).toEqual([page]);
  });

  it("si el render da algo que no se puede achicar, corta como una página que no salió del render", async () => {
    const notAPng = Buffer.alloc(64, 1);
    const { ocr, sizes } = scriptedOcr({ vacia: true });
    const r = await readPdf(pdfConTexto([textPage("PRIMERA"), []]), VISUAL_LIMITS, tools({ ocr, render: renderOf(notAPng) }));
    expect(r).toMatchObject({ kind: "read", pages: 2, pagesRead: 1, cut: "render" });
    expect(sizes).toHaveLength(0);
  });
});
