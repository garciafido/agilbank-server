/**
 * Un filtro de la búsqueda por IA sobre un campo Date (día de calendario, columna
 * date): los valores son días, meses o años, sin hora ni zona.
 * - Un período ("2025", "2025-06", "2025-06-15", también con "/") es [su primer día,
 *   el primer día del período siguiente).
 * - equals, contains y startsWith: adentro del período; notEquals, notContains y
 *   endsWith: afuera (outside, que va en el where: ver DateFilterResult); gte y gt:
 *   desde el principio o desde el final del período; lt y lte: antes del principio o
 *   antes del final.
 * - in y notIn: días. isNull e isNotNull no se convierten (los arma
 *   buildPrismaCondition).
 * A Prisma va cada día como el ISO de su medianoche UTC, que es como compara la
 * columna date. Nada depende de la zona del servidor; lo relativo («el mes pasado»)
 * lo resuelve el modelo desde el día de hoy en la zona del proyecto, que le da el
 * prompt de sistema.
 */
import { CalendarDate, isCalendarDate, sumarDias } from "../../../common/utils/calendarDate";

/** Un período como instantes ISO: [gte, lt). */
export type DateRange = { gte: string; lt: string };

/**
 * Lo que da un convertidor de filtros de fecha de la búsqueda por IA (el de un Date, acá,
 * y el de un DateTime, en los tools):
 * - condition: va dentro del filtro del campo, { <campo>: condition };
 * - outside: afuera del período; va en el where, como NOT: { <campo>: { gte, lt } }. Un
 *   `not` dentro del filtro del campo no sirve: Prisma niega cada operador por separado
 *   (NOT gte AND NOT lt), y eso no lo cumple ningún valor; tampoco acepta un OR ahí.
 *   Sin valor, la fila no entra (NOT de un NULL).
 * - converted: false: el operador no se convierte (o el valor no se puede leer: error).
 */
export type DateFilterResult =
  | { converted: true; condition: unknown }
  | { converted: true; outside: DateRange }
  | { converted: false; error?: string };
export type ConvertedDateFilter = Extract<DateFilterResult, { converted: true }>;
/** El de un Date (día de calendario). */
export type CalendarDateFilterResult = DateFilterResult;

/** La parte del where de un filtro de fecha convertido sobre `field`. */
export function dateFilterWhere(field: string, result: ConvertedDateFilter): Record<string, unknown> {
  return "outside" in result ? { NOT: { [field]: result.outside } } : { [field]: result.condition };
}

/**
 * Pone un filtro de fecha convertido en `where` (el del modelo del campo): la condición
 * como el filtro del campo, como siempre; lo de afuera del período, sumado a su AND, sin
 * pisar otro NOT ni otro AND que ya tenga.
 */
export function putDateFilter(where: Record<string, unknown>, field: string, result: ConvertedDateFilter): void {
  if ("outside" in result) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), dateFilterWhere(field, result)];
  } else {
    where[field] = result.condition;
  }
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");
/** Cómo va un día a Prisma: el instante de su medianoche UTC. */
const atMidnight = (day: CalendarDate) => `${day}T00:00:00.000Z`;

/** El período que escribe un valor, como [gte, lt) en días; null si no se puede leer. */
export function periodOf(value: string): { gte: CalendarDate; lt: CalendarDate } | null {
  const text = value.trim().replace(/\//g, "-");
  const year = /^(\d{4})$/.exec(text);
  if (year) {
    const y = Number(year[1]);
    return y >= 1 && y <= 9998 ? { gte: `${pad(y, 4)}-01-01`, lt: `${pad(y + 1, 4)}-01-01` } : null;
  }
  const month = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    if (y < 1 || y > 9998 || m < 1 || m > 12) return null;
    return { gte: `${pad(y, 4)}-${pad(m, 2)}-01`, lt: m === 12 ? `${pad(y + 1, 4)}-01-01` : `${pad(y, 4)}-${pad(m + 1, 2)}-01` };
  }
  const day = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (day) {
    const d = `${day[1]}-${pad(Number(day[2]), 2)}-${pad(Number(day[3]), 2)}`;
    return isCalendarDate(d) ? { gte: d, lt: sumarDias(d, 1) } : null;
  }
  return null;
}

export function convertCalendarDateFilter(operator: string, value: unknown): CalendarDateFilterResult {
  const invalid = (text: string): CalendarDateFilterResult => ({
    converted: false,
    error: `Formato de fecha inválido '${text}'. Use YYYY, YYYY-MM, o YYYY-MM-DD.`,
  });
  if (operator === "isNull" || operator === "isNotNull") return { converted: false };
  if (operator === "in" || operator === "notIn") {
    const values = Array.isArray(value) ? value.map(String) : String(value).split(",");
    const days = values.map((v) => v.trim().replace(/\//g, "-"));
    if (days.some((d) => !isCalendarDate(d))) return invalid(values.join(", "));
    return { converted: true, condition: { [operator]: days.map(atMidnight) } };
  }
  const text = String(value).trim();
  const period = periodOf(text);
  if (!period) return invalid(text);
  const gte = atMidnight(period.gte);
  const lt = atMidnight(period.lt);
  switch (operator) {
    case "equals":
    case "contains":
    case "startsWith":
      return { converted: true, condition: { gte, lt } };
    case "notEquals":
    case "notContains":
    case "endsWith":
      return { converted: true, outside: { gte, lt } };
    case "gte":
      return { converted: true, condition: { gte } };
    case "gt":
      return { converted: true, condition: { gte: lt } };
    case "lt":
      return { converted: true, condition: { lt: gte } };
    case "lte":
      return { converted: true, condition: { lt } };
    default:
      return { converted: false };
  }
}
