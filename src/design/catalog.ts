/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * El catálogo de TEMAS DE FÁBRICA: lo que el sistema ofrece elegir sin que
 * nadie lo escriba.
 *
 * Es DATO del generador, no filas de la base: un tema de fábrica existe en un
 * proyecto recién creado, antes de que haya una entidad `Theme` con nada
 * adentro, y el cliente lo recibe por el kit igual que el resto del módulo de
 * diseño. Elegir uno es guardar SU AUTORÍA —unos pocos campos de JSON— y no un
 * tema resuelto: si mañana el sistema de diseño mejora una derivación, el tema
 * de fábrica mejora con él, que es exactamente lo que no pasaría si se hubiera
 * congelado la salida.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOS CLASES DE ENTRADA, y por qué hacen falta las dos
 *
 * **Coordenadas** (`clase: "coordenada"`). La autoría nombra un preset y nada
 * más: `{v:1, preset:"slate"}`. Son EXACTAS por construcción —resolverlas
 * devuelve los mismos valores que `getPreset(...)`, y `catalog.test.ts` lo
 * comprueba valor por valor para todas— y no tienen ejes que ofrecer,
 * porque un preset no los tiene. Existen para que un esquema único de selección
 * no PIERDA opciones: todos los presets son alcanzables hoy escribiendo
 * `theme.preset` en `hkconfig.json`, y un selector que solo ofreciera
 * combinaciones de Matu los volvería inelegibles. Un vocabulario que unifica
 * quitando no unifica.
 *
 * Hay una coordenada por CADA preset, y el guard que lo comprueba mira las
 * coordenadas y no cualquier `autoria.preset`: las combinaciones declaran
 * `preset: "base"` porque ésa es la puerta para invocar el vocabulario, no
 * porque ofrezcan ese preset. Contarlas taparía justo el caso que pasó — el
 * preset `matu` "cubierto" por tres combinaciones, mientras su combinación
 * estándar no era elegible desde ningún lado.
 *
 * **Combinaciones** (`clase: "combinacion"`). La autoría elige una combinación
 * del sistema de diseño de Matu. Su valor propio es el OPUESTO al de las
 * coordenadas: exponen ejes —marca, acento, tema, superficies— y por eso son
 * puntos de partida que se pueden mover, no destinos. Las que reproducen la
 * semilla de un preset derivado son APROXIMACIONES declaradas: ver abajo. Las
 * demás salen de las marcas del corpus de Matu y no aproximan nada.
 *
 * El campo `clase` está para que la UI sepa qué mostrar: una coordenada no tiene
 * ejes de Matu que ofrecer y una combinación sí. Sin él, la pantalla tendría que
 * deducirlo de la presencia de `autoria.base`, que es la misma información
 * escrita de una forma que no se puede leer sin conocer el gate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Por qué las combinaciones NO llevan el nombre del preset que aproximan
 *
 * Comparten su SEMILLA —que es lo único que un preset derivado tuvo siempre—
 * pero no sus valores: reproducen exacto el tono de marca (`primary.bg`) y casi
 * nada más (3-4 de 176 valores). Las dos derivaciones —la de `scale.ts` y la
 * rampa de once pasos de Matu— coinciden en el escalón principal y divergen en
 * todos los demás. Una combinación llamada "Slate" habría prometido el preset
 * `slate`, que además está en este mismo catálogo y de verdad lo reproduce;
 * "Pizarra" promete el color, que es lo que se conserva.
 *
 * `legacy` no aparece como combinación por lo mismo pero peor: medido contra las
 * que aproximan un preset —todas dan lo mismo—, 147 de sus 166 valores quedan
 * distintos (88,6%), y no en las superficies sino en el
 * `on`/`onMuted`/`border`/`hover` que Matu deriva y que legacy eligió a mano,
 * uno por uno. Combinaciones exploratorias fuera del catálogo bajan ese número
 * unos pocos puntos y ninguna se acerca.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * La inversión de nombres, que es el detalle que más confunde
 *
 * Un preset derivado tiene TRES semillas (`brand`, `accent`, `neutral`) y Matu
 * tiene DOS ejes de color (`brand`, que pinta las superficies, y `accent`). No
 * se llaman igual las cosas que hacen lo mismo:
 *
 *   SEMILLAS[x].neutral  → autoria.base.brand    (las superficies)
 *   SEMILLAS[x].brand    → autoria.base.accent   (el color de marca)
 *   SEMILLAS[x].accent   → no tiene destino
 *
 * O sea: la semilla que se llama `brand` NO va al `brand` de Matu. En un preset
 * derivado el gris de las superficies sale de `neutral` y la marca de `brand`;
 * en Matu el eje que pinta las superficies se llama `brand` y el que pinta la
 * marca, `accent`. La tercera semilla se pierde: Matu no tiene un tercer eje de
 * color, y forzarlo a uno de los estados sería inventar una equivalencia que no
 * existe.
 *
 * El eje `theme` (Cated/Uchi/Human/Tech/Culture) NO lleva color: lleva familia
 * tipográfica, peso del botón y familia y grosor de íconos. `Uchi` es el elegido
 * para las tres, medido contra las primitivas de cada preset — ver el reporte.
 */

