/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Dónde mueren los 16 ternarios `isLight ? … : …`.
 *
 * Son **dos tablas de datos**, no una tabla con condicionales. El modo se
 * resuelve al generar eligiendo tabla, no en runtime evaluando una condición, y
 * eso es lo que hace que el oscuro sea un conjunto propio y no una inversión
 * del claro (6.1: "un color que funciona sobre blanco se percibe estridente
 * sobre negro").
 *
 * Que las dos tablas no sean simétricas es la señal de que está bien hecho: en
 * claro los bordes son un paso muy suave sobre el fondo, en oscuro necesitan
 * más separación para verse; y los colores de estado bajan de intensidad en
 * oscuro porque el mismo rojo que sobre blanco es firme, sobre negro grita.
 */

import { ColorScale, ScaleStep } from "./scale";
import { Hex, compositeOver } from "./color";
import { Pair } from "./contrast";
import {
  BorderIntensities,
  FamilySurfaces,
  RowStyle,
  SemanticSet,
  Surface,
} from "./types";

/** Una referencia del nivel 2 al nivel 1: qué escala, qué paso. */
type Ref = [scale: string, step: ScaleStep];

interface SurfaceRefs {
  bg: Ref;
  on: Ref;
  onMuted: Ref;
  border: Ref;
  hover: Ref;
  /**
   * El borde enfatizado: el de un campo de formulario.
   *
   * Es un token propio y no el mismo de la tarjeta porque WCAG 1.4.11 exige 3:1
   * a lo que identifica un control, y el borde de un campo es lo unico que lo
   * identifica —adentro no tiene fondo propio—. Una tarjeta, en cambio, se
   * separa por su relleno: su borde puede ser sutil, y con 3:1 se veria como
   * una caja dibujada con marcador.
   */
  borderStrong?: Ref;
}

interface SetRefs {
  page: SurfaceRefs;
  raised: SurfaceRefs;
  sunken: SurfaceRefs;
  inverse: SurfaceRefs;
  primary: SurfaceRefs;
  secondary: SurfaceRefs;
  error: SurfaceRefs;
  warning: SurfaceRefs;
  success: SurfaceRefs;
  info: SurfaceRefs;
  appBar: SurfaceRefs;
  sidebar: SurfaceRefs & { selected: Ref; onSelected: Ref };
  sensitive: {
    masked: SurfaceRefs;
    revealed: SurfaceRefs;
    ownership: SurfaceRefs;
    forbidden: SurfaceRefs;
  };
  text: { primary: Ref; secondary: Ref; disabled: Ref };
  divider: Ref;
  focusRing: Ref;
}

/** Un color de estado sobre fondo claro: pleno, con blanco encima. */
const statusLight = (scale: string): SurfaceRefs => ({
  bg: [scale, 600],
  on: ["neutral", 50],
  onMuted: [scale, 100],
  border: [scale, 700],
  hover: [scale, 700],
});

/** El mismo estado sobre fondo oscuro: un paso más claro y menos saturado. */
const statusDark = (scale: string): SurfaceRefs => ({
  // 400 y no 500: con 500 el texto oscuro encima quedaba en 3.8-4.4:1, apenas
  // por debajo de AA. Un boton de error ilegible es peor que uno menos intenso.
  bg: [scale, 400],
  on: ["neutral", 950],
  onMuted: [scale, 900],
  border: [scale, 300],
  hover: [scale, 300],
});

export const LIGHT_REFS: SetRefs = {
  page: {
    bg: ["neutral", 50],
    on: ["neutral", 900],
    onMuted: ["neutral", 600],
    border: ["neutral", 200],
    hover: ["neutral", 100],
  },
  raised: {
    bg: ["white", 50],
    on: ["neutral", 900],
    onMuted: ["neutral", 600],
    border: ["neutral", 200],
    hover: ["neutral", 100],
    borderStrong: ["neutral", 500],
  },
  sunken: {
    bg: ["neutral", 100],
    on: ["neutral", 900],
    onMuted: ["neutral", 600],
    border: ["neutral", 200],
    hover: ["neutral", 200],
  },
  inverse: {
    bg: ["neutral", 900],
    on: ["neutral", 50],
    onMuted: ["neutral", 300],
    border: ["neutral", 900],
    hover: ["neutral", 800],
  },

  primary: {
    bg: ["brand", 600],
    on: ["neutral", 50],
    onMuted: ["brand", 100],
    border: ["brand", 700],
    hover: ["brand", 700],
  },
  secondary: {
    bg: ["accent", 600],
    on: ["neutral", 50],
    onMuted: ["accent", 100],
    border: ["accent", 700],
    hover: ["accent", 700],
  },
  error: statusLight("error"),
  warning: statusLight("warning"),
  success: statusLight("success"),
  info: statusLight("info"),

  appBar: {
    bg: ["white", 50],
    on: ["neutral", 900],
    onMuted: ["neutral", 600],
    border: ["neutral", 200],
    hover: ["neutral", 100],
  },
  sidebar: {
    bg: ["white", 50],
    on: ["neutral", 900],
    onMuted: ["neutral", 600],
    border: ["neutral", 200],
    hover: ["neutral", 100],
    selected: ["brand", 600],
    onSelected: ["neutral", 50],
  },
  // 6.9: cuatro situaciones distintas. `forbidden` no puede parecerse a un
  // campo vacío —"no tenés permiso" y "no hay nada cargado" son afirmaciones
  // distintas—, y `revealed` tiene que dejar señal de que se lo vio.
  sensitive: {
    masked: {
      bg: ["neutral", 100],
      on: ["neutral", 700],
      onMuted: ["neutral", 700],
      border: ["neutral", 300],
      hover: ["neutral", 200],
    },
    revealed: {
      bg: ["warning", 50],
      on: ["neutral", 900],
      onMuted: ["neutral", 600],
      border: ["warning", 300],
      hover: ["warning", 100],
    },
    ownership: {
      bg: ["brand", 50],
      on: ["brand", 900],
      onMuted: ["brand", 700],
      border: ["brand", 200],
      hover: ["brand", 100],
    },
    forbidden: {
      bg: ["neutral", 100],
      on: ["neutral", 700],
      onMuted: ["neutral", 700],
      border: ["neutral", 400],
      hover: ["neutral", 200],
    },
  },

  text: {
    primary: ["neutral", 900],
    secondary: ["neutral", 600],
    disabled: ["neutral", 400],
  },
  divider: ["neutral", 200],
  focusRing: ["brand", 500],
};

export const DARK_REFS: SetRefs = {
  page: {
    bg: ["neutral", 950],
    on: ["neutral", 100],
    onMuted: ["neutral", 400],
    border: ["neutral", 800],
    hover: ["neutral", 900],
  },
  raised: {
    bg: ["neutral", 900],
    on: ["neutral", 100],
    onMuted: ["neutral", 400],
    border: ["neutral", 800],
    hover: ["neutral", 800],
    borderStrong: ["neutral", 500],
  },
  sunken: {
    bg: ["neutral", 950],
    on: ["neutral", 100],
    onMuted: ["neutral", 400],
    border: ["neutral", 800],
    hover: ["neutral", 900],
  },
  // En oscuro la superficie "inversa" es clara: el tooltip negro sobre fondo
  // negro desaparece. Es el defecto exacto que hoy tiene el tema.
  inverse: {
    bg: ["neutral", 100],
    on: ["neutral", 950],
    onMuted: ["neutral", 700],
    border: ["neutral", 100],
    hover: ["neutral", 200],
  },

  primary: {
    bg: ["brand", 400],
    on: ["neutral", 950],
    onMuted: ["brand", 900],
    border: ["brand", 300],
    hover: ["brand", 300],
  },
  secondary: {
    bg: ["accent", 400],
    on: ["neutral", 950],
    onMuted: ["accent", 900],
    border: ["accent", 300],
    hover: ["accent", 300],
  },
  error: statusDark("error"),
  warning: statusDark("warning"),
  success: statusDark("success"),
  info: statusDark("info"),

  appBar: {
    bg: ["neutral", 950],
    on: ["neutral", 100],
    onMuted: ["neutral", 400],
    border: ["neutral", 800],
    hover: ["neutral", 900],
  },
  sidebar: {
    bg: ["neutral", 900],
    on: ["neutral", 100],
    onMuted: ["neutral", 400],
    border: ["neutral", 800],
    hover: ["neutral", 800],
    selected: ["brand", 400],
    onSelected: ["neutral", 950],
  },
  sensitive: {
    masked: {
      bg: ["neutral", 800],
      on: ["neutral", 300],
      onMuted: ["neutral", 300],
      border: ["neutral", 700],
      hover: ["neutral", 700],
    },
    revealed: {
      bg: ["warning", 950],
      on: ["neutral", 100],
      onMuted: ["neutral", 400],
      border: ["warning", 700],
      hover: ["warning", 900],
    },
    ownership: {
      bg: ["brand", 950],
      on: ["brand", 100],
      onMuted: ["brand", 300],
      border: ["brand", 800],
      hover: ["brand", 900],
    },
    forbidden: {
      bg: ["neutral", 800],
      on: ["neutral", 300],
      onMuted: ["neutral", 300],
      border: ["neutral", 600],
      hover: ["neutral", 700],
    },
  },

  text: {
    primary: ["neutral", 100],
    secondary: ["neutral", 400],
    disabled: ["neutral", 600],
  },
  divider: ["neutral", 800],
  focusRing: ["brand", 400],
};

/**
 * `white` y `black` no salen de ninguna semilla: son los extremos absolutos y
 * no tienen pasos. Se referencian con la misma forma que las escalas para que
 * las tablas de arriba se lean parejas; el paso se ignora.
 */
const ABSOLUTE: Record<string, string> = {
  white: "#FFFFFF",
  black: "#000000",
};

function deref(scales: Record<string, ColorScale>, [name, step]: Ref): string {
  if (ABSOLUTE[name]) return ABSOLUTE[name];

  const scale = scales[name];
  if (!scale) {
    throw new Error(
      `El mapa semántico referencia la escala "${name}", que el preset no define. ` +
        `Escalas disponibles: ${Object.keys(scales).join(", ")}.`
    );
  }
  return scale[step];
}

const surface = (
  scales: Record<string, ColorScale>,
  refs: SurfaceRefs
): Surface => ({
  bg: deref(scales, refs.bg),
  on: deref(scales, refs.on),
  onMuted: deref(scales, refs.onMuted),
  border: deref(scales, refs.border),
  hover: deref(scales, refs.hover),
  ...(refs.borderStrong
    ? { borderStrong: deref(scales, refs.borderStrong) }
    : {}),
});

/**
 * Cuánto de la separación del hover se queda la fila rayada: la mitad.
 *
 * Es el mismo número y la misma idea que `OPACIDAD_DE_BORDE.control`, y no es
 * una coincidencia — las dos preguntas son "cuánto de esta separación quiero", y
 * la mitad es lo que compone el navegador al pintar el mismo color al 50%.
 */
export const MEZCLA_DE_RAYADO = 0.5;

/**
 * El fondo de la fila par, derivado del hover y de la superficie donde se
 * dibujan las filas.
 *
 * La alternativa —un escalón propio de la rampa, o un lavado del contenido—
 * queda descartada por medición: con un escalón independiente el rayado y el
 * hover se cruzan (en `legacy` claro, un lavado del contenido al 4% deja el
 * hover a 1.01:1 sobre la fila rayada, o sea invisible), y lo que se pierde es
 * la señal de "estás acá", que vale más que la separación que se gana. Partido
 * a la mitad, las dos separaciones son iguales por construcción: el rayado se
 * nota sobre la tarjeta tanto como el hover se nota sobre el rayado.
 *
 * Se cae solo donde el hover ya no se veía: si `rowHover` ES la superficie —lo
 * que pasa hoy en tres presets en oscuro— la mitad de cero es cero, y el rayado
 * no existe. No se compensa con otra regla: el gate lo denuncia con el par del
 * rayado, y lo que hay que arreglar es el hover.
 */
export const rowAltFrom = (rowHover: Hex, superficieDeFila: Hex): Hex =>
  compositeOver(rowHover, superficieDeFila, MEZCLA_DE_RAYADO);

/**
 * Las superficies de familia en el estado en que nacen: **exactamente lo que
 * cada familia venía tomando prestado**, leído de los `styleOverrides` de
 * `buildTheme.ts` y no de lo que uno supondría.
 *
 *     grid.border       ← MuiTableCell.root.borderBottom      (sunken.border)
 *     grid.headBorder   ← MuiTableCell.head.borderBottom      (raised.border)
 *     grid.headBg       ← MuiTableCell.head.backgroundColor   (sunken.bg)
 *     grid.rowHover     ← MuiTableRow.root:hover              (page.hover)
 *     grid.rowAlt       ← nada: el rayado no existía          (derivado)
 *     field.border      ← MuiOutlinedInput notchedOutline     (raised.border)
 *     field.borderHover ← el mismo, :hover     (raised.borderStrong ?? border)
 *     field.borderFocus ← el default de MUI para :focus       (primary.bg)
 *
 * Es una función y no ocho refs a la tabla de arriba a propósito: mientras el
 * valor sea el prestado, la única forma de que no se despegue de su origen es
 * que lo LEA de ahí. La divergencia —que es para lo que existen estas
 * superficies— entra después, y entonces sí como regla propia de cada preset.
 *
 * `borderFocus` era el único que no estaba escrito en ningún override: el campo
 * enfocado lo pintaba MUI con `palette.primary.main`, que es este mismo valor.
 * Se declaró para que los tres estados del control estén en un solo lugar y no
 * dos acá y uno en los defaults de una librería; desde la Task 4 el override lo
 * consume, así que ya no hay ninguna decisión afuera.
 *
 * `rowAlt` es el único que no transcribe NADA, porque el rayado no existía: se
 * deriva con `rowAltFrom`, que es la misma regla para todos los presets.
 */
export function familiesFrom(
  set: Omit<SemanticSet, "families">
): FamilySurfaces {
  /**
   * Cada borde se compone contra EL FONDO DONDE SE DIBUJA, no contra uno solo:
   * la línea del encabezado se apoya en el fondo del encabezado y la del cuerpo
   * en la tarjeta. Es lo que hace que el borde sea una relación y no un color.
   */
  const linea = (fondo: Hex, intensidad: number) =>
    compositeOver(set.page.on, fondo, intensidad);
  return {
    grid: {
      border: linea(set.raised.bg, OPACIDAD_DE_BORDE.decorativa),
      headBorder: linea(set.sunken.bg, OPACIDAD_DE_BORDE.decorativa),
      headBg: set.sunken.bg,
      rowHover: set.page.hover,
      // La tabla se dibuja sobre la tarjeta, no sobre la página: el rayado se
      // mide contra `raised.bg` aunque el hover venga prestado de `page`.
      rowAlt: rowAltFrom(set.page.hover, set.raised.bg),
    },
    field: {
      border: linea(set.raised.bg, OPACIDAD_DE_BORDE.control),
      borderHover: linea(set.raised.bg, OPACIDAD_DE_BORDE.controlEnfasis),
      borderFocus: set.primary.bg,
    },
  };
}

/**
 * Las intensidades de borde, en opacidad del rol `Content` sobre el fondo donde
 * el borde se dibuja.
 *
 * Un borde de COLOR FIJO no puede servir en las dos direcciones de superficie:
 * medido, el mismo token da 3.03 sobre la página y 2.25 sobre la tarjeta en
 * `Canvas`, y al revés en `Mantle`. Siempre pierde en una de las dos, y ningún
 * escalón de la rampa lo arregla porque el problema es que sea fijo. Compuesto
 * contra su propio fondo, queda bien en las dos por construcción.
 *
 * Dos intensidades y no una, porque son dos casos distintos:
 *
 * - `decorativa` (30%) separa sin identificar: la línea de una grilla, que se
 *   repite N veces por pantalla. Elegido midiendo: levanta el caso más débil
 *   —`legacy` de 1.14 a 1.94— y casi no mueve el más fuerte —el tokenizado de
 *   2.25 a 2.00—. Al 15% empeoraba el tokenizado; al 35% la grilla empieza a
 *   verse como una planilla de cálculo.
 * - `control` (50%) es lo que 1.4.11 alcanza: el borde que hace falta ver para
 *   saber que hay un campo. Al 50% pasa 3:1 en todos los presets y los dos
 *   modos, incluido el tokenizado.
 *
 * `controlEnfasis` es el mismo borde bajo el puntero: un paso más, no un color
 * distinto.
 */
export const OPACIDAD_DE_BORDE = {
  decorativa: 0.3,
  control: 0.5,
  controlEnfasis: 0.65,
} as const;

/**
 * Qué bordes mueve el control de cada familia, y a qué DISTANCIA de la línea
 * declarada queda cada uno.
 *
 * `grid.headBg` y `grid.rowHover` no están: son RELLENOS, y "cuánta línea" no
 * dice nada sobre ellos. `field.borderFocus` tampoco: el anillo de foco no es la
 * línea del control en reposo sino la marca diciendo dónde se está escribiendo,
 * tiene su propio umbral (3:1 por 1.4.11) y ablandarlo con la grilla sería sacar
 * accesibilidad por estética.
 *
 * El control declara una sola intensidad, pero una familia puede tener más de
 * una línea con jerarquía propia: el `borderHover` de un campo está por encima
 * de su reposo (50 y 65 por defecto), y aplastar los dos al valor declarado
 * borraba la diferencia —el estado de hover dejaba de verse— justo cuando
 * alguien toca el control para ver mejor los bordes.
 *
 * Por eso el control mueve la LÍNEA de la familia y el énfasis conserva su
 * distancia. Los offsets son los que separan los valores por defecto, así que
 * declarar la intensidad de fábrica reproduce exactamente el tema sin control.
 */
const BORDES_POR_FAMILIA: {
  [F in keyof FamilySurfaces]: readonly (readonly [
    keyof FamilySurfaces[F],
    number
  ])[];
} = {
  grid: [
    ["border", 0],
    ["headBorder", 0],
  ],
  field: [
    ["border", 0],
    [
      "borderHover",
      (OPACIDAD_DE_BORDE.controlEnfasis - OPACIDAD_DE_BORDE.control) * 100,
    ],
  ],
};

/**
 * Los bordes de familia, a una opacidad declarada en vez de la de por defecto.
 *
 * La ausencia devuelve el MISMO objeto sin recalcular: la identidad no se
 * consigue porque las cuentas den lo mismo —el redondeo a hex podría
 * traicionarla— sino porque no hay cuentas.
 *
 * Una opacidad fuera de rango AVISA y se ignora, como hace `density` con un
 * preset que declara sus tamaños uno por uno: `hkconfig.json` llega como `any`,
 * y un tema materialmente distinto y sin aviso es peor que uno roto a la vista.
 */
export function conBordesPorOpacidad(
  set: SemanticSet,
  borders: BorderIntensities | undefined,
  contexto: { preset: string; mode: string },
  warn: (message: string) => void
): SemanticSet {
  if (!borders) return set;

  const declaradas = (
    Object.keys(BORDES_POR_FAMILIA) as (keyof FamilySurfaces)[]
  )
    .map((familia) => [familia, borders[familia]] as const)
    .filter(([familia, valor]) => {
      if (valor === undefined) return false;
      if (typeof valor !== "number" || valor < 5 || valor > 100) {
        warn(
          `El tema declara para los bordes de ${familia} una opacidad que no sirve: ` +
            `${JSON.stringify(valor)} (preset "${contexto.preset}", modo ${
              contexto.mode
            }).\n` +
            `Se espera un número entre 5 y 100. Se ignora y quedan como están.`
        );
        return false;
      }
      return true;
    }) as (readonly [keyof FamilySurfaces, number])[];
  if (declaradas.length === 0) return set;

  const contenido = set.page.on;
  const movidos: Partial<{
    [F in keyof FamilySurfaces]: Partial<FamilySurfaces[F]>;
  }> = {};

  for (const [familia, opacidad] of declaradas) {
    const tocados: Record<string, string> = {};
    for (const [token, offset] of BORDES_POR_FAMILIA[familia]) {
      // Cada borde contra el fondo donde se dibuja, igual que en `familiesFrom`:
      // el del encabezado sobre el encabezado, el resto sobre la tarjeta.
      const fondo =
        familia === "grid" && token === "headBorder"
          ? set.sunken.bg
          : set.raised.bg;
      // El techo es 100: un énfasis no puede empujar su línea más allá de opaca.
      const suya = Math.min(100, opacidad + offset);
      tocados[token as string] = compositeOver(contenido, fondo, suya / 100);
    }
    movidos[familia] = tocados as never;
  }

  return {
    ...set,
    families: {
      grid: { ...set.families.grid, ...movidos.grid },
      field: { ...set.families.field, ...movidos.field },
    },
  };
}

export function buildSemanticSet(
  scales: Record<string, ColorScale>,
  mode: "light" | "dark"
): SemanticSet {
  const r = mode === "light" ? LIGHT_REFS : DARK_REFS;
  const s = (refs: SurfaceRefs) => surface(scales, refs);

  const set: Omit<SemanticSet, "families"> = {
    page: s(r.page),
    raised: s(r.raised),
    sunken: s(r.sunken),
    inverse: s(r.inverse),
    primary: s(r.primary),
    secondary: s(r.secondary),
    error: s(r.error),
    warning: s(r.warning),
    success: s(r.success),
    info: s(r.info),
    appBar: s(r.appBar),
    sidebar: {
      ...s(r.sidebar),
      selected: deref(scales, r.sidebar.selected),
      onSelected: deref(scales, r.sidebar.onSelected),
    },
    sensitive: {
      masked: s(r.sensitive.masked),
      revealed: s(r.sensitive.revealed),
      ownership: s(r.sensitive.ownership),
      forbidden: s(r.sensitive.forbidden),
    },
    text: {
      primary: deref(scales, r.text.primary),
      secondary: deref(scales, r.text.secondary),
      disabled: deref(scales, r.text.disabled),
    },
    divider: deref(scales, r.divider),
    focusRing: deref(scales, r.focusRing),
  };

  return { ...set, families: familiesFrom(set) };
}

/** Todas las superficies llevan texto encima: ese par siempre se comprueba. */
const SURFACE_KEYS = [
  "page",
  "raised",
  "sunken",
  "inverse",
  "primary",
  "secondary",
  "error",
  "warning",
  "success",
  "info",
  "appBar",
  "sidebar",
] as const;

/** 6.9: las cuatro situaciones de dato sensible se comprueban una por una. */
const SENSITIVE_KEYS = [
  "masked",
  "revealed",
  "ownership",
  "forbidden",
] as const;

/**
 * Solo estas superficies llevan texto secundario en la práctica. Sobre un fondo
 * de estado —un botón rojo— no hay jerarquía de texto que verificar.
 */
const MUTED_TEXT_KEYS = [
  "page",
  "raised",
  "sunken",
  "inverse",
  "appBar",
  "sidebar",
] as const;

/**
 * Los pares que se comprueban, y —más importante— los que NO.
 *
 * WCAG 1.4.11 exige 3:1 a los elementos gráficos **de los que depende
 * identificar un control**: el borde de un campo, el anillo de foco. NO a los
 * bordes decorativos ni a los divisores. Exigírselo haría fallar a cualquier
 * sistema de diseño del mundo —una tarjeta con borde de 3:1 sobre su fondo se
 * ve como una caja dibujada con marcador— y un gate que avisa cuarenta veces
 * de nada es un gate que se ignora, que es la única forma de que no sirva.
 *
 * El par de `sidebar.selected` sí está, por el motivo de 6.1: el ítem activo
 * del menú es el caso literal de "texto ilegible que aparece solo en algunos
 * lugares" cuando la marca se oscurece.
 */
export function pairsOf(
  set: SemanticSet,
  mode: string,
  /**
   * Cómo se separan las filas. Solo cambia QUÉ se mide: el par del rayado
   * existe cuando el rayado existe. Medirlo siempre agregaría dos fallas por
   * modo en todos los presets —el rayado es un relleno tenue y `rowAlt` está
   * declarado aunque no se use— y un gate que avisa de lo que nadie eligió es
   * un gate que se ignora.
   */
  opciones: { rows?: RowStyle } = {}
): Pair[] {
  const pairs: Pair[] = [];

  for (const key of SURFACE_KEYS) {
    const s = (set as any)[key] as Surface | undefined;
    if (!s) continue;
    pairs.push({
      name: `${mode}.${key}.on/bg`,
      background: s.bg,
      foreground: s.on,
      kind: "text",
    });
  }

  for (const key of MUTED_TEXT_KEYS) {
    const s = (set as any)[key] as Surface | undefined;
    if (!s) continue;
    pairs.push({
      name: `${mode}.${key}.onMuted/bg`,
      background: s.bg,
      foreground: s.onMuted,
      kind: "text",
    });
  }

  // Un dato protegido ilegible es peor que uno visible: quien lo mira no sabe
  // si esta enmascarado o si el sistema fallo.
  for (const key of SENSITIVE_KEYS) {
    const s = set.sensitive?.[key];
    if (!s) continue;
    pairs.push({
      name: `${mode}.sensitive.${key}.on/bg`,
      background: s.bg,
      foreground: s.on,
      kind: "text",
    });
    pairs.push({
      name: `${mode}.sensitive.${key}.onMuted/bg`,
      background: s.bg,
      foreground: s.onMuted,
      kind: "text",
    });
  }

  pairs.push({
    name: `${mode}.text.primary/page`,
    background: set.page.bg,
    foreground: set.text.primary,
    kind: "text",
  });
  pairs.push({
    name: `${mode}.text.secondary/page`,
    background: set.page.bg,
    foreground: set.text.secondary,
    kind: "text",
  });
  pairs.push({
    name: `${mode}.text.secondary/raised`,
    background: set.raised.bg,
    foreground: set.text.secondary,
    kind: "text",
  });
  // El borde del campo delimita un control: acá 1.4.11 sí aplica. El par
  // existía desde antes con el nombre `input.border`, apuntando a un token que
  // no era del campo sino de la tarjeta enfatizada; ahora nombra el token real.
  //
  // Mide el borde ENFATIZADO —el del campo bajo el puntero— y no el de reposo,
  // que es a rigor el que 1.4.11 alcanza.
  //
  // Deuda del gate, y conviene saber su forma real: el borde de reposo SÍ pasa
  // 3:1 en los presets derivados, en los dos modos. El único que falla es
  // `legacy`, que es `DEFAULT_PRESET` y el único que escribe sus families a
  // mano en vez de derivarlas. O sea que traer el reposo al gate no cambia los
  // colores de todos los proyectos —cambia los de legacy—, y esa es una
  // decisión de diseño sobre la pantalla existente.
  //
  // Se vuelve a medir con `familiesFrom` sobre `PRESETS`; no se anota el número
  // acá porque se mueve al tocar cualquier preset.
  pairs.push({
    name: `${mode}.field.borderHover/raised`,
    background: set.raised.bg,
    foreground: set.families.field.borderHover,
    kind: "ui",
  });
  // El anillo de foco del campo, sobre la misma tarjeta. Es el otro par que
  // 1.4.11 alcanza de lleno —"estás escribiendo acá" es información que se da
  // solo por color— y hasta acá no se medía: `focusRing/page` mide el anillo
  // GENERAL sobre la página, que es otro token sobre otro fondo. La medición
  // que lo trajo al gate: en oscuro y con la escalera `Canvas`, cuatro de los
  // seis esquemas de Matu quedan abajo de 3:1 (Neutral 2.20, Blue Cated 2.69,
  // Blue Uchi 2.86, Red Roel 2.93), y `legacy` da 2.54 — deuda que ese preset
  // declara como excepción, con su motivo. En `Mantle` pasan los seis.
  pairs.push({
    name: `${mode}.field.borderFocus/raised`,
    background: set.raised.bg,
    foreground: set.families.field.borderFocus,
    kind: "ui",
  });
  // El rayado, y solo cuando está elegido. Son DOS pares y no uno porque son
  // dos preguntas distintas y las dos se pueden perder por separado: si el
  // primero falla el rayado no separa nada, y si falla el segundo el rayado se
  // comió la señal de "estás acá". El umbral es `subtle` —perceptibilidad, no
  // 1.4.11—: un separador de filas no identifica ningún control.
  if (opciones.rows === "rayado") {
    pairs.push({
      name: `${mode}.grid.rowAlt/raised`,
      background: set.raised.bg,
      foreground: set.families.grid.rowAlt,
      kind: "subtle",
    });
    pairs.push({
      name: `${mode}.grid.rowHover/rowAlt`,
      background: set.families.grid.rowAlt,
      foreground: set.families.grid.rowHover,
      kind: "subtle",
    });
  }
  pairs.push({
    name: `${mode}.focusRing/page`,
    background: set.page.bg,
    foreground: set.focusRing,
    kind: "ui",
  });
  pairs.push({
    name: `${mode}.sidebar.onSelected/selected`,
    background: set.sidebar.selected,
    foreground: set.sidebar.onSelected,
    kind: "text",
  });

  return pairs;
}
