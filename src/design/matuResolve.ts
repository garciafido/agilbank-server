/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Resolución de un `MatuThemeDoc` (autoría, con alias) a un `MatuResolved`
 * (snapshot plano). Es el núcleo del sistema y su lógica más delicada, así que
 * los pasos van expuestos como funciones puras que se mutan una por una.
 *
 * El color se aplana en TRES etapas, que es como Matu lo encadena:
 *   escala (Color_NNN, hex)  →  tinta (Vivid → {Base_Colors.Color_600})
 *   →  rol (Main → {Vivid})  por cada una de las 6 capas de contraste.
 * La inversión claro/oscuro NO es un condicional: es que la capa de modo aliasea
 * cada tinta a un escalón distinto. Elegir modo es elegir tabla.
 *
 * Lo que Matu no expresa —movimiento, z-index, geometría del foco, la escalera
 * de 25 sombras que MUI espera— se ORIGINA en `doctrine.ts`. Los `overrides` del
 * documento lo afinan sin salir del grafo.
 */

import { Hex, compositeOver } from "./color";
import { ContrastLevel, Pair, checkPairs, formatFailures } from "./contrast";
import { CAPAS, FOCO, elevation, motion } from "./doctrine";
import { FocusRing, Layers, Motion } from "./types";
import {
  ColorToken,
  ContrastModeName,
  DimensionToken,
  FontFamilyToken,
  FontWeightToken,
  MatuColorScheme,
  MatuThemeDoc,
  NumberToken,
  RoleName,
  STATUS_NAMES,
} from "./matuAuthoring";
import { Dim } from "./matuNormalize";
import { composeRamp } from "./matuRamp";
import {
  MatuResolved,
  ResolvedAliases,
  ResolvedMode,
  ResolvedPrimitives,
  ResolvedRoles,
} from "./matuSnapshot";

export interface MatuResolveOptions {
  warn?: (message: string) => void;
  level?: ContrastLevel;
  onFailure?: "warn" | "error";
}

// ─────────────────────────────────────────────────────────────── Utilidades

const isRefStr = (v: unknown): v is string =>
  typeof v === "string" && /^\{.*\}$/.test(v.trim());

/** Los segmentos de un alias `{a.b.c}` → `["a","b","c"]`. */
export function refSegments(ref: string): string[] {
  return ref.trim().replace(/^\{/, "").replace(/\}$/, "").split(".");
}

/** Una dimensión canónica a px. Matu es todo px; rem se convierte con base 16. */
export function dimToPx(dim: Dim): number {
  return dim.unit === "rem" ? dim.value * 16 : dim.value;
}

function mapValues<V, R>(
  obj: Record<string, V>,
  fn: (v: V, k: string) => R
): Record<string, R> {
  const out: Record<string, R> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = fn(v, k);
  return out;
}

function dimValue(t: DimensionToken): number {
  if (isRefStr(t.$value))
    throw new Error(
      `Primitivo de dimensión inesperadamente sin resolver: ${t.$value}`
    );
  return dimToPx(t.$value as Dim);
}
function numValue(t: NumberToken | FontWeightToken): number {
  if (isRefStr(t.$value))
    throw new Error(
      `Primitivo numérico inesperadamente sin resolver: ${t.$value}`
    );
  return t.$value as number;
}

// ─────────────────────────────────────────────────── Color: deref en 3 etapas

export interface ColorCtx {
  baseColors?: Record<string, string>;
  relation?: Record<string, string>;
  ink?: Record<string, string>;
}

/** Resuelve un valor de color (hex concreto o alias) contra un contexto; null si el alias no existe. */
export function tryResolveColor(value: string, ctx: ColorCtx): string | null {
  if (!isRefStr(value)) return value;
  const segs = refSegments(value);
  if (segs.length === 1) return ctx.ink?.[segs[0]] ?? null;
  const [first, ,] = segs;
  const last = segs[segs.length - 1];
  if (first === "Base_Colors") return ctx.baseColors?.[last] ?? null;
  if (first === "Relation_Colors") return ctx.relation?.[last] ?? null;
  return null;
}

