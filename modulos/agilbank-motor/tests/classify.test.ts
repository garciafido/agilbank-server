import { classify } from "../src/classify";
import { catalog } from "../src/catalog/catalog";
import type { Catalog, TextEnding, TextSynonym } from "../src/catalog/catalog";
import type { Correction } from "../src/types";

const none: { previous: number | null; next: number | null } = { previous: null, next: null };
const c = (text: string, amountCents: number, bank: string | null = null, code: string | null = null, corrections: Correction[] = [], neighbors = none) =>
  classify({ text, code, amountCents }, neighbors, bank, catalog, corrections);

describe("classify", () => {
  it("la corrección de la empresa gana sobre la tabla", () => {
    const r = c("Com. mantenimiento cuenta", -1000000, "191", "500", [{ bankCode: "191", text: "Com. mantenimiento cuenta", type: "intereses" }]);
    expect(r).toEqual({ type: { code: "intereses", source: "company" }, isNew: false });
  });

  it("una corrección de otro banco no aplica", () => {
    expect(c("Com. mantenimiento cuenta", -100, "014", null, [{ bankCode: "191", text: "Com. mantenimiento cuenta", type: "intereses" }]).type.code).toBe("comision");
  });

  it("el código de operación del banco primero", () => {
    expect(c("cualquier texto", -100, "191", "IDCC3")).toEqual({ type: { code: "impuesto-debitos", source: "table" }, isNew: false });
  });

  it("después el comienzo del texto, el prefijo más largo", () => {
    expect(c("Transferencia Inmediata e/Ctas. Propias 30123456781-VAR-ACME", 6000000000, "191").type).toEqual({ code: "transferencia-cuenta-propia", source: "table" });
    expect(c("TRANSF DE EMPRESA EJEMPLO SA (30123456781)", 100, "014").type).toEqual({ code: "transferencia-recibida", source: "table" });
  });

  it("un tipo que depende del signo", () => {
    expect(c("TRANS P PR", 100, "007").type.code).toBe("transferencia-recibida");
    expect(c("TRANS P PR", -100, "007").type.code).toBe("transferencia-enviada");
  });

  it("fuera de la tabla, una regla general, con el aviso de concepto nuevo", () => {
    expect(c("IVA-Ali Adic RG 2408 s/Comis", -1950, null)).toEqual({ type: { code: "percepcion-iva", source: "rule" }, isNew: true });
    expect(c("Impuesto al debito", -500, null).type.code).toBe("impuesto-debitos");
    expect(c("REV. IMP.DEBITO.-LEY 25413", 1800, null).type.code).toBe("devolucion-impuesto");
    expect(c("Transferencia recibida de un cliente", 100, null).type.code).toBe("transferencia-recibida");
    expect(c("Echeq 48 Hs. Nro. 20", -100, null).type.code).toBe("echeq-pagado");
    expect(c("Rescate Fima", 100, null).type.code).toBe("fci-rescate");
  });

  it("sin texto que lo diga, la proporción con el renglón vecino", () => {
    const r = c("XYZ 123", -600, null, null, [], { previous: -100000, next: null });
    expect(r).toEqual({ type: { code: "impuesto-debitos", source: "rule" }, isNew: true });
    expect(c("XYZ 123", -600, null, null, [], { previous: null, next: 100000 }).type.code).toBe("impuesto-creditos");
    expect(c("XYZ 123", -2100, null, null, [], { previous: -10000, next: null }).type.code).toBe("iva");
  });

  it("si nada alcanza, sin clasificar", () => {
    expect(c("Suscripcion al Periodico Accion", -6990, null)).toEqual({ type: { code: "sin-clasificar", source: "none" }, isNew: true });
  });
});

const rule = (code: string) => ({ type: { code, source: "rule" }, isNew: true });
const unclassified = { type: { code: "sin-clasificar", source: "none" }, isNew: true };