import { ThemeAuthoring } from "./applied";
import { PRESETS, SEMILLAS } from "./presets";

/**
 * De qué clase es una entrada, y con eso qué puede ofrecer la pantalla que la
 * muestre. Ver el bloque "DOS CLASES DE ENTRADA" de arriba.
 */
export type ClaseDeTema = "coordenada" | "combinacion";

export interface TemaDeFabrica {
  /** Cómo se ofrece. En castellano: lo lee quien elige, no quien programa. */
  nombre: string;
  clase: ClaseDeTema;
  /**
   * Qué promete y qué no. Viaja con el tema y no en la pantalla que lo muestra
   * porque la honestidad del catálogo es del catálogo: una UI que se olvide de
   * mostrarlo no convierte una aproximación en una reproducción, pero una nota
   * escrita del lado de la UI sí se pierde en la próxima pantalla que ofrezca
   * lo mismo.
   */
  nota: string;
  autoria: ThemeAuthoring;
  /**
   * Qué preset CONGELADO aproxima esta combinación, si aproxima alguno.
   *
   * Es lo que deja ofrecer «hacer movible» sobre un tema cuyos valores están
   * congelados: la coordenada no tiene variables de color —no porque falte
   * permiso, sino porque no hay escala de la que derivar— y su aproximación sí.
   *
   * Se declara acá, junto a la nota que explica qué promete, y no en una tabla
   * aparte: una tabla nombre→nombre se desincroniza y el síntoma sería un botón
   * que no aparece. Que la declaración sea CIERTA —que ninguna otra combinación
   * esté más cerca— lo comprueba `catalog.test.ts`.
   */
  aproxima?: string;
}

/** Una entrada que nombra un preset y nada más: exacta, sin ejes. */
const coordinate = (
  name: string,
  preset: string,
  note: string
): TemaDeFabrica => ({
  nombre: name,
  clase: "coordenada",
  nota: note,
  autoria: { v: 1, preset },
});

/**
 * La combinación de Matu que re-expresa las semillas de un preset derivado.
 *
 * Recibe las semillas y no el nombre del preset a propósito: lo que se
 * re-expresa es la semilla, y pedirla explícita deja la inversión de nombres
 * escrita en el llamador, donde se lee.
 */
const combination = (
  name: string,
  seeds: { brand: string; neutral: string },
  theme: string,
  note: string,
  approximates?: string
): TemaDeFabrica => ({
  nombre: name,
  clase: "combinacion",
  nota: note,
  ...(approximates ? { aproxima: approximates } : {}),
  autoria: {
    v: 1,
    preset: "base",
    /**
     * Una sola semilla, y es la de MARCA. El sistema de Matu no tiene acento
     * propio: la misma rampa de once pasos pinta las superficies y los
     * controles, así que hay que elegir cuál de las dos semillas del preset
     * derivado sobrevive a la aproximación.
     *
     * Se elige `brand` y no `neutral` porque es lo que hace que estos temas sean
     * TRES y no uno. Medido: con las semillas neutrales los tres caen en
     * #5B6470, #41474F y #6A6259 —dos grises y un gris tibio, indistinguibles en
     * pantalla—; con las de marca, en un gris, un azul y un marrón. Y es además
     * lo único que deja que el nombre siga cumpliendo: «Pizarra» reproduce el
     * tono de marca de `slate` exacto (lo comprueba `catalog.test.ts`).
     *
     * El costo es que las superficies se tiñen del tono de marca en vez de
     * quedarse en el neutro del preset. Es el costo aceptado del sistema puro:
     * "superficies neutras con controles de color" era justamente el tema que el
     * eje de acento existía para poder armar.
     */
    base: { brand: seeds.brand, theme },
  },
});

