/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Las doctrinas de la Parte VI, como valores.
 *
 * El documento pide decidir doctrinas —si el sistema tiene profundidad, cómo
 * arranca y frena el movimiento, dónde no se anima—, no valores sueltos. Acá
 * viven los defaults de cada una, y los presets los toman o los pisan.
 *
 * Están juntos y no repartidos por preset para que la respuesta a "¿cuál es la
 * doctrina de movimiento del sistema?" tenga UN lugar donde mirarse.
 */

import {
  Elevation,
  FocusRing,
  Gradients,
  Iconography,
  Motion,
  RowStyle,
  SpacingScale,
} from "./types";

/** 6.3: la unidad y sus múltiplos admitidos. */
export function spacingScale(unit: number): SpacingScale {
  return {
    unit,
    none: 0,
    xs: unit * 0.5,
    s: unit,
    m: unit * 2,
    l: unit * 3,
    xl: unit * 4,
    xxl: unit * 6,
  };
}

/**
 * Cómo separa sus filas una grilla mientras nadie diga otra cosa.
 *
 * Es doctrina y no un default escondido en cada preset: los cuatro
 * constructores lo DECLARAN, para que un preset con otra opinión se vea como lo
 * que es —una decisión— y no como el único que no se olvidó de poner el campo.
 * Que hoy los cuatro digan lo mismo no lo vuelve redundante: lo vuelve
 * comprobable.
 */
export const TIPO_DE_FILA_POR_DEFECTO: RowStyle = "linea";

/**
 * Las tres alternativas, como dato con nombre: el gate arma con esto el
 * vocabulario que valida y que el selector ofrece, y `resolveTheme` comprueba
 * contra esto lo que llega del `hkconfig.json`. Escrita dos veces sería la lista
 * paralela de siempre — y el síntoma, un valor que un lado acepta y el otro no.
 */
export const TIPOS_DE_FILA: readonly RowStyle[] = ["linea", "rayado", "limpio"];

/**
 * 6.3, nivel 3: qué paddings de componente cuelgan de la unidad, y cuántas
 * unidades mide cada uno.
 *
 * Gemela de `radiosDeComponente` (`presets/derived.ts`) y por el mismo motivo,
 * agravado: la tabla estaba escrita CUATRO veces —el constructor derivado, el
 * adaptador de Matu, shadcn y el preset literal— y `spacingUnit` no llegaba a
 * ninguna desde la configuración. Mover la unidad movía `spacing` del tema MUI
 * —la escala de `sx={{p: 2}}`— y no movía nada de lo que el ojo llama densidad:
 * la celda de la grilla, el botón y el tooltip seguían clavados donde los dejó
 * el preset. La perilla decía "espaciado" y no espaciaba.
 *
 * Los múltiplos NO son inventados: son los que la apariencia de hoy ya tenía
 * con la unidad en 8 —8/16 en el botón, 6/12 en el tooltip, 14/16 en la celda,
 * 20 de sangría—, leídos como cuartos de unidad. Los siete resultaron múltiplos
 * limpios, así que ninguno queda fijo y el nivel 3 entero es función de un solo
 * número. Con `unit = 8` la salida es idéntica a la de antes, por construcción.
 *
 * La regla es UNA y es lineal: doblar la unidad dobla el aire. La alternativa
 * —amortiguar los paddings chicos para que el tooltip no crezca tanto como la
 * grilla— se descartó porque el botón y la celda YA escalaban lineales en el
 * constructor derivado: con dos reglas, la unidad significaría una cosa en un
 * componente y otra en el de al lado, y nadie podría predecir la pantalla desde
 * el número. Lineal sobre múltiplos chicos tampoco desborda: de 8 a 12 el
 * tooltip pasa de 6/12 a 9/18, no se triplica.
 */