describe("classify: las transferencias no se confunden por el nombre de la otra parte", () => {
  it.each([
    ["Transferencia recibida de Mantenimiento Industrial SRL", 100, "transferencia-recibida"],
    ["Transferencia recibida MERCADOLIBRE.COM", 100, "transferencia-recibida"],
    ["Transf. a www.tienda.com.ar", -100, "transferencia-enviada"],
    ["Transferencia recibida de ARCA Continental SA", 100, "transferencia-recibida"],
    ["Transferencia recibida de Cheques del Sur SA", 100, "transferencia-recibida"],
    ["Transf. interbanking de Intereses SA", 100, "transferencia-recibida"],
    ["Transferencia a Fideicomiso Leasing", -100, "transferencia-enviada"],
    ["Transferencia Inmediata e/Ctas. Dist. Tit. o Bco. 30123456781-VAR-CHEQUES SA", -100, "transferencia-enviada"],
    ["CR TRAN Cheques SA", 100, "transferencia-recibida"],
    ["TRF a Debin SA", -100, "transferencia-enviada"],
    ["Transfer de Sellos SA", 100, "transferencia-recibida"],
    ["Trans a Sircreb SA", -100, "transferencia-enviada"],
  ])("«%s» es una transferencia", (text, amount, code) => {
    expect(c(text, amount)).toEqual(rule(code));
  });

  it.each([
    ["Transferencia entre Cuentas Propias", -100, "transferencia-cuenta-propia"],
    ["Transf. misma titularidad", 100, "transferencia-cuenta-propia"],
    ["Transf. ctas propias pago de haberes", -100, "transferencia-cuenta-propia"],
    ["Transferencia por pago de haberes", -100, "pago-masivo"],
    ["Transferencia pago a proveedores", -100, "pago-masivo"],
    ["Transferencia por embargo judicial", -100, "orden-judicial"],
    ["Transferencia haberes embargo", -100, "pago-masivo"],
    ["Transferencia por pago de haberes", 100, "transferencia-recibida"],
  ])("dentro de una transferencia solo cuentan propias, haberes y orden judicial: «%s»", (text, amount, code) => {
    expect(c(text, amount)).toEqual(rule(code));
  });

  it.each([
    "Com. mantenimiento cuenta",
    "Comision por transferencia",
    "Comisiones varias",
    "Mantenimiento de cuenta",
    "Com. mant. cuenta",
    "Com. por servicio",
    "Com. serv. cuenta",
    "Com. servicio de cuenta",
    "Com. gestion cheques",
    "Com. uso canal",
  ])("«%s» es comisión", (text) => {
    expect(c(text, -100)).toEqual(rule("comision"));
  });

  it.each(["Pago MERCADOLIBRE.COM", "Compra www.tienda.com.ar", "Compra en comercio"])("«%s» no es comisión: «com» suelto es un dominio y «compra» no es «com»", (text) => {
    expect(c(text, -100)).toEqual(unclassified);
  });

  it.each([
    "Com. emision cheque",
    "Com. Transf. interbanking",
    "Comis. transferencia",
    "Com. Transferencias",
    "Com. mantenimiento cuenta",
    "Comis. mant. cuenta",
    "Com. Mercado",
    "Comision por mantenimiento",
  ])("«%s» empieza con «com» o «comis»: es comisión antes que cualquier otra cosa", (text) => {
    expect(c(text, -100)).toEqual(rule("comision"));
  });

  it("una comisión abreviada que entra no es una comisión", () => {
    expect(c("Com. mantenimiento cuenta", 100)).toEqual(unclassified);
  });

  it.each([
    ["Transferencias cash proveedores", -100, "transferencia-enviada"],
    ["Transferencias recibidas", 100, "transferencia-recibida"],
    ["Transfs. recibidas", 100, "transferencia-recibida"],
    ["TRFs a proveedores", -100, "transferencia-enviada"],
    ["Transferencias recibidas de Mantenimiento Industrial SRL", 100, "transferencia-recibida"],
    ["Transferencias a Cheques del Sur SA", -100, "transferencia-enviada"],
    ["Transferencias entre cuentas propias", -100, "transferencia-cuenta-propia"],
    ["Transferencias por pago de haberes", -100, "pago-masivo"],
    ["Acreditacion transferencias", 100, "transferencia-recibida"],
    ["Acreditacion transfs", 100, "transferencia-recibida"],
    ["Acreditacion trfs", 100, "transferencia-recibida"],
  ])("el verbo en plural también: «%s»", (text, amount, code) => {
    expect(c(text, amount)).toEqual(rule(code));
  });

  it("fuera de una transferencia, la regla de transferencia sigue valiendo", () => {
    expect(c("Acreditacion transf. de cliente", 100)).toEqual(rule("transferencia-recibida"));
  });
});

