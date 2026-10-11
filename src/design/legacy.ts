/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * La apariencia de hoy, declarada.
 *
 * Es el default del generador, y esa elección es deliberada: cualquier otro
 * default cambiaría el aspecto de todos los proyectos existentes en su próxima
 * regeneración, sin que nadie lo haya pedido. La infraestructura nueva entra
 * inerte y se activa desde el hkconfig.
 *
 * Cada valor de acá está transcrito de `PrefStore.ts.ts` tal como estaba. NO se
 * corrige nada — ni el `#6B7280` que en oscuro contrasta mal, ni el tooltip que
 * ignora el modo. Esas son correcciones de la etapa 2; mezclarlas acá volvería
 * inverificable la etapa 1, que es la única que tiene un criterio de corrección
 * inequívoco: no debe cambiar nada.
 *
 * La fidelidad llega hasta la forma de escribir: `#333` se conserva abreviado y
 * no expandido a `#333333`. Son el mismo color, pero el CSS emitido cambia, y
 * el criterio de esta etapa es que no cambie nada.
 */

import { ContrastException } from "./contrast";
import { Preset, SemanticSet } from "./types";
import {
  CAPAS,
  EASING,
  FOCO,
  SIN_GRADIENTES,
  TIPO_DE_FILA_POR_DEFECTO,
  iconography,
  spacingScale,
} from "./doctrine";
import { rowAltFrom } from "./semanticMap";

/**
 * Los 15 pares que el gate de 6.8 (`contrast.ts`) marca insuficientes en esta
 * paleta, agrupados por causa — no 15 motivos idénticos. El motivo de fondo es
 * uno solo y se repite a propósito en cada grupo: es la fidelidad de esta
 * etapa (ver cabecera del archivo), no un descuido por par. Corregir cualquiera
 * de estos colores es cambiar la cara de producción — una decisión de diseño
 * aparte, no un fix de acá. La vía nueva para quien la quiera es el vocabulario
 * tokenizado (preset `matu`), que sí pasa el gate.
 *
 * Viven acá y no en cada `hkconfig.json` porque la deuda es del preset, no de
 * cada proyecto que lo usa por ser el default: repetir 15 excepciones con un
 * motivo ajeno en cada proyecto generado sería peor que tenerlas una vez, en
 * el único lugar del que salen.
 */
const EXCEPCIONES_LEGACY: ContrastException[] = [
  // El verde de éxito (#2F9E44) nunca llegó a 4.5:1 sobre blanco, en ninguno
  // de los dos modos: es el mismo color transcrito tal cual estaba.
  {
    pair: "light.success.on/bg",
    reason:
      "verde de éxito histórico, insuficiente en los dos modos; fidelidad pre-tokens, corregirlo cambia la cara de producción",
  },
  {
    pair: "dark.success.on/bg",
    reason:
      "verde de éxito histórico, insuficiente en los dos modos; fidelidad pre-tokens, corregirlo cambia la cara de producción",
  },

  // El borde de campo (#D1D5DB claro, #555 oscuro) es deliberadamente sutil:
  // el tema pre-tokens nunca lo pensó como componente que deba pasar 1.4.11.
  {
    pair: "light.field.borderHover/raised",
    reason:
      "borde de campo histórico, sutil por diseño; nunca se pensó contra 1.4.11 (componente de interfaz), fidelidad pre-tokens",
  },
  {
    pair: "dark.field.borderHover/raised",
    reason:
      "borde de campo histórico, sutil por diseño; nunca se pensó contra 1.4.11 (componente de interfaz), fidelidad pre-tokens",
  },

  // El anillo de foco del campo es el azul de marca (#2B6CB0), el mismo en los
  // dos modos: sobre blanco da 5.42:1 y sobre la tarjeta oscura 2.54:1. No es
  // un borde sutil por diseño como los de arriba — es la marca sin variante
  // oscura, que es una deuda distinta y por eso lleva su propio motivo.
  {
    pair: "dark.field.borderFocus/raised",
    reason:
      "azul de marca #2B6CB0 usado como foco en los dos modos; sobre la tarjeta oscura no llega a 3:1 y el histórico no tiene variante oscura de marca, fidelidad pre-tokens",
  },

  // El gris apagado #6B7280 del oscuro histórico, reutilizado tal cual en cada
  // superficie general — no es un error puntual de una, es el mismo color.
  {
    pair: "dark.page.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, insuficiente en toda superficie general; fidelidad pre-tokens",
  },
  {
    pair: "dark.raised.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, insuficiente en toda superficie general; fidelidad pre-tokens",
  },
  {
    pair: "dark.sunken.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, insuficiente en toda superficie general; fidelidad pre-tokens",
  },
  {
    pair: "dark.appBar.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, insuficiente en toda superficie general; fidelidad pre-tokens",
  },
  {
    pair: "dark.sidebar.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, insuficiente en toda superficie general; fidelidad pre-tokens",
  },

  // Los cuatro asientos de 6.9 heredan el mismo gris apagado: misma causa que
  // las superficies generales, repetida en los cuatro estados de sensibilidad.
  {
    pair: "dark.sensitive.masked.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, heredado en los cuatro asientos de sensibilidad (6.9); fidelidad pre-tokens",
  },
  {
    pair: "dark.sensitive.revealed.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, heredado en los cuatro asientos de sensibilidad (6.9); fidelidad pre-tokens",
  },
  {
    pair: "dark.sensitive.ownership.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, heredado en los cuatro asientos de sensibilidad (6.9); fidelidad pre-tokens",
  },
  {
    pair: "dark.sensitive.forbidden.onMuted/bg",
    reason:
      "gris apagado #6B7280 del oscuro histórico, heredado en los cuatro asientos de sensibilidad (6.9); fidelidad pre-tokens",
  },

  // El mismo gris, expuesto ahora por el slot `text.secondary` en vez de
  // `Surface.onMuted` — la causa es idéntica a los dos grupos de arriba.
  {
    pair: "dark.text.secondary/page",
    reason:
      "gris apagado #6B7280 del oscuro histórico, expuesto por text.secondary; misma causa que onMuted en las superficies",
  },
  {
    pair: "dark.text.secondary/raised",
    reason:
      "gris apagado #6B7280 del oscuro histórico, expuesto por text.secondary; misma causa que onMuted en las superficies",
  },
];