/** Igual que `tryResolveColor` pero exige que resuelva: un rol que no resuelve es un error de tema. */
export function resolveColor(
  value: string,
  ctx: ColorCtx,
  what: string
): string {
  const hex = tryResolveColor(value, ctx);
  if (hex === null)
    throw new Error(`No se pudo resolver el color de ${what}: "${value}".`);
  return hex;
}

const hexOf = (t: ColorToken): string => String(t.$value);

// ────────────────────────────────────────────────────────────── Primitivos

export function resolvePrimitives(doc: MatuThemeDoc): ResolvedPrimitives {
  const p = doc.primitives;
  return {
    radius: mapValues(p.radius, dimValue),
    spacing: mapValues(p.spacing, dimValue),
    fontSize: mapValues(p.fontSize, dimValue),
    lineHeight: mapValues(p.lineHeight, numValue),
    fontWeight: mapValues(p.fontWeight, numValue),
    opacity: mapValues(p.opacity.base, numValue),
  };
}

// ───────────────────────────────────────────────────────────── Alias (Themes)

/** Grupo de primitivo → categoría resuelta, para desreferenciar los alias de Themes. */
const CATEGORY: Record<string, keyof ResolvedPrimitives> = {
  Radius_Tokens: "radius",
  Spacing_Tokens: "spacing",
  Font_Size_Tokens: "fontSize",
  Line_Height_Tokens: "lineHeight",
  Font_Weight_Tokens: "fontWeight",
  Opacity_Tokens: "opacity",
};

/** Un alias escalar `{Grupo.…​.Token}` → su número; el primer segmento elige categoría, el último el token. */
export function derefScalar(ref: string, prims: ResolvedPrimitives): number {
  const segs = refSegments(ref);
  const cat = CATEGORY[segs[0]];
  const name = segs[segs.length - 1];
  if (!cat) throw new Error(`Alias con grupo desconocido: "${ref}".`);
  const v = prims[cat][name];
  if (v === undefined)
    throw new Error(`Alias "${ref}" apunta a un token ausente ("${name}").`);
  return v;
}

function scalarFromDim(t: DimensionToken, prims: ResolvedPrimitives): number {
  return isRefStr(t.$value)
    ? derefScalar(t.$value as string, prims)
    : dimToPx(t.$value as Dim);
}
function scalarFromNumber(
  t: NumberToken | FontWeightToken,
  prims: ResolvedPrimitives
): number {
  return isRefStr(t.$value)
    ? derefScalar(t.$value as string, prims)
    : (t.$value as number);
}

function resolveAliases(
  doc: MatuThemeDoc,
  prims: ResolvedPrimitives
): ResolvedAliases {
  const ff = doc.theme.fontFamily;
  const familyTokens = mapValues(ff.tokens, (t) => String(t.$value));
  const familyOf = (t: FontFamilyToken): string =>
    isRefStr(t.$value)
      ? familyTokens[refSegments(t.$value as string).slice(-1)[0]] ??
        String(t.$value)
      : String(t.$value);

  return {
    fontFamily: mapValues(ff.alias, familyOf),
    radius: mapValues(doc.theme.radius, (t) => scalarFromDim(t, prims)),
    stroke: mapValues(doc.theme.stroke, (t) => scalarFromDim(t, prims)),
    opacity: mapValues(doc.theme.opacity, (t) => scalarFromNumber(t, prims)),
    weight: mapValues(doc.theme.weight, (t) => scalarFromNumber(t, prims)),
    width: mapValues(doc.theme.width, (t) => scalarFromDim(t, prims)),
    height: mapValues(doc.theme.height, (t) => scalarFromDim(t, prims)),
    icons: {
      family: String(doc.theme.icons.family.$value),
      strokeWidth: scalarFromDim(doc.theme.icons.strokeWidth, prims),
    },
  };
}