describe("classify: las correcciones, de la más específica a la más general", () => {
  const broad: Correction = { bankCode: null, text: "Transferencia", type: "intereses" };
  const specific: Correction = { bankCode: "191", text: "Transferencia recibida de acme", type: "sellos" };
  const company = (code: string) => ({ type: { code, source: "company" }, isNew: false });

  it("la del banco gana sobre la de todos los bancos, en cualquier orden de la lista", () => {
    expect(c("Transferencia recibida de ACME SA", -100, "191", null, [broad, specific])).toEqual(company("sellos"));
    expect(c("Transferencia recibida de ACME SA", -100, "191", null, [specific, broad])).toEqual(company("sellos"));
  });

  it("la de todos los bancos aplica a cualquier banco, y también sin banco", () => {
    expect(c("Transferencia recibida de ACME SA", -100, "014", null, [broad, specific])).toEqual(company("intereses"));
    expect(c("Transferencia recibida de ACME SA", -100, null, null, [broad, specific])).toEqual(company("intereses"));
    expect(c("Suscripcion al Periodico Accion", -6990, "014", null, [{ bankCode: null, text: "Suscripcion al Periodico Accion", type: "comision" }])).toEqual(company("comision"));
  });

  it("el código de operación gana sobre el texto dentro del mismo alcance", () => {
    const byText: Correction = { bankCode: "191", text: "Transferencia recibida", type: "sellos" };
    const byCode: Correction = { bankCode: "191", operationCode: "974", type: "intereses" };
    expect(c("Transferencia recibida de ACME", -100, "191", "974", [byText, byCode])).toEqual(company("intereses"));
    expect(c("Transferencia recibida de ACME", -100, "191", "974", [byCode, byText])).toEqual(company("intereses"));
    expect(c("Transferencia recibida de ACME", -100, "191", "975", [byCode, byText])).toEqual(company("sellos"));
    expect(c("Transferencia recibida de ACME", -100, "191", null, [byCode, byText])).toEqual(company("sellos"));
  });

  it("una corrección con código y texto aplica por el texto aunque el código no coincida", () => {
    expect(c("Transferencia recibida de ACME", -100, "191", "975", [{ bankCode: "191", operationCode: "974", text: "Transferencia recibida", type: "sellos" }])).toEqual(company("sellos"));
  });

  it("el alcance gana sobre el código: el texto de un banco gana al código de todos los bancos", () => {
    const anyBankCode: Correction = { bankCode: null, operationCode: "974", type: "intereses" };
    expect(c("Transferencia recibida de ACME", -100, "191", "974", [anyBankCode, { bankCode: "191", text: "Transferencia", type: "sellos" }])).toEqual(company("sellos"));
  });

  it("entre textos, el más largo; con igual largo, el primero de la lista", () => {
    const short: Correction = { bankCode: "191", text: "Transferencia", type: "sellos" };
    const long: Correction = { bankCode: "191", text: "Transferencia recibida", type: "intereses" };
    expect(c("Transferencia recibida de ACME", -100, "191", null, [short, long])).toEqual(company("intereses"));
    expect(c("Transferencia recibida de ACME", -100, "191", null, [long, short])).toEqual(company("intereses"));
    const first: Correction = { bankCode: "191", text: "Transferencia", type: "sellos" };
    const second: Correction = { bankCode: "191", text: "TRANSFERENCIA", type: "intereses" };
    expect(c("Transferencia recibida de ACME", -100, "191", null, [first, second])).toEqual(company("sellos"));
  });

  it("una corrección sin código ni texto no aplica a nada", () => {
    expect(c("Com. mantenimiento cuenta", -100, "014", null, [{ bankCode: null, type: "intereses" }]).type.source).toBe("rule");
  });
});

describe("classify: los intereses", () => {
  it("«interes» en singular también son intereses", () => {
    expect(c("Interes sobre saldo deudor", -100)).toEqual(rule("intereses"));
    expect(c("Interés por descubierto", -100)).toEqual(rule("intereses"));
    expect(c("Intereses por descubierto", -100)).toEqual(rule("intereses"));
  });

  it("una palabra que solo empieza como interés no lo es", () => {
    expect(c("Interesante promocion", -100)).toEqual(unclassified);
  });
});

describe("classify: el débito directo a ARCA es un pago a ARCA", () => {
  it.each(["014", null, "191"])("en el banco %s", (bank) => {
    expect(c("Debito Directo Recaudaciones en pesos AFIP", -100, bank).type.code).toBe("pago-arca");
  });

  it("un débito directo que no es de ARCA sigue siendo un débito automático", () => {
    expect(c("Debito directo Claro", -100)).toEqual(rule("debito-automatico"));
  });
});

