import { endsWithWords, isoDate, normalizeConcept, numberFormatOf, parseCents, startsWithWords, textOf } from "../src/values";

describe("isoDate", () => {
  it.each([
    ["31/07/2026", "2026-07-31"],
    ["5/8/2025", "2025-08-05"],
    ["05-08-25", "2025-08-05"],
    ["05.08.2025", "2025-08-05"],
    ["2025-06-02", "2025-06-02"],
    ["2025-06-02T00:00:00.000Z", "2025-06-02"],
    [" 31/07/2026 ", "2026-07-31"],
  ])("%s es %s", (texto, esperado) => expect(isoDate(texto)).toBe(esperado));

  it.each([["31/02/2026"], ["13/13/2026"], ["0/5/2026"], ["Saldo"], [""], ["1/1/1890"], ["31/07/2026 Transf"]])(
    "%s no es una fecha",
    (texto) => expect(isoDate(texto)).toBeNull(),
  );

  it("un número suelto no es una fecha: las planillas ya convierten las suyas", () => {
    expect(isoDate(45810)).toBeNull();
  });

  it("una celda vacía no es una fecha", () => expect(isoDate(null)).toBeNull());

  it("los años van de 1990 a 2100", () => {
    expect(isoDate("01/01/1990")).toBe("1990-01-01");
    expect(isoDate("31/12/2100")).toBe("2100-12-31");
    expect(isoDate("31/12/1989")).toBeNull();
    expect(isoDate("01/01/2101")).toBeNull();
  });

  it("un día o un mes que no existen no son una fecha; los bordes que sí existen, sí", () => {
    expect(isoDate("01/01/2026")).toBe("2026-01-01");
    expect(isoDate("31/12/2026")).toBe("2026-12-31");
    expect(isoDate("29/02/2028")).toBe("2028-02-29");
    expect(isoDate("29/02/2026")).toBeNull();
    expect(isoDate("00/07/2026")).toBeNull();
    expect(isoDate("01/00/2026")).toBeNull();
    expect(isoDate("01/13/2026")).toBeNull();
    expect(isoDate("2026-13-01")).toBeNull();
    expect(isoDate("2026-12-32")).toBeNull();
  });

  it("la fecha es la celda entera: nada antes ni después, salvo la hora de una fecha ISO", () => {
    expect(isoDate("x01/07/2026")).toBeNull();
    expect(isoDate("x2026-07-01")).toBeNull();
    expect(isoDate("2026-07-01 hasta")).toBeNull();
    expect(isoDate("2026-07-01T00:00:00")).toBe("2026-07-01");
    expect(isoDate("2026-07-01 10:30")).toBe("2026-07-01");
  });
});

describe("numberFormatOf", () => {
  it("la coma con dos decimales es formato argentino", () => {
    expect(numberFormatOf(["1.234,56", "12,50"])).toBe("ar");
  });
  it("el punto con dos decimales es formato inglés", () => {
    expect(numberFormatOf(["1500.50", "2345678.90"])).toBe("us");
  });
  it("el punto de a tres cifras sin coma es separador de miles argentino", () => {
    expect(numberFormatOf(["1.234", "45.000"])).toBe("ar");
  });
  it("sin evidencia, argentino", () => expect(numberFormatOf([])).toBe("ar"));

  it("decide la mayoría: la coma con dos decimales le gana a un solo punto decimal", () => {
    expect(numberFormatOf(["12,50", "13,75", "1.00"])).toBe("ar");
    expect(numberFormatOf(["12,50", "1.00", "2.00"])).toBe("us");
    expect(numberFormatOf(["1,5", "2,5", "1.00"])).toBe("ar");
  });

  it("los signos de los importes no esconden los decimales", () => {
    expect(numberFormatOf(["12,50-", "(13,75)", "1.00"])).toBe("ar");
    expect(numberFormatOf(["12.50-", "13.75-", "1,00"])).toBe("us");
  });

  it("los espacios y el signo pesos no cuentan, estén donde estén", () => {
    expect(numberFormatOf(["1.234,56 ", "$ 1.234,56 $", "1,234.56"])).toBe("ar");
  });

  it("el punto de a tres cifras sin coma es separador de miles argentino; la coma de a tres sin punto, inglés", () => {
    expect(numberFormatOf(["1.234", "1.000", "1.50"])).toBe("ar");
    expect(numberFormatOf(["1,234", "2,000"])).toBe("us");
    expect(numberFormatOf(["1,234", "2,000", "1,50"])).toBe("us");
    expect(numberFormatOf(["1.234-", "1.000-", "1.50"])).toBe("ar");
    expect(numberFormatOf(["1,234-", "2,000-", "1,50"])).toBe("us");
  });

  it("lo que no tiene separador, o tiene cifras de más después de él, no es evidencia", () => {
    expect(numberFormatOf(["1234", "1234", "1.50"])).toBe("us");
    expect(numberFormatOf(["1234"])).toBe("ar");
    expect(numberFormatOf(["1.2345", "1.50"])).toBe("us");
    expect(numberFormatOf(["1,2345", "1,50"])).toBe("ar");
    expect(numberFormatOf(["1,2345"])).toBe("ar");
    expect(numberFormatOf(["1,2345", "1.50"])).toBe("us");
  });

  it("con punto y coma juntos, el de a tres cifras no decide", () => {
    expect(numberFormatOf(["1.234,567", "1.50"])).toBe("us");
    expect(numberFormatOf(["1,234.567", "1,50"])).toBe("ar");
  });
});

