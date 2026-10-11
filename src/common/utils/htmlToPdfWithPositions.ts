import { Page, PDFOptions } from "puppeteer";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { DEFAULT_PDF_OPTIONS, launchBrowser } from "./htmlToPdf";
import type { SignaturePosition } from "./htmlToPdf";
import { linkAnnotationUri, removeInternalLinks } from "./pdfInternalLinks";

/** Rectángulo normalizado como `SignaturePosition`: página desde 0, origen arriba a la izquierda, 0-1. */
export interface FieldRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Una aparición impresa de un campo marcado. */
export interface FieldOccurrence {
  key: string;
  text: string;
  rects: FieldRect[];
}

export const FIELD_LINK_PREFIX = "https://fld.internal/";
const SIGNATURE_LINK_PREFIX = "https://sig.internal/";

// A4 at 96 CSS DPI: 794 × 1123 px (igual que htmlToPdf.ts).
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const MM_TO_PX = 96 / 25.4;
const PAGE_STYLE_TAG = `<style>@page { size: 210mm 297mm; margin: 20mm; }</style>`;
const FIELD_MARKER = /<!--f:\d+ [\s\S]*?-->|<!--\/f:\d+-->/g;

/** Lo que devuelve la conversión de marcas dentro de la página. */
interface MarkerConversion {
  occurrences: { id: number; key: string; text: string }[];
  textNodes: number;
  moved: number;
  firstMoved: string | null;
}

/**
 * Convierte HTML con marcas de campo (`<!--f:N clave-->valor<!--/f:N-->`) en un
 * PDF y devuelve, además de las posiciones de firma, dónde quedó impresa cada
 * aparición de cada campo.
 *
 * Las marcas se convierten en links invisibles a `FIELD_LINK_PREFIX + N`;
 * Chromium genera una anotación con el rectángulo exacto de cada línea, en la
 * página correcta. Si envolver el texto en links movió algún nodo de texto, se
 * recarga el HTML sin marcas y el PDF sale sin campos, con
 * `fieldsDiscardedReason`. Los links internos (campos y firmas) se eliminan del
 * archivo por completo antes de devolverlo.
 */
