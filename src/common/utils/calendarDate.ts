/**
 * El día de calendario: un campo `date` de haiku ("AAAA-MM-DD", sin hora ni zona).
 *
 * En la base es una columna `date` (`DateTime @db.Date`): Prisma la escribe con los
 * getters UTC del Date que recibe y la lee como el Date de la medianoche UTC de ese
 * día. Fuera de la base viaja como el texto "AAAA-MM-DD" (el escalar Date de GraphQL,
 * src/common/graphql/dateScalar.ts). Ninguna función de acá usa la zona del proceso:
 * el mismo día da el mismo resultado en cualquier servidor. «Hoy» es el día en la
 * zona del proyecto (src/config/projectTimeZone.ts).
 *
 * Archivo del generador: se reescribe en cada regeneración.
 */
import { PROJECT_TIME_ZONE } from "../../config/projectTimeZone";

/** Un día de calendario: "AAAA-MM-DD". Sin hora ni zona. */
export type CalendarDate = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Un ISO con hora: "AAAA-MM-DDTHH:MM…", con o sin zona al final. */
const ISO_WITH_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/**
 * Si un ISO termina en una zona ("Z", "+03:00", "-0300", "+03"). Sin zona, se le agrega
 * "Z". El Date de JavaScript no lee "+03" (dos cifras, sin minutos): ese da null.
 */
const ISO_ZONE = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** El Date de la medianoche UTC de (año, mes 1-12, día). setUTCFullYear: los años de 0 a 99 no pasan a 1900. */
function utcMidnight(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

/** El día UTC de un instante, o null si no es un Date válido o cae fuera de los años 0001 a 9999. */
function utcDayOf(date: Date): CalendarDate | null {
  if (Number.isNaN(date.getTime())) return null;
  const day = `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
  return isCalendarDate(day) ? day : null;
}

/** El día UTC de una suma; si cae fuera de los años 0001 a 9999, tira. */
function sumDayOf(date: Date, what: string): CalendarDate {
  const day = utcDayOf(date);
  if (day === null) throw new RangeError(`${what}: el resultado cae fuera de los años 0001 a 9999`);
  return day;
}

/**
 * "AAAA-MM-DD" con un día que existe (rechaza "2026-02-30"), de los años 0001 a 9999.
 *
 * Como CalendarDate es string, con un argumento string la rama negativa queda en never:
 * después de `if (isCalendarDate(texto)) return …;` no se puede seguir usando `texto`.
 * Para separar la forma, la regex (como diaDeCalendario).
 */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string") return false;
  const match = DAY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const date = utcMidnight(year, month, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Las tres partes de un día que existe; si no lo es, tira. */
function partsOf(day: CalendarDate): [number, number, number] {
  if (!isCalendarDate(day)) throw new RangeError('no es un día de calendario "AAAA-MM-DD"');
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
}

/**
 * Lleva cualquier forma vieja o nueva a "AAAA-MM-DD":
 * - Date → su día UTC;
 * - "AAAA-MM-DD" válido → igual;
 * - ISO con hora ("1980-05-12T03:00:00.000Z") → el día UTC del instante (sin zona al
 *   final, se toma como UTC; un día que no existe, como "2026-02-30T…", da null);
 * - null, undefined, "", algo que no se puede leer o un día fuera de los años 0001 a
 *   9999 → null.
 */
export function diaDeCalendario(value: Date | string | null | undefined): CalendarDate | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return utcDayOf(value);
  if (typeof value !== "string") return null;
  // Con la forma "AAAA-MM-DD", el día si existe. (No `if (isCalendarDate(value)) return
  // value;`: después de esa guarda `value` queda en never; ver isCalendarDate.)
  if (DAY.test(value)) return isCalendarDate(value) ? value : null;
  if (!ISO_WITH_TIME.test(value) || !isCalendarDate(value.slice(0, 10))) return null;
  return utcDayOf(new Date(ISO_ZONE.test(value) ? value : `${value}Z`));
}

/** El Date a medianoche UTC de ese día (lo que Prisma escribe en una columna date). */
export function calendarDateToDate(day: CalendarDate): Date {
  const [year, month, d] = partsOf(day);
  return utcMidnight(year, month, d);
}

/** Un Intl.DateTimeFormat por zona: armarlo cuesta, y «hoy» se pide muchas veces. */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** El día de calendario que es `instant` en `timeZone`. */
function dayIn(instant: Date, timeZone: string): CalendarDate {
  let formatter = dayFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pad(Number(part("year")), 4)}-${part("month")}-${part("day")}`;
}

/** Hoy en la zona del proyecto (PROJECT_TIME_ZONE). `now` es para las pruebas. */
export function hoyEnElProyecto(now: Date = new Date()): CalendarDate {
  return dayIn(now, PROJECT_TIME_ZONE);
}

/** Suma días de calendario (n puede ser negativo). Si el resultado cae fuera de los años 0001 a 9999, tira. */
export function sumarDias(day: CalendarDate, n: number): CalendarDate {
  if (!Number.isInteger(n)) throw new RangeError("sumarDias: n tiene que ser un entero");
  const date = calendarDateToDate(day);
  date.setUTCDate(date.getUTCDate() + n);
  return sumDayOf(date, "sumarDias");
}

/**
 * Suma meses; si el día no existe en el mes de destino, va al último día del mes (31/01 + 1 → 28/02 o 29/02).
 * Si el resultado cae fuera de los años 0001 a 9999, tira.
 */
export function sumarMeses(day: CalendarDate, n: number): CalendarDate {
  if (!Number.isInteger(n)) throw new RangeError("sumarMeses: n tiene que ser un entero");
  const [year, month, d] = partsOf(day);
  const total = year * 12 + (month - 1) + n;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12 + 1;
  // El día 0 del mes siguiente es el último de este.
  const lastDay = utcMidnight(targetYear, targetMonth + 1, 0).getUTCDate();
  return sumDayOf(utcMidnight(targetYear, targetMonth, Math.min(d, lastDay)), "sumarMeses");
}

/** -1, 0 o 1, en orden cronológico (que para "AAAA-MM-DD" es el alfabético). */
export function compararDias(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Un Intl.DateTimeFormat por locale: armarlo cuesta, y formatearDia corre por cada fila de una lista o un documento. */
const textFormatters = new Map<string, Intl.DateTimeFormat>();

/** Texto para una persona, en el formato del locale ("es-AR" por defecto), sin pasar por la zona del proceso. null → "". */
export function formatearDia(day: CalendarDate | null | undefined, locale = "es-AR"): string {
  if (day === null || day === undefined || day === "") return "";
  let formatter = textFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    textFormatters.set(locale, formatter);
  }
  return formatter.format(calendarDateToDate(day));
}