/**
 * El gemelo MOVIBLE de un tema congelado, derivado y no anotado.
 *
 * Un tema de clase `coordenada` reproduce su preset valor por valor y no expone
 * ninguna variable de color: sus valores están congelados, y guardarlo con otro
 * nombre no los libera —lo que falta no es permiso, es una escala de la que
 * derivar—. Su gemelo es la combinación que lo aproxima y SÍ se puede mover.
 *
 * Cada aproximación declara qué preset aproxima (ver `TemaDeFabrica.aproxima`), y
 * un test comprueba que ninguna otra combinación esté más cerca.
 *
 * Devuelve `null` cuando no hay ninguno: es información, no una falla. Significa
 * que ese tema todavía no tiene aproximación en el catálogo.
 */
export const gemeloMovible = (preset: string): TemaDeFabrica | null =>
  TEMAS_DE_FABRICA.find((t) => t.aproxima === preset) ?? null;

/**
 * El tema del corpus de Matu que menos se aleja de las primitivas de los
 * presets derivados.
 *
 * Los tres declaran exactamente lo mismo en todo lo que este eje toca —Inter,
 * botón en 500, íconos `material` sin trazo—, así que la medición da el mismo
 * ganador para los tres y la constante es una sola. `Uchi` gana por dos de los
 * tres criterios mayores: su tipografía (Source Sans Pro) está en el mismo
 * grupo del catálogo que Inter ("neutra", en `fonts.ts`) y su peso de botón es
 * 500. Ningún tema del corpus trae Inter ni íconos `material`, y los radios no
 * discriminan: los cinco declaran la misma escala.
 */
const CLOSEST_THEME = "Uchi";

/**
 * Uno de los cinco temas del corpus de Matu, con la marca estándar.
 *
 * Lo que estos cinco ejercen es el eje que NO lleva color: cada tema trae su
 * familia tipográfica, el grosor de trazo de sus íconos y sus radios por
 * componente. Medido, los cinco se distinguen de verdad — `Culture` pone el
 * botón en 999 (píldora) con la tarjeta en 8, `Tech` lleva todo a 2, `Human` es
 * el único con íconos `material`.
 *
 * Van con la marca de la combinación estándar y no con una propia: lo que se
 * ofrece es el TEMA, y variar dos ejes a la vez haría que no se pueda ver cuál
 * de los dos produjo qué.
 *
 * Traen su TRAZO de ícono declarado, y no su familia. La familia se decide en
 * GENERACIÓN —elige de qué paquete se importan los íconos— así que un tema
 * aplicado no puede cambiarla; declararla acá sería prometer algo que el sistema
 * no puede cumplir. El trazo sí es en vivo.
 *
 * La consecuencia hay que decirla: `Human` es el único de los cinco con íconos
 * rellenos, y eso NO se ve al elegirlo. Se ve si el proyecto genera con
 * `theme.icons.family = "material"`. Preferimos que falte a que mienta.
 */
const matuTheme = (
  theme: string,
  note: string,
  icons: ThemeAuthoring["icons"]
): TemaDeFabrica => ({
  nombre: theme,
  clase: "combinacion",
  nota: note,
  autoria: { v: 1, preset: "base", base: { theme }, icons },
});

/**
 * El orden IMPORTA: lo primero es lo que se elige. Van las exactas antes que las
 * aproximaciones, y `Legacy (histórico)` primera de todas — es la cara que el
 * sistema tiene hoy y la referencia contra la que se mira cualquier otra.
 */
