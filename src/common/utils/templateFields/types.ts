/**
 * Tipos del render de plantillas con catálogo y campos marcados.
 *
 * Un catálogo agrega filtros de formato y funciones de cálculo al entorno de
 * nunjucks. Las funciones declaran la clave del dato que imprimen, para que el
 * render con marcas pueda identificarlo.
 */

/** Violación de forma, o salida que no se pudo marcar. `line` cuenta desde 1. */
export interface TemplateWarning {
  line: number;
  reason: string;
}

/**
 * Función de cálculo del catálogo.
 * - `fn` devuelve un valor plano (nunca HTML marcado).
 * - `key` recibe los argumentos ya evaluados y `pathOf`, que da el camino en
 *   los datos de un objeto o lista (`"publishers[0]"`, `""` para la raíz) o
 *   `undefined` si no sale de los datos. Devuelve la clave del valor impreso;
 *   las claves calculadas empiezan con `@`. Sin `key`, la salida no se marca.
 */
export interface CatalogFunction {
  fn: (...args: any[]) => any;
  key?: (
    args: any[],
    pathOf: (value: unknown) => string | undefined
  ) => string | undefined;
}

export interface TemplateCatalog {
  /** Filtros de formato: no cambian la clave del valor que reciben. */
  filters?: Record<string, (...args: any[]) => any>;
  functions?: Record<string, CatalogFunction>;
}

/** Filtros que solo dan formato: los de nunjucks y los que registra haiku. */
export const BUILTIN_FORMAT_FILTERS: readonly string[] = [
  "upper",
  "lower",
  "capitalize",
  "title",
  "trim",
  "replace",
  "default",
  "safe",
  "escape",
  "aLetras",
  "formatDate",
];
