import puppeteer, { PDFOptions } from "puppeteer";
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFNumber,
  PDFString,
  PDFHexString,
} from "pdf-lib";
import { removeInternalLinks } from "./pdfInternalLinks";

// A4 at 96 CSS DPI: 794 × 1123 px
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

export interface SignaturePosition {
  page: number;
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  w: number; // 0-1 normalized
  h: number; // 0-1 normalized
  signerIndex: number;
}

export const DEFAULT_PDF_OPTIONS: PDFOptions = {
  format: "A4",
  printBackground: true,
  margin: {
    top: "20mm",
    right: "20mm",
    bottom: "20mm",
    left: "20mm",
  },
};

export function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/**
 * Convierte un string HTML a un buffer PDF.
 */
export async function convertHtmlToPdf(
  htmlContent: string,
  pdfOptions?: PDFOptions
): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    return await page.pdf(pdfOptions || DEFAULT_PDF_OPTIONS);
  } catch (error) {
    console.error("Error al generar el PDF:", error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Convierte HTML a PDF y extrae coordenadas exactas de .firma-espacio
 * usando anotaciones Link del PDF generado por Puppeteer.
 * Inyecta <a> invisibles sobre cada .firma-espacio; Puppeteer los convierte
 * en anotaciones PDF con Rect exacto. Luego lee esas posiciones con pdf-lib
 * y las elimina del PDF final. Cero aproximación viewport→PDF.
 */
export async function convertHtmlToPdfWithSignaturePositions(
  htmlContent: string,
  pdfOptions?: PDFOptions
): Promise<{ pdf: Buffer; signaturePositions: SignaturePosition[] }> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const opts = pdfOptions || DEFAULT_PDF_OPTIONS;

    const MM_TO_PX = 96 / 25.4;
    const contentWidthPx =
      A4_WIDTH_PX -
      parseFloat(String(opts.margin?.left || "0")) * MM_TO_PX -
      parseFloat(String(opts.margin?.right || "0")) * MM_TO_PX;
    const contentHeightPx =
      A4_HEIGHT_PX -
      parseFloat(String(opts.margin?.top || "0")) * MM_TO_PX -
      parseFloat(String(opts.margin?.bottom || "0")) * MM_TO_PX;

    await page.setViewport({
      width: Math.round(contentWidthPx),
      height: Math.round(contentHeightPx),
    });
    await page.emulateMediaType("print");

    const pageStyleTag = `<style>@page { size: 210mm 297mm; margin: 20mm; }</style>`;
    await page.setContent(pageStyleTag + htmlContent, {
      waitUntil: "networkidle0",
    });

    // Inject child <a> inside each .firma-espacio covering 100% of its area.
    // The <a> follows the same page-break behavior as its parent, so Puppeteer
    // creates a Link annotation with the exact position on the correct page.
    // (istanbul ignore: Puppeteer serializes the function; coverage counters
    // injected by jest do not exist inside the page.)
    await page.evaluate(
      /* istanbul ignore next */ () => {
        const sigEls = document.querySelectorAll(".firma-espacio");
        sigEls.forEach((el, i) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.position = "relative";
          const a = document.createElement("a");
          a.href = "https://sig.internal/" + i;
          a.textContent = " ";
          a.style.cssText =
            "position:absolute;top:0;left:0;width:100%;height:100%;color:transparent;text-decoration:none;outline:none;display:block";
          htmlEl.appendChild(a);
        });
      }
    );

    const pdfBytes = await page.pdf(opts);

    // Extract exact annotation coordinates from the generated PDF.
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pdfPages = pdfDoc.getPages();
    const signaturePositions: SignaturePosition[] = [];

    for (let pageIdx = 0; pageIdx < pdfPages.length; pageIdx++) {
      const pdfPage = pdfPages[pageIdx];
      const { width: pw, height: ph } = pdfPage.getSize();

      const annotsObj = pdfPage.node.lookup(PDFName.of("Annots"));
      if (!(annotsObj instanceof PDFArray)) continue;

      for (let a = 0; a < annotsObj.size(); a++) {
        const annot = pdfDoc.context.lookup(annotsObj.get(a));
        if (!(annot instanceof PDFDict)) continue;

        const subtype = annot.get(PDFName.of("Subtype"));
        if (!subtype || subtype.toString() !== "/Link") continue;

        const action = annot.lookup(PDFName.of("A"));
        if (!(action instanceof PDFDict)) continue;

        const uriObj = action.get(PDFName.of("URI"));
        if (!uriObj) continue;
        const uriStr =
          uriObj instanceof PDFString || uriObj instanceof PDFHexString
            ? uriObj.decodeText()
            : "";

        const m = uriStr.match(/^https:\/\/sig\.internal\/(\d+)$/);
        if (!m) continue;

        const rectObj = annot.lookup(PDFName.of("Rect"));
        if (!(rectObj instanceof PDFArray) || rectObj.size() < 4) continue;

        const nums: number[] = [];
        for (let v = 0; v < 4; v++) {
          const n = pdfDoc.context.lookup(rectObj.get(v));
          if (n instanceof PDFNumber) nums.push(n.asNumber());
        }
        if (nums.length < 4) continue;
        const [x1, y1, x2, y2] = nums;

        // PDF coords: bottom-left origin, points.
        // DocuSeal: top-left origin, 0-1 normalized.
        signaturePositions.push({
          page: pageIdx,
          x: x1 / pw,
          y: (ph - y2) / ph,
          w: (x2 - x1) / pw,
          h: (y2 - y1) / ph,
          signerIndex: parseInt(m[1], 10),
        });
      }
    }

    signaturePositions.sort((a, b) => a.signerIndex - b.signerIndex);

    // Strip sig annotations to produce a clean PDF: from the pages, from the
    // file and from the tagged structure (a page-only strip leaves them behind).
    removeInternalLinks(pdfDoc, ["https://sig.internal/"]);

    const cleanPdf = await pdfDoc.save();
    return { pdf: Buffer.from(cleanPdf), signaturePositions };
  } catch (error) {
    console.error("Error al generar PDF con posiciones de firma:", error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// Captura de campos: vive en su propio módulo (que importa launchBrowser y
// DEFAULT_PDF_OPTIONS de acá) y se reexporta para que se use desde un solo lugar.
export {
  convertHtmlToPdfWithPositions,
  FIELD_LINK_PREFIX,
} from "./htmlToPdfWithPositions";
export type { FieldOccurrence, FieldRect } from "./htmlToPdfWithPositions";
