// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFObject,
  PDFStream,
  PDFString,
} from "pdf-lib";
import {
  convertHtmlToPdfWithPositions,
  convertHtmlToPdfWithSignaturePositions,
  DEFAULT_PDF_OPTIONS,
  FIELD_LINK_PREFIX,
  launchBrowser,
} from "../../../src/common/utils/htmlToPdf";
import * as withPositions from "../../../src/common/utils/htmlToPdfWithPositions";

jest.setTimeout(60000);

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

// Chromium redondea el margen de 20mm a 76px: el contenido arranca en 57pt.
const MARGIN_PT = 57;
const PX_TO_PT = 0.75;

const HTML = `<html><body style="margin:0;font:12px serif">
  <div style="height:100px"></div>
  <div class="firma-espacio" style="width:200px;height:80px"></div>
  <p>Ver <a href="https://real.example/">un link de verdad</a></p>
  <div class="firma-espacio" style="break-before:page;margin-left:100px;width:300px;height:40px"></div>
</body></html>`;

describe("htmlToPdf", () => {
  it("exporta el navegador y las opciones por defecto", () => {
    expect(typeof launchBrowser).toBe("function");
    expect(DEFAULT_PDF_OPTIONS).toEqual({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });
  });

  it("convertHtmlToPdfWithSignaturePositions mide cada caja en su página", async () => {
    const { pdf, signaturePositions } =
      await convertHtmlToPdfWithSignaturePositions(HTML);
    const { width, height } = (await PDFDocument.load(pdf))
      .getPage(0)
      .getSize();

    expect(signaturePositions.map((p) => [p.page, p.signerIndex])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    const [first, second] = signaturePositions;
    expect(first.x).toBeCloseTo(MARGIN_PT / width, 4);
    expect(first.y).toBeCloseTo((MARGIN_PT + 100 * PX_TO_PT) / height, 4);
    expect(first.w).toBeCloseTo((200 * PX_TO_PT) / width, 4);
    expect(first.h).toBeCloseTo((80 * PX_TO_PT) / height, 4);
    expect(second.x).toBeCloseTo((MARGIN_PT + 100 * PX_TO_PT) / width, 4);
    expect(second.y).toBeCloseTo(MARGIN_PT / height, 4);
    expect(second.w).toBeCloseTo((300 * PX_TO_PT) / width, 4);
    expect(second.h).toBeCloseTo((40 * PX_TO_PT) / height, 4);
  });

  it("no deja ningún link sig.internal en el archivo y conserva los reales", async () => {
    const { pdf } = await convertHtmlToPdfWithSignaturePositions(HTML);
    const strings = await allStrings(pdf);
    expect(
      strings.filter((s) => s.startsWith("https://sig.internal/"))
    ).toEqual([]);
    expect(strings).toContain("https://real.example/");
  });

  it("reexporta la captura de campos y funciona importada desde acá", async () => {
    expect(convertHtmlToPdfWithPositions).toBe(
      withPositions.convertHtmlToPdfWithPositions
    );
    expect(FIELD_LINK_PREFIX).toBe("https://fld.internal/");
    const { fields } = await convertHtmlToPdfWithPositions(
      "<p>CUIT: <!--f:1 authors[0].taxId-->20-12345678-9<!--/f:1--></p>"
    );
    expect(fields.map((f) => [f.key, f.text])).toEqual([
      ["authors[0].taxId", "20-12345678-9"],
    ]);
  });
});