describe("classify: un CUIT o un CBU en el concepto", () => {
  it("con un CUIT válido, la transferencia según el signo", () => {
    expect(c("CR 30123456781 ACME", 600)).toEqual(rule("transferencia-recibida"));
    expect(c("DB 30123456781 ACME", -600)).toEqual(rule("transferencia-enviada"));
    expect(c("CR 30-12345678-1 ACME", 600)).toEqual(rule("transferencia-recibida"));
  });

  it("con un CBU válido, la transferencia según el signo", () => {
    expect(c("OP 1230123412345678901233 ACME", 600)).toEqual(rule("transferencia-recibida"));
    expect(c("OP 1230123412345678901233 ACME", -600)).toEqual(rule("transferencia-enviada"));
  });

  it("un número que no es CUIT ni CBU no cuenta", () => {
    expect(c("CR 30123456780 ACME", 600)).toEqual(unclassified);
    expect(c("CR 12123456783 ACME", 600)).toEqual(unclassified);
    expect(c("OP 930123456781 ACME", 600)).toEqual(unclassified);
    expect(c("OP 1230123412345678901234 ACME", 600)).toEqual(unclassified);
    expect(c("OP 11230123412345678901233 ACME", 600)).toEqual(unclassified);
  });

  it("alcanza con que uno de los números sea válido", () => {
    expect(c("OP 30123456780 y 30123456781", 600)).toEqual(rule("transferencia-recibida"));
    expect(c("OP 1230123412345678901234 y 1230123412345678901233", -600)).toEqual(rule("transferencia-enviada"));
  });

  it("las palabras mandan sobre el número, y el número sobre la proporción", () => {
    expect(c("Impuesto al debito 30123456781", -100).type.code).toBe("impuesto-debitos");
    expect(c("CR 30123456781 ACME", -600, null, null, [], { previous: -100000, next: null })).toEqual(rule("transferencia-enviada"));
  });
});

describe("classify: una regla no le da a un crédito el tipo de un débito, ni al revés", () => {
  it("un crédito no es intereses ni impuesto a los débitos", () => {
    expect(c("Intereses ganados", 100)).toEqual(unclassified);
    expect(c("Imp. Deb. Ley 25413", 100)).toEqual(unclassified);
    expect(c("Intereses", -100)).toEqual(rule("intereses"));
    expect(c("Imp. Deb. Ley 25413", -100)).toEqual(rule("impuesto-debitos"));
  });

  it("una regla saltada deja pasar a la siguiente", () => {
    expect(c("Intereses ganados transferencia", 100)).toEqual(rule("transferencia-recibida"));
  });

  it("un tipo sin signo acepta los dos", () => {
    expect(c("Pago debin", 100)).toEqual(rule("debin"));
    expect(c("Pago debin", -100)).toEqual(rule("debin"));
  });

  it("un importe en cero no tiene signo que contradiga", () => {
    expect(c("Intereses", 0)).toEqual(rule("intereses"));
    expect(c("REV. IMP.DEBITO.-LEY 25413", 0)).toEqual(rule("devolucion-impuesto"));
  });

  it("el IVA y su percepción son cargos: no salen de una base que entra", () => {
    expect(c("XYZ 123", -2100, null, null, [], { previous: 10000, next: null })).toEqual(unclassified);
    expect(c("XYZ 123", -300, null, null, [], { previous: null, next: 10000 })).toEqual(unclassified);
    expect(c("XYZ 123", -300, null, null, [], { previous: -10000, next: null })).toEqual(rule("percepcion-iva"));
  });

  it("si un vecino no sirve, se prueba el otro", () => {
    expect(c("XYZ 123", -2100, null, null, [], { previous: 10000, next: -10000 })).toEqual(rule("iva"));
  });
});

describe("classify: los códigos de operación vienen de una celda", () => {
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])("«%s» no es un código del banco", (code) => {
    expect(c("Com. mantenimiento cuenta", -100, "191", code).type.code).toBe("comision");
    expect(c("Com. mantenimiento cuenta", -100, "191", code).type.source).not.toBe("none");
  });

  it.each(["__proto__", "constructor", "toString"])("«%s» no es un banco", (bank) => {
    expect(c("Com. mantenimiento cuenta", -100, bank, "500")).toEqual(rule("comision"));
  });
});