export async function convertHtmlToPdfWithPositions(
  html: string,
  pdfOptions?: PDFOptions
): Promise<{
  pdf: Buffer;
  signaturePositions: SignaturePosition[];
  fields: FieldOccurrence[];
  fieldsDiscardedReason?: string;
}> {
  const opts = pdfOptions || DEFAULT_PDF_OPTIONS;
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport(printViewport(opts));
    await page.emulateMediaType("print");
    await page.setContent(PAGE_STYLE_TAG + html, { waitUntil: "networkidle0" });

    const conversion = (await page.evaluate(
      `${CONVERT_FIELD_MARKERS}(${JSON.stringify(FIELD_LINK_PREFIX)})`
    )) as MarkerConversion;
    let occurrences = conversion.occurrences;
    let fieldsDiscardedReason: string | undefined;
    if (conversion.moved > 0) {
      fieldsDiscardedReason =
        `El texto se movió al convertir las marcas en links: ` +
        `${conversion.moved} de ${conversion.textNodes} nodos de texto ` +
        `(el primero, dentro de <${conversion.firstMoved}>)`;
      occurrences = [];
      await page.setContent(PAGE_STYLE_TAG + html.replace(FIELD_MARKER, ""), {
        waitUntil: "networkidle0",
      });
    }

    await injectSignatureLinks(page);
    const pdfBytes = await page.pdf(opts);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const signaturePositions: SignaturePosition[] = [];
    readLinkRects(pdfDoc, SIGNATURE_LINK_PREFIX).forEach(
      (rects, signerIndex) => {
        rects.forEach((rect) =>
          signaturePositions.push({ ...rect, signerIndex })
        );
      }
    );
    signaturePositions.sort((a, b) => a.signerIndex - b.signerIndex);

    const fieldRects = readLinkRects(pdfDoc, FIELD_LINK_PREFIX);
    const fields: FieldOccurrence[] = occurrences
      .slice()
      .sort((a, b) => a.id - b.id)
      .map((o) => ({
        key: o.key,
        text: o.text,
        rects: fieldRects.get(o.id) ?? [],
      }))
      .filter((o) => o.rects.length > 0);

    removeInternalLinks(pdfDoc, [FIELD_LINK_PREFIX, SIGNATURE_LINK_PREFIX]);
    const pdf = Buffer.from(await pdfDoc.save());

    const result: {
      pdf: Buffer;
      signaturePositions: SignaturePosition[];
      fields: FieldOccurrence[];
      fieldsDiscardedReason?: string;
    } = { pdf, signaturePositions, fields };
    if (fieldsDiscardedReason !== undefined)
      result.fieldsDiscardedReason = fieldsDiscardedReason;
    return result;
  } catch (error) {
    console.error("Error al generar PDF con posiciones de campos:", error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

/** Mismo viewport que `convertHtmlToPdfWithSignaturePositions`: el área útil de la página. */
function printViewport(opts: PDFOptions): { width: number; height: number } {
  const mm = (value: string | number | undefined): number =>
    parseFloat(String(value || "0")) * MM_TO_PX;
  return {
    width: Math.round(
      A4_WIDTH_PX - mm(opts.margin?.left) - mm(opts.margin?.right)
    ),
    height: Math.round(
      A4_HEIGHT_PX - mm(opts.margin?.top) - mm(opts.margin?.bottom)
    ),
  };
}

/** Igual que `convertHtmlToPdfWithSignaturePositions`: un link que cubre cada `.firma-espacio`. */
async function injectSignatureLinks(page: Page): Promise<void> {
  await page.evaluate(
    /* istanbul ignore next */
    (prefix: string) => {
      const sigEls = document.querySelectorAll(".firma-espacio");
      sigEls.forEach((el, i) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.position = "relative";
        const a = document.createElement("a");
        a.href = prefix + i;
        a.textContent = " ";
        a.style.cssText =
          "position:absolute;top:0;left:0;width:100%;height:100%;color:transparent;text-decoration:none;outline:none;display:block";
        htmlEl.appendChild(a);
      });
    },
    SIGNATURE_LINK_PREFIX
  );
}

/**
 * Rectángulos de los links cuya URI es `prefix + N`, agrupados por N, en el
 * orden de las páginas. Se normalizan igual que `SignaturePosition`.
 */
function readLinkRects(
  pdfDoc: PDFDocument,
  prefix: string
): Map<number, FieldRect[]> {
  const byId = new Map<number, FieldRect[]>();
  pdfDoc.getPages().forEach((pdfPage, pageIndex) => {
    const { width: pw, height: ph } = pdfPage.getSize();
    const annots = pdfPage.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) return;
    for (const entry of annots.asArray()) {
      const annot = pdfDoc.context.lookup(entry);
      const uri = linkAnnotationUri(annot);
      if (uri === undefined || !uri.startsWith(prefix)) continue;
      const suffix = uri.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      const rect = (annot as PDFDict).lookup(PDFName.of("Rect"));
      if (!(rect instanceof PDFArray) || rect.size() < 4) continue;
      const nums = rect
        .asArray()
        .slice(0, 4)
        .map((n) => pdfDoc.context.lookup(n))
        .filter((n): n is PDFNumber => n instanceof PDFNumber)
        .map((n) => n.asNumber());
      if (nums.length < 4) continue;
      const x1 = Math.min(nums[0], nums[2]);
      const x2 = Math.max(nums[0], nums[2]);
      const y1 = Math.min(nums[1], nums[3]);
      const y2 = Math.max(nums[1], nums[3]);
      const id = parseInt(suffix, 10);
      const rects = byId.get(id) ?? [];
      rects.push({
        page: pageIndex,
        x: x1 / pw,
        y: (ph - y2) / ph,
        w: (x2 - x1) / pw,
        h: (y2 - y1) / ph,
      });
      byId.set(id, rects);
    }
  });
  return byId;
}

/**
 * Conversión de marcas. Corre dentro de la página y va como texto, no como
 * función: Puppeteer serializa las funciones, y cualquier transformación del
 * código las rompe adentro de la página. El bundle de producción (esbuild con
 * `keepNames`) agrega llamadas a `__name`, la cobertura de jest agrega
 * contadores y TypeScript puede agregar helpers; en la página no existe
 * ninguno. Un string no lo toca nadie.
 *
 * 1. Toma los `getClientRects()` de todos los nodos de texto.
 * 2. Empareja las marcas por número, buscándolas en todo el documento (una
 *    marca que sigue a un `<style>` inicial abre en `<head>`). Un número que
 *    aparece en más de una apertura o en más de un cierre no es del render
 *    (un valor `| safe` que trae marcas): sus pares se descartan.
 * 3. Recorre cada par de la marca de apertura a la de cierre (el `Range` del
 *    par): envuelve cada nodo de texto con contenido en un link a
 *    `linkPrefix + N` y arma el texto de la aparición con todos los nodos de
 *    texto, con un espacio entre bloques y en cada `<br>`. El texto de los
 *    elementos de texto crudo (los mismos que `RAW_TEXT_ELEMENTS` del render,
 *    más `svg`) no cuenta ni se envuelve.
 * 4. Borra las marcas y vuelve a medir los mismos nodos. Del primero que se
 *    movió informa solo el elemento que lo contiene (`div.clase`), no el
 *    texto: el motivo va al log y el texto es del contrato.
 *
 * Límites conocidos:
 * - La comparación del paso 4 es de geometría. CSS de la plantilla que solo
 *   pinta un `a` (`a { background }`, `outline`, `color … !important`, el
 *   `a[href]:after` de una hoja de impresión) cambia el PDF sin descartar los
 *   campos. Arreglarlo es un reset más fuerte en el link o comparar algunas
 *   propiedades de pintura antes y después.
 * - No espera `document.fonts.ready` antes de la primera medición: con
 *   fuentes web que cargan tarde, el texto podría moverse entre las dos
 *   mediciones y descartar los campos sin necesidad.
 *
 * Devuelve un `MarkerConversion`.
 */
