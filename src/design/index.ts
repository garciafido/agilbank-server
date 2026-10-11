/**
 * ARCHIVO GENERADO — no editar.
 *
 * Copia literal del módulo de diseño del generador. Se emite en vez de
 * reescribirse para que la escala que se ve al probar sea exactamente la que
 * después se genera.
 */

export * from "./color";
export * from "./scale";
export * from "./contrast";
export * from "./semanticMap";
export * from "./doctrine";
export * from "./derived";
export * from "./shuffle";
export * from "./presets";
export * from "./fonts";
export { resolveTheme } from "./resolve";
export type { ResolveOptions } from "./resolve";
export { RANGOS, resolveAuthoring, pickActiveTheme } from "./applied";
export type { ThemeAuthoring, ThemeDraftShape } from "./applied";
export { TEMAS_DE_FABRICA, gemeloMovible } from "./catalog";
export {
  ZONAS,
  cadenaDeColor,
  caminosDeColor,
  caminosDeTokens,
  queCambio,
  zonasTocadas,
} from "./laboratorio";
export type { Caminos, Eslabon, Zona } from "./laboratorio";
export type { ClaseDeTema, TemaDeFabrica } from "./catalog";
export type {
  SemanticSet,
  Surface,
  HaikuThemeConfig,
  ResolvedTheme,
  Primitives,
  ComponentTokens,
} from "./types";

// La ruta Matu. Se exporta por nombre y no con `export *` porque su vocabulario
// se cruza con el interno —los dos tienen un `resolve` y un `validate`— y un
// barril que los mezcla deja que se elija el equivocado sin que nada avise.
export { matuToPreset, matuLayers } from "./matuAdapter";
export type { MatuLayers } from "./matuAdapter";
export { resolveMatu } from "./matuResolve";
export { validateResolved } from "./matuValidate";
export { composeRamp } from "./matuRamp";
export { assembleDoc, isColorSeed } from "./matuAssemble";
export type { Corpus, Selection } from "./matuAssemble";
export { MATU_CORPUS } from "./matuCorpus";
export { PROJECT_BRAND_NAME } from "./matuBrand";
export {
  BASELINE_SELECTION,
  matuColorSchemes,
  matuContentContrasts,
  matuResolvedFor,
  matuSolidChromes,
  matuSurfaces,
  matuThemes,
} from "./matuSelection";
export type { MatuResolved, ResolvedMode, ResolvedRoles } from "./matuSnapshot";
export { DEFAULT_SURFACE_STAIR } from "./matuAuthoring";
export type {
  MatuThemeDoc,
  ContentContrast,
  ContrastModeName,
  RoleName,
  SolidChrome,
  StatusName,
  SurfaceStair,
} from "./matuAuthoring";
