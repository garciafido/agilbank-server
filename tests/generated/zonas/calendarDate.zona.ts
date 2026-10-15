// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Los ayudantes del día de calendario (src/common/utils/calendarDate.ts), con el
 * proceso en una de las seis zonas (lo corre tests/generated/calendarDate.test.ts).
 * Ninguno depende de la zona del proceso; «hoy» es el de la zona del proyecto.
 */
import { afirmarZona } from "../support/enCadaZona";
import {
  calendarDateToDate,
  diaDeCalendario,
  formatearDia,
  hoyEnElProyecto,
  isCalendarDate,
  sumarMeses,
} from "../../../src/common/utils/calendarDate";
import { PROJECT_TIME_ZONE } from "../../../src/config/projectTimeZone";

const ZONA = afirmarZona();

/** El día de un instante en una zona, armado aparte (formatToParts), para comparar con hoyEnElProyecto. */
const diaEn = (instante: Date, zona: string) => {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
};

describe(`el día de calendario, con el proceso en ${ZONA}`, () => {
  it("un Date a medianoche UTC, uno a las 03:00Z, el ISO con hora y el texto dan el mismo día", () => {
    expect(diaDeCalendario(new Date("1985-03-12T00:00:00.000Z"))).toBe(
      "1985-03-12"
    );
    expect(diaDeCalendario(new Date("1985-03-12T03:00:00.000Z"))).toBe(
      "1985-03-12"
    );
    expect(diaDeCalendario("1985-03-12T03:00:00.000Z")).toBe("1985-03-12");
    expect(diaDeCalendario("1985-03-12T23:30:00")).toBe("1985-03-12");
    expect(diaDeCalendario("1985-03-12")).toBe("1985-03-12");
  });

  it("rechaza lo que no es un día que existe", () => {
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(diaDeCalendario("2026-02-30T00:00:00.000Z")).toBeNull();
    expect(diaDeCalendario("12/03/1985")).toBeNull();
  });

  it("calendarDateToDate es la medianoche UTC del día", () => {
    expect(calendarDateToDate("1985-03-12").toISOString()).toBe(
      "1985-03-12T00:00:00.000Z"
    );
  });

  it("hoy es el día en la zona del proyecto, no en la del proceso", () => {
    for (const instante of [
      "2026-10-11T02:30:00.000Z",
      "2026-10-11T14:00:00.000Z",
      "2026-10-11T23:30:00.000Z",
    ]) {
      const ahora = new Date(instante);
      expect({ instante, hoy: hoyEnElProyecto(ahora) }).toEqual({
        instante,
        hoy: diaEn(ahora, PROJECT_TIME_ZONE),
      });
    }
  });

  it("sumarMeses va al último día del mes", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("formatearDia no pasa por la zona del proceso, con dos cifras en el día y el mes", () => {
    expect(formatearDia("1984-10-07")).toBe("07/10/1984");
    expect(formatearDia("1985-03-12", "es-AR")).toBe("12/03/1985");
    expect(formatearDia("1985-03-12", "en-US")).toBe("03/12/1985");
  });
});