// ─────────────────────────────────────────────────────── Color por modo

/**
 * Resuelve un modo entero (light o dark) para UN esquema: las 6 capas de
 * contraste, cada una con sus 10 roles.
 *
 * Toma el esquema por parámetro y no del documento porque la marca y los cuatro
 * estados recorren exactamente el mismo camino con distinta escala — que es la
 * propiedad que hace que un estado sea un esquema y no un color suelto.
 */
export function resolveScheme(
  scheme: MatuColorScheme,
  doc: Pick<MatuThemeDoc, "colorMode" | "contrast">,
  mode: "light" | "dark"
): {
  resolved: ResolvedMode;
  ink: Record<string, string>;
  relation: Record<string, string>;
} {
  const baseColors = mapValues(scheme.baseColors, hexOf);
  const schemeRelation = mapValues(scheme.relationColors, hexOf);

  // Etapa tinta: cada impresión aliasea a un escalón de la escala.
  const inkMap = doc.colorMode[mode];
  const ink: Record<string, string> = {};
  for (const [name, tok] of Object.entries(inkMap)) {
    if (name === "relationColors") continue;
    ink[name] = resolveColor(
      (tok as ColorToken).$value as string,
      { baseColors, relation: schemeRelation },
      `tinta ${name} (${mode})`
    );
  }
  // Los colores de relación del modo: hex concretos (Shadow) o alias a la escala del esquema.
  const relation: Record<string, string> = {};
  for (const [name, tok] of Object.entries(inkMap.relationColors ?? {})) {
    relation[name] = resolveColor(
      tok.$value as string,
      { baseColors, relation: schemeRelation },
      `relación ${name} (${mode})`
    );
  }

  // Etapa rol: cada capa de contraste mapea los 10 roles a impresiones o relaciones.
  const contrast = {} as ResolvedMode["contrast"];
  for (const [cmode, roles] of Object.entries(doc.contrast) as [
    ContrastModeName,
    Record<RoleName, ColorToken>
  ][]) {
    contrast[cmode] = mapValues(roles, (tok, role) =>
      resolveColor(
        tok.$value as string,
        { ink, relation, baseColors },
        `rol ${role} en ${cmode} (${mode})`
      )
    ) as ResolvedRoles;
  }

  return { resolved: { contrast }, ink, relation };
}

/** El esquema de MARCA del documento, que es el que además aporta el contexto de los efectos. */
export function resolveMode(doc: MatuThemeDoc, mode: "light" | "dark") {
  return resolveScheme(doc.colorScheme, doc, mode);
}

// ─────────────────────────────────────────────────────────────── Efectos

/** `"0px 2px 4px 0px #5555554d"` desde una capa de sombra; null si el color no resuelve. */
export function shadowCss(
  layers: {
    offsetX: string;
    offsetY: string;
    blur: string;
    spread: string;
    color: string;
  }[],
  ctx: ColorCtx
): string | null {
  const parts: string[] = [];
  for (const l of layers) {
    const color = tryResolveColor(l.color, ctx);
    if (color === null) return null; // p. ej. {Hover}/{Active}, que el export deja sin definir
    parts.push(`${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${color}`);
  }
  return parts.join(", ");
}

function resolveEffects(
  doc: MatuThemeDoc,
  ctx: ColorCtx
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, tok] of Object.entries(doc.effects)) {
    const raw = tok.$value;
    if (isRefStr(raw)) continue;
    const layers = Array.isArray(raw) ? raw : [raw];
    const css = shadowCss(layers, ctx);
    if (css !== null) out[name] = css; // los que no resuelven se descartan, no se emiten rotos
  }
  return out;
}

// ─────────────────────────────────────────────────────── Gate de contraste

/**
 * Los pares que se comprueban sobre los roles resueltos. Es el análogo Matu de
 * `semanticMap.pairsOf`: se mira la capa `Canvas High` de cada modo, que es la
 * de las superficies principales. `text` para lo que lleva texto, `ui` para lo
 * que identifica un control (borde, foco) — el umbral 1.4.11.
 */
