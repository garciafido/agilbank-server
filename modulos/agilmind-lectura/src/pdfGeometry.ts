// La geometría del texto del PDF: una caja por palabra, sin pasar por el OCR.
//
// ── El problema que resuelve ──
//
// El localizador liga cada campo a una caja usando `OcrWord.start/end`, que son
// offsets de caracteres dentro del texto que se le pasó. Esas palabras salían
// SOLO del OCR. Y el OCR es el camino de RESPALDO: se recorre nada más que
// cuando la capa de texto del PDF rindió poco.
//
// La consecuencia es una paradoja que estuvo activa hasta el 22-08-2026: cuanto
// mejor se leía un documento, menos se podía inspeccionar. Un comprobante
// electrónico con capa de texto limpia —el 63% del corpus— se leía por texto,
// nunca pasaba por el OCR, y por lo tanto no producía ni una caja. El visor de
// la mesa de entrada exige al menos una para abrirse, así que quedaba apagado
// justamente en los documentos que mejor se leen.
//
// ── Por qué NO se reconstruye el texto desde acá ──
//
// `pdftotext -bbox-layout` trae las palabras con su caja, y sería tentador armar
// el texto con ellas. Sería un error: los parsers y los ~40 localizadores están
// medidos contra la salida de `pdftotext -layout`, que rellena con espacios para
// conservar las columnas. Un texto distinto mueve todos esos números a la vez.
//
// Así que el `-layout` sigue siendo la ÚNICA fuente de lo que se parsea, y acá
// solo se ALINEA la geometría contra él. La propiedad que eso garantiza es la
// que hace al cambio seguro: **el texto no cambia, así que ningún valor extraído
// puede cambiar**. Solo aparecen cajas donde antes no había.
//
// ── El alineamiento se hace por LÍNEA, no por palabra ──
//
// La primera versión avanzaba un cursor palabra por palabra. Medido sobre 12
// documentos reales, alineaba el 43%. El diagnóstico descartó la explicación
// obvia: **el 100% de las palabras del `-bbox-layout` está presente en el texto
// del `-layout`**. No falta ninguna. Lo que falla es elegir CUÁL aparición es.
//
// Solo el 10,9% de las palabras aparece una única vez en el documento. El resto
// son cortas y repetidas —`de`, `1`, `A`, `%`— y con un cursor codicioso la
// primera de ellas engancha una aparición muy posterior, arrastra el cursor, y
// desde ahí el 87,4% de las palabras queda "atrás" y no se alinea nunca.
//
// La unidad correcta es la línea. Una línea entera de texto es casi siempre
// única en el documento, así que sirve de ancla: se busca la línea, y recién
// dentro de ella —unos pocos caracteres— se ubican sus palabras. El cursor
// avanza de línea en línea, así que un fallo cuesta esa línea y nada más.
//
// Si una línea no se encuentra se saltea y sus palabras no reciben caja.
// Degrada, no rompe: un campo sin caja es exactamente lo que pasaba antes, y el
// conteo se devuelve para que la pérdida se vea en vez de quedar en silencio.

import type { OcrWord, PageSize } from "./tipos";

