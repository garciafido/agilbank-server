/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

/**
 * Elegir una combinación del sistema de diseño de Matu.
 *
 * El corpus tiene dos ejes que se combinan —seis marcas (`Color Scheme`) por
 * cinco temas (`Themes`)—, y hasta acá solo una de esas ~30 combinaciones era
 * alcanzable. Este módulo es el que las hace elegibles: ensambla, resuelve y
 * valida la que se pida, desde el corpus committeado y sin tocar el disco.
 *
 * Es PURO a propósito: corre igual en generación y en el navegador (el banco de
 * diseño resuelve con esta misma función, no con una aproximación).
 */

import { MATU_CORPUS } from "./matuCorpus";
import { MatuResolved } from "./matuSnapshot";
import {
  BASELINE_COLOR_SCHEME,
  RawNode,
  RawTree,
  STATUS_MODES,
  Selection,
  assembleDoc,
  checkBrandExclusivity,
} from "./matuAssemble";
import {
  CONTENT_CONTRASTS,
  ContentContrast,
  SOLID_CHROMES,
  SURFACE_STAIRS,
  SolidChrome,
  SurfaceStair,
} from "./matuAuthoring";
import { PROJECT_BRAND_NAME } from "./matuBrand";
import { resolveMatu } from "./matuResolve";
import { validateResolved } from "./matuValidate";

/**
 * La combinación estándar: la que recibe un proyecto que no elige ninguna.
 *
 * `Blue Cated` trae los colores de relación poblados (foco, acentos) y una marca
 * azul real.
 */
export const BASELINE_SELECTION: Selection = {
  colorScheme: BASELINE_COLOR_SCHEME,
  theme: "Cated",
};

/** Los cuatro modos de `Color Scheme` que son el eje de ESTADOS, no marcas. */
const STATUS_MODE_SET = new Set(Object.values(STATUS_MODES));

const modesOf = (collection: string): string[] =>
  Object.keys(MATU_CORPUS.manifest.collections[collection]?.modes ?? {});

/** Las marcas elegibles: los modos de `Color Scheme` menos los cuatro de estado. */
export const matuColorSchemes = (): string[] =>
  modesOf("Color Scheme").filter((m) => !STATUS_MODE_SET.has(m));

/** Los temas elegibles: los modos de `Themes`. */
export const matuThemes = (): string[] => modesOf("Themes");

/**
 * Las familias tipográficas que los temas del corpus declaran
 * (`Font_Family.Tokens`), sin repetir y en orden estable.
 *
 * Sale del corpus y no de una lista escrita a mano por lo mismo que las otras
 * dos listas de arriba: una copia se desincroniza en silencio. Es lo que deja
 * que un proyecto con el banco encendido cargue las webfonts que esos temas
 * piden de verdad — cuáles de ellas tienen paquete lo decide el catálogo
 * (`fonts.ts`), no este módulo.
 */
export const matuFontFamilies = (): string[] => {
  const isTree = (node: RawNode | undefined): node is RawTree =>
    node !== undefined && !("$value" in node);
  const subTree = (
    node: RawNode | undefined,
    key: string
  ): RawTree | undefined => {
    const child = isTree(node) ? node[key] : undefined;
    return isTree(child) ? child : undefined;
  };

  const names = new Set<string>();
  for (const files of Object.values(
    MATU_CORPUS.manifest.collections["Themes"]?.modes ?? {}
  )) {
    for (const file of files) {
      const tokens = subTree(
        MATU_CORPUS.files[file]?.["Font_Family"],
        "Tokens"
      );
      for (const leaf of Object.values(tokens ?? {})) {
        if ("$value" in leaf && typeof leaf.$value === "string")
          names.add(leaf.$value);
      }
    }
  }
  return [...names].sort();
};

/**
 * Las direcciones elegibles de la escalera de superficies.
 *
 * No salen del corpus como las otras dos listas: el corpus trae las seis capas,
 * pero cuáles de ellas son la MISMA escalera en sentidos opuestos es una lectura
 * del sistema, no un dato suyo. Vive en el vocabulario (`SurfaceStair`) y el
 * reparto de roles de cada una, en el adaptador.
 */
