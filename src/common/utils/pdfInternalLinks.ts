import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFRef,
  PDFString,
} from "pdf-lib";

const ANNOTS = PDFName.of("Annots");
const SUBTYPE = PDFName.of("Subtype");
const LINK = PDFName.of("Link");
const SPAN = PDFName.of("Span");
const ACTION = PDFName.of("A");
const URI = PDFName.of("URI");
const TYPE = PDFName.of("Type");
const OBJR = PDFName.of("OBJR");
const OBJ = PDFName.of("Obj");
const KIDS = PDFName.of("K");
const STRUCTURE_TYPE = PDFName.of("S");
const STRUCT_TREE_ROOT = PDFName.of("StructTreeRoot");

/**
 * URI de una anotación de link, o `undefined` si el objeto no es un link con
 * una acción URI.
 */
export function linkAnnotationUri(
  annot: PDFObject | undefined
): string | undefined {
  if (!(annot instanceof PDFDict)) return undefined;
  if (annot.get(SUBTYPE) !== LINK) return undefined;
  const action = annot.lookup(ACTION);
  if (!(action instanceof PDFDict)) return undefined;
  const uri = action.lookup(URI);
  if (uri instanceof PDFString || uri instanceof PDFHexString)
    return uri.decodeText();
  return undefined;
}

/**
 * Elimina del PDF las anotaciones de link cuya URI empieza con alguno de los
 * prefijos, sin dejar rastro en el archivo.
 *
 * Sacarlas del `/Annots` de la página no alcanza: Puppeteer genera PDFs
 * etiquetados y la estructura de accesibilidad conserva un elemento `/Link`
 * que apunta a cada anotación (un `OBJR`), así que el objeto sigue en el
 * archivo. Por eso, además:
 * - se borra cada objeto de anotación (y su acción, si es un objeto aparte);
 * - en la estructura, los `/Link` que la referenciaban pasan a `/Span` y
 *   pierden esos `OBJR`.
 *
 * Chromium no pone `/StructParent` en las anotaciones de link, así que el
 * `ParentTree` no las referencia y no hay que tocarlo.
 *
 * Límite conocido: el `/Annots` de la página se reemplaza por un array
 * directo nuevo. Si fuera un objeto indirecto, el viejo quedaría huérfano en
 * el archivo, con referencias colgadas; Chromium lo escribe directo. Lo
 * robusto sería modificar el array en su lugar.
 *
 * Devuelve la cantidad de anotaciones eliminadas.
 */
export function removeInternalLinks(
  pdfDoc: PDFDocument,
  uriPrefixes: string[]
): number {
  const { context } = pdfDoc;
  const isInternal = (annot: PDFObject | undefined): boolean => {
    const uri = linkAnnotationUri(annot);
    return (
      uri !== undefined && uriPrefixes.some((prefix) => uri.startsWith(prefix))
    );
  };

  const removedRefs = new Set<PDFRef>();
  let removed = 0;
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.lookup(ANNOTS);
    if (!(annots instanceof PDFArray)) continue;
    const kept = PDFArray.withContext(context);
    for (const entry of annots.asArray()) {
      if (!isInternal(context.lookup(entry))) {
        kept.push(entry);
        continue;
      }
      removed++;
      if (entry instanceof PDFRef) removedRefs.add(entry);
    }
    if (kept.size() === annots.size()) continue;
    if (kept.size() === 0) page.node.delete(ANNOTS);
    else page.node.set(ANNOTS, kept);
  }

  for (const ref of removedRefs) {
    const annot = context.lookup(ref);
    if (annot instanceof PDFDict) {
      const action = annot.get(ACTION);
      if (action instanceof PDFRef) context.delete(action);
    }
    context.delete(ref);
  }

  if (removedRefs.size > 0) retagStructure(pdfDoc, removedRefs);
  return removed;
}

/**
 * Recorre el árbol de estructura: quita los `OBJR` que apuntan a anotaciones
 * eliminadas y convierte en `/Span` los `/Link` que los tenían.
 */
function retagStructure(pdfDoc: PDFDocument, removedRefs: Set<PDFRef>): void {
  const { context } = pdfDoc;
  const root = pdfDoc.catalog.lookup(STRUCT_TREE_ROOT);
  if (!(root instanceof PDFDict)) return;

  const isRemovedObjr = (kid: PDFObject): boolean => {
    const dict = context.lookup(kid);
    if (!(dict instanceof PDFDict) || dict.get(TYPE) !== OBJR) return false;
    const target = dict.get(OBJ);
    return target instanceof PDFRef && removedRefs.has(target);
  };
  const dropObjr = (kid: PDFObject): void => {
    if (kid instanceof PDFRef) context.delete(kid);
  };

  const visited = new Set<PDFObject>();
  const visit = (node: PDFObject): void => {
    const resolved = context.lookup(node);
    if (resolved === undefined || visited.has(resolved)) return;
    visited.add(resolved);
    if (resolved instanceof PDFArray) {
      resolved.asArray().forEach(visit);
      return;
    }
    if (!(resolved instanceof PDFDict)) return;

    let touched = false;
    const kids = resolved.lookup(KIDS);
    if (kids instanceof PDFArray) {
      for (let i = kids.size() - 1; i >= 0; i--) {
        const kid = kids.get(i);
        if (isRemovedObjr(kid)) {
          dropObjr(kid);
          kids.remove(i);
          touched = true;
        } else {
          visit(kid);
        }
      }
      if (touched && kids.size() === 0) resolved.delete(KIDS);
    } else {
      const kid = resolved.get(KIDS);
      if (kid !== undefined && isRemovedObjr(kid)) {
        dropObjr(kid);
        resolved.delete(KIDS);
        touched = true;
      } else if (kid !== undefined) {
        visit(kid);
      }
    }
    if (touched && resolved.get(STRUCTURE_TYPE) === LINK)
      resolved.set(STRUCTURE_TYPE, SPAN);
  };

  const topKids = root.get(KIDS);
  if (topKids !== undefined) visit(topKids);
}
