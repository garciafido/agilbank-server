/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Una marca PROPIA del proyecto, dentro del vocabulario tokenizado de Matu.
 *
 * Lo que hace esto barato es que una marca ahí no es una grilla de capas por
 * roles: las seis capas de `Color Contrast` y los diez roles de `Color Mode` son
 * ejes COMPARTIDOS, idénticos para las seis marcas del corpus. Lo único que
 * cambia de una marca a otra es su escala `Color_0..Color_1000`. Aportando esa
 * escala, el resto del sistema —modos, capas, roles y los cuatro estados, que
 * son su propio eje— ya está.
 *
 * La escala sale de `deriveScale`, la MISMA que usan los presets derivados: la
 * lightness de cada paso la fija el generador y de la semilla salen solo el tono
 * y la croma, que es lo que hace que el contraste de la marca se conozca antes
 * de saber cuál va a ser la semilla.
 *
 * Lo que NO se deriva son los `relationColors` (foco y acentos de hue): son
 * independientes del tono de marca a propósito (ver `MatuColorScheme`), así que
 * los sigue aportando el corpus.
 *
 * Esta marca no entra al corpus. `corpus.ts` es la autoría de Matu; una marca
 * nuestra metida ahí sería indistinguible de las suyas dentro de seis meses.
 * Vive en la configuración del proyecto y se deriva al resolver.
 */

import { Hex, hexToOklch, toGamutHex } from "./color";
import { ColorScale, SCALE_STEPS, deriveScale } from "./scale";
import { ColorToken } from "./matuAuthoring";
import { canonicalHex } from "./matuNormalize";

/**
 * El nombre con el que se muestra una marca propia donde el corpus muestra el
 * suyo. Vive acá y no escrito en cada pantalla porque una lista paralela de
 * nombres se desincroniza en silencio.
 */
export const PROJECT_BRAND_NAME = "Marca del proyecto";

/**
 * Cuánto más oscuro que `Color_950` queda `Color_1000`.
 *
 * Los dos extremos de la escala de Matu —el blanco y el casi-negro teñido— caen
 * fuera de la rampa de once pasos: `Color_0` es literalmente `#ffffff` en las
 * seis marcas del corpus, y `Color_1000` es un escalón más allá del último. Se
 * lo deriva del propio `Color_950` para que conserve su tono y su croma.
 *
 * El factor está medido sobre el corpus: la lightness OKLab de `Color_1000`
 * sobre la de `Color_950` da 0.65..0.74 en cinco de las seis marcas. `Neutral`
 * baja a 0.33 y queda afuera del promedio a propósito — es la marca gris, donde
 * el extremo oscuro se elige por sí mismo y no por continuidad de una rampa.
 */
const DARK_EXTREME = 0.7;

/**
 * Los trece escalones de un `Color Scheme` de Matu desde una semilla.
 *
 * Una semilla que no sea un color CORTA: derivar una marca de algo que no es un
 * color produciría una escala gris sin que nada avise. El mensaje nombra la
 * clave que hay que ir a corregir — antes era un parámetro, porque esta misma
 * derivación alimentaba también el acento; con ese eje fuera hay una sola.
 */
export function brandBaseColors(seed: Hex): Record<string, ColorToken> {
  const field = "theme.base.brand";
  let scale: ColorScale;
  try {
    scale = deriveScale(seed);
  } catch {
    throw new Error(
      `El color de ${field} ("${seed}") no es un color válido.\n` +
        `${field} espera un color en #RGB o #RRGGBB.`
    );
  }

  const color = (hex: Hex): ColorToken => ({
    $type: "color",
    $value: canonicalHex(hex),
  });

  const dark = hexToOklch(scale[950]);

  return {
    Color_0: color("#ffffff"),
    ...Object.fromEntries(
      SCALE_STEPS.map((step) => [`Color_${step}`, color(scale[step])])
    ),
    Color_1000: color(toGamutHex({ ...dark, l: dark.l * DARK_EXTREME })),
  };
}