describe("classify: la tabla del banco y la general", () => {
  const small = (banks: Catalog["synonyms"]["banks"], general: TextSynonym[]): Catalog => ({ ...catalog, synonyms: { ...catalog.synonyms, banks, general } });
  const run = (text: string, bank: string | null, cat: Catalog, amountCents = -100) => classify({ text, code: null, amountCents }, none, bank, cat, []);
  const table = (code: string) => ({ type: { code, source: "table" }, isNew: false });

  it("entre varios prefijos del banco, el más largo, esté donde esté en la lista", () => {
    const texts: TextSynonym[] = [
      { prefix: "pago", type: "pago-servicio" },
      { prefix: "pago de servicios", type: "pago-masivo" },
      { prefix: "pago de", type: "leasing" },
    ];
    const forward = small({ "999": { codes: {}, texts } }, []);
    const backward = small({ "999": { codes: {}, texts: [...texts].reverse() } }, []);
    for (const cat of [forward, backward]) {
      expect(run("Pago de servicios varios", "999", cat)).toEqual(table("pago-masivo"));
      expect(run("Pago de sueldos", "999", cat)).toEqual(table("leasing"));
      expect(run("Pago visa", "999", cat)).toEqual(table("pago-servicio"));
      expect(run("Pagos varios", "999", cat)).toEqual(unclassified);
    }
  });

  it("sin prefijo del banco, la lista general, también el más largo", () => {
    const cat = small({ "999": { codes: {}, texts: [{ prefix: "pago de", type: "leasing" }] } }, [
      { prefix: "cargo", type: "comision" },
      { prefix: "cargo especial", type: "sellos" },
      { prefix: "movimiento fci", type: { "+": "fci-rescate", "-": "fci-suscripcion" } },
    ]);
    expect(run("Cargo especial mensual", "999", cat)).toEqual(table("sellos"));
    expect(run("Cargo mensual", "999", cat)).toEqual(table("comision"));
    expect(run("Cargo especial mensual", "888", cat)).toEqual(table("sellos"));
    expect(run("Cargo especial mensual", null, cat)).toEqual(table("sellos"));
    expect(run("Movimiento FCI", null, cat, 100)).toEqual(table("fci-rescate"));
    expect(run("Movimiento FCI", null, cat, -100)).toEqual(table("fci-suscripcion"));
  });

  it("un prefijo del banco gana sobre la lista general aunque la general sea más larga", () => {
    const cat = small({ "999": { codes: {}, texts: [{ prefix: "cargo", type: "intereses" }] } }, [{ prefix: "cargo especial", type: "sellos" }]);
    expect(run("Cargo especial mensual", "999", cat)).toEqual(table("intereses"));
    expect(run("Cargo especial mensual", "888", cat)).toEqual(table("sellos"));
  });

  it("sin prefijo del banco, el final más largo del banco, antes que la lista general: el banco que escribe primero la otra parte", () => {
    const endings: TextEnding[] = [
      { suffix: "ref", type: "comision" },
      { suffix: "bco ref", type: { "+": "transferencia-recibida", "-": "transferencia-enviada" } },
    ];
    for (const list of [endings, [...endings].reverse()]) {
      const cat = small({ "999": { codes: {}, texts: [{ prefix: "cr tra", type: "deposito-cheques" }], endings: list } }, [{ prefix: "acme", type: "sellos" }]);
      expect(run("ACME SA 30123456781 BCO.015 REF.", "999", cat, 100)).toEqual(table("transferencia-recibida"));
      expect(run("ACME SA 30123456781 BCO.015 REF.", "999", cat, -100)).toEqual(table("transferencia-enviada"));
      expect(run("Otro cargo REF.", "999", cat)).toEqual(table("comision"));
      expect(run("CR.TRA. ACME SA 30123456781 BCO.015 REF.", "999", cat)).toEqual(table("deposito-cheques"));
      expect(run("ACME SA 30123456781 BCO.015 REF.", "888", cat)).toEqual(table("sellos"));
      expect(run("ACME SA 30123456781 BCO.015 REF. FAC", "999", cat)).toEqual(table("sellos"));
    }
  });
});