export function espaciadosDeComponente(unit: number) {
  // Redondea porque los cuartos de unidad no dan entero en cualquier unidad
  // (0.75 × 6 = 4.5), y un padding fraccionario en px es un borde borroso.
  const u = (multiple: number) => Math.round(unit * multiple);
  return {
    button: { paddingY: u(1), paddingX: u(2), variantPaddingLeft: u(2.5) },
    tooltip: { paddingY: u(0.75), paddingX: u(1.5) },
    table: { cellPaddingY: u(1.75), cellPaddingX: u(2) },
  };
}

/**
 * 6.7. Las curvas.
 *
 * `entering` arranca rápido y frena suave: lo que aparece tiene que asentarse.
 * `exiting` hace lo contrario, porque a lo que se va no hay que esperarlo.
 * `emphasized` sobrepasa apenas — se reserva para lo que debe notarse, que en
 * un sistema de gestión es muy poco.
 */
export const EASING = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  entering: "cubic-bezier(0, 0, 0, 1)",
  exiting: "cubic-bezier(0.3, 0, 1, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1.2)",
} as const;

const SPEED = {
  fast: { instant: 0, fast: 90, base: 140, slow: 200, deliberate: 280 },
  default: { instant: 0, fast: 120, base: 180, slow: 260, deliberate: 360 },
  slow: { instant: 0, fast: 160, base: 240, slow: 340, deliberate: 460 },
} as const;

/**
 * Dónde NO se anima, por default.
 *
 * El documento es explícito: "las operaciones frecuentes suelen ganar sin
 * animación", y "repetido cuarenta veces por jornada, estorba". Estas son las
 * interacciones que alguien que carga obras todo el día hace cientos de veces.
 */
const NEVER_ANIMATE = [
  "tableRowHover",
  "listItemHover",
  "menuItemHover",
  "checkboxToggle",
  "inputFocus",
];

export function motion(speed: keyof typeof SPEED = "default"): Motion {
  return {
    duration: { ...SPEED[speed] },
    easing: { ...EASING },
    neverAnimate: [...NEVER_ANIMATE],
    respectReducedMotion: true,
  };
}

/**
 * 6.5. Dos capas: una breve y cercana que apoya el elemento, otra extendida y
 * muy tenue que lo separa del fondo. Es la diferencia concreta entre una sombra
 * de hace diez años —una sola capa, difusa y opaca— y una de ahora.
 */
export function elevation(doctrine: "flat" | "layered"): Elevation {
  const s: string[] = Array(25).fill("none");

  if (doctrine === "flat") {
    s[1] = "0 1px 2px rgba(0,0,0,0.04)";
    s[2] = "0 2px 4px rgba(0,0,0,0.06)";
    s[3] = "0 4px 8px rgba(0,0,0,0.08)";
    return { doctrine, levels: 3, shadows: s };
  }

  const layers = [
    "0 1px 1px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)",
    "0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)",
    "0 2px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.05)",
    "0 4px 8px rgba(0,0,0,0.07), 0 16px 40px rgba(0,0,0,0.06)",
  ];
  // Se repite el último para el resto: MUI espera 25 entradas y por encima de
  // cuatro niveles la diferencia deja de percibirse.
  for (let i = 1; i < 25; i++)
    s[i] = layers[Math.min(i - 1, layers.length - 1)];
  return { doctrine, levels: layers.length, shadows: s };
}

/** 6.5: el uso actual del degradado es casi imperceptible, o no existe. */
export const SIN_GRADIENTES: Gradients = { surface: null, emphasis: null };

/** 6.8: el anillo de foco. Dos píxeles y una separación que lo despegue. */
export const FOCO: FocusRing = { width: 2, offset: 2, style: "solid" };

/**
 * 6.6. El trazo de 1.75 acompaña un peso tipográfico de 400-500 sin verse
 * flaco; Lucide viene en 2 por default, que junto a texto normal se lee pesado.
 */
export function iconography(
  family: Iconography["family"] = "material"
): Iconography {
  return {
    family,
    strokeWidth: family === "lucide" ? 1.75 : 0,
    size: { s: 18, m: 20, l: 24 },
  };
}

/** Los tres niveles de apilamiento por encima de la banda de modales. */
export const CAPAS = { menu: 10250, snackbar: 10350, tooltip: 10400 };
