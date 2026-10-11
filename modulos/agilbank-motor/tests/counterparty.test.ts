import { counterpartyOf, isValidCbu, isValidCuit, splitLeadingCode } from "../src/counterparty";

const VALID_BY_PREFIX = [
  "20123456786", "23123456785", "24123456781", "25123456788", "26123456784", "27123456780",
  "30123456781", "33123456780", "34123456787", "50123456782", "51123456789", "55123456784",
];
const MOD11_OK_OTHER_PREFIX = [
  "00123456785", "10123456780", "12123456783", "21123456782", "22123456789", "28123456787", "29123456783", "31123456788",
  "32123456784", "35123456783", "40123456787", "49123456784", "52123456785", "54123456788", "56123456780", "99123456781",
];

describe("isValidCuit e isValidCbu", () => {
  it.each(["30123456781", "30234567892", "20123456786", "27234567891"])("el CUIT %s es válido", (c) => expect(isValidCuit(c)).toBe(true));
  it.each(["30123456780", "3012345678", "abcdefghijk"])("el CUIT %s no es válido", (c) => expect(isValidCuit(c)).toBe(false));
  it.each(["1230123412345678901233", "4560456800001234567891"])("el CBU %s es válido", (c) => expect(isValidCbu(c)).toBe(true));
  it.each(["1230123412345678901234", "123012341234567890123"])("el CBU %s no es válido", (c) => expect(isValidCbu(c)).toBe(false));

  it.each(VALID_BY_PREFIX)("el CUIT %s tiene un prefijo que asigna AFIP", (c) => expect(isValidCuit(c)).toBe(true));
  it.each(MOD11_OK_OTHER_PREFIX)("el CUIT %s cumple el módulo 11 pero su prefijo no es de AFIP", (c) => expect(isValidCuit(c)).toBe(false));

  it("un CUIT nunca es todo ceros", () => {
    expect(isValidCuit("00000000000")).toBe(false);
  });

  it("un CBU nunca es todo ceros ni tiene el banco 000, aunque los verificadores cierren", () => {
    expect(isValidCbu("0".repeat(22))).toBe(false);
    expect(isValidCbu("0000123212345678901233")).toBe(false);
    expect(isValidCbu("0001234212345678901233")).toBe(false);
  });

  it("un banco que empieza con dos ceros pero no es el 000 sí es un CBU", () => {
    expect(isValidCbu("0010123912345678901233")).toBe(true);
  });

  it("el verificador que sale de resto 11 es 0, y ningún otro dígito cierra", () => {
    const valid = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => isValidCuit(`3312345678${d}`));
    expect(valid).toEqual([0]);
  });

  it("el verificador que sale de resto 10 es 9, y ningún otro dígito cierra", () => {
    const valid = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => isValidCuit(`3387654321${d}`));
    expect(valid).toEqual([9]);
  });
});