export function pairsOfRoles(label: string, r: ResolvedRoles): Pair[] {
  return [
    {
      name: `${label}.Content/Canvas`,
      background: r.Canvas,
      foreground: r.Content,
      kind: "text",
    },
    {
      name: `${label}.OnMain/Main`,
      background: r.Main,
      foreground: r.On_Main,
      kind: "text",
    },
    {
      name: `${label}.OnSurface/Surface`,
      background: r.Surface,
      foreground: r.On_Surface,
      kind: "text",
    },
    {
      name: `${label}.ContentLow/Surface`,
      background: r.Surface,
      foreground: r.Content_Low,
      kind: "text",
    },
    {
      name: `${label}.Border/Surface`,
      background: r.Surface,
      foreground: r.Border,
      kind: "ui",
    },
    {
      name: `${label}.Focus/Canvas`,
      background: r.Canvas,
      foreground: r.Focus,
      kind: "ui",
    },
  ];
}

/**
 * De un estado se comprueban DOS pares, no los seis.
 *
 * Un estado se usa de dos formas: relleno (el chip rojo, capa `Solid`) y tinte
 * (el fondo suave de un aviso, capa `Canvas High`). Lo demás de sus capas no
 * llega a la pantalla, y avisar de eso sería ruido — la misma razón por la que
 * `pairsOf` no le exige 3:1 a un borde decorativo.
 */
export function pairsOfStatus(label: string, mode: ResolvedMode): Pair[] {
  const solid = mode.contrast["Solid"];
  const canvas = mode.contrast["Canvas High"];
  return [
    {
      name: `${label}.relleno`,
      background: solid.Canvas,
      foreground: solid.Content,
      kind: "text",
    },
    {
      name: `${label}.tinte`,
      background: canvas.Surface,
      foreground: canvas.On_Surface,
      kind: "text",
    },
  ];
}

/**
 * Los pares de un acento que NO sale del esquema de superficies.
 *
 * Mientras el acento era el mismo esquema, cada par que llegaba a la pantalla
 * tenía sus dos colores sacados de la misma rampa y el gate de `pairsOfRoles`
 * los cubría. Con el eje separado hay pares REALES cuyos dos lados vienen de
 * esquemas distintos —y son justamente los que nadie eligió a la vez—, así que
 * hay que medirlos: un acento que contrasta consigo mismo no dice nada de cómo
 * se ve sobre la página que lo rodea.
 *
 * `selected` es la opacidad del renglón activo del menú, que el adaptador
 * compone acá mismo: medir el acento sin lavar sería medir un color que no
 * aparece en pantalla.
 */
export function pairsOfAccent(
  label: string,
  accent: ResolvedMode,
  surfaces: ResolvedMode,
  selected: number
): Pair[] {
  const solid = accent.contrast["Solid"];
  const tinte = accent.contrast["Canvas High"];
  const base = surfaces.contrast["Canvas High"];
  const seleccionado = compositeOver(
    tinte.Main as Hex,
    base.Mantle as Hex,
    selected
  );
  return [
    {
      name: `${label}.relleno`,
      background: solid.Canvas,
      foreground: solid.Content,
      kind: "text",
    },
    {
      name: `${label}.tinte`,
      background: tinte.Surface,
      foreground: tinte.On_Surface,
      kind: "text",
    },
    // El botón relleno contra la página que lo rodea: sin texto de por medio, es
    // el borde del propio control lo que hay que poder ver (1.4.11).
    {
      name: `${label}.sobre-página`,
      background: base.Canvas,
      foreground: solid.Canvas,
      kind: "ui",
    },
    // El renglón activo del menú: acento lavado sobre el fondo del menú, con el
    // texto que sigue siendo el de las superficies.
    {
      name: `${label}.seleccionado`,
      background: seleccionado,
      foreground: base.Content,
      kind: "text",
    },
  ];
}