/**
 * 25 entradas porque es lo que MUI espera. Solo 1-3 están pobladas, y eso
 * significa que hoy **elevation 8 es "none"**: los menús, popovers y
 * autocompletes no tienen sombra. Poblar la escala "porque falta" cambiaría la
 * pantalla en todos ellos. La doctrina de dos capas de 6.5 es etapa 2.
 */
const SHADOWS = (() => {
  const s: string[] = Array(25).fill("none");
  s[1] = "0 1px 2px rgba(0,0,0,0.04)";
  s[2] = "0 2px 4px rgba(0,0,0,0.06)";
  s[3] = "0 4px 8px rgba(0,0,0,0.08)";
  return s;
})();

const light: SemanticSet = {
  page: {
    bg: "#FAFAFA",
    on: "#1A1A1A",
    onMuted: "#6B7280",
    border: "#E5E5E5",
    hover: "#F9FAFB",
  },
  raised: {
    bg: "#FFFFFF",
    on: "#1A1A1A",
    onMuted: "#6B7280",
    border: "#E5E5E5",
    hover: "#F9FAFB",
    borderStrong: "#D1D5DB",
  },
  sunken: {
    bg: "#FAFAFA",
    on: "#1A1A1A",
    onMuted: "#6B7280",
    border: "#F0F0F0",
    hover: "#F9FAFB",
  },
  inverse: {
    bg: "#1A1A1A",
    on: "#FFFFFF",
    onMuted: "#E5E5E5",
    border: "#1A1A1A",
    hover: "#2D2D2D",
  },

  primary: {
    bg: "#2B6CB0",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#1E4A7A",
    hover: "#1E4A7A",
    subtle: "#4A9BD9",
  },
  secondary: {
    bg: "#6B7280",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#6B7280",
    hover: "#6B7280",
  },
  error: {
    bg: "#DC3545",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#DC3545",
    hover: "#DC3545",
  },
  // Hoy ninguno de estos `on` está escrito: MUI los deriva con `augmentColor`,
  // que elige texto claro u oscuro según su propio umbral de 3:1. Para el
  // naranja el blanco da 2.47:1, así que MUI ya está poniendo texto oscuro
  // —`rgba(0,0,0,0.87)`, que compuesto ronda 7.7:1—. Se transcribe lo que se
  // renderiza, no lo que uno supondría.
  warning: {
    bg: "#E8912D",
    on: "#000000",
    onMuted: "#000000",
    border: "#E8912D",
    hover: "#E8912D",
  },
  success: {
    bg: "#2F9E44",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#2F9E44",
    hover: "#2F9E44",
  },

  appBar: {
    bg: "#FFFFFF",
    on: "#1A1A1A",
    onMuted: "#6B7280",
    border: "#E5E5E5",
    hover: "#F9FAFB",
  },
  sidebar: {
    bg: "#FFFFFF",
    on: "#1A1A1A",
    onMuted: "#6B7280",
    border: "#E5E5E5",
    hover: "#F9FAFB",
    // Hoy vive como `PrefStore.contrastText`, duplicando `primary.main`.
    selected: "#2B6CB0",
    onSelected: "#FFFFFF",
  },

  text: { primary: "#1A1A1A", secondary: "#6B7280" },
  divider: "#E5E5E5",
  focusRing: "#2B6CB0",
  // 6.9 pide cuatro formas distintas. El acta todavia no las decidio, asi que
  // los cuatro asientos existen con el mismo valor: declarados, no inventados.
  sensitive: {
    masked: {
      bg: "#FAFAFA",
      on: "#1A1A1A",
      onMuted: "#6B7280",
      border: "#E5E5E5",
      hover: "#F9FAFB",
    },
    revealed: {
      bg: "#FAFAFA",
      on: "#1A1A1A",
      onMuted: "#6B7280",
      border: "#E5E5E5",
      hover: "#F9FAFB",
    },
    ownership: {
      bg: "#FAFAFA",
      on: "#1A1A1A",
      onMuted: "#6B7280",
      border: "#E5E5E5",
      hover: "#F9FAFB",
    },
    forbidden: {
      bg: "#FAFAFA",
      on: "#1A1A1A",
      onMuted: "#6B7280",
      border: "#E5E5E5",
      hover: "#F9FAFB",
    },
  },
  // Transcritas como todo lo demás de este archivo, y no leídas de las
  // superficies de arriba con `familiesFrom`: acá cada valor es un hecho de la
  // pantalla de hoy, no el resultado de una regla. De dónde salía prestado cada
  // uno está en `familiesFrom` (`semanticMap.ts`), que es contra lo que se
  // comprueban: grid ← sunken.border / raised.border / sunken.bg / page.hover;
  // field ← raised.border / raised.borderStrong / primary.bg.
  families: {
    // `rowAlt` es la excepción a la transcripción de este archivo, y no puede
    // no serlo: el rayado no existe en la pantalla de hoy, así que no hay nada
    // que transcribir. Se deriva con la misma regla que los demás presets — un
    // hex escrito a mano acá sería un color que nadie eligió.
    grid: {
      border: "#F0F0F0",
      headBorder: "#E5E5E5",
      headBg: "#FAFAFA",
      rowHover: "#F9FAFB",
      rowAlt: rowAltFrom("#F9FAFB", "#FFFFFF"),
    },
    field: {
      border: "#E5E5E5",
      borderHover: "#D1D5DB",
      borderFocus: "#2B6CB0",
    },
  },
};

