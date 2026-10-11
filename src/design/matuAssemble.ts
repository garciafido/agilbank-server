/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Ensamblado de una COMBINACIÓN del corpus de Matu a un `MatuThemeDoc`.
 *
 * PURO: no toca el disco. Vive separado de `import.ts` —que sí lo toca— porque
 * eso es lo que hace alcanzables las ~30 combinaciones: el corpus llega como
 * dato (`corpus.ts`) y ensamblar deja de ser un paso de dev para pasar a correr
 * en generación y en el navegador, con la misma función.
 *
 * Un "tema" es una COMBINACIÓN entre colecciones (un Color Scheme × un Themes,
 * con AMBOS Color Mode y las SEIS capas de Contrast); `assembleDoc` la arma y de
 * paso aplica las reglas de `normalize.ts` a cada hoja concreta. Los alias
 * (`{...}`) se preservan sin resolver — eso es trabajo de `resolve.ts`.
 */

import {
  ColorToken,
  ContrastModeName,
  DimensionToken,
  FontFamilyToken,
  FontWeightToken,
  InkMap,
  ContentContrast,
  MatuAliases,
  MatuColorScheme,
  MatuThemeDoc,
  NumberToken,
  Ref,
  RoleMap,
  STATUS_NAMES,
  SolidChrome,
  StatusName,
  SurfaceStair,
} from "./matuAuthoring";
import { brandBaseColors } from "./matuBrand";
import {
  canonicalHex,
  fixShadowRef,
  fixSpacing320,
  lineHeightToRatio,
  opacityToFraction,
  parseDimension,
  stripNLevels,
} from "./matuNormalize";

// ─────────────────────────────────────────────────────────── Forma cruda (JSON)

export interface RawLeaf {
  $type?: string;
  $value: unknown;
  $description?: string;
}
export type RawNode = RawLeaf | RawTree;
export interface RawTree {
  [key: string]: RawNode;
}

const isLeaf = (n: RawNode): n is RawLeaf =>
  n !== null && typeof n === "object" && "$value" in n;
const isRef = (v: unknown): v is string =>
  typeof v === "string" && /^\{.*\}$/.test(v.trim());

export interface Manifest {
  name: string;
  collections: Record<string, { modes: Record<string, string[]> }>;
  styles?: Record<string, string[]>;
}

/** El export de Tokens Studio, entero: el manifest y cada archivo ya parseado. */
export interface Corpus {
  manifest: Manifest;
  /** Contenido parseado de cada archivo, por nombre de archivo. */
  files: Record<string, RawTree>;
}

export interface Selection {
  /** Nombre del modo de Color Scheme, p. ej. "Neutral". Excluyente con `brand`. */
  colorScheme?: string;
  /**
   * El color semilla de una marca PROPIA del proyecto, p. ej. `"#2B6CB0"`.
   * Excluyente con `colorScheme`: una viene del corpus de Matu y la otra se
   * deriva acá (ver `brand.ts`), y las dos ocupan el mismo lugar del sistema.
   */
  brand?: string;
  /** Nombre del modo de Themes, p. ej. "Cated". */
  theme: string;
  /**
   * En qué DIRECCIÓN se lee la escalera de superficies: `"Canvas"` —el lienzo en
   * el extremo de la rampa, y lo elevado hacia adentro— o `"Mantle"`, la misma
   * escalera al revés (página apagada, tarjeta al frente).
   *
   * Es un eje propio porque Matu escribe las dos y hasta acá el adaptador leía
   * una sola: un tema que eleva ACLARANDO —tarjeta más clara que la página, como
   * está hecho el preset de siempre y buena parte de las interfaces densas— no
   * se podía expresar con ninguna combinación de marca, tema y acento.
   *
   * Ausente ⇒ la de siempre, que es exactamente lo que había antes del eje.
   */
  surfaces?: SurfaceStair;
  /**
   * Cuánto contrasta el CONTENIDO con el lienzo. Ver `ContentContrast`: es el
   * otro nivel que Matu escribe en los nombres de sus capas, y que el adaptador
   * leía en uno solo.
   *
   * Ausente ⇒ `High`, el nivel firme, que es lo de siempre.
   */
  contentContrast?: ContentContrast;
  /**
   * Dónde se usa la capa `Solid`: qué cromo va teñido de marca. Ver
   * `SolidChrome`.
   *
   * Ausente ⇒ nada teñido, que es lo de siempre.
   */
  solidChrome?: SolidChrome;
  /**
   * Qué modo de `Color Scheme` aporta cada estado. Se puede cambiar sin tocar
   * código —un proyecto podría querer su propio ámbar para "warning"— y por eso
   * es dato de la selección y no una constante del ensamblado.
   */
  statusSchemes?: Record<StatusName, string>;
}