describe("parseCents", () => {
  it.each([
    ["1.234,56", "ar", 123456],
    ["-1.234,56", "ar", -123456],
    ["1.234,56-", "ar", -123456],
    ["(1.234,56)", "ar", -123456],
    ["$ 1.234", "ar", 123400],
    ["1234,5", "ar", 123450],
    ["+12,00", "ar", 1200],
    ["1,234.56", "us", 123456],
    ["1234.56", "us", 123456],
    ["0", "ar", 0],
  ] as const)("%s (%s) son %i centavos", (texto, formato, centavos) => {
    expect(parseCents(texto, formato)).toBe(centavos);
  });

  it("un número de la planilla se redondea al centavo", () => {
    expect(parseCents(12345678.229999999, "ar")).toBe(1234567823);
    expect(parseCents(-0.005, "ar")).toBe(-1);
  });

  it("el centavo se redondea alejándose del cero y nunca queda en -0", () => {
    expect(parseCents(0.005, "ar")).toBe(1);
    expect(parseCents(-0.001, "ar")).toBe(0);
    expect(parseCents("-0,00", "ar")).toBe(0);
  });

  it.each([["abc"], ["12/05/2026"], ["-"], [""], ["1.23.4"], ["1.234,56,7"]])("%s no es un importe", (texto) => {
    expect(parseCents(texto, "ar")).toBeNull();
  });

  it.each([["(-1.234,56)"], ["-1.234,56-"], ["(1.234,56-)"]])(
    "%s lleva dos marcas de signo y no es un importe",
    (texto) => {
      expect(parseCents(texto, "ar")).toBeNull();
    },
  );

  it("los decimales son uno o dos: más dígitos delatan un formato mal detectado, no centavos", () => {
    expect(parseCents("1,234", "ar")).toBeNull();
    expect(parseCents("1.234,567", "ar")).toBeNull();
    expect(parseCents("1.234", "us")).toBeNull();
    expect(parseCents("1234,5", "ar")).toBe(123450);
  });

  it("una celda vacía no es un importe", () => expect(parseCents(null, "ar")).toBeNull());

  it("un número que no es finito no es un importe", () => {
    expect(parseCents(Infinity, "ar")).toBeNull();
    expect(parseCents(-Infinity, "ar")).toBeNull();
    expect(parseCents(NaN, "ar")).toBeNull();
  });

  it("un texto de cifras tan largo que no es finito no es un importe", () => {
    expect(parseCents("9".repeat(400), "ar")).toBeNull();
  });

  it("un paréntesis sin su pareja no es un importe", () => {
    expect(parseCents("(100,00", "ar")).toBeNull();
    expect(parseCents("100,00)", "ar")).toBeNull();
  });

  it("los espacios en el medio no cuentan", () => {
    expect(parseCents(" 1 234,56 ", "ar")).toBe(123456);
    expect(parseCents("-  12,10", "ar")).toBe(-1210);
  });
});

describe("normalizeConcept, startsWithWords y endsWithWords", () => {
  it("saca acentos, números y puntuación sin cortar en el número", () => {
    expect(normalizeConcept("Impuesto Ley 25.413 Ali Gral s/Débitos")).toBe("impuesto ley ali gral s debitos");
  });
  it("un número pegado a las palabras las separa", () => {
    expect(normalizeConcept("Imp25413Debitos")).toBe("imp debitos");
  });
  it("sin prefijo o sin final no hay comienzo ni final, aunque el texto esté vacío", () => {
    expect(startsWithWords("", "")).toBe(false);
    expect(endsWithWords("", "")).toBe(false);
    expect(startsWithWords(" algo", "")).toBe(false);
    expect(endsWithWords("algo ", "")).toBe(false);
  });
  it("compara por palabras enteras", () => {
    expect(startsWithWords("transf de acme sa", "transf de")).toBe(true);
    expect(startsWithWords("transferencia", "transf")).toBe(false);
    expect(startsWithWords("total", "total")).toBe(true);
    expect(startsWithWords("algo", "")).toBe(false);
  });
  it("compara el final por palabras enteras", () => {
    expect(endsWithWords("acme sa bco ref", "bco ref")).toBe(true);
    expect(endsWithWords("bco ref", "bco ref")).toBe(true);
    expect(endsWithWords("acme sa xbco ref", "bco ref")).toBe(false);
    expect(endsWithWords("acme sa bco ref fac", "bco ref")).toBe(false);
    expect(endsWithWords("algo", "")).toBe(false);
  });
});

describe("textOf", () => {
  it("lleva una celda a texto sin espacios de más", () => {
    expect(textOf("  Transf  ")).toBe("Transf");
    expect(textOf(500)).toBe("500");
    expect(textOf(null)).toBe("");
    expect(textOf("Transf   de\t\tACME")).toBe("Transf de ACME");
  });
});
