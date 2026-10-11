/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * El grafo de AUTORÍA de un tema Matu, normalizado.
 *
 * Es la "pregunta" (en el sentido de `themeConfig` vs `tokens`): la forma
 * durable desde la que se re-resuelve. Un tema = UNA combinación entre las
 * colecciones de Matu (un Color Scheme × un Color Mode × las capas de Contrast
 * × un Themes) + primitivos + efectos, empaquetada en un solo documento.
 *
 * La hoja sigue la forma de nodo del W3C Design Tokens (DTCG 2025.10): cada
 * token es `{$type, $value}`, y un `$value` puede ser un alias `"{a.b.c}"` sin
 * resolver. Esa fidelidad al estándar es a propósito: `schema/authoring.schema.json`
 * es un JSON Schema DTCG-compatible, y es el artefacto con el que se le proponen
 * mejoras estructurales a Matu para su Figma. La resolución de los alias y la
 * selección de modo NO están en el estándar (DTCG deja los modos fuera de
 * alcance): eso lo hace `resolve.ts`, y es lógica propia.
 *
 * Ese esquema se mantiene A MANO — no lo emite ningún script—, así que hay que
 * tocarlo junto con los tipos de acá. Ya se había desincronizado en el peor
 * lugar: le faltaban `statusSchemes` y tres tintas de `InkName`, y
 * `statusSchemes` es justamente el eje que el esquema existe para proponer.
 *
 * Este archivo es SOLO tipos. La forma cruda que sale de Figma/Tokens Studio
 * (con sus defectos y su dialecto viejo) la arregla `normalize.ts` hasta esta
 * forma; nada de acá asume esos defectos.
 */

// ─────────────────────────────────────────────────────────── Nodo DTCG (hoja)

/**
 * Un alias sin resolver, tal como lo escribe Tokens Studio: `"{Base_Colors.Color_600}"`.
 * Sobrevive dentro de `$value` hasta que `resolve.ts` lo aplana a un valor.
 */
export type Ref = `{${string}}`;

export interface Token<TType extends string, TValue> {
  $type: TType;
  /** El valor concreto, o un alias `{...}` a otro token mientras no se resolvió. */
  $value: TValue | Ref;
  $description?: string;
}

export type ColorToken = Token<"color", string>;
/** DTCG 2025.10: `dimension` es objeto `{value, unit}`, no el string `"2px"` del dialecto viejo. */
export type DimensionToken = Token<
  "dimension",
  { value: number; unit: "px" | "rem" }
>;
/** Opacidad y line-height: unitless. En el export de Matu venían mistipados como `dimension`. */
export type NumberToken = Token<"number", number>;
export type FontWeightToken = Token<"fontWeight", number>;
export type FontFamilyToken = Token<"fontFamily", string | string[]>;

export interface ShadowLayer {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  /** Hex, hex con alfa, o un alias `{...}`. */
  color: string;
}
export type ShadowToken = Token<"shadow", ShadowLayer | ShadowLayer[]>;

// ─────────────────────────────────────── Nivel 1: primitivos (Tokens/Mode 1)

/**
 * Las escalas crudas de Matu. Nombres tal como los emite (`Radius_M`, `s-8`,
 * `text-16`), preservados para que el round-trip a Figma no pierda la identidad
 * de cada token. La composición en algo que MUI consume (radius por componente,
 * rampa tipográfica) es trabajo del resolver, no de acá.
 */
export interface MatuPrimitives {
  radius: Record<string, DimensionToken>;
  spacing: Record<string, DimensionToken>;
  /** Ratios unitless (0.9 = 90%), ya normalizados desde los px del export. */
  lineHeight: Record<string, NumberToken>;
  fontSize: Record<string, DimensionToken>;
  fontWeight: Record<string, FontWeightToken>;
  opacity: {
    /** Escala base 0..1 (10 → 0.1), ya normalizada desde los `"10".."90"` del export. */
    base: Record<string, NumberToken>;
    /** Los overlays de estado: hover/selected/active/disable. */
    states: Record<MatuStateName, NumberToken>;
  };
}

export type MatuStateName = "hover" | "selected" | "active" | "disable";

// ────────────────────────────────────────── Nivel 2: color (Scheme → Mode → Contrast)

/** La escala 0..1000 de un esquema, más sus colores de relación (focus, acentos). */
export interface MatuColorScheme {
  /** `Color_0` (claro) .. `Color_1000` (oscuro). Ver "Capa de esquema de color". */
  baseColors: Record<string, ColorToken>;
  /** Focus (independiente del tono de marca, a propósito) y acentos de hue. */
  relationColors: Record<string, ColorToken>;
}

