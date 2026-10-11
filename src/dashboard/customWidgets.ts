/**
 * Widgets de dashboard CUSTOM del proyecto (stub de extensión).
 *
 * Acá se declaran widgets cuyo cálculo no es expresable como metric del
 * DSL (cruces entre entidades, composiciones, raw SQL). Cada entrada
 * define el fetcher Y su fila de catálogo: el registro en el
 * fetcherRegistry y el seed de DashboardWidget los toman de esta lista
 * automáticamente (y la poda del seed NUNCA elimina estas claves).
 *
 * Este archivo es un stub generado UNA vez: se completa en el proyecto
 * (develop) y se preserva en los merges base→develop.
 *
 * Reglas:
 * - `widgetKey` único, prefijado por área (ej. "creditAccount-composicion").
 * - `component` debe existir en el cliente: CountCard | SumCard | AvgCard |
 *   PieChart | BarChart | GroupByChart | LineChart.
 * - Con `cacheMode: 'invalidated'` declarar `sourceEntities` (entidades del
 *   bus entity:mutations que invalidan el cache).
 * - El fetcher debe chequear permisos con ctx.serviceContext.permissions()
 *   y filtrar por tenant — igual que los fetchers generados.
 */

import type { DataFetcher, WidgetCacheMode, WidgetCacheScope } from "./types";

export type CustomWidgetDefinition = {
  widgetKey: string;
  title: string;
  category: string;
  component:
    | "CountCard"
    | "SumCard"
    | "AvgCard"
    | "PieChart"
    | "BarChart"
    | "GroupByChart"
    | "LineChart";
  defaultConfig?: Record<string, unknown>;
  minWidth?: number;
  minHeight?: number;
  fetcher: DataFetcher;
  description?: string;
  cacheMode?: WidgetCacheMode;
  sourceEntities?: string[];
  cacheScope?: WidgetCacheScope;
};

export const customWidgets: CustomWidgetDefinition[] = [];
