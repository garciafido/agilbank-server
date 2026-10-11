// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

// htmlToPdfWithPositions va primero a propósito: htmlToPdf.test.ts importa en
// el orden inverso, y entre los dos cubren el import circular en ambos sentidos.
import {
  convertHtmlToPdfWithPositions,
  FIELD_LINK_PREFIX,
} from "../../../src/common/utils/htmlToPdfWithPositions";
import { convertHtmlToPdfWithSignaturePositions } from "../../../src/common/utils/htmlToPdf";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFObject,
  PDFStream,
  PDFString,
} from "pdf-lib";
import type { PDFOptions } from "puppeteer";

jest.setTimeout(60000);

const SIGNATURE_LINK_PREFIX = "https://sig.internal/";

const mark = (id: number, key: string, value: string): string =>
  `<!--f:${id} ${key}-->${value}<!--/f:${id}-->`;

const stripMarkers = (html: string): string =>
  html.replace(/<!--f:\d+ [\s\S]*?-->|<!--\/f:\d+-->/g, "");

/** Todos los strings de todos los objetos indirectos del archivo. */
async function allStrings(pdf: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  const out: string[] = [];
  const visit = (obj: PDFObject): void => {
    if (obj instanceof PDFString || obj instanceof PDFHexString)
      out.push(obj.decodeText());
    else if (obj instanceof PDFDict) obj.values().forEach(visit);
    else if (obj instanceof PDFArray) obj.asArray().forEach(visit);
    else if (obj instanceof PDFStream) visit(obj.dict);
  };
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => visit(obj));
  return out;
}

async function expectNoInternalUris(pdf: Uint8Array): Promise<void> {
  const strings = await allStrings(pdf);
  expect(
    strings.filter(
      (s) =>
        s.startsWith(FIELD_LINK_PREFIX) || s.startsWith(SIGNATURE_LINK_PREFIX)
    )
  ).toEqual([]);
}

const words = (n: number): string =>
  Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");

