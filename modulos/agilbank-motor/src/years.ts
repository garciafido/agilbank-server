import type { Cell, Grid } from "./types";
import { isoDate } from "./values";

/**
 * Solo con barra y con dos cifras de cada lado, como la imprime el BBVA: «12.05» puede ser un importe
 * en formato inglés, y «3/12» o «1/2» una cuota o una cantidad.
 */
const YEARLESS = /^(\d{2})\/(\d{2})$/;
const FULL = /(?<![\d/])\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?![\d/])/g;

/** Más lejos que esto de la referencia no hay año que sirva (el «29/02» fuera de un año bisiesto). */
const MAX_DISTANCE_MS = 200 * 24 * 3600 * 1000;

const time = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/** El medio del período de ProntoNet; sin él, la mediana de las fechas completas que trae el archivo. */
const referenceOf = (grid: Grid, period: { from?: string | null; to?: string | null }): number | null => {
  const hints = [period.from, period.to].map((d) => (d ? isoDate(d) : null)).filter((d): d is string => d !== null);
  if (hints.length > 0) return hints.reduce((sum, d) => sum + time(d), 0) / hints.length;
  const found: number[] = [];
  for (const row of grid.rows) {
    for (const v of row) {
      if (typeof v !== "string") continue;
      for (const m of v.matchAll(FULL)) {
        const d = isoDate(m[0]);
        if (d !== null) found.push(time(d));
      }
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
};

/**
 * Las fechas sin año («03/07», como las imprime el BBVA) con el año que las deja más cerca del
 * período, en cualquier columna. La cercanía se mide al punto medio del período (o al único
 * extremo que haya): está pensado para extractos mensuales. De diciembre a enero, enero cae en el año
 * siguiente. Una fecha que ningún año deja a menos de 200 días queda como está.
 */
export const completeYears = (grid: Grid, period: { from?: string | null; to?: string | null } = {}): Grid => {
  if (!grid.rows.some((r) => r.some((v) => typeof v === "string" && YEARLESS.test(v.trim())))) return grid;
  const reference = referenceOf(grid, period);
  if (reference === null) return grid;
  const year = new Date(reference).getUTCFullYear();
  const rows = grid.rows.map((row) =>
    row.map((v): Cell => {
      const m = typeof v === "string" ? YEARLESS.exec(v.trim()) : null;
      if (!m) return v;
      let best: { text: string; distance: number } | null = null;
      for (const y of [year - 1, year, year + 1]) {
        const text = `${m[1]}/${m[2]}/${y}`;
        const iso = isoDate(text);
        if (iso === null) continue;
        const distance = Math.abs(time(iso) - reference);
        if (best === null || distance < best.distance) best = { text, distance };
      }
      return best === null || best.distance > MAX_DISTANCE_MS ? v : best.text;
    }),
  );
  return { ...grid, rows };
};
