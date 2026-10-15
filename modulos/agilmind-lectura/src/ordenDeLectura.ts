// El orden de lectura de lo que detecta PP-OCR: cajas sueltas que se reagrupan en filas, de izquierda a
// derecha, corrigiendo la inclinación del escaneo. Solo transforma datos: no carga ningún modelo.

export interface PaddleWord {
  text: string;
  start: number;
  end: number;
  box: { x: number; y: number; w: number; h: number };
}

/**
 * Reconstruye el ORDEN DE LECTURA desde las cajas detectadas. Ordenar solo
 * por «y» intercala las tablas de los escaneos inclinados: con ~1° de
 * pendiente los números de una fila quedan más arriba que su propia
 * descripción y el texto sale en zigzag — el parser veía una fila basura
 * donde había diecisiete.
 *
 * Tres pasos: (1) la pendiente global del escaneo es la mediana del ángulo
 * de las cajas anchas — cada cuadrilátero trae la suya; (2) el ancla de cada
 * caja es el punto medio de su borde IZQUIERDO proyectado a x=0 con esa
 * pendiente — el borde izquierdo, porque una caja que el detector pegó de
 * más hacia la derecha sigue naciendo donde nace su texto; (3) filas por
 * banda vertical (cadena de anclas a menos de medio renglón), y dentro de
 * cada fila las cajas van de izquierda a derecha.
 */
export function agruparEnOrdenDeLectura(
  lines: Array<{ text: string; box: Array<[number, number]> }>,
  scale = 1,
): { text: string; words: PaddleWord[] } {
  const geo = lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const pts = [...l.box].sort((a, b) => a[0] - b[0]);
      const izq = { x: (pts[0][0] + pts[1][0]) / 2, y: (pts[0][1] + pts[1][1]) / 2 };
      const der = { x: (pts[2][0] + pts[3][0]) / 2, y: (pts[2][1] + pts[3][1]) / 2 };
      return { line: l, izq, der, alto: Math.abs(pts[1][1] - pts[0][1]), ancho: der.x - izq.x, ancla: 0 };
    });
  if (!geo.length) return { text: "", words: [] };

  const mediana = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const pendientes = geo
    .filter((g) => g.ancho > 40 && g.ancho >= 5 * g.alto)
    .map((g) => (g.der.y - g.izq.y) / g.ancho);
  // Menos de tres cajas confiables, o un ángulo absurdo: mejor no corregir.
  let pendiente = pendientes.length >= 3 ? mediana(pendientes) : 0;
  if (Math.abs(pendiente) > 0.1) pendiente = 0;

  for (const g of geo) g.ancla = g.izq.y - pendiente * g.izq.x;
  const umbral = Math.max(8, 0.55 * mediana(geo.map((g) => g.alto)));

  geo.sort((a, b) => a.ancla - b.ancla);
  const filas: Array<typeof geo> = [];
  for (const g of geo) {
    const fila = filas[filas.length - 1];
    if (fila && g.ancla - fila[fila.length - 1].ancla <= umbral) fila.push(g);
    else filas.push([g]);
  }

  let text = "";
  const words: PaddleWord[] = [];
  for (const fila of filas) {
    fila.sort((a, b) => a.izq.x - b.izq.x);
    if (text.length > 0) text += "\n";
    for (const [i, g] of fila.entries()) {
      // Las coordenadas vuelven divididas por el upscale de entrada: la
      // evidencia siempre habla en píxeles de la imagen ORIGINAL.
      const xs = g.line.box.map((p) => p[0] / scale);
      const ys = g.line.box.map((p) => p[1] / scale);
      const lineBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
      if (i > 0) text += " ";
      const lineText = g.line.text.trim();
      const lineStart = text.length;
      text += lineText;

      let cursor = 0;
      for (const token of lineText.split(/\s+/).filter(Boolean)) {
        const at = lineText.indexOf(token, cursor);
        if (at < 0) continue;
        cursor = at + token.length;
        words.push({
          text: token,
          start: lineStart + at,
          end: lineStart + at + token.length,
          box: {
            x: Math.round(lineBox.x + (at / lineText.length) * lineBox.w),
            y: lineBox.y,
            w: Math.max(4, Math.round((token.length / lineText.length) * lineBox.w)),
            h: lineBox.h,
          },
        });
      }
    }
  }
  return { text, words };
}