/**
 * Si un valor nombra un esquema del corpus o es la semilla de uno derivado.
 *
 * La forma del valor alcanza para distinguirlos —ningún modo del corpus empieza
 * con `#`— y evita un segundo campo cuyo único trabajo sería decir cuál de los
 * dos se llenó.
 */
export const isColorSeed = (value: string): boolean =>
  value.trim().startsWith("#");

/**
 * Los modos que Matu ya trae para cada estado.
 *
 * Viven en la MISMA colección que la marca (ver `MatuThemeDoc.statusSchemes`):
 * en su Figma son alternativas excluyentes entre sí y con `Blue Cated`. Acá se
 * los lee como lo que son —un eje propio— y se los combina con la marca, que es
 * la composición que su archivo no puede expresar todavía.
 */
export const STATUS_MODES: Record<StatusName, string> = {
  error: "Error",
  warning: "Warning",
  success: "Success",
  info: "Info",
};

/**
 * La marca del corpus que se usa cuando la selección no nombra ninguna, y de la
 * que salen los colores de relación de una marca propia.
 *
 * Es la única del corpus con los acentos de hue poblados con colores reales; en
 * las demás vienen en blanco.
 */
export const BASELINE_COLOR_SCHEME = "Blue Cated";

/**
 * Las dos formas de nombrar una marca son excluyentes, y declarar las dos CORTA.
 *
 * La precedencia silenciosa sería peor que el error: las dos ocupan el mismo
 * lugar del sistema, y quien escribió las dos espera que mande alguna sin que
 * exista ninguna regla que diga cuál.
 */
export function checkBrandExclusivity(sel: Selection): void {
  if (sel.colorScheme && sel.brand) {
    throw new Error(
      `theme.base declara "colorScheme" ("${sel.colorScheme}") y "brand" ("${sel.brand}") a la vez, y son excluyentes.\n` +
        `"colorScheme" elige una de las marcas del corpus de Matu; "brand" deriva la del proyecto desde un color semilla. Dejar una sola.`
    );
  }
}

/** Resuelve el archivo de un modo dentro de una colección, o falla con un mensaje claro. */
function fileOfMode(m: Manifest, collection: string, mode: string): string {
  const col = m.collections[collection];
  if (!col)
    throw new Error(`El manifest no tiene la colección "${collection}".`);
  const files = col.modes[mode];
  if (!files || !files.length) {
    throw new Error(
      `La colección "${collection}" no tiene el modo "${mode}". Modos: ${Object.keys(
        col.modes
      ).join(", ")}`
    );
  }
  return files[0];
}

// ───────────────────────────────────────────────────────── Mapeo de cada hoja

/** Una hoja de dimensión: alias preservado, o valor normalizado (con el fix de s-320 por nombre). */
function dimToken(name: string, leaf: RawLeaf): DimensionToken {
  if (isRef(leaf.$value))
    return { $type: "dimension", $value: leaf.$value as Ref };
  return {
    $type: "dimension",
    $value: fixSpacing320(name, parseDimension(leaf.$value as string)),
  };
}

