import { daysBetween, inReferenceWindow, inWindow, isOwnAccount, isTransfer, ownAccountCbus, lineNumber, numberMatches, partyConflict, partyContradicts, partyKey, partyMatch, referenceDate, valueDates, WINDOW_DAYS } from "../../src/reconcile/match";
import type { Party } from "../../src/reconcile/types";
import { line, val } from "./fixtures";

describe("referenceDate", () => {
  it("un valor que sale usa la fecha valor y si no, la del comprobante", () => {
    expect(referenceDate(val({ amountCents: -1, valueDate: "2026-07-20", voucherDate: "2026-07-01" }))).toBe("2026-07-20");
    expect(referenceDate(val({ amountCents: -1, depositDate: "2026-07-25", voucherDate: "2026-07-01" }))).toBe("2026-07-01");
  });
  it("uno que entra usa la fecha de depósito, después la fecha valor, después la del comprobante", () => {
    expect(referenceDate(val({ depositDate: "2026-07-05", valueDate: "2026-07-06" }))).toBe("2026-07-05");
    expect(referenceDate(val({ valueDate: "2026-07-06" }))).toBe("2026-07-06");
    expect(referenceDate(val({ voucherDate: null }))).toBeNull();
  });
});

describe("la ventana de 5 días (RF-14)", () => {
  it("5 días entra, 6 no (AC-14), hacia los dos lados", () => {
    expect(daysBetween("2026-07-10", "2026-07-15")).toBe(5);
    expect(inWindow(line({ date: "2026-07-15" }), val(), WINDOW_DAYS)).toBe(5);
    expect(inWindow(line({ date: "2026-07-05" }), val(), WINDOW_DAYS)).toBe(5);
    expect(inWindow(line({ date: "2026-07-16" }), val(), WINDOW_DAYS)).toBeNull();
    expect(inWindow(line(), val({ voucherDate: null }), WINDOW_DAYS)).toBeNull();
  });
  it("cruza el fin de mes", () => {
    expect(daysBetween("2026-06-28", "2026-07-02")).toBe(4);
  });
  it("el mismo día son 0 días y no es fuera de la ventana", () => {
    expect(inWindow(line(), val(), WINDOW_DAYS)).toBe(0);
  });
  it("basta una fecha del valor en la ventana, y los días son los de la más cercana", () => {
    expect(inWindow(line(), val({ voucherDate: "2026-07-08", depositDate: "2026-07-17" }), WINDOW_DAYS)).toBe(2);
    expect(inWindow(line(), val({ voucherDate: "2026-07-01", valueDate: "2026-07-14", depositDate: "2026-07-20" }), WINDOW_DAYS)).toBe(4);
    expect(inWindow(line(), val({ voucherDate: "2026-07-13", valueDate: "2026-07-11", depositDate: "2026-07-12" }), WINDOW_DAYS)).toBe(1);
    expect(inWindow(line(), val({ voucherDate: "2026-07-01", valueDate: "2026-07-20", depositDate: "2026-07-16" }), WINDOW_DAYS)).toBeNull();
  });
  it("las fechas del valor son las que trae, en orden: comprobante, valor y depósito", () => {
    expect(valueDates(val({ voucherDate: "2026-07-01", valueDate: "2026-07-02", depositDate: "2026-07-03" }))).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(valueDates(val({ voucherDate: null, depositDate: "2026-07-03" }))).toEqual(["2026-07-03"]);
  });
  it("la ventana de la referencia mira solo la fecha con que el banco ve el valor", () => {
    expect(inReferenceWindow(line(), val({ voucherDate: "2026-07-10", depositDate: "2026-07-14" }), WINDOW_DAYS)).toBe(4);
    expect(inReferenceWindow(line(), val({ voucherDate: "2026-07-10", depositDate: "2026-07-16" }), WINDOW_DAYS)).toBeNull();
    expect(inReferenceWindow(line(), val({ voucherDate: "2026-07-10", depositDate: "2026-07-16" }), 6)).toBe(6);
    expect(inReferenceWindow(line(), val({ voucherDate: null }), WINDOW_DAYS)).toBeNull();
  });
  it("la ventana es la que se pide: con 10 días entran 10, con 0 solo el mismo día", () => {
    expect(inWindow(line({ date: "2026-07-20" }), val(), 10)).toBe(10);
    expect(inWindow(line({ date: "2026-07-21" }), val(), 10)).toBeNull();
    expect(inWindow(line(), val(), 0)).toBe(0);
    expect(inWindow(line({ date: "2026-07-11" }), val(), 0)).toBeNull();
  });
  it("cuenta también la fecha que no es la de referencia: el depósito de un valor que sale", () => {
    expect(inWindow(line(), val({ amountCents: -1, voucherDate: "2026-07-01", depositDate: "2026-07-12" }), WINDOW_DAYS)).toBe(2);
  });
});