/**
 * Los cuatro estados que el sistema distingue. Cada uno es un esquema completo,
 * no un color: un error tiene relleno, texto encima, tinte de fondo y borde, y
 * los cuatro cambian con el modo igual que la marca.
 */
export type StatusName = "error" | "warning" | "success" | "info";

export const STATUS_NAMES: StatusName[] = [
  "error",
  "warning",
  "success",
  "info",
];

/**
 * Nomenclatura de "impresión de tinta": mode-independiente en el nombre, pero su
 * `$value` aliasea a un escalón distinto de la escala según el modo. Es donde
 * Light/Dark se invierte (Light: Base=Color_0=claro; Dark: Base=Color_1000).
 */
export type InkName =
  | "Base"
  | "Wash"
  | "Tint"
  | "Soft"
  | "Medium_Soft"
  | "Medium"
  | "Vivid"
  | "Vivid_Darker"
  | "Vivid_Darkest"
  | "Strong"
  | "Deep"
  | "Contrast"
  | "Light"
  | "Dark";

/** Un modo de color mapea cada impresión de tinta a un escalón de la escala. */
export type InkMap = Record<InkName, ColorToken> & {
  /** Los colores de relación reexpresados por modo (sombra, focus, acentos). */
  relationColors?: Record<string, ColorToken>;
};

/**
 * Los roles semánticos que un componente consume. Todo el resto del sistema se
 * expresa con estos diez nombres; un botón no conoce un color, conoce `Main`.
 */
export type RoleName =
  | "Canvas"
  | "Content"
  | "Main"
  | "On_Main"
  | "Surface"
  | "On_Surface"
  | "Mantle"
  | "Border"
  | "Content_Low"
  | "Focus";

/** Un modo de contraste mapea cada rol a una impresión de tinta. */
export type RoleMap = Record<RoleName, ColorToken>;

/**
 * Las seis capas de contraste de Matu. Cada una es un remapeo completo de los
 * diez roles; distintas superficies de la app consumen distintas capas.
 */
export type ContrastModeName =
  | "Canvas High"
  | "Canvas Low"
  | "Mantle High"
  | "Mantle Low"
  | "Solid"
  | "Highest";

/**
 * Las dos direcciones en las que Matu escribe la MISMA escalera de superficies.
 * Sus nombres lo dicen: en `Canvas High` el escalón del extremo de la rampa lo
 * ocupa el lienzo, en `Mantle High` lo ocupa el manto.
 *
 * Comparadas rol por rol, entre esas dos capas SOLO se intercambian `Canvas` y
 * `Mantle` —y `On_Surface`, que sigue a la que deja de ser tarjeta—; el
 * contenido, el borde y el foco son idénticos. Eso es lo que las vuelve dos
 * direcciones de una escalera y no dos temas.
 *
 * El nivel (`High`/`Low`) NO es parte de este eje: esa es la escala de contraste
 * del CONTENIDO —el rol `Content` de `Canvas High` contra el de `Canvas Low`— y
 * es otra decisión.
 *
 * De qué capa lee cada dirección, y qué rol le toca a cada superficie, lo decide
 * el adaptador (`NEUTRAL_TIERS`): es un reparto, no un dato del vocabulario.
 */
export type SurfaceStair = "Canvas" | "Mantle";

export const SURFACE_STAIRS: SurfaceStair[] = ["Canvas", "Mantle"];

/**
 * Cuánto contrasta el CONTENIDO con el lienzo: el otro eje que Matu escribe en
 * los nombres de sus capas, y que el adaptador leía en un solo nivel.
 *
 * Medido en `Blue Cated`, entre `Canvas High` y `Canvas Low` cambian DOS roles y
 * nada más: `Content` y `Content_Low`, los dos al tono vivo de la marca. El
 * contraste del texto contra la página baja de 20.27:1 a 6.91:1 en claro y de
 * 20.27:1 a 4.48:1 en oscuro. Es exactamente lo que Matu describe: «pasa el
 * content de contrast a vivid, y por eso baja el contraste con el canvas».
 *
 * Hay una consecuencia que conviene tener presente antes de elegir `Low`: los dos
 * roles quedan del MISMO color, así que **el texto secundario deja de
 * distinguirse del primario**. No es un defecto de la adaptación —es lo que la
 * capa dice— pero sí una decisión con costo, y el gate la mide como cualquier
 * otra: en oscuro, `Low` queda a 4.48:1 sobre la página, apenas por encima del
 * 4.5:1 que pide AA para texto, así que en algunos esquemas va a avisar.
 */