interface PalabraConCaja {
  texto: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Una línea del `-bbox-layout`: es la unidad de anclaje del alineamiento. */
interface LineaConCajas {
  palabras: PalabraConCaja[];
  pagina: number;
}

/**
 * Lee las palabras con su caja del XML de `pdftotext -bbox-layout`.
 *
 * Se parsea con expresión regular y no con un parser de XML a propósito: la
 * salida de poppler es plana y regular, y sumar una dependencia de XML para
 * leer tres atributos y un texto no se justifica. El `&amp;` y compañía sí hay
 * que deshacerlos, porque poppler escapa el contenido de `<word>`.
 */
// Exportadas para los tests: el alineamiento es la lógica de este archivo, y
// probarlo a través de `pdfTextGeometry` obligaría a tener un PDF por caso —
// justo los casos que importan (dos columnas, encabezado repetido, línea
// ausente) son incómodos de conseguir y frágiles de mantener como archivo.
// No van al index del módulo: nadie afuera las necesita.
export function lineasDelXml(xml: string): {
  lineas: LineaConCajas[];
  pageWidth: number | null;
  pageHeight: number | null;
  pageSizes: PageSize[];
} {
  const lineas: LineaConCajas[] = [];
  let pageWidth: number | null = null;
  let pageHeight: number | null = null;
  const pageSizes: PageSize[] = [];
  let pagina = 0;
  let actual: LineaConCajas | null = null;

  // Un solo recorrido sobre las tres marcas que importan, en el orden del
  // documento: así la página y la línea salen de la posición y no de anidar
  // expresiones.
  const re =
    /<page width="([\d.]+)" height="([\d.]+)"|<line\b|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) {
      pagina++;
      pageSizes.push({ width: parseFloat(m[1]), height: parseFloat(m[2]) });
      if (pagina === 1) {
        pageWidth = parseFloat(m[1]);
        pageHeight = parseFloat(m[2]);
      }
      continue;
    }
    if (m[3] === undefined) {
      // Abrió una <line>. Se cierra sola al abrir la siguiente.
      actual = { palabras: [], pagina };
      lineas.push(actual);
      continue;
    }
    const texto = desescapar(m[7] ?? "");
    if (!texto || !actual) continue;
    const x1 = parseFloat(m[3]);
    const y1 = parseFloat(m[4]);
    const x2 = parseFloat(m[5]);
    const y2 = parseFloat(m[6]);
    actual.palabras.push({ texto, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  return { lineas: lineas.filter((l) => l.palabras.length), pageWidth, pageHeight, pageSizes };
}

const desescapar = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // El &amp; va último: si fuera primero, "&amp;lt;" se convertiría en "<".
    .replace(/&amp;/g, "&");

/** Las líneas del texto del `-layout`, con el offset donde arranca cada una. */
function lineasDelTexto(texto: string): Array<{ texto: string; offset: number }> {
  const out: Array<{ texto: string; offset: number }> = [];
  let offset = 0;
  for (const linea of texto.split("\n")) {
    if (linea.trim()) out.push({ texto: linea, offset });
    offset += linea.length + 1;
  }
  return out;
}

/**
 * ¿Esta línea del texto contiene las palabras de la línea del bbox, en orden?
 *
 * Devuelve los offsets locales de cada palabra, o null si no calza. Exige el
 * orden y no solo la presencia: dos líneas con las mismas palabras en distinto
 * orden son líneas distintas, y confundirlas pondría cada caja en el lugar de
 * otra.
 */
function calzar(
  lineaTexto: string,
  palabras: PalabraConCaja[],
  ocupados: Array<[number, number]>,
): number[] | null {
  const libre = (a: number, b: number) => !ocupados.some(([x, y]) => a < y && x < b);
  const offsets: number[] = [];
  let cursor = 0;
  for (const p of palabras) {
    let idx = lineaTexto.indexOf(p.texto, cursor);
    // Saltear los tramos ya repartidos en vez de abandonar: la palabra puede
    // estar más adelante en la misma línea.
    while (idx !== -1 && !libre(idx, idx + p.texto.length)) {
      idx = lineaTexto.indexOf(p.texto, idx + 1);
    }
    if (idx === -1) return null;
    offsets.push(idx);
    cursor = idx + p.texto.length;
  }
  return offsets;
}

/**
 * Alinea línea por línea, SIN cursor: por unicidad, y desempatando por cercanía.
 *
 * No hay cursor a propósito, y esto costó dos intentos. El `-bbox-layout` emite
 * bloque por bloque —toda la columna izquierda, después toda la derecha— pero el
 * `-layout` arma una grilla visual donde la primera línea de ambas columnas cae
 * en la MISMA línea de salida. Así que al terminar la primera columna un cursor
 * quedó abajo, y todas las líneas de la segunda están detrás: un cursor que solo
 * avanza las pierde enteras. Medido: 20% de alineamiento, peor que palabra por
 * palabra.
 *
 * El orden de bloques no es el orden de líneas, así que no se usa el orden. Se
 * usa que una línea entera de texto es casi siempre única: se buscan TODAS las
 * líneas del texto que calzan, y se acepta si hay una sola. Cuando hay varias
 * —encabezados de tabla que se repiten, líneas de un solo número— se elige la
 * más cercana a la última aceptada, que es la vecindad correcta con muchísima
 * más frecuencia que cualquier otra.
 */
export function alinear(texto: string, lineas: LineaConCajas[]): { words: OcrWord[]; noAlineadas: number } {
  const delTexto = lineasDelTexto(texto);
  const words: OcrWord[] = [];
  // Qué tramos de cada línea del texto ya se repartieron.
  //
  // Marcar la línea entera como usada no sirve: una línea del `-layout` con dos
  // columnas —"IZQ-UNO      RIGHT-UNO"— tiene que servir a DOS líneas del bbox,
  // una por bloque. Prohibirlo descartaba la columna derecha completa, que es
  // justo el caso que este alineamiento existe para resolver.
  //
  // Un cursor hacia adelante tampoco: el bbox puede emitir el bloque derecho
  // antes que el izquierdo, y entonces el cursor que dejó el derecho bloquea al
  // izquierdo, que está atrás.
  //
  // Lo que de verdad no puede repetirse son los OFFSETS: dos palabras distintas
  // no salen del mismo lugar del texto. Con la lista de tramos ocupados el orden
  // deja de importar, y un encabezado repetido no se queda con las cajas de
  // todas sus copias.
  const ocupadosDe: Array<Array<[number, number]>> = delTexto.map(() => []);
  let ultima = 0;
  let noAlineadas = 0;

  for (const linea of lineas) {
    const candidatos: Array<{ offsets: number[]; indice: number }> = [];
    for (let i = 0; i < delTexto.length; i++) {
      const offsets = calzar(delTexto[i].texto, linea.palabras, ocupadosDe[i]);
      if (offsets) candidatos.push({ offsets, indice: i });
    }
    if (!candidatos.length) {
      noAlineadas += linea.palabras.length;
      continue;
    }
    const elegido =
      candidatos.length === 1
        ? candidatos[0]
        : candidatos.reduce((mejor, c) =>
            Math.abs(c.indice - ultima) < Math.abs(mejor.indice - ultima) ? c : mejor,
          );
    linea.palabras.forEach((p, i) =>
      ocupadosDe[elegido.indice].push([elegido.offsets[i], elegido.offsets[i] + p.texto.length]),
    );
    ultima = elegido.indice;

    const base = delTexto[elegido.indice].offset;
    linea.palabras.forEach((p, i) => {
      const start = base + elegido.offsets[i];
      words.push({
        text: p.texto,
        box: { x: p.x, y: p.y, w: p.w, h: p.h },
        start,
        end: start + p.texto.length,
        page: linea.pagina,
      });
    });
  }
  // El localizador recorre el texto en orden; el bbox las trae en orden de
  // bloque, que como se explicó arriba no coincide.
  words.sort((a, b) => a.start - b.start);
  return { words, noAlineadas };
}
