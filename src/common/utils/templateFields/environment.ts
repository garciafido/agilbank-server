import * as nunjucks from "nunjucks";
import { aLetrasFilter } from "../nunjucksMacros/aLetras";
import { formatDateFilter } from "../nunjucksMacros/formatDate";
import type { TemplateCatalog } from "./types";

/**
 * Entorno de nunjucks de los renders de plantillas: autoescape activo,
 * variables indefinidas como vacío, los filtros `aLetras` y `formatDate`, y
 * los filtros y funciones del catálogo (las funciones quedan como globales).
 */
export function createEnvironment(
  catalog?: TemplateCatalog
): nunjucks.Environment {
  const env = new nunjucks.Environment(null, {
    autoescape: true,
    throwOnUndefined: false,
  });
  env.addFilter("aLetras", aLetrasFilter);
  env.addFilter("formatDate", formatDateFilter);
  for (const [name, filter] of Object.entries(catalog?.filters ?? {})) {
    env.addFilter(name, filter);
  }
  for (const [name, fn] of Object.entries(catalog?.functions ?? {})) {
    env.addGlobal(name, fn.fn);
  }
  return env;
}