/**
 * El oscuro de hoy sale de 16 ternarios que solo cubren fondo, texto y bordes;
 * todo lo demás se hereda del claro. Acá queda declarado como conjunto propio,
 * pero con **los mismos valores heredados**, no con valores mejores: la etapa 1
 * cambia dónde vive la decisión, no cuál es.
 */
const dark: SemanticSet = {
  page: {
    bg: "#1A1A1A",
    on: "#E5E5E5",
    onMuted: "#6B7280",
    border: "#404040",
    hover: "#333",
  },
  raised: {
    bg: "#2D2D2D",
    on: "#E5E5E5",
    onMuted: "#6B7280",
    border: "#404040",
    hover: "#333",
    borderStrong: "#555",
  },
  sunken: {
    bg: "#2D2D2D",
    on: "#E5E5E5",
    onMuted: "#6B7280",
    border: "#333",
    hover: "#333",
  },
  inverse: {
    bg: "#1A1A1A",
    on: "#FFFFFF",
    onMuted: "#E5E5E5",
    border: "#1A1A1A",
    hover: "#2D2D2D",
  },

  primary: {
    bg: "#2B6CB0",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#1E4A7A",
    hover: "#1E4A7A",
    subtle: "#4A9BD9",
  },
  secondary: {
    bg: "#6B7280",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#6B7280",
    hover: "#6B7280",
  },
  error: {
    bg: "#DC3545",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#DC3545",
    hover: "#DC3545",
  },
  warning: {
    bg: "#E8912D",
    on: "#000000",
    onMuted: "#000000",
    border: "#E8912D",
    hover: "#E8912D",
  },
  success: {
    bg: "#2F9E44",
    on: "#FFFFFF",
    onMuted: "#FFFFFF",
    border: "#2F9E44",
    hover: "#2F9E44",
  },

  appBar: {
    bg: "#1A1A1A",
    on: "#E5E5E5",
    onMuted: "#6B7280",
    border: "#404040",
    hover: "#333",
  },
  sidebar: {
    bg: "#2D2D2D",
    on: "#E5E5E5",
    onMuted: "#6B7280",
    border: "#404040",
    hover: "#333",
    selected: "#2B6CB0",
    onSelected: "#FFFFFF",
  },

  text: { primary: "#E5E5E5", secondary: "#6B7280" },
  divider: "#404040",
  focusRing: "#2B6CB0",
  // 6.9 pide cuatro formas distintas. El acta todavia no las decidio, asi que
  // los cuatro asientos existen con el mismo valor: declarados, no inventados.
  sensitive: {
    masked: {
      bg: "#2D2D2D",
      on: "#E5E5E5",
      onMuted: "#6B7280",
      border: "#404040",
      hover: "#333",
    },
    revealed: {
      bg: "#2D2D2D",
      on: "#E5E5E5",
      onMuted: "#6B7280",
      border: "#404040",
      hover: "#333",
    },
    ownership: {
      bg: "#2D2D2D",
      on: "#E5E5E5",
      onMuted: "#6B7280",
      border: "#404040",
      hover: "#333",
    },
    forbidden: {
      bg: "#2D2D2D",
      on: "#E5E5E5",
      onMuted: "#6B7280",
      border: "#404040",
      hover: "#333",
    },
  },
  // Mismo criterio que en claro. `borderFocus` es el mismo azul en los dos
  // modos porque el oscuro de hoy hereda `primary` del claro sin tocarlo: se
  // transcribe lo que se renderiza, no lo que convendría.
  families: {
    grid: {
      border: "#333",
      headBorder: "#404040",
      headBg: "#2D2D2D",
      rowHover: "#333",
      rowAlt: rowAltFrom("#333", "#2D2D2D"),
    },
    field: { border: "#404040", borderHover: "#555", borderFocus: "#2B6CB0" },
  },
};