describe("counterpartyOf", () => {
  it("Credicoop: el CUIT seguido del motivo y el nombre cortado", () => {
    expect(counterpartyOf("Transf.Inmediata e/Ctas.Dist Tit.O/Bco 30123456781-VAR-ACME", [])).toEqual({ cuit: "30123456781", name: "ACME", cbu: null });
    expect(counterpartyOf("Transf. Interbanking - Distinto Titular Ord.:30234567892-ACME", [])).toEqual({ cuit: "30234567892", name: "ACME", cbu: null });
    expect(counterpartyOf("Debito Inmediato (DEBIN) 33123456780-FAC-EMPRESA UNO SA", [])?.name).toBe("EMPRESA UNO SA");
  });

  it("Provincia: el nombre antes del CUIT entre paréntesis", () => {
    expect(counterpartyOf("TRANSF DE EMPRESA EJEMPLO SA (30123456781) FAC ejemplo", [])).toEqual({
      cuit: "30123456781",
      name: "EMPRESA EJEMPLO SA",
      cbu: null,
    });
  });

  it("Provincia: el nombre pegado al CUIT", () => {
    expect(counterpartyOf("CR.TRAN. 30234567892EMPRESA DOS SA 00A14", [])?.name).toBe("EMPRESA DOS SA");
  });

  it("Galicia: el CUIT en una columna de leyendas, el nombre a la izquierda y otra leyenda a la derecha, las dos a distancia 1: gana el nombre", () => {
    const extras = [
      { column: 1, text: "Trf Inmed Proveed" },
      { column: 10, text: "Proveedor Ejemplo Srl" },
      { column: 11, text: "30123456781" },
      { column: 12, text: "FACTURAS" },
    ];
    expect(counterpartyOf("907269 - TRF INMED PROVEED", extras)).toEqual({ cuit: "30123456781", name: "Proveedor Ejemplo Srl", cbu: null });
  });

  it("Galicia: el nombre dos columnas a la izquierda del CUIT, con la del medio (el código del banco) fuera de las leyendas", () => {
    const extras = [
      { column: 9, text: "Proveedor Ejemplo Srl" },
      { column: 11, text: "30123456781" },
      { column: 13, text: "FACTURAS" },
    ];
    expect(counterpartyOf("907269 - TRF INMED PROVEED", extras)).toEqual({ cuit: "30123456781", name: "Proveedor Ejemplo Srl", cbu: null });
  });

  it("el nombre y el CUIT en la misma celda: ese nombre, no el de otra columna", () => {
    const next = { column: 6, text: "FACTURAS" };
    expect(counterpartyOf("907269 - TRF INMED PROVEED", [{ column: 5, text: "Proveedor Ejemplo Srl 30123456781" }, next])?.name).toBe("Proveedor Ejemplo Srl");
    expect(counterpartyOf("907269 - TRF INMED PROVEED", [{ column: 5, text: "30123456781 Proveedor Ejemplo Srl" }, next])?.name).toBe("Proveedor Ejemplo Srl");
    expect(counterpartyOf("907269 - TRF INMED PROVEED", [{ column: 5, text: "Proveedor Ejemplo Srl (30123456781)" }, next])?.name).toBe("Proveedor Ejemplo Srl");
  });

  it("una celda con un número delante del CUIT, sin nombre, toma el nombre de la columna de texto más cercana", () => {
    expect(counterpartyOf("907269 - TRF INMED PROVEED", [{ column: 5, text: "12345 30123456781" }, { column: 6, text: "FACTURAS" }])?.name).toBe("FACTURAS");
  });

  it("el CBU de la contraparte en el concepto", () => {
    expect(counterpartyOf("Transferencia a 1230123412345678901233 Proveedor", [])?.cbu).toBe("1230123412345678901233");
  });

  it("sin CUIT ni CBU no hay contraparte", () => {
    expect(counterpartyOf("Com. mantenimiento cuenta", [{ column: 3, text: "ASOCIACION EJEMPLO" }])).toBeNull();
  });

  it("un número de once cifras con el dígito verificador mal no se publica como CUIT", () => {
    expect(counterpartyOf("Pago 30123456780-VAR-ACME", [])).toBeNull();
  });

  it("un número de once cifras que cierra el módulo 11 pero no tiene prefijo de AFIP no es un CUIT, ni en el concepto ni en una columna", () => {
    expect(counterpartyOf("Comprobante 12123456783 pago", [])).toBeNull();
    expect(counterpartyOf("Comprobante 12-12345678-3 pago", [])).toBeNull();
    expect(counterpartyOf("Operacion", [{ column: 4, text: "99123456781" }])).toBeNull();
  });

  it("un número que no es CUIT no tapa al CUIT que viene después", () => {
    expect(counterpartyOf("Op 12123456783 Transf 30123456781-VAR-ACME", [])).toEqual({ cuit: "30123456781", name: "ACME", cbu: null });
  });

  it("los ceros de relleno no son una contraparte", () => {
    expect(counterpartyOf("Pago 00000000000 sin datos", [])).toBeNull();
    expect(counterpartyOf("Pago 0000000000000000000000", [])).toBeNull();
    expect(counterpartyOf("Pago a 0000123212345678901233", [])).toBeNull();
  });
});