function numberToken(
  leaf: RawLeaf,
  transform: (v: string | number) => number
): NumberToken {
  if (isRef(leaf.$value))
    return { $type: "number", $value: leaf.$value as Ref };
  return { $type: "number", $value: transform(leaf.$value as string | number) };
}

function weightToken(leaf: RawLeaf): FontWeightToken {
  if (isRef(leaf.$value))
    return { $type: "fontWeight", $value: leaf.$value as Ref };
  return { $type: "fontWeight", $value: parseFloat(String(leaf.$value)) };
}

function colorToken(leaf: RawLeaf): ColorToken {
  const v = leaf.$value;
  if (isRef(v)) return { $type: "color", $value: fixShadowRef(v) };
  return { $type: "color", $value: canonicalHex(String(v)) };
}

function familyToken(leaf: RawLeaf): FontFamilyToken {
  return { $type: "fontFamily", $value: leaf.$value as string };
}

/** Recorre un grupo plano de hojas y las mapea con `fn`, saltando lo que no sea hoja. */
function mapLeaves<T>(
  tree: RawTree,
  fn: (name: string, leaf: RawLeaf) => T
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, node] of Object.entries(tree)) {
    if (isLeaf(node)) out[name] = fn(name, node);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────── Ensamblado

export function assembleDoc(corpus: Corpus, sel: Selection): MatuThemeDoc {
  checkBrandExclusivity(sel);

  const { manifest: m, files } = corpus;
  const file = (collection: string, mode: string) =>
    files[fileOfMode(m, collection, mode)];

  const prim = file("Tokens", Object.keys(m.collections["Tokens"].modes)[0]);
  const opacityGroup = prim["Opacity_Tokens"] as RawTree;

  const primitives = {
    radius: mapLeaves(prim["Radius_Tokens"] as RawTree, dimToken),
    spacing: mapLeaves(prim["Spacing_Tokens"] as RawTree, dimToken),
    lineHeight: mapLeaves(prim["Line_Height_Tokens"] as RawTree, (_n, l) =>
      numberToken(l, lineHeightToRatio)
    ),
    fontSize: mapLeaves(prim["Font_Size_Tokens"] as RawTree, dimToken),
    fontWeight: mapLeaves(prim["Font_Weight_Tokens"] as RawTree, (_n, l) =>
      weightToken(l)
    ),
    opacity: {
      base: mapLeaves(opacityGroup["Base"] as RawTree, (_n, l) =>
        numberToken(l, opacityToFraction)
      ),
      states: normalizeStates(opacityGroup["States"] as RawTree),
    },
  };

  const scheme = (mode: string): MatuColorScheme => {
    const tree = file("Color Scheme", mode);
    return {
      baseColors: mapLeaves(tree["Base_Colors"] as RawTree, (_n, l) =>
        colorToken(l)
      ),
      relationColors: mapLeaves(tree["Relation_Colors"] as RawTree, (_n, l) =>
        colorToken(l)
      ),
    };
  };

  // Los colores de relación NO se derivan de una semilla: el foco es
  // independiente del tono de marca a propósito, así que salen del corpus igual
  // que para las seis marcas de Matu.
  const derived = (seed: string): MatuColorScheme => ({
    baseColors: brandBaseColors(seed),
    relationColors: scheme(BASELINE_COLOR_SCHEME).relationColors,
  });

  const colorScheme: MatuColorScheme = sel.brand
    ? derived(sel.brand)
    : scheme(sel.colorScheme ?? BASELINE_COLOR_SCHEME);

  const statusModes = sel.statusSchemes ?? STATUS_MODES;
  const statusSchemes = {} as MatuThemeDoc["statusSchemes"];
  for (const name of STATUS_NAMES)
    statusSchemes[name] = scheme(statusModes[name]);

  const contrast = {} as Record<ContrastModeName, RoleMap>;
  for (const mode of Object.keys(m.collections["Color Contrast"].modes)) {
    const clean = stripNLevels(
      file("Color Contrast", mode) as Record<string, RawNode>
    );
    contrast[mode as ContrastModeName] = mapLeaves(clean as RawTree, (_n, l) =>
      colorToken(l)
    ) as RoleMap;
  }

  return {
    $schema: "https://design-tokens.org/tr/drafts/format/",
    primitives,
    colorScheme,
    statusSchemes,
    colorMode: {
      light: inkMap(file("Color Mode", "Light")),
      dark: inkMap(file("Color Mode", "Dark")),
    },
    contrast,
    theme: aliases(file("Themes", sel.theme)),
    effects: mapLeaves(effectsTree(corpus), (_n, l) =>
      shadowLeaf(l)
    ) as MatuThemeDoc["effects"],
  };
}

/** Las sombras viven en `manifest.styles`, no en `collections`. */
function effectsTree(corpus: Corpus): RawTree {
  const names = corpus.manifest.styles?.["effect"] ?? [];
  return names.length ? corpus.files[names[0]] : {};
}

function normalizeStates(
  states: RawTree
): MatuThemeDoc["primitives"]["opacity"]["states"] {
  const key = (
    raw: string
  ): keyof MatuThemeDoc["primitives"]["opacity"]["states"] => {
    const k = raw.replace(/_Opacity$/i, "").toLowerCase();
    return k as "hover" | "selected" | "active" | "disable";
  };
  const out = {} as MatuThemeDoc["primitives"]["opacity"]["states"];
  for (const [name, node] of Object.entries(states)) {
    if (isLeaf(node)) out[key(name)] = numberToken(node, opacityToFraction);
  }
  return out;
}

function inkMap(tree: RawTree): InkMap {
  const out: Record<string, ColorToken> = {};
  let relation: Record<string, ColorToken> | undefined;
  for (const [name, node] of Object.entries(tree)) {
    if (isLeaf(node)) out[name] = colorToken(node);
    // `Relation_Colors` es un sub-árbol de hojas, no una hoja: va a su propio campo.
    else if (name === "Relation_Colors")
      relation = mapLeaves(node as RawTree, (_n, l) => colorToken(l));
  }
  const result = out as unknown as InkMap;
  if (relation) result.relationColors = relation;
  return result;
}

function aliases(tree: RawTree): MatuAliases {
  const ff = tree["Font_Family"] as RawTree;
  const icons = tree["Icons_Alias"] as RawTree;
  return {
    fontFamily: {
      tokens: mapLeaves(ff["Tokens"] as RawTree, (_n, l) => familyToken(l)),
      alias: mapLeaves(ff["Alias"] as RawTree, (_n, l) => familyToken(l)),
    },
    radius: mapLeaves(tree["Radius_Alias"] as RawTree, dimToken),
    stroke: mapLeaves(tree["Stroke_Alias"] as RawTree, dimToken),
    opacity: mapLeaves(tree["Opacity_Alias"] as RawTree, (_n, l) =>
      numberToken(l, opacityToFraction)
    ),
    weight: mapLeaves(tree["Weight_Alias"] as RawTree, (_n, l) =>
      weightToken(l)
    ),
    width: mapLeaves(tree["Width_Alias"] as RawTree, dimToken),
    height: mapLeaves(tree["Height_Alias"] as RawTree, dimToken),
    icons: {
      family: familyToken(icons["Icons_Family"] as RawLeaf),
      strokeWidth: dimToken("Icons_Stroke", icons["Icons_Stroke"] as RawLeaf),
    },
  };
}

function shadowLeaf(leaf: RawLeaf): MatuThemeDoc["effects"][string] {
  const raw = leaf.$value as
    | Record<string, unknown>
    | Record<string, unknown>[];
  const layers = (Array.isArray(raw) ? raw : [raw]).map((l) => ({
    offsetX: l.offsetX as string,
    offsetY: l.offsetY as string,
    blur: l.blur as string,
    spread: l.spread as string,
    color: canonicalHex(fixShadowRef(l.color as string)),
  }));
  return { $type: "shadow", $value: layers };
}
