// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Cómo escribe el server un día de calendario para una persona, con el proceso en
 * una de las seis zonas: graphqlToDate (el nombre visible, src/common/utils/
 * conversions.ts) y el filtro formatDate de las plantillas de documentos
 * (src/common/utils/nunjucksMacros/formatDate.ts). El mismo día en cualquier zona.
 */
import { afirmarZona } from "../support/enCadaZona";
import { graphqlToDate } from "../../../src/common/utils/conversions";
import { formatDateFilter } from "../../../src/common/utils/nunjucksMacros/formatDate";

const ZONA = afirmarZona();

describe(`un día para una persona, con el proceso en ${ZONA}`, () => {
  it.each([
    [
      "el Date de una columna date (medianoche UTC)",
      new Date("1985-03-12T00:00:00.000Z"),
    ],
    ["un Date de antes, a las 03:00Z", new Date("1985-03-12T03:00:00.000Z")],
    ["el texto del día", "1985-03-12"],
    ["el ISO con hora de un snapshot viejo", "1985-03-12T03:00:00.000Z"],
  ])("graphqlToDate: %s → 12/03/1985", (_que, valor) => {
    expect(graphqlToDate(valor)).toBe("12/03/1985");
    expect(graphqlToDate(valor, "Asia/Tokyo")).toBe("12/03/1985");
  });

  it('graphqlToDate sin valor, o con algo que no es un día: "..."', () => {
    expect([
      graphqlToDate(null),
      graphqlToDate(undefined),
      graphqlToDate(""),
      graphqlToDate("12/03/1985"),
    ]).toEqual(["...", "...", "...", "..."]);
  });

  it("formatDate de las plantillas: el texto del día y el Date de la columna dan el mismo día", () => {
    expect(formatDateFilter("1985-03-12", "dd/MM/yyyy")).toBe("12/03/1985");
    expect(
      formatDateFilter(new Date("1985-03-12T00:00:00.000Z"), "dd/MM/yyyy")
    ).toBe("12/03/1985");
    expect(formatDateFilter("2024-02-29", "yyyy")).toBe("2024");
  });

  it("formatDate con un día que no existe no inventa otro", () => {
    expect(formatDateFilter("2026-02-30", "dd/MM/yyyy")).toBe(
      "Invalid Parsed Date"
    );
  });
});