describe("splitLeadingCode", () => {
  it("separa el código del banco que viene adelante del texto", () => {
    expect(splitLeadingCode("907213 - DEB. AUTOM. DE SERV.")).toEqual({ code: "907213", text: "DEB. AUTOM. DE SERV." });
    expect(splitLeadingCode("Com. mantenimiento cuenta")).toEqual({ code: null, text: "Com. mantenimiento cuenta" });
  });
});

describe("isValidCuit e isValidCbu: la forma exacta", () => {
  it.each(["301234567815", "30123456781 ", "30123456781x", "x30123456781", "300000007919", "300000205894"])("%j no es un CUIT: sobra algo", (c) => {
    expect(isValidCuit(c)).toBe(false);
  });

  it.each(["12301234123456789012339", "1230123412345678901233 ", "68866840488444860824204", "24208284644048646282420"])("%j no es un CBU: sobra algo", (c) => {
    expect(isValidCbu(c)).toBe(false);
  });

  it("un CBU al que le falta un dígito tampoco", () => {
    expect(isValidCbu("123012341234567890123")).toBe(false);
  });
});

describe("counterpartyOf: el nombre", () => {
  const withName = (concept: string) => counterpartyOf(concept, [])?.name;

  it("antes del CUIT entre paréntesis, con espacios de más y sin el verbo de la transferencia", () => {
    expect(withName("TRANSF DE EMPRESA EJEMPLO SA ( 30123456781)")).toBe("EMPRESA EJEMPLO SA");
    expect(withName("Transf  de  Empresa Ejemplo SA (30123456781)")).toBe("Empresa Ejemplo SA");
    expect(withName("Transferencia a  Empresa Ejemplo SA (30123456781)")).toBe("Empresa Ejemplo SA");
    expect(withName("Transferencia de Empresa Ejemplo SA  (30123456781)")).toBe("Empresa Ejemplo SA");
  });

  it("antes del CUIT entre paréntesis, tras el prefijo de Provincia con o sin puntos y espacios", () => {
    expect(withName("CR.TRAN. EMPRESA DOS SA (30234567892)")).toBe("EMPRESA DOS SA");
    expect(withName("CR.TRAN.EMPRESA DOS SA (30234567892)")).toBe("EMPRESA DOS SA");
    expect(withName("CR TRAN EMPRESA DOS SA (30234567892)")).toBe("EMPRESA DOS SA");
    expect(withName("CRTRAN EMPRESA DOS SA (30234567892)")).toBe("EMPRESA DOS SA");
  });

  it("el nombre pegado al paréntesis, sin espacio, llega entero", () => {
    expect(withName("CR.TRAN. EMPRESA DOS SA(30234567892)")).toBe("EMPRESA DOS SA");
    expect(withName("Transf de Empresa Ejemplo SA(30123456781)")).toBe("Empresa Ejemplo SA");
  });

  it("un paréntesis anterior no tapa el nombre que va justo antes del CUIT", () => {
    expect(withName("(REF 1) EMPRESA DOS SA (30234567892)")).toBe("EMPRESA DOS SA");
  });

  it("después del CUIT, un número en el medio corta: no es un nombre", () => {
    expect(withName("Pago 30123456781 123 ACME")).toBeNull();
  });

  it("los espacios repetidos del nombre se juntan en uno", () => {
    expect(withName("Transf 30123456781-VAR-ACME   SA")).toBe("ACME SA");
  });

  it("un nombre de dos letras es un nombre; de una, no", () => {
    expect(withName("Transf 30123456781-VAR-JP")).toBe("JP");
    expect(withName("Transf 30123456781-VAR-J")).toBeNull();
  });
});

