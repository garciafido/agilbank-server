/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Composición de la rampa tipográfica (h1..button) desde las escalas crudas.
 *
 * Que el esquema de origen emita tamaños, alturas y pesos SUELTOS **no es un
 * hueco: es una decisión**, y conviene no confundirlas. Matu lo dejó dicho:
 * `h1..h6` responden a la **jerarquía de lectura** para accesibilidad, no a
 * tamaño. Un `h3` puede medir una cosa en el título de una tarjeta y otra en un
 * subtítulo; atar "h2 = siempre este tamaño y este peso" es atarse.
 *
 * Entonces por qué existe esta tabla: **MUI exige la rampa compuesta**. Su tema
 * tiene `typography.h1..h6` y no admite "los ingredientes sueltos". Lo que se
 * compone acá es un **default nuestro**, no la intención del esquema — y por eso
 * la tabla vive en un solo lugar, como dato, en vez de repartida.
 *
 * DEUDA (la parte que todavía duele): hoy no hay forma de pedir un tamaño sin
 * pedir un nivel semántico. Si el título de una tarjeta necesita 20px, la única
 * vía es `variant="h3"` — y en MUI eso **emite un `<h3>` real**, con lo que el
 * componente se declara nivel 3 del documento sin quererlo y rompe el esquema
 * para quien usa un lector de pantalla. La salida correcta es doble: exponer la
 * escala cruda junto a la rampa, y usar `variant` para el aspecto con
 * `component` para la semántica (`<Typography variant="h3" component="h2">`).
 *
 * La primera mitad: `Primitives.typographyIngredients` (`../types.ts`) lleva
 * los mismos `fontSize`/`lineHeight`/`fontWeight` de acá, sin componer a
 * nivel. La llena `matuToPreset` (`adapter.ts`) para el preset tokenizado; los
 * presets derivados no tienen una escala de origen de la que salga, así que
 * ahí queda ausente. La segunda mitad: el ejemplo del par `variant`+
 * `component` desacoplado, en la galería (`gallery/catalog.ts`, entrada
 * `tipografia-escala-semantica`).
 *
 * Los tamaños salen en `rem` (px/16) para quedar en el mismo formato que el
 * `TypographyScale` que el resto del sistema ya produce.
 */

import { TypographyScale } from "./types";

/** px → rem con base 16. Exportado porque el adaptador compone los mismos tamaños. */
export const rem = (px: number) =>
  `${Math.round((px / 16) * 10000) / 10000}rem`;

/**
 * El inverso, para volver a los px cuando hay que RECOMPONER la rampa —la
 * densidad, que multiplica la escala entera (`resolve.ts`)—. Los ingredientes
 * viajan en rem porque el cliente los consume así, y `composeRamp` pide px:
 * alguien tiene que deshacer la conversión, y es mejor que sea la pieza que la
 * hizo. No pierde nada: todo px entero dividido por 16 cae en cuatro decimales
 * exactos (1/16 = 0.0625), que es la precisión que `rem` conserva.
 */
export const px = (valor: string) => parseFloat(valor) * 16;

export interface RampScales {
  /** Tamaños en px, por nombre de token (`text-32` → 32). */
  fontSize: Record<string, number>;
  /** Alturas de línea como ratio unitless (`line-height-120` → 1.2). */
  lineHeight: Record<string, number>;
}

/** Un tamaño/altura por nombre, con un mensaje claro si el token falta. */
function need(map: Record<string, number>, name: string, kind: string): number {
  const v = map[name];
  if (v === undefined)
    throw new Error(
      `La rampa tipográfica necesita ${kind} "${name}", ausente en el tema.`
    );
  return v;
}

/**
 * La tabla rol→escalón. Es la decisión de diseño que Matu deja sin tomar: qué
 * tamaño y qué altura le toca a cada nivel. Calibrada contra la rampa que el
 * sistema ya usaba (h1 2rem/1.2, cuerpo 1.7), no inventada.
 */
export function composeRamp(
  scales: RampScales,
  fontFamily: string,
  buttonWeight = 500,
  /**
   * Las familias de título y botón, cuando el corpus las distingue.
   *
   * Viajan hasta el tema pero NO las consume nadie todavía: honrar la
   * distinción es una decisión pendiente con Matu (ver `adapter.ts`), y hasta
   * que conteste el valor está disponible sin cambiarle la cara a nada.
   */
  titulo = fontFamily,
  boton = fontFamily
): TypographyScale {
  const fs = (name: string) => rem(need(scales.fontSize, name, "el tamaño"));
  const lh = (name: string) =>
    need(scales.lineHeight, name, "la altura de línea");

  return {
    fontFamily,
    titleFontFamily: titulo,
    buttonFontFamily: boton,
    weights: [400, 500, 600, 700],
    h1: {
      fontWeight: 600,
      fontSize: fs("text-32"),
      lineHeight: lh("line-height-120"),
    },
    h2: {
      fontWeight: 600,
      fontSize: fs("text-24"),
      lineHeight: lh("line-height-120"),
    },
    h3: {
      fontWeight: 600,
      fontSize: fs("text-20"),
      lineHeight: lh("line-height-130"),
    },
    h4: {
      fontWeight: 500,
      fontSize: fs("text-18"),
      lineHeight: lh("line-height-130"),
    },
    h5: {
      fontWeight: 500,
      fontSize: fs("text-16"),
      lineHeight: lh("line-height-150"),
    },
    h6: {
      fontWeight: 500,
      fontSize: fs("text-14"),
      lineHeight: lh("line-height-150"),
    },
    body1: {
      fontWeight: 400,
      fontSize: fs("text-16"),
      lineHeight: lh("line-height-170"),
    },
    body2: {
      fontWeight: 400,
      fontSize: fs("text-14"),
      lineHeight: lh("line-height-150"),
    },
    subtitle1: { fontWeight: 500, lineHeight: lh("line-height-150") },
    subtitle2: { fontWeight: 400, lineHeight: lh("line-height-150") },
    button: { fontWeight: buttonWeight, textTransform: "none" },
  };
}
