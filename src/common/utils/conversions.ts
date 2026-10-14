import { diaDeCalendario, formatearDia } from "./calendarDate";

export const graphqlToDateTime = (
  dateTime: string | Date,
  timeZone?: string
) => {
  return new Date(dateTime).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  });
};

/**
 * Un día de calendario (un campo date) como DD/MM/AAAA, sin pasar por ninguna zona:
 * el Date de Prisma (la medianoche UTC), "AAAA-MM-DD" o el ISO con hora de un dato
 * viejo dan su día UTC. Sin valor, o con algo que no es un día, "...". El segundo
 * argumento queda por compatibilidad: un día no tiene zona.
 */
export const graphqlToDate = (
  date: string | Date | undefined | null,
  _timeZone?: string
) => {
  const day = diaDeCalendario(date);
  return day === null ? "..." : formatearDia(day, "es-AR");
};