export type ContentContrast = "High" | "Low";

export const CONTENT_CONTRASTS: ContentContrast[] = ["High", "Low"];

/** Sin declararlo, el nivel firme: es el que el adaptador leía antes del eje. */
export const DEFAULT_CONTENT_CONTRAST: ContentContrast = "High";

/**
 * Dónde se usa la capa `Solid`: el cromo TEÑIDO de marca.
 *
 * `Solid` es la capa que Matu define para "el color como fondo", y hasta acá
 * solo la usaban los rellenos —el botón, los estados—. Pero una barra superior o
 * un menú lateral pintados con el color de la marca es una de las formas más
 * comunes de una aplicación, y no se podía pedir: el cromo leía siempre la capa
 * neutra.
 *
 * Es un eje y no dos booleanos porque las combinaciones no son independientes en
 * la práctica: barra teñida con lateral neutro y lateral teñido con barra neutra
 * son decisiones de identidad distintas, y ofrecerlas como dos casillas invita a
 * marcar las dos sin mirar qué pasa cuando se tocan.
 *
 * Ausente ⇒ nada teñido, que es lo de siempre.
 */
export type SolidChrome = "none" | "appBar" | "sidebar" | "both";

export const SOLID_CHROMES: SolidChrome[] = [
  "none",
  "appBar",
  "sidebar",
  "both",
];

export const DEFAULT_SOLID_CHROME: SolidChrome = "none";

/** La dirección que rige cuando el tema no declara ninguna: la de siempre. */
export const DEFAULT_SURFACE_STAIR: SurfaceStair = "Canvas";

// ─────────────────────────────────────────────────── Nivel 3: alias (Themes)

/**
 * La capa de alias de Matu: qué fuente para títulos, qué radio para botones,
 * qué peso para una etiqueta. No referencia color — solo primitivos.
 */
export interface MatuAliases {
  fontFamily: {
    tokens: Record<string, FontFamilyToken>;
    /** Paragraph/Title/Button/System → una de las familias de `tokens`. */
    alias: Record<string, FontFamilyToken>;
  };
  radius: Record<string, DimensionToken>;
  stroke: Record<string, DimensionToken>;
  opacity: Record<string, NumberToken>;
  weight: Record<string, FontWeightToken>;
  width: Record<string, DimensionToken>;
  height: Record<string, DimensionToken>;
  icons: {
    family: FontFamilyToken;
    strokeWidth: DimensionToken;
  };
}

// ──────────────────────────── Gap-fill: lo que Matu no expresa (lo pone doctrine)

/**
 * Overrides de lo que el export de Matu no puede decir: movimiento, z-index,
 * geometría del foco. Su ausencia hace que el resolver tome los defaults de
 * `doctrine.ts`; su presencia deja que un proyecto los afine sin salir del
 * grafo de autoría.
 */
export interface MatuGapFill {
  motion?: { speed?: "fast" | "default" | "slow" };
  layers?: { menu?: number; snackbar?: number; tooltip?: number };
  focus?: { width?: number; offset?: number; style?: "solid" | "dashed" };
  elevation?: "flat" | "layered";
}

// ───────────────────────────────────────────────────────── El documento entero

export interface MatuThemeDoc {
  $schema?: string;
  primitives: MatuPrimitives;
  colorScheme: MatuColorScheme;
  /**
   * Los esquemas de estado, en un eje PROPIO — y ahí está la diferencia con el
   * export de Matu, que es deliberada.
   *
   * En su Figma `Error` es un modo hermano de `Blue Cated` dentro de la misma
   * colección `Color Scheme`, y una colección de variables tiene un modo activo
   * por vez: una pantalla en la marca no puede resolver el estado de error al
   * mismo tiempo. Un botón de error sobre una pantalla de marca es hoy
   * irrepresentable ahí. No es un dato que falte — es un eje ortogonal modelado
   * como alternativa.
   *
   * Acá se lo separa porque leemos los archivos directo y no nos ata el límite
   * de Figma: un tema es marca × estados × modo × contraste. Esa estructura es
   * lo que se le propone a Matu (el artefacto de interop es el esquema, no los
   * datos), y mientras tanto el ensamblado los toma de sus mismos archivos.
   */
  statusSchemes: Record<StatusName, MatuColorScheme>;
  colorMode: { light: InkMap; dark: InkMap };
  contrast: Record<ContrastModeName, RoleMap>;
  theme: MatuAliases;
  effects: Record<string, ShadowToken>;
  overrides?: MatuGapFill;
}