describe("el número (RF-15)", () => {
  it("la referencia del renglón, o el último número de 4 a 10 dígitos del concepto", () => {
    expect(lineNumber(line({ reference: "000820519" }))).toBe("820519");
    expect(lineNumber(line({ bank: { code: null, text: "ECHEQ 820519 PAGADO", extras: [] } }))).toBe("820519");
    expect(lineNumber(line({ bank: { code: null, text: "CUIT 30111111118", extras: [] } }))).toBeNull();
    expect(lineNumber(line({ bank: { code: null, text: "COMISION 123", extras: [] } }))).toBeNull();
  });
  it("una referencia con letras o separadores se queda con sus dígitos", () => {
    expect(lineNumber(line({ reference: "Nº 0045-12" }))).toBe("4512");
  });
  it("una referencia de menos de 4 dígitos cede al concepto", () => {
    expect(lineNumber(line({ reference: "123", bank: { code: null, text: "CHEQUE 55120", extras: [] } }))).toBe("55120");
    expect(lineNumber(line({ reference: "000012", bank: { code: null, text: "TRANSF", extras: [] } }))).toBeNull();
  });
  it("de varios números del concepto toma el último que sirve", () => {
    expect(lineNumber(line({ bank: { code: null, text: "CHEQUE 111111 DEPOSITO 222222 EN 99", extras: [] } }))).toBe("222222");
    expect(lineNumber(line({ bank: { code: null, text: "CHEQUE 111111 CUIT 30111111118", extras: [] } }))).toBe("111111");
  });
  it("10 dígitos entran, 11 no; los ceros a la izquierda no cuentan para el mínimo pero sí para el máximo", () => {
    expect(lineNumber(line({ bank: { code: null, text: "OP 1234567890", extras: [] } }))).toBe("1234567890");
    expect(lineNumber(line({ bank: { code: null, text: "OP 12345678901", extras: [] } }))).toBeNull();
    expect(lineNumber(line({ bank: { code: null, text: "OP 0000000012", extras: [] } }))).toBeNull();
    expect(lineNumber(line({ bank: { code: null, text: "OP 00123456", extras: [] } }))).toBe("123456");
    expect(lineNumber(line({ bank: { code: null, text: "OP 0012345678", extras: [] } }))).toBe("12345678");
  });
  it("los dígitos de una fecha, de un CUIT con guiones o de un importe no son un número", () => {
    expect(lineNumber(line({ bank: { code: null, text: "CHEQUE 820519 FECHA 10/07/2026", extras: [] } }))).toBe("820519");
    expect(lineNumber(line({ bank: { code: null, text: "CUIT 30-11111111-8", extras: [] } }))).toBeNull();
    expect(lineNumber(line({ bank: { code: null, text: "PAGO 1.500,00 REF 4512", extras: [] } }))).toBe("4512");
    expect(lineNumber(line({ bank: { code: null, text: "PAGO 4512 IMPORTE 1500,00", extras: [] } }))).toBe("4512");
    expect(lineNumber(line({ bank: { code: null, text: "FECHA 2026-07-10", extras: [] } }))).toBeNull();
    expect(lineNumber(line({ bank: { code: null, text: "FECHA 10.07.2026", extras: [] } }))).toBeNull();
  });
  it("un separador que no está entre dígitos no descarta el número", () => {
    expect(lineNumber(line({ bank: { code: null, text: "ECHEQ-820519.", extras: [] } }))).toBe("820519");
    expect(lineNumber(line({ bank: { code: null, text: "ECHEQ 820519, PAGADO", extras: [] } }))).toBe("820519");
    expect(lineNumber(line({ bank: { code: null, text: "NRO.4512/OK", extras: [] } }))).toBe("4512");
  });
  it("la referencia lleva el mismo tope de 10 dígitos: un CUIT o un CBU no es un número", () => {
    const text = "TRANSF";
    expect(lineNumber(line({ reference: "30111111118", bank: { code: null, text, extras: [] } }))).toBeNull();
    expect(lineNumber(line({ reference: "0110000000000000000001", bank: { code: null, text, extras: [] } }))).toBeNull();
    expect(lineNumber(line({ reference: "1234567890", bank: { code: null, text, extras: [] } }))).toBe("1234567890");
    expect(lineNumber(line({ reference: "30111111118", bank: { code: null, text: "ECHEQ 820519", extras: [] } }))).toBe("820519");
  });
  it("4 dígitos es el mínimo", () => {
    expect(lineNumber(line({ bank: { code: null, text: "OP 1234", extras: [] } }))).toBe("1234");
    expect(lineNumber(line({ bank: { code: null, text: "OP 123", extras: [] } }))).toBeNull();
  });
  it("el del valor termina en el del renglón (AC-16: 47820519 y 820519), o es igual", () => {
    expect(numberMatches("820519", "47820519")).toBe(true);
    expect(numberMatches("4512", "4512")).toBe(true);
    expect(numberMatches("820518", "47820519")).toBe(false);
    expect(numberMatches("519", "47820519")).toBe(false);
    expect(numberMatches(null, "47820519")).toBe(false);
    expect(numberMatches("820519", null)).toBe(false);
  });
  it("el del renglón más largo que el del valor no coincide", () => {
    expect(numberMatches("47820519", "820519")).toBe(false);
  });
  it("tres dígitos que terminan igual no alcanzan aunque el valor los contenga", () => {
    expect(numberMatches("284", "284")).toBe(false);
    expect(numberMatches("1284", "1284")).toBe(true);
  });
});