describe("classify: la proporción con el vecino, con un centavo de tolerancia", () => {
  const near = (amount: number, neighbors: { previous: number | null; next: number | null }) => c("XYZ 123", amount, null, null, [], neighbors);

  it.each([
    [-599, "impuesto-debitos"],
    [-600, "impuesto-debitos"],
    [-601, "impuesto-debitos"],
    [-1199, "impuesto-debitos"],
    [-1201, "impuesto-debitos"],
  ])("%i sobre una base de -100000", (amount, code) => {
    expect(near(amount, { previous: -100000, next: null })).toEqual(rule(code));
  });

  it.each([-598, -602, -1198, -1202, -1000])("%i está a dos centavos o más de toda alícuota", (amount) => {
    expect(near(amount, { previous: -100000, next: null })).toEqual(unclassified);
  });

  it.each([
    [-2099, "iva"],
    [-2101, "iva"],
    [-1049, "iva"],
    [-2699, "iva"],
    [-299, "percepcion-iva"],
    [-301, "percepcion-iva"],
    [-149, "percepcion-iva"],
  ])("%i sobre una base de -10000", (amount, code) => {
    expect(near(amount, { previous: -10000, next: null })).toEqual(rule(code));
  });

  it.each([-2098, -2102, -298, -302])("%i sobre una base de -10000 está a dos centavos", (amount) => {
    expect(near(amount, { previous: -10000, next: null })).toEqual(unclassified);
  });

  it("la base se mide por su valor absoluto", () => {
    expect(near(-600, { previous: 100000, next: null })).toEqual(rule("impuesto-creditos"));
    expect(near(-600, { previous: -100000, next: null })).toEqual(rule("impuesto-debitos"));
  });

  it("una base en cero no sirve, y se mira el otro vecino", () => {
    expect(near(-600, { previous: 0, next: null })).toEqual(unclassified);
    expect(near(-600, { previous: null, next: 0 })).toEqual(unclassified);
    expect(near(-600, { previous: 0, next: -100000 })).toEqual(rule("impuesto-debitos"));
    expect(near(-600, { previous: -100000, next: 0 })).toEqual(rule("impuesto-debitos"));
    expect(near(-1, { previous: 0, next: null })).toEqual(unclassified);
  });

  it("un importe que entra nunca es un cargo proporcional", () => {
    expect(near(600, { previous: -100000, next: null })).toEqual(unclassified);
    expect(near(0, { previous: -100000, next: null })).toEqual(unclassified);
  });
});

describe("classify: cada regla general da su tipo", () => {
  it.each([
    ["Sircreb Cba", -100, "sircreb"],
    ["Percepcion IIBB", -100, "percepcion-iibb"],
    ["Percep. IIBB Cba", -100, "percepcion-iibb"],
    ["Percepcion de Ingresos Brutos", -100, "percepcion-iibb"],
    ["Ing. Brutos RG 5 Percepcion", -100, "percepcion-iibb"],
    ["Recaudacion IIBB", -100, "recaudacion-iibb"],
    ["Ingresos Brutos Cordoba", -100, "recaudacion-iibb"],
    ["IVA Percepcion", -100, "percepcion-iva"],
    ["Percepcion IVA", -100, "percepcion-iva"],
    ["IVA 21%", -100, "iva"],
    ["Devolucion de Impuesto", 100, "devolucion-impuesto"],
    ["Imp. Ley 25413 Ali Gral s/Creditos", -100, "impuesto-creditos"],
    ["Imp. Ley 25413 Ali Gral s/Debitos", -100, "impuesto-debitos"],
    ["Sellos Provincia", -100, "sellos"],
    ["Intereses por descubierto", -100, "intereses"],
    ["Echeq acreditado", 100, "deposito-cheques"],
    ["Echeq 48 Hs.", -100, "echeq-pagado"],
    ["Cheque 123", 100, "deposito-cheques"],
    ["Cheque 123", -100, "cheque-pagado"],
    ["Cheques 123", -100, "cheque-pagado"],
    ["Deposito en efectivo", 100, "deposito-cheques"],
    ["Acreditacion valores", 100, "deposito-cheques"],
    ["Debito en cuenta automatico", -100, "debito-automatico"],
    ["Suscripcion Fondo Comun", -100, "fci-suscripcion"],
    ["Rescate Fondo Comun", 100, "fci-rescate"],
    ["Cuota Leasing", -100, "leasing"],
    ["Pago de servicios", -100, "pago-servicio"],
    ["Debin cobrado", 100, "debin"],
    ["Pago VEP", -100, "pago-arca"],
  ])("«%s» (%i) es %s", (text, amount, code) => {
    expect(c(text, amount)).toEqual(rule(code));
  });
});