const CONVERT_FIELD_MARKERS = String.raw`(function (linkPrefix) {
  function measure(nodes) {
    return nodes.map(function (node) {
      var range = document.createRange();
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      var parts = [];
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        parts.push(r.x + "," + r.y + "," + r.width + "," + r.height);
      }
      return parts.join(";");
    });
  }

  function describe(el) {
    if (!el) return "?";
    var name = el.tagName.toLowerCase();
    var cls = typeof el.className === "string" ? el.className.trim() : "";
    return cls ? name + "." + cls.split(/\s+/).join(".") : name;
  }

  function blockOf(node) {
    var el = node.parentElement;
    while (el) {
      var display = getComputedStyle(el).display;
      if (display !== "inline" && display !== "contents") return el;
      el = el.parentElement;
    }
    return null;
  }

  var textNodes = [];
  var textWalker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
  for (var t = textWalker.nextNode(); t; t = textWalker.nextNode()) textNodes.push(t);
  var before = measure(textNodes);

  var openRe = /^f:(\d+) ([\s\S]+)$/;
  var closeRe = /^\/f:(\d+)$/;
  var markers = [];
  var open = new Map();
  var pairs = [];
  var openings = new Map();
  var closings = new Map();
  var count = function (counts, id) {
    counts.set(id, (counts.get(id) || 0) + 1);
  };
  var commentWalker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  for (var c = commentWalker.nextNode(); c; c = commentWalker.nextNode()) {
    var opening = openRe.exec(c.data);
    if (opening) {
      markers.push(c);
      count(openings, Number(opening[1]));
      if (!open.has(opening[1])) open.set(opening[1], { key: opening[2], node: c });
      continue;
    }
    var closing = closeRe.exec(c.data);
    if (!closing) continue;
    markers.push(c);
    count(closings, Number(closing[1]));
    var start = open.get(closing[1]);
    if (!start) continue;
    open.delete(closing[1]);
    pairs.push({ id: Number(closing[1]), key: start.key, open: start.node, close: c });
  }
  pairs = pairs.filter(function (pair) {
    return openings.get(pair.id) === 1 && closings.get(pair.id) === 1;
  });

  var RAW_TEXT =
    "style,script,title,textarea,xmp,iframe,noembed,noframes,noscript,plaintext,svg";
  var occurrences = [];
  pairs.forEach(function (pair) {
    var walker = document.createTreeWalker(
      document,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
    );
    walker.currentNode = pair.open;
    var pieces = [];
    var toWrap = [];
    var lastBlock;
    var seenText = false;
    for (var n = walker.nextNode(); n && n !== pair.close; n = walker.nextNode()) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.tagName === "BR") pieces.push(" ");
        continue;
      }
      if (n.nodeType !== Node.TEXT_NODE) continue;
      if (n.parentElement && n.parentElement.closest(RAW_TEXT)) continue;
      var block = blockOf(n);
      if (seenText && block !== lastBlock) pieces.push(" ");
      seenText = true;
      lastBlock = block;
      pieces.push(n.data);
      if (n.data.trim() !== "") toWrap.push(n);
    }
    if (toWrap.length === 0) return;
    toWrap.forEach(function (text) {
      var link = document.createElement("a");
      link.setAttribute("href", linkPrefix + pair.id);
      link.setAttribute("style", "color:inherit;text-decoration:inherit");
      text.parentNode.insertBefore(link, text);
      link.appendChild(text);
    });
    occurrences.push({
      id: pair.id,
      key: pair.key,
      text: pieces.join("").replace(/\s+/g, " ").trim()
    });
  });
  markers.forEach(function (marker) {
    marker.remove();
  });

  var after = measure(textNodes);
  var moved = 0;
  var firstMoved = null;
  for (var k = 0; k < textNodes.length; k++) {
    if (before[k] === after[k]) continue;
    moved++;
    if (firstMoved === null) firstMoved = describe(textNodes[k].parentElement);
  }
  return { occurrences: occurrences, textNodes: textNodes.length, moved: moved, firstMoved: firstMoved };
})`;