describe("la contraparte", () => {
  const parties = new Map<string, Party>([
    ["supplier:7", { id: "7", role: "supplier", cuit: "20222222223", cbu: "0110000000000000000001" }],
    ["customer:8", { id: "8", role: "customer", cuit: "27333333334", cbu: null }],
    ["supplier:9", { id: "9", role: "supplier", cuit: null, cbu: null }],
  ]);
  it("el CUIT o el CBU del renglón contra el del proveedor o cliente del valor, o contra el librador", () => {
    expect(partyMatch(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), val({ supplierId: "7" }), parties)).toEqual({ cuit: "20222222223" });
    expect(partyMatch(line({ counterparty: { cuit: null, name: null, cbu: "0110000000000000000001" } }), val({ supplierId: "7" }), parties)).toEqual({ cbu: "0110000000000000000001" });
    expect(partyMatch(line({ counterparty: { cuit: "30111111118", name: null, cbu: null } }), val({ drawerCuit: "30111111118" }), parties)).toEqual({ cuit: "30111111118" });
    expect(partyMatch(line({ counterparty: { cuit: "27333333334", name: null, cbu: null } }), val({ supplierId: "7" }), parties)).toBeNull();
    expect(partyMatch(line(), val({ supplierId: "7" }), parties)).toBeNull();
  });
  it("el cliente del valor también cuenta", () => {
    expect(partyMatch(line({ counterparty: { cuit: "27333333334", name: null, cbu: null } }), val({ customerId: "8" }), parties)).toEqual({ cuit: "27333333334" });
  });
  it("el proveedor manda sobre el cliente cuando el valor trae los dos", () => {
    expect(partyMatch(line({ counterparty: { cuit: "27333333334", name: null, cbu: null } }), val({ supplierId: "7", customerId: "8" }), parties)).toBeNull();
  });
  it("un proveedor sin CUIT cae al librador; un proveedor desconocido, también", () => {
    const l = line({ counterparty: { cuit: "30111111118", name: null, cbu: null } });
    expect(partyMatch(l, val({ supplierId: "9", drawerCuit: "30111111118" }), parties)).toEqual({ cuit: "30111111118" });
    expect(partyMatch(l, val({ supplierId: "404", drawerCuit: "30111111118" }), parties)).toEqual({ cuit: "30111111118" });
  });
  it("el CUIT gana sobre el CBU cuando coinciden los dos", () => {
    const l = line({ counterparty: { cuit: "20222222223", name: null, cbu: "0110000000000000000001" } });
    expect(partyMatch(l, val({ supplierId: "7" }), parties)).toEqual({ cuit: "20222222223" });
  });
  it("un CUIT distinto no impide que el CBU coincida", () => {
    const l = line({ counterparty: { cuit: "30111111118", name: null, cbu: "0110000000000000000001" } });
    expect(partyMatch(l, val({ supplierId: "7" }), parties)).toEqual({ cbu: "0110000000000000000001" });
  });
  it("dos lados sin CUIT o sin CBU no coinciden por estar vacíos", () => {
    expect(partyMatch(line({ counterparty: { cuit: null, name: null, cbu: "0110000000000000000001" } }), val({ supplierId: "9" }), parties)).toBeNull();
    expect(partyMatch(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), val({ supplierId: "9" }), parties)).toBeNull();
    expect(partyMatch(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), val({ customerId: "8" }), parties)).toBeNull();
  });
  it("un proveedor que no está en el mapa no aporta nada", () => {
    expect(partyMatch(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), val({ supplierId: "8" }), parties)).toBeNull();
  });
  it("sin nada del lado del valor no hay coincidencia", () => {
    expect(partyMatch(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), val(), parties)).toBeNull();
  });
  it("los ceros a la izquierda del CBU cuentan", () => {
    const l = line({ counterparty: { cuit: null, name: null, cbu: "110000000000000000001" } });
    expect(partyMatch(l, val({ supplierId: "7" }), parties)).toBeNull();
  });
  it("una cuenta propia se reconoce por el CBU de la contraparte", () => {
    const own = [{ id: "2", cbu: "1910000000000000000002", number: null }];
    expect(isOwnAccount(line({ counterparty: { cuit: null, name: null, cbu: "1910000000000000000002" } }), ownAccountCbus(own))).toBe(true);
    expect(isOwnAccount(line({ counterparty: { cuit: null, name: null, cbu: "1910000000000000000003" } }), ownAccountCbus(own))).toBe(false);
    expect(isOwnAccount(line(), ownAccountCbus(own))).toBe(false);
  });
  it("alcanza con que sea una de las cuentas propias", () => {
    const own = [{ id: "1", cbu: "1910000000000000000001", number: null }, { id: "2", cbu: "1910000000000000000002", number: null }];
    expect(isOwnAccount(line({ counterparty: { cuit: null, name: null, cbu: "1910000000000000000002" } }), ownAccountCbus(own))).toBe(true);
    expect(isOwnAccount(line({ counterparty: { cuit: null, name: null, cbu: "1910000000000000000002" } }), ownAccountCbus([]))).toBe(false);
  });
  it("una cuenta propia sin CBU no coincide con una contraparte sin CBU", () => {
    const own = [{ id: "2", cbu: null, number: "123" }];
    expect(isOwnAccount(line({ counterparty: { cuit: "20222222223", name: null, cbu: null } }), ownAccountCbus(own))).toBe(false);
  });
});