export const TEMAS_DE_FABRICA: TemaDeFabrica[] = [
  coordinate(
    "Legacy (histórico)",
    "legacy",
    "La cara que el sistema tiene hoy, valor por valor."
  ),
  // Sin bloque `matu`, la autoría resuelve a `BASELINE_SELECTION` (Blue Cated ×
  // Cated), que es lo que `getPreset("base")` ya trae horneado: exacta como
  // cualquier otra coordenada. Está acá y no entre las combinaciones porque como
  // coordenada NO se mueve — quien quiera correr los ejes tiene las tres de
  // abajo, y quien quiera el sistema completo tal como el generador lo entrega,
  // ésta. Sin ella, la combinación estándar del sistema de roles era lo único
  // del catálogo que no se podía elegir.
  coordinate(
    "Base (combinación estándar)",
    "base",
    "El sistema de diseño de Matu tal como viene: marca azul, tema Cated y los cuatro estados como esquemas propios."
  ),
  coordinate(
    "Neutral",
    "neutral",
    "Gris institucional, sin identidad de marca. Reproduce el preset «neutral» valor por valor."
  ),
  coordinate(
    "Slate",
    "slate",
    "Denso y de alto contraste, con acento azul. Reproduce el preset «slate» valor por valor."
  ),
  coordinate(
    "Atrium",
    "atrium",
    "Holgado, de formas redondeadas y restricción cromática. Reproduce el preset «atrium» valor por valor."
  ),
  /**
   * El gemelo MOVIBLE del tema histórico.
   *
   * Los otros tres presets derivados tenían el suyo y éste no, y era el que más
   * falta hacía: es el tema que los proyectos usan de verdad, así que era el
   * único cuyo color no se podía mover ni guardando una variante — sus valores
   * son transcritos, no derivados, y renombrarlos no les crea una escala.
   *
   * La semilla se lee del preset y no se copia, igual que en los otros tres. Pero
   * a diferencia de ellos su tono de marca NO se reproduce exacto, y eso no es un
   * defecto: los tres derivados calculan su marca con la MISMA derivación que
   * esto, así que coinciden; el histórico la tiene escrita a mano. Lo que sale es
   * su tono y su croma a la luminosidad que el sistema fija — lo más cerca que la
   * derivación puede estar de un valor que nunca derivó de nada.
   */
  combination(
    "Histórico movible",
    {
      brand: PRESETS.legacy.light.primary.bg,
      neutral: PRESETS.legacy.light.primary.bg,
    },
    CLOSEST_THEME,
    "Aproximación movible del tema histórico: toma su azul y lo deriva con el sistema, así que se puede mover por sus variables. El tono queda cerca, no idéntico.",
    "legacy"
  ),
  combination(
    "Gris institucional",
    SEMILLAS.neutral,
    CLOSEST_THEME,
    "Aproximación: toma el gris del preset «neutral» y lo deriva con Matu. Comparte la semilla, no los valores, y se puede mover por ejes.",
    "neutral"
  ),
  combination(
    "Pizarra",
    SEMILLAS.slate,
    CLOSEST_THEME,
    "Aproximación: superficies grises frías sobre las semillas del preset «slate». Se puede mover por sus variables.",
    "slate"
  ),
  combination(
    "Tierra",
    SEMILLAS.atrium,
    CLOSEST_THEME,
    "Aproximación: superficies grises cálidas con acento marrón, sobre las semillas del preset «atrium». Se puede mover por ejes.",
    "atrium"
  ),
  // Los cinco temas del corpus, al final: son el eje de FORMA y letra sobre la
  // marca estándar, no aproximaciones de ningún preset nuestro.
  matuTheme(
    "Uchi",
    "Source Sans Pro con esquinas de 4 y trazo de ícono muy fino (0.3). El más contenido de los cinco.",
    { strokeWidth: 0.3 }
  ),
  // Es la combinación estándar del sistema con su tema declarado, así que es el
  // gemelo movible de la coordenada que trae ese mismo sistema horneado.
  {
    ...matuTheme(
      "Cated",
      "Manrope, esquinas de 8 con tarjetas de 12 y trazo de 0.8. Es el tema de la combinación estándar, y la versión movible del preset tokenizado.",
      { strokeWidth: 0.8 }
    ),
    aproxima: "base",
  },
  matuTheme(
    "Human",
    "Manrope con esquinas de 8. Es el único con íconos rellenos, y eso solo se ve si el proyecto genera con esa familia.",
    undefined
  ),
  matuTheme(
    "Tech",
    "Source Sans Pro con esquinas de 2 y el trazo más fino del corpus (0.2). Denso y técnico.",
    { strokeWidth: 0.2 }
  ),
  matuTheme(
    "Culture",
    "Source Sans Pro con botones en píldora (999) sobre tarjetas de 8. El contraste de formas más marcado.",
    { strokeWidth: 0.7 }
  ),
];
