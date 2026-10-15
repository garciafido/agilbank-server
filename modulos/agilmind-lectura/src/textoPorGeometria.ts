// El texto reordenado según DÓNDE está cada palabra, no según en qué orden la leyó el OCR.
//
// ── Por qué existe ──
//
// El OCR devuelve dos cosas: un `text` plano y una lista de `words` con caja. El lector
// trabaja sobre el `text`, y ahí está el problema: **el orden de ese texto es el orden en
// que el motor de OCR encontró las palabras, no el orden en que están impresas.**
//
// Medido sobre el caso testigo `marcalba-00349`. La tabla de items del PDF es:
//
//     CODIGO   DESCRIPCION                CANTIDAD    PRECIO       TOTAL
//     22007    HORMIGON ELABORADO H-30     115,000  107312,000  12340880,00
//     22045    OBRA ERYMA Y PREVIAL          1,000       0,000        0,00
//
// y el `text` del OCR la entrega así:
//
//     HORMIGON ELABORADO H-30 115,000 107312,000 12340880.00
//     22007
//     1,000 0,000 0,00
//     22045 OBRAERYMAYPREVIAL
//
// El código se fue a una línea aparte —a veces antes de su fila, a veces después— y en
// dos de las cuatro filas los números quedaron separados de su descripción. Sobre ese
// texto, `parseLineItemsFromText` no puede hacer nada: cosecha números desde el final de
// la línea, así que una línea que es solo un código no da fila, y una que es solo números
// tampoco. Se leían 2 de 4 renglones en la página 1 y 0 de 3 en la página 2.
//
// Agrupando las mismas palabras por su coordenada `y`, las cuatro filas salen enteras y
// en el orden impreso, con el código adelante. No hay heurística: es el layout.
//
// ── Por qué agrupar por `y` y no por otra cosa ──
//
// `modeloDeColumnas.ts` midió la dispersión de los bordes sobre 18 documentos reales: los
// números están alineados a la derecha con 0,21 puntos de dispersión, y el texto da una
// señal diez veces más floja. Eso vale para las COLUMNAS. Para las FILAS la señal es la
// línea de base, que es lo más estable de una tabla impresa: todas las celdas de una fila
// comparten el alto del renglón.
//
// La tolerancia sale de la altura de la propia palabra, no de una constante: un
// comprobante escaneado a 150 DPI y otro a 300 tienen alturas distintas, y una tolerancia
// fija funcionaría en uno y partiría filas en el otro.
//
// ── Lo que NO hace ──
//
// No interpreta ni decide qué es cada columna: reordena. Qué significa cada celda lo
// siguen decidiendo los parsers de siempre, sobre un texto que ahora refleja el papel.
// Y si las palabras no traen caja, devuelve null: sin geometría no hay nada que
// reconstruir, y devolver el texto original disfrazado de reconstruido sería mentir sobre
// la procedencia del dato.

import { pendienteDeLaPagina } from "./inclinacionDeLaPagina";
import type { OcrWord } from "./tipos";

/**
 * Cuánto tienen que solaparse verticalmente dos palabras para ser de la misma fila,
 * como fracción de la altura de la MÁS BAJA de las dos.
 *
 * Se compara el solape de los intervalos [y, y+h] y no la distancia entre las `y`,
 * porque las cajas de una misma fila NO tienen la misma altura ni empiezan a la misma
 * altura. Medido sobre el OCR de tesseract de un comprobante escaneado:
 *
 *   fila de items:   12340880 → y=740 h=22        HORMIGON → y=753 h=18
 *   encabezado:      TOTAJL   → y=712 h=17     DESCRIPCION → y=723 h=18
 *
 * Los dígitos no tienen descendentes y su caja sale más alta y más arriba, así que
 * dentro de una misma fila impresa las `y` difieren hasta 13 puntos — más que la
 * tolerancia que salía de una fracción de la altura, que partía las filas al medio. El
 * solape, en cambio, separa limpio: dentro de la fila va del 35% al 82%, y entre filas
 * vecinas es CERO, porque los intervalos no se tocan.
 *
 * 0,25 queda con margen para los dos lados: bien debajo del 35% que da el peor caso
 * intra-fila, y muy por encima del 0% que dan dos filas distintas.
 */
const SOLAPE_MINIMO = 0.25;

/**
 * Las palabras agrupadas en filas por su coordenada vertical, cada fila ordenada de
 * izquierda a derecha.
 *
 * Se expone además del texto porque quien quiera columnas necesita las cajas, y volver a
 * derivarlas del texto reconstruido sería perderlas para recuperarlas.
 */
export function filasPorGeometria(words: OcrWord[]): OcrWord[][] {
  const conCaja = words.filter(
    (w) => w.box && typeof w.box.y === "number" && typeof w.box.h === "number" && w.box.h > 0 && w.text,
  );
  if (!conCaja.length) return [];

  // Las alturas se comparan ENDEREZADAS: un escaneo inclinado hace que la palabra del
  // final de un renglón caiga más abajo que la del principio del siguiente, y el renglón
  // se parte. Las cajas no se tocan. Ver `inclinacionDeLaPagina.ts`.
  const pendiente = pendienteDeLaPagina(conCaja);
  const alto = (w: OcrWord): number => w.box.y - pendiente * (w.box.x + w.box.w / 2);

  /** Cuánto se solapan verticalmente, como fracción de la altura de la más baja. */
  const solape = (a: OcrWord, b: OcrWord): number => {
    const desde = Math.max(alto(a), alto(b));
    const hasta = Math.min(alto(a) + a.box.h, alto(b) + b.box.h);
    const menor = Math.min(a.box.h, b.box.h);
    return menor > 0 ? Math.max(0, hasta - desde) / menor : 0;
  };

  const ordenadas = [...conCaja].sort((a, b) => alto(a) - alto(b) || a.box.x - b.box.x);
  const filas: OcrWord[][] = [];
  let actual: OcrWord[] = [];
  // La referencia es la PRIMERA palabra de la fila, no la última: comparando contra la
  // última, una fila con palabras que bajan de a poco se estira sin límite y termina
  // absorbiendo la de abajo.
  let referencia: OcrWord | null = null;

  for (const w of ordenadas) {
    if (!referencia) {
      actual = [w];
      referencia = w;
      continue;
    }
    if (solape(referencia, w) >= SOLAPE_MINIMO) {
      actual.push(w);
    } else {
      filas.push(actual.sort((a, b) => a.box.x - b.box.x));
      actual = [w];
      referencia = w;
    }
  }
  if (actual.length) filas.push(actual.sort((a, b) => a.box.x - b.box.x));
  return filas;
}

/**
 * El texto en orden de papel: una línea por fila impresa.
 *
 * Devuelve null si las palabras no traen geometría usable — el llamador se queda con el
 * texto del OCR y el comportamiento es el de antes, exacto.
 */
export function textoPorGeometria(words: OcrWord[] | undefined): string | null {
  if (!words?.length) return null;
  const filas = filasPorGeometria(words);
  if (!filas.length) return null;
  return filas.map((f) => f.map((w) => w.text).join(" ")).join("\n");
}