describe("partyContradicts", () => {
  const parties = new Map<string, Party>([
    ["supplier:7", { id: "7", role: "supplier", cuit: "20222222223", cbu: "0110000000000000000001" }],
    ["supplier:9", { id: "9", role: "supplier", cuit: null, cbu: "0110000000000000000009" }],
  ]);
  const withCuit = (cuit: string | null, cbu: string | null = null) => line({ counterparty: { cuit, name: null, cbu } });
  it("el CUIT del renglón distinto del CUIT del proveedor o del librador contradice", () => {
    expect(partyContradicts(withCuit("27333333334"), val({ supplierId: "7" }), parties)).toBe(true);
    expect(partyContradicts(withCuit("27333333334"), val({ drawerCuit: "30111111118" }), parties)).toBe(true);
  });
  it("el mismo CUIT no contradice", () => {
    expect(partyContradicts(withCuit("20222222223"), val({ supplierId: "7" }), parties)).toBe(false);
  });
  it("sin CUIT de un lado no hay contradicción", () => {
    expect(partyContradicts(line(), val({ supplierId: "7" }), parties)).toBe(false);
    expect(partyContradicts(withCuit(null, "0110000000000000000002"), val({ supplierId: "7" }), parties)).toBe(false);
    expect(partyContradicts(withCuit("27333333334"), val(), parties)).toBe(false);
    expect(partyContradicts(withCuit("27333333334"), val({ supplierId: "9" }), parties)).toBe(false);
  });
  it("solo el CUIT contradice: un CBU distinto no", () => {
    expect(partyContradicts(withCuit(null, "0110000000000000000002"), val({ supplierId: "9" }), parties)).toBe(false);
  });
});

