// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import puppeteer from "puppeteer";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFRef,
  PDFStream,
  PDFString,
} from "pdf-lib";
import {
  linkAnnotationUri,
  removeInternalLinks,
} from "../../../src/common/utils/pdfInternalLinks";

jest.setTimeout(60000);

const FIELD = "https://fld.internal/";
const SIGNATURE = "https://sig.internal/";

/** Todos los strings de todos los objetos indirectos del archivo. */
function allStrings(doc: PDFDocument): string[] {
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

/** Elementos de estructura (`/StructElem`) del archivo. */
function structElems(doc: PDFDocument): PDFDict[] {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .filter(
      (obj): obj is PDFDict =>
        obj instanceof PDFDict &&
        obj.get(PDFName.of("Type")) === PDFName.of("StructElem")
    );
}

function kidsOf(elem: PDFDict): PDFObject[] {
  const kids = elem.lookup(PDFName.of("K"));
  if (kids instanceof PDFArray) return kids.asArray();
  const kid = elem.get(PDFName.of("K"));
  return kid === undefined ? [] : [kid];
}

/** Destinos (`/Obj`) de los OBJR de un elemento de estructura. */
function objrTargets(doc: PDFDocument, elem: PDFDict): PDFRef[] {
  return kidsOf(elem)
    .map((kid) => doc.context.lookup(kid))
    .filter(
      (kid): kid is PDFDict =>
        kid instanceof PDFDict &&
        kid.get(PDFName.of("Type")) === PDFName.of("OBJR")
    )
    .map((objr) => objr.get(PDFName.of("Obj")))
    .filter((target): target is PDFRef => target instanceof PDFRef);
}

function pageLinkUris(doc: PDFDocument): string[] {
  const uris: string[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(PDFName.of("Annots"));
    if (!(annots instanceof PDFArray)) continue;
    for (const entry of annots.asArray()) {
      const uri = linkAnnotationUri(doc.context.lookup(entry));
      if (uri !== undefined) uris.push(uri);
    }
  }
  return uris;
}

const HTML = `<html><body style="font:12px serif">
  <p>CUIT: <a href="${FIELD}1" style="color:inherit;text-decoration:inherit">20-12345678-9</a></p>
  <p style="width:120px"><a href="${FIELD}2" style="color:inherit;text-decoration:inherit">un valor largo que ocupa varias líneas del párrafo</a></p>
  <p>Real: <a href="https://real.example/">un link de verdad</a></p>
  <p>Parecido: <a href="https://fld.internal.example.com/x">no es interno</a></p>
  <div style="height:1100px"></div>
  <p>Página 2: <a href="${FIELD}3" style="color:inherit;text-decoration:inherit">Juan Pérez</a></p>
  <div class="firma-espacio" style="position:relative;width:200px;height:80px">
    <a href="${SIGNATURE}0" style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;color:transparent"> </a>
  </div>
</body></html>`;

async function chromiumPdf(html: string, tagged: boolean): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", tagged });
  } finally {
    await browser.close();
  }
}

describe("removeInternalLinks", () => {
  let tagged: Uint8Array;
  let untagged: Uint8Array;

  beforeAll(async () => {
    tagged = await chromiumPdf(HTML, true);
    untagged = await chromiumPdf(HTML, false);
  });

  it("parte de un PDF etiquetado con links internos en páginas y estructura", async () => {
    const doc = await PDFDocument.load(tagged);
    const uris = pageLinkUris(doc);
    expect(
      uris.filter((u) => u.startsWith(FIELD)).length
    ).toBeGreaterThanOrEqual(4);
    expect(uris).toContain(`${SIGNATURE}0`);
    const linkElems = structElems(doc).filter(
      (e) => e.get(PDFName.of("S")) === PDFName.of("Link")
    );
    const internalTargets = linkElems
      .flatMap((e) => objrTargets(doc, e))
      .filter((ref) =>
        (linkAnnotationUri(doc.context.lookup(ref)) ?? "").startsWith(FIELD)
      );
    expect(internalTargets.length).toBeGreaterThan(0);
  });

  it("borra los objetos, los saca de las páginas y retaguea la estructura", async () => {
    const doc = await PDFDocument.load(tagged);
    const expected = pageLinkUris(doc).filter(
      (u) => u.startsWith(FIELD) || u.startsWith(SIGNATURE)
    ).length;

    const removed = removeInternalLinks(doc, [FIELD, SIGNATURE]);
    expect(removed).toBe(expected);

    const saved = await PDFDocument.load(await doc.save());
    const strings = allStrings(saved);
    expect(
      strings.filter((s) => s.startsWith(FIELD) || s.startsWith(SIGNATURE))
    ).toEqual([]);
    expect(strings).toContain("https://real.example/");
    expect(strings).toContain("https://fld.internal.example.com/x");
    expect(pageLinkUris(saved).sort()).toEqual([
      "https://fld.internal.example.com/x",
      "https://real.example/",
    ]);
    expect(saved.getPageCount()).toBe(
      (await PDFDocument.load(tagged)).getPageCount()
    );

    // Ningún OBJR apunta a un objeto borrado y cada /Link que queda es un link real.
    for (const elem of structElems(saved)) {
      for (const target of objrTargets(saved, elem)) {
        expect(saved.context.lookup(target)).toBeInstanceOf(PDFDict);
      }
      if (elem.get(PDFName.of("S")) === PDFName.of("Link")) {
        const uris = objrTargets(saved, elem).map((t) =>
          linkAnnotationUri(saved.context.lookup(t))
        );
        expect(uris.length).toBeGreaterThan(0);
        uris.forEach((u) =>
          expect(u === undefined || u.startsWith(FIELD)).toBe(false)
        );
      }
    }
    expect(
      structElems(saved).some(
        (e) => e.get(PDFName.of("S")) === PDFName.of("Span")
      )
    ).toBe(true);
  });

  it("no toca nada si ningún link coincide", async () => {
    const doc = await PDFDocument.load(tagged);
    const before = pageLinkUris(doc);
    expect(removeInternalLinks(doc, ["https://nada.internal/"])).toBe(0);
    const saved = await PDFDocument.load(await doc.save());
    expect(pageLinkUris(saved)).toEqual(before);
  });

  it("funciona con un PDF sin etiquetar", async () => {
    const doc = await PDFDocument.load(untagged);
    expect(doc.catalog.get(PDFName.of("StructTreeRoot"))).toBeUndefined();
    const expected = pageLinkUris(doc).filter(
      (u) => u.startsWith(FIELD) || u.startsWith(SIGNATURE)
    ).length;
    expect(expected).toBeGreaterThanOrEqual(5);
    expect(removeInternalLinks(doc, [FIELD, SIGNATURE])).toBe(expected);
    const saved = await PDFDocument.load(await doc.save());
    expect(
      allStrings(saved).filter(
        (s) => s.startsWith(FIELD) || s.startsWith(SIGNATURE)
      )
    ).toEqual([]);
    expect(pageLinkUris(saved).sort()).toEqual([
      "https://fld.internal.example.com/x",
      "https://real.example/",
    ]);
  });
});