export const legacyPreset: Preset = {
  name: "legacy",

  primitives: {
    scales: {},
    spacingUnit: 8,
    spacing: spacingScale(8),
    radius: { none: 0, xs: 4, s: 6, m: 8, l: 10, xl: 16, full: 9999 },
    radiusProgression: "even",
    // Hoy no hay ninguna transicion declarada: MUI aplica las suyas. Se
    // transcriben las de MUI para no cambiar la pantalla al empezar a
    // declararlas.
    motion: {
      duration: {
        instant: 0,
        fast: 150,
        base: 250,
        slow: 375,
        deliberate: 500,
      },
      easing: { ...EASING },
      neverAnimate: [],
      respectReducedMotion: false,
    },
    elevation: { doctrine: "flat", levels: 3, shadows: SHADOWS },
    gradients: SIN_GRADIENTES,
    focus: FOCO,
    icons: iconography("material"),
    shadows: SHADOWS,
    layers: CAPAS,
    duration: { fast: 150, base: 250, slow: 375 },
    typography: {
      weights: [400, 500, 600, 700],
      fontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      // El histórico usa una sola familia para todo: título y botón la repiten.
      titleFontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      buttonFontFamily:
        '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      h1: { fontWeight: 600, fontSize: "2rem", lineHeight: 1.4 },
      h2: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.4 },
      h3: { fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.5 },
      h4: { fontWeight: 500, fontSize: "1.125rem", lineHeight: 1.5 },
      h5: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.5 },
      h6: { fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.6 },
      body1: { fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.7 },
      body2: { fontWeight: 400, fontSize: "0.8125rem", lineHeight: 1.6 },
      subtitle1: { fontWeight: 500, lineHeight: 1.6 },
      subtitle2: { fontWeight: 400, lineHeight: 1.6 },
      button: { fontWeight: 500, textTransform: "none" },
    },
  },

  // Los paddings quedan transcritos y no calculados, como todo lo de acá. No
  // son una isla: coinciden EXACTAMENTE con `espaciadosDeComponente(8)`, que es
  // la tabla que rige cuando el proyecto mueve `spacingUnit` — de esos números
  // salió. Así, cambiar la unidad no produce un salto entre dos criterios.
  components: {
    button: {
      radius: 6,
      paddingY: 8,
      paddingX: 16,
      fontSize: "0.875rem",
      variantPaddingLeft: 20,
    },
    card: { radius: 8 },
    dialog: { radius: 10, shadow: "0 8px 24px rgba(0,0,0,0.12)" },
    chip: { radius: 4, fontSize: "0.75rem" },
    tooltip: { radius: 4, fontSize: "0.75rem", paddingY: 6, paddingX: 12 },
    input: { radius: 6 },
    table: {
      cellPaddingY: 14,
      cellPaddingX: 16,
      fontSize: "0.875rem",
      headFontSize: "0.8125rem",
      rows: TIPO_DE_FILA_POR_DEFECTO,
    },
  },

  light,
  dark,

  contrastExceptions: EXCEPCIONES_LEGACY,
};