describe("una transferencia y lo que dice un CUIT que contradice", () => {
  const parties = new Map<string, Party>();
  const t = (code: string) => ({ code, source: "table" as const });
  it("es transferencia el valor cuyo tipo la nombra, sin mayúsculas ni acentos; el tipo del renglón no cuenta", () => {
    expect(isTransfer(val({ kind: "Transferencia bancaria" }))).toBe(true);
    expect(isTransfer(val({ kind: "PAGO POR TRANSFERÉNCIA" }))).toBe(true);
    expect(isTransfer(val({ kind: "Cheque" }))).toBe(false);
    expect(isTransfer(val({ kind: "" }))).toBe(false);
  });
  it("sin contradicción, nada; en una transferencia, un tercero; en lo demás, el valor queda afuera", () => {
    const withCuit = (code: string) => line({ type: t(code), counterparty: { cuit: "20222222223", name: null, cbu: null } });
    expect(partyConflict(withCuit("transferencia-recibida"), val({ drawerCuit: "20222222223" }), parties)).toBeNull();
    expect(partyConflict(withCuit("transferencia-recibida"), val({ drawerCuit: "27333333334" }), parties)).toBe("third-party");
    expect(partyConflict(withCuit("cheque-pagado"), val({ kind: "Cheque", drawerCuit: "27333333334" }), parties)).toBe("excluded");
    expect(partyConflict(withCuit("cheque-pagado"), val({ kind: "Cheque" }), parties)).toBeNull();
    expect(partyConflict(withCuit("transferencia-recibida"), val({ kind: "Cheque", drawerCuit: "27333333334" }), parties)).toBe("excluded");
  });
});

describe("partyKey", () => {
  it("lleva el rol y el id", () => {
    expect(partyKey({ id: "7", role: "supplier", cuit: null, cbu: null })).toBe("supplier:7");
    expect(partyKey({ id: "8", role: "customer", cuit: null, cbu: null })).toBe("customer:8");
  });
});