export const matuSurfaces = (): SurfaceStair[] => SURFACE_STAIRS;

/** Los dos niveles de contraste del contenido. Ver `ContentContrast`. */
export const matuContentContrasts = (): ContentContrast[] => CONTENT_CONTRASTS;

/** Dónde se puede pedir el cromo teñido. Ver `SolidChrome`. */
export const matuSolidChromes = (): SolidChrome[] => SOLID_CHROMES;

/**
 * Comprueba que la combinación exista, y si no CORTA.
 *
 * Sin esto el fallo natural sería caer a la combinación estándar: pedir "Tech" y
 * recibir "Cated" sin que nada avise es peor que no poder elegir, porque el
 * proyecto cree que aplicó una decisión que no se aplicó.
 */
export function checkMatuSelection(sel: Selection): void {
  checkBrandExclusivity(sel);

  const brands = matuColorSchemes();
  const themes = matuThemes();

  // Una marca propia no se busca en el corpus: no está ahí, y ese es el punto.
  // Su semilla la comprueba `brandBaseColors` al derivarla.
  if (sel.colorScheme !== undefined && !brands.includes(sel.colorScheme)) {
    // Cruzar los dos ejes es el error más fácil de cometer: los dos son nombres
    // sueltos y ninguno dice a qué colección pertenece.
    const hint = themes.includes(sel.colorScheme)
      ? ` "${sel.colorScheme}" sí es un tema: ¿están cruzados los dos ejes?`
      : STATUS_MODE_SET.has(sel.colorScheme)
      ? ` "${sel.colorScheme}" nombra el eje de estados, que viene con cualquier marca y no se elige acá.`
      : "";
    throw new Error(
      `El esquema de color "${sel.colorScheme}" no existe en el sistema de diseño Matu.\n` +
        `Disponibles: ${brands.join(", ")}.${hint}`
    );
  }

  if (!themes.includes(sel.theme)) {
    const hint = brands.includes(sel.theme)
      ? ` "${sel.theme}" sí es un esquema de color: ¿están cruzados los dos ejes?`
      : "";
    throw new Error(
      `El tema "${sel.theme}" no existe en el sistema de diseño Matu.\n` +
        `Disponibles: ${themes.join(", ")}.${hint}`
    );
  }

  /**
   * El acento fue un eje y ya no lo es: el sistema de Matu no lo tiene. Un
   * `accent` que sobreviva en un `hkconfig.json` CORTA en vez de ignorarse.
   *
   * Ignorarlo sería fallar abierto de la peor forma: el proyecto declaró un color
   * de énfasis, recibe un tema donde los botones son del color de la marca, y
   * nada avisa. El mensaje tiene que decir las dos cosas —que el eje se fue y qué
   * hacer en su lugar— porque quien lo lee eligió ese color por algo.
   */
  if ((sel as { accent?: unknown }).accent !== undefined) {
    throw new Error(
      `El tema declara "theme.base.accent", que ya no existe.\n` +
        `El sistema de diseño de Matu no tiene un eje de acento: la misma rampa de ` +
        `once pasos pinta las superficies y los controles, así que un color de ` +
        `énfasis aparte no es expresable.\n` +
        `Para que los controles tengan ESE color, declaralo como marca: ` +
        `theme.base.brand = "..." (y sacá "colorScheme", que es excluyente). ` +
        `Las superficies se van a teñir de él.`
    );
  }

  // La dirección se comprueba por nombre y no armando: no elige nada del corpus
  // —elige de cuál de sus capas lee el adaptador—, así que una desconocida no
  // falla al ensamblar sino al pintar, con una capa que no existe.
  if (sel.surfaces !== undefined && !SURFACE_STAIRS.includes(sel.surfaces)) {
    throw new Error(
      `La dirección de superficies "${sel.surfaces}" no existe.\n` +
        `Disponibles: ${SURFACE_STAIRS.join(
          ", "
        )}. Es la escalera de superficies, ` +
        `no una capa de contraste: el nivel de contraste del contenido no se elige acá.`
    );
  }

  // Los dos ejes de abajo se comprueban por nombre y por el mismo motivo que la
  // dirección: no eligen nada del corpus —eligen de qué capa lee el adaptador, o
  // qué superficie la usa—, así que uno desconocido no falla al ensamblar sino al
  // pintar, con una capa que no existe o un cromo que quedó neutro sin aviso.
  if (
    sel.contentContrast !== undefined &&
    !CONTENT_CONTRASTS.includes(sel.contentContrast)
  ) {
    throw new Error(
      `El nivel de contraste del contenido "${sel.contentContrast}" no existe.\n` +
        `Disponibles: ${CONTENT_CONTRASTS.join(
          ", "
        )}. Es cuánto contrasta el TEXTO con ` +
        `el lienzo, no la dirección de la escalera de superficies.`
    );
  }

  if (
    sel.solidChrome !== undefined &&
    !SOLID_CHROMES.includes(sel.solidChrome)
  ) {
    throw new Error(
      `El cromo teñido "${sel.solidChrome}" no existe.\n` +
        `Disponibles: ${SOLID_CHROMES.join(", ")}.`
    );
  }

  for (const [status, mode] of Object.entries(sel.statusSchemes ?? {})) {
    if (!modesOf("Color Scheme").includes(mode)) {
      throw new Error(
        `El esquema "${mode}", elegido para el estado "${status}", no existe en el sistema de diseño Matu.\n` +
          `Disponibles: ${modesOf("Color Scheme").join(", ")}.`
      );
    }
  }
}

