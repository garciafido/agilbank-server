// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Los filtros de la búsqueda por IA sobre un campo Date (día de calendario,
 * src/services/aiSearch/builders/calendarDateFilter.ts), con el proceso en una de las
 * seis zonas: un período es [su primer día, el del siguiente), con cada día en su
 * medianoche UTC, sin el desfase de 3 horas de un DateTime.
 */
import { afirmarZona } from "../support/enCadaZona";
import { convertCalendarDateFilter } from "../../../src/services/aiSearch/builders/calendarDateFilter";

const ZONA = afirmarZona();

describe(`la búsqueda por IA sobre un día, con el proceso en ${ZONA}`, () => {
  it("un año, un mes y un día", () => {
    expect(convertCalendarDateFilter("contains", "2024")).toEqual({
      converted: true,
      condition: {
        gte: "2024-01-01T00:00:00.000Z",
        lt: "2025-01-01T00:00:00.000Z",
      },
    });
    expect(convertCalendarDateFilter("equals", "2024-02")).toEqual({
      converted: true,
      condition: {
        gte: "2024-02-01T00:00:00.000Z",
        lt: "2024-03-01T00:00:00.000Z",
      },
    });
    expect(convertCalendarDateFilter("equals", "2024-02-29")).toEqual({
      converted: true,
      condition: {
        gte: "2024-02-29T00:00:00.000Z",
        lt: "2024-03-01T00:00:00.000Z",
      },
    });
  });

  it("un día que no existe es un error que dice el formato", () => {
    expect(convertCalendarDateFilter("equals", "2024-02-30")).toEqual({
      converted: false,
      error:
        "Formato de fecha inválido '2024-02-30'. Use YYYY, YYYY-MM, o YYYY-MM-DD.",
    });
  });
});