describe("counterpartyOf: las columnas sueltas", () => {
  const suelto = (extras: Array<{ column: number; text: string }>, concept = "907269 - TRF INMED PROVEED") => counterpartyOf(concept, extras);

  it("el CBU de una columna suelta", () => {
    expect(suelto([{ column: 3, text: "CBU 1230123412345678901233" }])).toEqual({ cuit: null, name: null, cbu: "1230123412345678901233" });
  });

  it("un CBU con el verificador mal en una columna suelta no se publica", () => {
    expect(suelto([{ column: 3, text: "1230123412345678901234" }])).toBeNull();
  });

  it("el CBU de la columna se busca en cada celda: una mala no tapa la buena", () => {
    expect(suelto([{ column: 3, text: "1230123412345678901234" }, { column: 4, text: "1230123412345678901233" }])?.cbu).toBe("1230123412345678901233");
  });

  it("el CBU del concepto manda sobre el de las columnas", () => {
    expect(suelto([{ column: 3, text: "4560456800001234567891" }], "Transferencia a 1230123412345678901233")?.cbu).toBe("1230123412345678901233");
  });

  it("el CUIT del concepto manda sobre el de las columnas, y se queda con su nombre", () => {
    expect(suelto([{ column: 3, text: "Otro Nombre SA 30234567892" }], "Transf 30123456781-VAR-ACME")).toEqual({ cuit: "30123456781", name: "ACME", cbu: null });
  });

  it("el CUIT y el CBU pueden venir cada uno de un lado", () => {
    expect(suelto([{ column: 3, text: "1230123412345678901233" }], "Transf 30123456781-VAR-ACME")).toEqual({ cuit: "30123456781", name: "ACME", cbu: "1230123412345678901233" });
  });

  it("un texto que termina con números no es un número: «Ref 2026» puede ser el nombre", () => {
    expect(suelto([{ column: 5, text: "30123456781" }, { column: 6, text: "Ref 2026" }])?.name).toBe("Ref 2026");
    expect(suelto([{ column: 5, text: "30123456781" }, { column: 6, text: "2026 Ref" }])?.name).toBe("2026 Ref");
  });

  it("las columnas que son solo números no son el nombre, ni siquiera la más cercana", () => {
    const extras = [{ column: 4, text: "98765" }, { column: 5, text: "12345 30123456781" }, { column: 7, text: "FACTURAS" }];
    expect(suelto(extras)?.name).toBe("FACTURAS");
  });

  it("con una columna a cada lado a igual distancia, gana la de la izquierda aunque venga después", () => {
    const extras = [{ column: 12, text: "FACTURAS" }, { column: 11, text: "30123456781" }, { column: 10, text: "Proveedor Ejemplo Srl" }];
    expect(suelto(extras)?.name).toBe("Proveedor Ejemplo Srl");
  });

  it("la celda del CUIT no es el nombre de sí misma, aunque lo que tenga al lado no sea un número", () => {
    expect(suelto([{ column: 5, text: "30123456781 #" }])).toEqual({ cuit: "30123456781", name: null, cbu: null });
  });

  it("sin ninguna columna de texto cerca, el CUIT va sin nombre", () => {
    expect(suelto([{ column: 5, text: "30123456781" }])).toEqual({ cuit: "30123456781", name: null, cbu: null });
  });
});

describe("splitLeadingCode: bordes", () => {
  it("el código solo vale al principio, con un guion rodeado de espacios", () => {
    expect(splitLeadingCode("Pago 907213 - DEB").code).toBeNull();
    expect(splitLeadingCode("907213-DEB").code).toBeNull();
    expect(splitLeadingCode("907213  -  DEB. AUTOM.")).toEqual({ code: "907213", text: "DEB. AUTOM." });
  });
});