describe("convertHtmlToPdfWithPositions", () => {
  it("devuelve cada aparición con su clave, su texto y su rectángulo", async () => {
    const html = `<body style="font:12px serif">
      <p>CUIT: ${mark(1, "authors[1].taxId", "20-12345678-9")}</p>
      <p>Editorial: ${mark(2, "publishers[0].name", "Pérez &amp; Hijos")}</p>
      <p>De nuevo: ${mark(3, "authors[1].taxId", "20-12345678-9")}</p>
      <p>Sin cierre: <!--f:9 authors[0].name-->nadie</p>
    </body>`;
    const result = await convertHtmlToPdfWithPositions(html);

    expect(result.fieldsDiscardedReason).toBeUndefined();
    expect(result.signaturePositions).toEqual([]);
    expect(result.fields.map((f) => [f.key, f.text])).toEqual([
      ["authors[1].taxId", "20-12345678-9"],
      ["publishers[0].name", "Pérez & Hijos"],
      ["authors[1].taxId", "20-12345678-9"],
    ]);
    for (const field of result.fields) {
      expect(field.rects).toHaveLength(1);
      const [rect] = field.rects;
      expect(rect.page).toBe(0);
      expect(rect.x).toBeGreaterThan(0);
      expect(rect.x + rect.w).toBeLessThan(1);
      expect(rect.y).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
    }
    const ys = result.fields.map((f) => f.rects[0].y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    await expectNoInternalUris(result.pdf);
  });

  it("un valor de varias líneas tiene un rectángulo por línea", async () => {
    const html = `<body style="font:12px serif"><p style="width:150px">${mark(
      1,
      "works[0].contractObservation",
      "una observación bastante larga que no entra en una sola línea del párrafo angosto"
    )}</p></body>`;
    const { fields, pdf } = await convertHtmlToPdfWithPositions(html);

    expect(fields).toHaveLength(1);
    const { rects } = fields[0];
    expect(rects.length).toBeGreaterThanOrEqual(3);
    rects.forEach((rect) => expect(rect.page).toBe(0));
    for (let i = 1; i < rects.length; i++)
      expect(rects[i].y).toBeGreaterThan(rects[i - 1].y);
    await expectNoInternalUris(pdf);
  });

  it("un valor que cruza el salto de página tiene rectángulos en las dos páginas", async () => {
    const html = `<body style="font:12px serif"><div style="height:900px"></div><p>${mark(
      1,
      "observations[0]",
      words(400)
    )}</p></body>`;
    const { fields, pdf } = await convertHtmlToPdfWithPositions(html);

    expect(fields).toHaveLength(1);
    const pages = Array.from(new Set(fields[0].rects.map((r) => r.page)));
    expect(pages).toEqual([0, 1]);
    expect(fields[0].text).toBe(words(400));
    await expectNoInternalUris(pdf);
  });

  it("HTML con | safe: arma el texto por bloques y conserva el link real", async () => {
    const value =
      '<p>Obs con <b>negrita</b> y <a href="https://real.example/">un link</a></p>' +
      "<ul><li>uno</li><li>dos</li></ul>";
    const html = `<body style="font:12px serif">${mark(
      1,
      "observations[0]",
      value
    )}</body>`;
    const { fields, pdf } = await convertHtmlToPdfWithPositions(html);

    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe("observations[0]");
    expect(fields[0].text).toBe("Obs con negrita y un link uno dos");
    expect(fields[0].rects.length).toBeGreaterThanOrEqual(3);
    expect(await allStrings(pdf)).toContain("https://real.example/");
    await expectNoInternalUris(pdf);
  });

  it("descarta lo oculto, lo de tamaño cero y lo recortado", async () => {
    const html = `<body style="font:12px serif">
      <p style="visibility:hidden">${mark(1, "a.hidden", "oculto")}</p>
      <p style="display:none">${mark(2, "a.none", "no se muestra")}</p>
      <p style="font-size:0">${mark(3, "a.zero", "cero")}</p>
      <div style="height:20px;overflow:hidden"><div style="height:40px"></div>${mark(
        4,
        "a.clipped",
        "recortado"
      )}</div>
      <p>${mark(5, "a.visible", "visible")}</p>
    </body>`;
    const { fields, fieldsDiscardedReason, pdf } =
      await convertHtmlToPdfWithPositions(html);

    expect(fieldsDiscardedReason).toBeUndefined();
    expect(fields.map((f) => f.key)).toEqual(["a.visible"]);
    await expectNoInternalUris(pdf);
  });

  it("encuentra la marca que abre en <head> después de un <style> inicial", async () => {
    const html = `<style>p { margin: 0 }</style>\n${mark(
      1,
      "contractMetadata.editionInfo.name",
      "Mi Álbum"
    )} <p>resto</p>`;
    const { fields, pdf } = await convertHtmlToPdfWithPositions(html);

    expect(fields.map((f) => [f.key, f.text])).toEqual([
      ["contractMetadata.editionInfo.name", "Mi Álbum"],
    ]);
    expect(fields[0].rects).toHaveLength(1);
    await expectNoInternalUris(pdf);
  });

  it("el texto de <xmp>, <iframe>, <noembed> y <noframes> no es texto del campo", async () => {
    const html = `<body style="font:12px serif"><p>${mark(
      1,
      "observations[0]",
      "antes <xmp>crudo</xmp><iframe>marco</iframe><noembed>embed</noembed><noframes>frames</noframes> después"
    )}</p></body>`;
    const { fields, fieldsDiscardedReason, pdf } =
      await convertHtmlToPdfWithPositions(html);

    expect(fieldsDiscardedReason).toBeUndefined();
    expect(fields.map((f) => [f.key, f.text])).toEqual([
      ["observations[0]", "antes después"],
    ]);
    await expectNoInternalUris(pdf);
  });

  it("un número de marca que aparece en más de una apertura o de un cierre no va al mapa", async () => {
    const html = `<body style="font:12px serif">
      <p>Obs: ${mark(2, "authors[0].taxId", "FALSO")}</p>
      <p>CUIT: ${mark(1, "authors[1].taxId", "20-1")} ${mark(
      2,
      "authors[0].taxId",
      "20-2"
    )}</p>
      <p>Suelta: <!--f:3 otra.clave--> ${mark(
        3,
        "authors[0].firstName",
        "Ana"
      )}</p>
    </body>`;
    const { fields, fieldsDiscardedReason, pdf } =
      await convertHtmlToPdfWithPositions(html);

    expect(fieldsDiscardedReason).toBeUndefined();
    expect(fields.map((f) => [f.key, f.text])).toEqual([
      ["authors[1].taxId", "20-1"],
    ]);
    await expectNoInternalUris(pdf);
  });

  it("si la conversión falla, lo registra con console.error y propaga el error", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await expect(
        convertHtmlToPdfWithPositions("<p>x</p>", {
          format: "no-existe",
        } as unknown as PDFOptions)
      ).rejects.toThrow(/no-existe/);
      expect(consoleError).toHaveBeenCalledWith(
        "Error al generar PDF con posiciones de campos:",
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("si convertir las marcas mueve el texto, sale sin campos y con el motivo", async () => {
    const html = `<body style="font:12px serif">
      <div style="display:flex;gap:12px">Nombre: ${mark(
        1,
        "authors[0].firstName",
        "Juan"
      )} fin</div>
      <div class="firma-espacio" style="width:200px;height:80px"></div>
    </body>`;
    const result = await convertHtmlToPdfWithPositions(html);

    expect(result.fields).toEqual([]);
    expect(result.fieldsDiscardedReason).toMatch(/se movió.*dentro de <div>/);
    expect(result.fieldsDiscardedReason).not.toMatch(/Nombre|Juan/);
    const plain = await convertHtmlToPdfWithSignaturePositions(
      stripMarkers(html)
    );
    expect(result.signaturePositions).toEqual(plain.signaturePositions);
    expect(result.signaturePositions).toHaveLength(1);
    await expectNoInternalUris(result.pdf);
  });

  it("las firmas salen igual que con convertHtmlToPdfWithSignaturePositions", async () => {
    const html = `<body style="font:12px serif">
      <p>Autor: ${mark(1, "authors[0].firstName", "Juan")} ${mark(
      2,
      "authors[0].lastName",
      "Pérez"
    )}</p>
      <div class="firma-espacio" style="width:200px;height:80px"></div>
      <p style="break-before:page">Editorial: ${mark(
        3,
        "publishers[0].name",
        "EMU"
      )}</p>
      <div class="firma-espacio" style="margin-left:100px;width:300px;height:40px"></div>
    </body>`;
    const result = await convertHtmlToPdfWithPositions(html);
    const plain = await convertHtmlToPdfWithSignaturePositions(
      stripMarkers(html)
    );

    expect(result.fieldsDiscardedReason).toBeUndefined();
    expect(result.signaturePositions).toHaveLength(2);
    expect(result.signaturePositions).toEqual(plain.signaturePositions);
    expect(result.fields.map((f) => [f.key, f.rects[0].page])).toEqual([
      ["authors[0].firstName", 0],
      ["authors[0].lastName", 0],
      ["publishers[0].name", 1],
    ]);
    await expectNoInternalUris(result.pdf);
  });

  it("con cientos de marcas no queda ninguna URI interna en el archivo", async () => {
    const rows = Array.from(
      { length: 300 },
      (_, i) =>
        `<p>Dato ${i}: ${mark(i + 1, `works[${i}].title`, `Obra ${i}`)}</p>`
    ).join("");
    const html = `<body style="font:12px serif">${rows}
      <div class="firma-espacio" style="width:200px;height:80px"></div></body>`;
    const { fields, signaturePositions, pdf } =
      await convertHtmlToPdfWithPositions(html);

    expect(fields).toHaveLength(300);
    expect(fields[299]).toMatchObject({
      key: "works[299].title",
      text: "Obra 299",
    });
    expect(signaturePositions).toHaveLength(1);
    await expectNoInternalUris(pdf);
  });
});
