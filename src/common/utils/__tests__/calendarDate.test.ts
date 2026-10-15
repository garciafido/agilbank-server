/**
 * Los ayudantes del día de calendario (fecha sin hora). Ninguno depende de la zona
 * del proceso: se corren con TZ en las seis zonas. «Hoy» es el de la zona del
 * proyecto (PROJECT_TIME_ZONE), y se compara con Intl en esa zona: esta prueba se
 * copia a cada proyecto y vale con la zona que tenga.
 */
import {
  calendarDateToDate,
  compararDias,
  diaDeCalendario,
  formatearDia,
  hoyEnElProyecto,
  isCalendarDate,
  sumarDias,
  sumarMeses,
} from "../calendarDate";
import { PROJECT_TIME_ZONE } from "../../../config/projectTimeZone";

/** El día de un instante en una zona, armado aparte (formatToParts), para comparar con hoyEnElProyecto. */
const diaEn = (instante: Date, zona: string) => {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    instante
  );
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
};

describe("isCalendarDate", () => {
  it.each([["1985-03-12"], ["2024-02-29"], ["0001-01-01"], ["9999-12-31"]])("%s es un día", (day) => {
    expect(isCalendarDate(day)).toBe(true);
  });
  it.each([
    ["2026-02-29"],
    ["2026-02-30"],
    ["2026-13-01"],
    ["2026-00-10"],
    ["2026-01-00"],
    ["0000-01-01"],
    ["1985-3-12"],
    ["12/03/1985"],
    ["1985-03-12T00:00:00.000Z"],
    [" 1985-03-12"],
    [""],
    [null],
    [19850312],
    [new Date("1985-03-12T00:00:00.000Z")],
  ])("%p no lo es", (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});

describe("diaDeCalendario", () => {
  it.each([
    ["un Date a medianoche UTC", new Date("1985-03-12T00:00:00.000Z"), "1985-03-12"],
    ["un Date a las 03:00Z (el backoffice en Argentina)", new Date("1985-03-12T03:00:00.000Z"), "1985-03-12"],
    ["un Date a las 23:30Z", new Date("1985-03-12T23:30:00.000Z"), "1985-03-12"],
    ["el texto del día", "1985-03-12", "1985-03-12"],
    ["un ISO con hora y Z", "1985-03-12T03:00:00.000Z", "1985-03-12"],
    ["un ISO con otra zona: su día UTC", "1985-03-12T23:30:00-03:00", "1985-03-13"],
    ["un ISO sin zona: se toma como UTC", "1985-03-12T23:30:00", "1985-03-12"],
    ["una medianoche local con desfase: el día UTC del instante", "1980-05-12T00:00:00-03:00", "1980-05-12"],
    ["el último instante de 9999 (en Argentina)", "9999-12-31T20:59:59.999-03:00", "9999-12-31"],
    ["el primero de 0001", "0001-01-01T00:00:00.000Z", "0001-01-01"],
  ])("%s → el día", (_what, value, day) => {
    expect(diaDeCalendario(value)).toBe(day);
  });
  it.each([
    ["null", null],
    ["undefined", undefined],
    ['""', ""],
    ["DD/MM/AAAA", "12/03/1985"],
    ["un día que no existe", "2026-02-30"],
    ["un ISO de un día que no existe (V8 lo pasaría al 2 de marzo)", "2026-02-30T00:00:00.000Z"],
    ["un Date inválido", new Date("x")],
    ["un desfase de dos cifras sin minutos (Date no lo lee)", "1985-03-12T23:30:00-03"],
    ["un ISO cuyo día UTC cae en 10000", "9999-12-31T23:00:00-03:00"],
    ["un ISO cuyo día UTC cae en 0000", "0001-01-01T00:00:00+01:00"],
    ["un Date de 10000", new Date("+010000-01-01T00:00:00.000Z")],
    ["un Date de antes de 0000", new Date(-62198755200000)],
  ])("%s → null", (_what, value) => {
    expect(diaDeCalendario(value as any)).toBeNull();
  });
});

describe("calendarDateToDate", () => {
  it("es la medianoche UTC de ese día, también en los años de un dígito o dos", () => {
    expect(calendarDateToDate("1985-03-12").toISOString()).toBe("1985-03-12T00:00:00.000Z");
    expect(calendarDateToDate("0099-01-01").toISOString()).toBe("0099-01-01T00:00:00.000Z");
  });
  it("tira con lo que no es un día", () => {
    expect(() => calendarDateToDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("hoyEnElProyecto: el día en la zona del proyecto, no en la del proceso", () => {
  // Instantes en que, según la zona, el día es otro: cerca de la medianoche UTC, a
  // mediodía, al final del día UTC y en el cambio de año.
  it.each([
    ["2026-10-11T00:30:00.000Z"],
    ["2026-10-11T02:30:00.000Z"],
    ["2026-10-11T12:00:00.000Z"],
    ["2026-10-11T23:30:00.000Z"],
    ["2026-12-31T23:00:00.000Z"],
    ["2027-01-01T10:30:00.000Z"],
  ])("a las %s es el día que Intl da en la zona del proyecto", (instant) => {
    const now = new Date(instant);
    expect({ zona: PROJECT_TIME_ZONE, hoy: hoyEnElProyecto(now) }).toEqual({ zona: PROJECT_TIME_ZONE, hoy: diaEn(now, PROJECT_TIME_ZONE) });
  });
  it("sin argumento, ahora", () => {
    expect(isCalendarDate(hoyEnElProyecto())).toBe(true);
  });
});

describe("sumarDias y sumarMeses", () => {
  it.each([
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-28", 2, "2024-03-01"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-10-11", 0, "2026-10-11"],
  ])("%s + %d días = %s", (day, n, result) => {
    expect(sumarDias(day, n)).toBe(result);
  });
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-11-30", 3, "2027-02-28"],
    ["2026-07-15", 3, "2026-10-15"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2027-01-15", -12, "2026-01-15"],
    ["2026-01-15", 0, "2026-01-15"],
    // Un aniversario del 29 de febrero, en un año que no es bisiesto.
    ["2024-02-29", 12, "2025-02-28"],
    ["2024-02-29", -12, "2023-02-28"],
  ])("%s + %d meses = %s", (day, n, result) => {
    expect(sumarMeses(day, n)).toBe(result);
  });
  it("en los bordes de 0001 a 9999 suman; fuera, tiran (nunca dan un texto que no es un día)", () => {
    expect([sumarDias("9999-12-30", 1), sumarDias("0001-01-02", -1)]).toEqual(["9999-12-31", "0001-01-01"]);
    expect([sumarMeses("9999-11-30", 1), sumarMeses("0001-02-28", -1)]).toEqual(["9999-12-30", "0001-01-28"]);
    expect(() => sumarDias("9999-12-31", 1)).toThrow(RangeError);
    expect(() => sumarDias("0001-01-01", -1)).toThrow(RangeError);
    expect(() => sumarMeses("9999-12-15", 1)).toThrow(RangeError);
    expect(() => sumarMeses("0001-01-15", -1)).toThrow(RangeError);
  });
  it("n no entero o un día que no existe: tira", () => {
    expect(() => sumarDias("2026-01-01", 1.5)).toThrow(RangeError);
    expect(() => sumarMeses("2026-01-01", 0.5)).toThrow(RangeError);
    expect(() => sumarMeses("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("compararDias", () => {
  it("es el orden cronológico", () => {
    expect(["2024-03-01", "1985-03-12", "2024-02-29"].sort(compararDias)).toEqual(["1985-03-12", "2024-02-29", "2024-03-01"]);
    expect(compararDias("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("formatearDia", () => {
  it.each([
    ["es-AR", "12/03/1985"],
    ["en-US", "03/12/1985"],
    ["pt-BR", "12/03/1985"],
  ])("%s", (locale, text) => {
    expect(formatearDia("1985-03-12", locale)).toBe(text);
  });
  it("dos cifras en el día y en el mes (lo que esperan los documentos de jupiter)", () => {
    expect(formatearDia("1984-10-07")).toBe("07/10/1984");
    expect(formatearDia("1984-10-07", "es-AR")).toBe("07/10/1984");
  });
  it('por defecto, "es-AR"; vacío → ""', () => {
    expect(formatearDia("2024-02-29")).toBe("29/02/2024");
    expect(formatearDia(null)).toBe("");
    expect(formatearDia(undefined)).toBe("");
    expect(formatearDia("")).toBe("");
  });
  it("un texto que no es un día tira", () => {
    expect(() => formatearDia("12/03/1985")).toThrow(RangeError);
  });
  it("dos llamadas con el mismo locale dan lo mismo, también con otro locale en el medio", () => {
    expect([
      formatearDia("1985-03-12", "es-AR"),
      formatearDia("1985-03-12", "en-US"),
      formatearDia("1985-03-12", "es-AR"),
      formatearDia("1985-03-12", "en-US"),
    ]).toEqual(["12/03/1985", "03/12/1985", "12/03/1985", "03/12/1985"]);
  });
});

describe("los formateadores de Intl se arman una vez (corren por cada fila de una lista o un documento)", () => {
  it("formatearDia: uno por locale", () => {
    const formateadores = jest.spyOn(Intl, "DateTimeFormat");
    try {
      expect([formatearDia("1985-03-12", "de-DE"), formatearDia("2024-02-29", "de-DE")]).toEqual(["12.03.1985", "29.02.2024"]);
      expect(formateadores).toHaveBeenCalledTimes(1);
    } finally {
      formateadores.mockRestore();
    }
  });
  it("hoyEnElProyecto: a lo sumo uno, por muchas veces que se llame", () => {
    const instantes = ["2026-10-11T02:30:00.000Z", "2026-10-11T14:00:00.000Z", "2026-10-11T23:30:00.000Z"].map((i) => new Date(i));
    const esperados = instantes.map((i) => diaEn(i, PROJECT_TIME_ZONE));
    const formateadores = jest.spyOn(Intl, "DateTimeFormat");
    try {
      expect(instantes.map((i) => hoyEnElProyecto(i))).toEqual(esperados);
      expect(formateadores.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      formateadores.mockRestore();
    }
  });
});
