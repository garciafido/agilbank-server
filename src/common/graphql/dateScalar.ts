/**
 * El escalar Date de GraphQL: un día de calendario (fecha sin hora), "AAAA-MM-DD".
 *
 * - serialize: el Date que da Prisma (la medianoche UTC de una columna date) o un
 *   texto ("AAAA-MM-DD", o el ISO con hora de un dato viejo) → "AAAA-MM-DD".
 * - parseValue / parseLiteral: solo "AAAA-MM-DD" de un día que existe → el Date de su
 *   medianoche UTC, que es lo que Prisma escribe en la columna. Cualquier otra cosa
 *   (otro formato, un ISO con hora, un día que no existe, un número) → GraphQLError
 *   con extensions.code = "BAD_USER_INPUT". El escalar no pone el valor en su
 *   mensaje; con una variable, graphql-js le antepone el suyo («Variable "$x" got
 *   invalid value "…"; …») y conserva extensions.code.
 *
 * Lo registra src/entities/index.ts (Date: DateScalar). DateTime no cambia.
 * Archivo del generador: se reescribe en cada regeneración.
 */
import { GraphQLError, GraphQLScalarType, Kind, ValueNode } from "graphql";
import { calendarDateToDate, diaDeCalendario, isCalendarDate } from "../utils/calendarDate";

const badInput = (what: string) =>
  new GraphQLError(`Date: ${what}; se espera un día "AAAA-MM-DD" que exista`, { extensions: { code: "BAD_USER_INPUT" } });

export const DateScalar = new GraphQLScalarType<Date, string>({
  name: "Date",
  description: 'Un día de calendario, "AAAA-MM-DD": sin hora ni zona.',
  serialize(value: unknown): string {
    const day = value instanceof Date || typeof value === "string" ? diaDeCalendario(value) : null;
    if (day === null) throw new GraphQLError("Date: el valor no es un día de calendario");
    return day;
  },
  parseValue(value: unknown): Date {
    if (!isCalendarDate(value)) throw badInput("el valor no es un día de calendario");
    return calendarDateToDate(value);
  },
  parseLiteral(ast: ValueNode): Date {
    if (ast.kind !== Kind.STRING || !isCalendarDate(ast.value)) throw badInput("el literal no es un día de calendario");
    return calendarDateToDate(ast.value);
  },
});
