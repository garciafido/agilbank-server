import { DateTime } from "luxon";

/**
 * Formatea un objeto de fecha o string a un formato especificado.
 * @param dateObj El objeto de fecha, string (ISO, dd/MM/yyyy, "now"), o timestamp.
 * @param format El formato de salida para la fecha (sintaxis de Luxon).
 * @returns El string de la fecha formateada o un mensaje de error.
 */
export function formatDateFilter(
  dateObj: any,
  format: string = "LLL dd, yyyy"
): string {
  // LLL dd, yyyy es un formato común de Luxon
  try {
    let dt: DateTime;

    if (dateObj === "now") {
      dt = DateTime.now().toUTC(); // Usar DateTime.now() para la hora actual y luego convertir a UTC si es necesario
      // o DateTime.utc() si siempre quieres la hora UTC "pura" de inicio.
      // Para consistencia con el resto, usar UTC
      // dt = DateTime.utc(); // Si "now" debe ser la fecha/hora UTC actual
    } else if (dateObj instanceof DateTime) {
      // Si ya es un objeto DateTime de Luxon
      dt = dateObj;
    } else if (dateObj instanceof Date) {
      // Si es un objeto Date de JavaScript
      dt = DateTime.fromJSDate(dateObj, { zone: "utc" });
    } else if (typeof dateObj === "string") {
      if (dateObj.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Un día de calendario "AAAA-MM-DD" (un campo date): ese día, sin zona
        dt = DateTime.fromISO(dateObj, { zone: "utc" });
      } else if (dateObj.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        // Formato ISO 8601 (parcial)
        dt = DateTime.fromISO(dateObj, { zone: "utc" });
      } else if (dateObj.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        // Formato DD/MM/YYYY
        dt = DateTime.fromFormat(dateObj, "dd/MM/yyyy", { zone: "utc" });
      } else if (dateObj.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
        // Formato YYYY/MM/DD
        dt = DateTime.fromFormat(dateObj, "yyyy/MM/dd", { zone: "utc" });
      } else if (
        !isNaN(Number(dateObj)) &&
        !isNaN(new Date(Number(dateObj)).valueOf())
      ) {
        // Si es un timestamp numérico
        dt = DateTime.fromMillis(Number(dateObj), { zone: "utc" });
      } else {
        // Último intento, parseo más genérico (puede ser menos fiable)
        const parsedDate = new Date(dateObj);
        if (!isNaN(parsedDate.valueOf())) {
          dt = DateTime.fromJSDate(parsedDate, { zone: "utc" });
        } else {
          // Si después de todos los intentos no se pudo parsear
          console.warn(
            `[Nunjucks Date Filter] Could not parse date: ${dateObj} with any known format.`
          );
          return "Invalid Date Input";
        }
      }
    } else if (typeof dateObj === "number") {
      // Si es un timestamp numérico
      dt = DateTime.fromMillis(dateObj, { zone: "utc" });
    } else {
      // Si no es un tipo reconocido
      console.warn(
        `[Nunjucks Date Filter] Unrecognized date input type: ${typeof dateObj} for value ${dateObj}`
      );
      return "Invalid Date Type";
    }

    // @ts-ignore: dt puede ser undefined si ninguna condición anterior la asignó
    if (!dt || !dt.isValid) {
      // El log de advertencia ya se hizo arriba si no se pudo parsear un string
      // @ts-ignore
      if (dt && dt.invalidReason) {
        // @ts-ignore
        console.warn(
          `[Nunjucks Date Filter] Luxon DateTime is invalid. Reason: ${dt.invalidReason}, Explanation: ${dt.invalidExplanation} for input: ${dateObj}`
        );
      } else if (!dt) {
        console.warn(
          `[Nunjucks Date Filter] Luxon DateTime object (dt) was not created for input: ${dateObj}`
        );
      }
      return "Invalid Parsed Date";
    }

    // Devolver la fecha formateada.
    // Por defecto, las fechas se manejan en UTC según la lógica de parseo.
    // Si quieres que la salida sea en una zona horaria específica, puedes añadir .setZone('America/New_York') antes de .toFormat()
    // Ejemplo: return dt.setZone('local').toFormat(format); para la zona local del servidor.
    return dt.toFormat(format);
  } catch (e: any) {
    console.error(
      `[Nunjucks Date Filter] Error formatting date '${dateObj}':`,
      e.message
    );
    return "Date Formatting Error";
  }
}