const CACHE = new Map<string, MatuResolved>();

const cacheKey = (sel: Selection) =>
  JSON.stringify([
    sel.colorScheme ?? null,
    sel.brand ?? null,
    sel.theme,
    sel.surfaces ?? null,
    sel.contentContrast ?? null,
    sel.solidChrome ?? null,
    sel.statusSchemes ?? null,
  ]);

/**
 * Cómo se nombra la marca de una selección ya resuelta.
 *
 * Una marca propia se nombra por lo que es y no por su semilla: la pantalla que
 * la muestra tiene que poder decir que NO es una de las seis de Matu, y un hex
 * suelto no lo dice. La semilla viaja aparte, para quien la necesite.
 */
const brandOf = (sel: Selection) =>
  sel.brand
    ? { colorScheme: PROJECT_BRAND_NAME, brand: sel.brand }
    : { colorScheme: sel.colorScheme ?? BASELINE_COLOR_SCHEME };

/**
 * La combinación pedida, ensamblada y resuelta desde el corpus.
 *
 * Se valida SIEMPRE y no solo al hornear: una combinación puede existir en el
 * manifest y estar incompleta en el corpus, y ahí el fallo tiene que ser un
 * mensaje y no una pantalla a medio pintar.
 */
export function matuResolvedFor(
  sel: Selection = BASELINE_SELECTION
): MatuResolved {
  // La validación va ANTES del cache y no después. La clave se arma con los ejes
  // que el sistema conoce, así que una selección con una clave que NO es un eje
  // —un `accent` sobreviviente— produce la misma clave que la válida y el cache
  // devolvía un tema en vez de cortar: el gate quedaba salteado justo en el caso
  // que existe para atajar. Validar primero cuesta unas comparaciones de string.
  checkMatuSelection(sel);

  const key = cacheKey(sel);
  const cached = CACHE.get(key);
  if (cached) return cached;
  const selection = {
    ...brandOf(sel),
    theme: sel.theme,
    ...(sel.surfaces ? { surfaces: sel.surfaces } : {}),
    ...(sel.contentContrast ? { contentContrast: sel.contentContrast } : {}),
    ...(sel.solidChrome ? { solidChrome: sel.solidChrome } : {}),
  };
  const resolved: MatuResolved = {
    ...resolveMatu(assembleDoc(MATU_CORPUS, sel), { warn: () => {} }),
    selection,
  };

  const report = validateResolved(resolved);
  if (!report.ok) {
    throw new Error(
      `La combinación ${selection.colorScheme} × ${selection.theme}` +
        ` no arma un tema aplicable:\n${report.errors.join("\n")}`
    );
  }

  CACHE.set(key, resolved);
  return resolved;
}