describe("classify: las correcciones de la empresa, los bordes", () => {
  it("una corrección por código de operación que no es el del renglón no aplica", () => {
    const r = c("Com. mantenimiento cuenta", -100, "191", "500", [{ bankCode: "191", operationCode: "999", type: "intereses" }]);
    expect(r.type.source).not.toBe("company");
  });

  it("una corrección con código de operación nulo no aplica a un renglón sin código: manda su texto", () => {
    expect(c("Algo distinto", -100, null, null, [{ bankCode: null, operationCode: null, text: "Com", type: "intereses" }])).toEqual(unclassified);
    expect(c("Com. varias", -100, null, null, [{ bankCode: null, operationCode: null, text: "Com", type: "intereses" }]).type).toEqual({ code: "intereses", source: "company" });
  });

  it("una corrección sin texto ni código no aplica a nada", () => {
    expect(c("Algo distinto", -100, null, null, [{ bankCode: null, type: "intereses" }])).toEqual(unclassified);
  });

  it("el código de operación del renglón gana al texto de otra corrección", () => {
    const corrections: Correction[] = [
      { bankCode: "191", text: "Com. mantenimiento cuenta", type: "sellos" },
      { bankCode: "191", operationCode: "500", type: "intereses" },
    ];
    expect(c("Com. mantenimiento cuenta", -100, "191", "500", corrections).type.code).toBe("intereses");
  });
});

describe("classify: los bordes del catálogo y de la proporción", () => {
  it("un tipo que no está en el catálogo no rompe: sin signo declarado cabe en cualquier importe", () => {
    const sinTipos: Catalog = { ...catalog, types: [] };
    expect(classify({ text: "Impuesto al debito", code: null, amountCents: -500 }, none, null, sinTipos, [])).toEqual(rule("impuesto-debitos"));
  });

  it("un importe en cero no es un cargo proporcional, ni siquiera sobre una base chica", () => {
    expect(c("XYZ 123", 0, null, null, [], { previous: -100, next: null })).toEqual(unclassified);
  });
});

describe("classify: la corrección de la empresa solo aplica si su tipo cabe en el signo del importe", () => {
  const company = (code: string) => ({ type: { code, source: "company" }, isNew: false });
  const byCode: Correction = { bankCode: "191", operationCode: "974", type: "transferencia-recibida" };

  it("una corrección a un tipo de ingreso por un código de operación no cambia un renglón de ese código con importe negativo", () => {
    expect(c("Transferencia enviada a ACME", -100, "191", "974", [byCode])).toEqual(c("Transferencia enviada a ACME", -100, "191", "974"));
    expect(c("Transferencia enviada a ACME", -100, "191", "974", [byCode]).type.source).not.toBe("company");
    expect(c("Transferencia recibida de ACME", 100, "191", "974", [byCode])).toEqual(company("transferencia-recibida"));
  });

  it("por texto, igual: un tipo de egreso no se aplica a un crédito", () => {
    const comision: Correction = { bankCode: null, text: "Ajuste", type: "comision" };
    expect(c("Ajuste a favor", 100, null, null, [comision]).type.source).not.toBe("company");
    expect(c("Ajuste en contra", -100, null, null, [comision])).toEqual(company("comision"));
  });

  it("si la que pesa más no cabe, aplica la siguiente que sí", () => {
    const byText: Correction = { bankCode: "191", text: "Transferencia", type: "transferencia-enviada" };
    expect(c("Transferencia a ACME", -100, "191", "974", [byCode, byText])).toEqual(company("transferencia-enviada"));
    expect(c("Transferencia de ACME", 100, "191", "974", [byText, byCode])).toEqual(company("transferencia-recibida"));
  });

  it("un tipo sin signo cabe en los dos signos, y un importe en cero cabe en cualquier tipo", () => {
    const propia: Correction = { bankCode: null, text: "Mov", type: "transferencia-cuenta-propia" };
    expect(c("Mov interno", 100, null, null, [propia])).toEqual(company("transferencia-cuenta-propia"));
    expect(c("Mov interno", -100, null, null, [propia])).toEqual(company("transferencia-cuenta-propia"));
    expect(c("Mov interno", 0, null, null, [{ bankCode: null, text: "Mov", type: "comision" }])).toEqual(company("comision"));
  });
});