// ──────────────────────────────────────────────────────────── Punto de entrada

export function resolveMatu(
  doc: MatuThemeDoc,
  options: MatuResolveOptions = {}
): MatuResolved {
  const warn = options.warn ?? ((m: string) => console.warn(m));
  const level: ContrastLevel = options.level ?? "AA";

  const prims = resolvePrimitives(doc);
  const aliases = resolveAliases(doc, prims);

  const lightM = resolveMode(doc, "light");
  const darkM = resolveMode(doc, "dark");

  const gap = doc.overrides ?? {};
  const mov: Motion = motion(gap.motion?.speed ?? "default");
  const layers: Layers = {
    menu: gap.layers?.menu ?? CAPAS.menu,
    snackbar: gap.layers?.snackbar ?? CAPAS.snackbar,
    tooltip: gap.layers?.tooltip ?? CAPAS.tooltip,
  };
  const focus: FocusRing = {
    width: gap.focus?.width ?? FOCO.width,
    offset: gap.focus?.offset ?? FOCO.offset,
    style: gap.focus?.style ?? FOCO.style,
  };
  const shadows = elevation(gap.elevation ?? "layered").shadows;

  // La escala del esquema, resuelta una vez: la consumen los efectos (que
  // aliasean escalones para el color de sombra) y viaja en el snapshot, que es
  // lo único que puede decir aguas abajo de qué escala salieron las capas.
  const baseColors = mapValues(doc.colorScheme.baseColors, hexOf);

  // Los efectos se resuelven en el contexto del modo claro (la sombra es la
  // misma en ambos; el color de sombra vive en `relationColors` del modo).
  const effects = resolveEffects(doc, {
    ink: lightM.ink,
    relation: lightM.relation,
    baseColors,
  });

  const parrafo =
    aliases.fontFamily["Paragraph_Font_Family"] ??
    Object.values(aliases.fontFamily)[0] ??
    "sans-serif";
  const typography = composeRamp(
    { fontSize: prims.fontSize, lineHeight: prims.lineHeight },
    parrafo,
    aliases.weight["Button_Label_Weight"] ?? 500,
    aliases.fontFamily["Title_Font_Family"] ?? parrafo,
    aliases.fontFamily["Button_Font_Family"] ?? parrafo
  );

  const states = mapValues(
    doc.primitives.opacity.states,
    numValue
  ) as MatuResolved["states"];

  // Los estados recorren el mismo camino que la marca. El gate de contraste NO
  // se les aplica dos veces: sus pares se suman abajo, junto con los de marca,
  // para que un fallo diga en qué estado está y no en un informe aparte.
  const status = {} as MatuResolved["status"];
  for (const name of STATUS_NAMES) {
    const scheme = doc.statusSchemes[name];
    if (!scheme)
      throw new Error(`El documento no trae el esquema de estado "${name}".`);
    status[name] = {
      light: resolveScheme(scheme, doc, "light").resolved,
      dark: resolveScheme(scheme, doc, "dark").resolved,
    };
  }

  // Gate: la capa Canvas High de cada modo, que es la de las superficies base.
  const pairs = [
    ...pairsOfRoles("light", lightM.resolved.contrast["Canvas High"]),
    ...pairsOfRoles("dark", darkM.resolved.contrast["Canvas High"]),
    ...STATUS_NAMES.flatMap((name) => [
      ...pairsOfStatus(`light.${name}`, status[name].light),
      ...pairsOfStatus(`dark.${name}`, status[name].dark),
    ]),
  ];
  const report = checkPairs(pairs, level, []);
  if (report.failures.length > 0) {
    const message = formatFailures(report.failures, level);
    if ((options.onFailure ?? "warn") === "error") throw new Error(message);
    warn(message);
  }

  return {
    baseColors,
    primitives: prims,
    aliases,
    typography,
    states,
    effects,
    motion: mov,
    layers,
    focus,
    shadows,
    light: lightM.resolved,
    dark: darkM.resolved,
    status,
  };
}
