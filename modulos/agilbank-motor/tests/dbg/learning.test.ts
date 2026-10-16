import { HALF_LIFE_DAYS, historyGroup, historyKey, inferHistoryType, learnFromDecisions, MAX_AGE_DAYS, MIN_DECISIONS, MIN_SHARE, pairFromCatalog, pairFromHistory, taxAccountsByName } from "../../src/dbg/learning";
import type { AccountPair, Catalogs, DecisionRow, HistoryDbg } from "../../src/dbg/types";

const pair = (accountId: string, movementTypeId = "7"): AccountPair => ({ movementTypeId, accountId, vatAccountId: null, perceptionAccountId: null });
let ref = 0;
const dec = (over: Partial<DecisionRow> = {}): DecisionRow => ({ lineRef: `S1:l${++ref}`, conceptKey: "191|COM1|com mant", result: "accepted", proposedKind: "dbg", proposedPair: pair("100"), chosenKind: "dbg", chosenPair: pair("100"), decidedAt: "2026-07-01", ...over });
const NOW = "2026-07-10";
const KEY = "191|COM1|com mant";

describe("learnFromDecisions", () => {
  it("las constantes del aprendizaje", () => {
    expect([HALF_LIFE_DAYS, MIN_DECISIONS, MIN_SHARE, MAX_AGE_DAYS]).toEqual([180, 3, 0.8, 365]);
  });
  it("AC-30: una sola corrección ya propone la cuenta elegida, weak", () => {
    const l = learnFromDecisions([dec({ result: "corrected", chosenPair: pair("200") })], NOW).get(KEY);
    expect(l).toEqual({ pair: pair("200"), confidence: "weak", kind: null });
  });
  it("tres iguales y recientes: grounded, y la preferencia dbg", () => {
    const l = learnFromDecisions([dec(), dec({ decidedAt: "2026-06-01" }), dec({ decidedAt: "2026-05-01" })], NOW).get(KEY);
    expect(l).toEqual({ pair: pair("100"), confidence: "grounded", kind: "dbg" });
  });
  it("tres con dos pares distintos sin el 80 %: el de más peso, weak", () => {
    const rows = [dec({ chosenPair: pair("100") }), dec({ chosenPair: pair("100"), decidedAt: "2026-06-01" }), dec({ chosenPair: pair("200"), decidedAt: "2026-07-09" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual(expect.objectContaining({ pair: pair("100"), confidence: "weak" }));
  });
  it("el 80 % justo alcanza: cuatro del mismo par y uno distinto, todos del mismo día", () => {
    const rows = [1, 2, 3, 4].map(() => dec({ decidedAt: NOW })).concat(dec({ chosenPair: pair("200"), decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "grounded", kind: "dbg" });
  });
  it("debajo del 80 %: tres del mismo par y uno distinto no es grounded, aunque la preferencia dbg sí", () => {
    const rows = [1, 2, 3].map(() => dec({ decidedAt: NOW })).concat(dec({ chosenPair: pair("200"), decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "weak", kind: "dbg" });
  });
  it("el peso decae con vida media de 180 días: una decisión de hace 180 días vale la mitad de una de hoy", () => {
    const rows = [dec({ chosenPair: pair("100"), decidedAt: "2026-07-10" }), dec({ chosenPair: pair("200"), decidedAt: "2026-01-11" }), dec({ chosenPair: pair("200"), decidedAt: "2026-01-11" })];
    // 1 contra 0.5 + 0.5 = empate: gana el más reciente
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("100"));
  });
  it("con el empate al revés también gana el más reciente", () => {
    const rows = [dec({ chosenPair: pair("200"), decidedAt: "2026-01-11" }), dec({ chosenPair: pair("200"), decidedAt: "2026-01-11" }), dec({ chosenPair: pair("100"), decidedAt: "2026-07-10" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("100"));
  });
  it("en el empate cuenta la decisión más reciente de cada par, no la última que llegó", () => {
    // 200: 3 × 0,5 = 1,5 hasta el 11-01; 100: 1 + 0,5 = 1,5 hasta hoy, aunque su decisión de hoy llegue antes
    const rows = [1, 2, 3].map(() => dec({ chosenPair: pair("200"), decidedAt: "2026-01-11" })).concat([dec({ decidedAt: NOW }), dec({ decidedAt: "2026-01-11" })]);
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("100"));
  });
  it("pares con ids que pegados se confunden siguen siendo distintos", () => {
    const a: AccountPair = { movementTypeId: "71", accountId: "00", vatAccountId: null, perceptionAccountId: null };
    const b: AccountPair = { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null };
    const rows = [dec({ chosenPair: a, decidedAt: NOW }), dec({ chosenPair: b, decidedAt: NOW }), dec({ chosenPair: b, decidedAt: NOW })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.confidence).toBe("weak");
  });
  it("la preferencia con el 80 % justo: cuatro de cinco", () => {
    const four = (kind: "dbg" | "pending") => [1, 2, 3, 4].map(() => dec({ chosenKind: kind, chosenPair: null, decidedAt: NOW }));
    expect(learnFromDecisions([...four("dbg"), dec({ chosenKind: "pending", chosenPair: null, decidedAt: NOW })], NOW).get(KEY)?.kind).toBe("dbg");
    expect(learnFromDecisions([...four("pending"), dec({ chosenPair: null, decidedAt: NOW })], NOW).get(KEY)?.kind).toBe("pending");
  });
  it("tres antiguas pesan menos que dos de hoy: 3 × 0,25 contra 2", () => {
    const rows = [1, 2, 3].map(() => dec({ chosenPair: pair("200"), decidedAt: "2025-07-15" })).concat([1, 2].map(() => dec({ decidedAt: NOW })));
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("100"));
  });
  it("una decisión con fecha posterior a hoy pesa como una de hoy, no más", () => {
    const rows = [dec({ chosenPair: pair("200"), decidedAt: "2027-07-10" }), dec({ decidedAt: NOW }), dec({ decidedAt: NOW })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("100"));
  });
  it("la última de más de 365 días: nunca grounded, ni preferencia", () => {
    const old = ["2025-01-01", "2025-02-01", "2025-03-01"].map((decidedAt) => dec({ decidedAt }));
    expect(learnFromDecisions(old, NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "weak", kind: null });
  });
  it("la última tiene que ser de menos de 365 días: 364 sirve, 365 justos no", () => {
    const at = (last: string) => ["2025-01-01", "2025-02-01", last].map((decidedAt) => dec({ decidedAt }));
    expect(learnFromDecisions(at("2025-07-11"), NOW).get(KEY)?.confidence).toBe("grounded");
    expect(learnFromDecisions(at("2025-07-10"), NOW).get(KEY)?.confidence).toBe("weak");
  });
  it("cuenta la más reciente aunque llegue primero", () => {
    const rows = [dec({ decidedAt: "2026-07-01" }), dec({ decidedAt: "2025-01-01" }), dec({ decidedAt: "2025-02-01" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.confidence).toBe("grounded");
  });
  it("una rechazada no enseña un par: resta peso a lo propuesto", () => {
    const rows = [dec({ chosenPair: pair("100") }), dec({ result: "rejected", proposedPair: pair("100"), chosenKind: "pending", chosenPair: null, decidedAt: "2026-07-09" }), dec({ chosenPair: pair("200"), decidedAt: "2026-07-08" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("200"));
  });
  it("la rechazada resta aunque llegue antes que lo que se había elegido: el mismo resultado en los dos órdenes", () => {
    const accepted = [1, 2, 3, 4].map(() => dec({ decidedAt: NOW }));
    const rejected = dec({ result: "rejected", proposedPair: pair("100"), chosenKind: "pending", chosenPair: null, decidedAt: NOW });
    const expected = { pair: pair("100"), confidence: "weak", kind: "dbg" }; // el par queda en 3 de 5; dbg, 4 de 5
    expect(learnFromDecisions([...accepted, rejected], NOW).get(KEY)).toEqual(expected);
    expect(learnFromDecisions([rejected, ...accepted], NOW).get(KEY)).toEqual(expected);
  });
  it("una aceptada vieja y una rechazada nueva, la rechazada primero como las entrega la base: el par se anula", () => {
    const rows = [dec({ result: "rejected", proposedPair: pair("100"), chosenKind: "pending", chosenPair: null, decidedAt: NOW }), dec({ decidedAt: "2026-01-11" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toBeNull();
  });
  it("una rechazada reciente no da recencia al par: lo elegido hace más de un año sigue sin ser grounded", () => {
    // 20 × 0,214 contra 1: el 81 % del peso, pero la última elegida es de hace 400 días. La preferencia sí la cuenta:
    // la rechazada es una decisión sobre dbg o pendiente, y es de hoy.
    const rows = Array.from({ length: 20 }, () => dec({ decidedAt: "2025-06-05" })).concat(dec({ result: "rejected", proposedPair: pair("300"), chosenKind: "pending", chosenPair: null, decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "weak", kind: "dbg" });
  });
  it("una rechazada sin par propuesto, o con uno que nadie eligió, no cambia el par", () => {
    const rows = [dec(), dec({ result: "rejected", proposedPair: null, chosenKind: "pending", chosenPair: null }), dec({ result: "rejected", proposedPair: pair("300"), chosenKind: "pending", chosenPair: null })];
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "weak", kind: null });
  });
  it("lo rechazado tanto como lo elegido deja el par en null", () => {
    const rows = [dec({ decidedAt: NOW }), dec({ result: "rejected", proposedPair: pair("100"), chosenKind: "pending", chosenPair: null, decidedAt: NOW })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toBeNull();
  });
  it("una rechazada que deja pendiente enseña pendiente: lo que quedó en su lugar cuenta para la preferencia", () => {
    const rows = [1, 2, 3].map(() => dec({ result: "rejected", chosenKind: "pending", chosenPair: null, decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)?.kind).toBe("pending");
  });
  it("el año de la preferencia se cuenta desde la decisión más reciente, no desde la última que llega", () => {
    const pending = (decidedAt: string) => dec({ chosenKind: "pending", chosenPair: null, decidedAt });
    expect(learnFromDecisions([pending(NOW), pending(NOW), pending("2025-01-01")], NOW).get(KEY)?.kind).toBe("pending");
  });
  it("la preferencia de las rechazadas sigue la regla de 3 y 80 %, y la de 365 días contada desde la última, rechazada o no", () => {
    const rejected = (decidedAt: string) => dec({ result: "rejected", chosenKind: "pending", chosenPair: null, decidedAt });
    expect(learnFromDecisions([rejected(NOW), rejected(NOW)], NOW).get(KEY)?.kind).toBeNull();
    expect(learnFromDecisions([rejected(NOW), rejected(NOW), rejected(NOW), dec({ decidedAt: NOW })], NOW).get(KEY)?.kind).toBeNull();
    expect(learnFromDecisions(["2025-01-01", "2025-02-01", "2025-03-01"].map(rejected), NOW).get(KEY)?.kind).toBeNull();
  });
  it("la preferencia pendiente: tres decisiones que eligieron pendiente para un concepto", () => {
    const rows = [1, 2, 3].map((i) => dec({ proposedKind: "dbg", chosenKind: "pending", chosenPair: null, decidedAt: `2026-07-0${i}` }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: null, confidence: "weak", kind: "pending" });
  });
  it("un pendiente con un par no enseña el par", () => {
    const rows = [1, 2, 3].map(() => dec({ chosenKind: "pending", chosenPair: pair("100"), decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: null, confidence: "weak", kind: "pending" });
  });
  it("un dbg sin par suma a la preferencia dbg pero no a un par", () => {
    const rows = [1, 2, 3].map(() => dec({ chosenPair: null, decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: null, confidence: "weak", kind: "dbg" });
  });
  it("dos dbg y dos pendientes: ninguna preferencia", () => {
    const rows = [dec(), dec(), dec({ chosenKind: "pending", chosenPair: null }), dec({ chosenKind: "pending", chosenPair: null })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.kind).toBeNull();
  });
  it("una decisión sobre un apareo no enseña nada", () => {
    expect(learnFromDecisions([dec({ proposedKind: "match", chosenKind: "match", chosenPair: null, proposedPair: null })], NOW).size).toBe(0);
    expect(learnFromDecisions([dec({ proposedKind: "match", chosenKind: "dbg" })], NOW).size).toBe(0);
    expect(learnFromDecisions([dec({ proposedKind: "dbg", chosenKind: "match" })], NOW).size).toBe(0);
  });
  it("una decisión sobre un a-revisar no enseña par, aunque se haya elegido un dbg", () => {
    const rows = [1, 2, 3].map(() => dec({ proposedKind: "review", proposedPair: null, chosenPair: pair("200"), decidedAt: NOW }));
    expect(learnFromDecisions(rows, NOW).size).toBe(0);
  });
  it("una decisión sobre un a-revisar no cuenta para la preferencia entre dbg y pendiente", () => {
    const dbg = [1, 2, 3].map(() => dec({ decidedAt: NOW }));
    const review = [1, 2].map(() => dec({ proposedKind: "review", proposedPair: null, chosenKind: "pending", chosenPair: null, decidedAt: NOW }));
    expect(learnFromDecisions([...dbg, ...review], NOW).get(KEY)).toEqual({ pair: pair("100"), confidence: "grounded", kind: "dbg" });
  });
  it("un mismo renglón decidido en dos conciliaciones cuenta una vez, con la decisión más reciente", () => {
    const rows = [dec({ lineRef: "S1:l1", chosenPair: pair("100"), decidedAt: "2026-07-01" }), dec({ lineRef: "S1:l1", chosenPair: pair("200"), decidedAt: "2026-07-05" }), dec({ lineRef: "S1:l2", decidedAt: "2026-07-02" })];
    const l = learnFromDecisions(rows, NOW).get(KEY);
    expect(l?.confidence).toBe("weak"); // dos renglones distintos, no tres
    expect(l?.pair).toEqual(pair("200"));
  });
  it("la decisión más reciente sobre un renglón manda aunque llegue antes", () => {
    const rows = [dec({ lineRef: "S1:l1", chosenPair: pair("200"), decidedAt: "2026-07-05" }), dec({ lineRef: "S1:l1", chosenPair: pair("100"), decidedAt: "2026-07-01" })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("200"));
  });
  it("dos decisiones del mismo renglón y el mismo día: manda la primera, porque llegan de la más reciente a la más vieja", () => {
    const rows = [dec({ lineRef: "S1:l1", chosenPair: pair("200"), decidedAt: NOW }), dec({ lineRef: "S1:l1", chosenPair: pair("100"), decidedAt: NOW })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(pair("200"));
  });
  it("un renglón cuya última decisión fue un apareo ya no enseña", () => {
    const rows = [dec({ lineRef: "S1:l1", decidedAt: "2026-07-01" }), dec({ lineRef: "S1:l1", chosenKind: "match", chosenPair: null, decidedAt: "2026-07-05" })];
    expect(learnFromDecisions(rows, NOW).size).toBe(0);
  });
  it("las claves no se mezclan", () => {
    const l = learnFromDecisions([dec(), dec({ conceptKey: "191|IVA|iva", chosenPair: pair("300") })], NOW);
    expect(l.get("191|IVA|iva")?.pair).toEqual(pair("300"));
    expect(l.get(KEY)?.pair).toEqual(pair("100"));
  });
  describe("lo rechazado sobre un concepto: el par que la historia o el catálogo no vuelven a proponer", () => {
    const no = (accountId: string, decidedAt = NOW, movementTypeId = "7") => dec({ result: "rejected", proposedPair: { ...pair(accountId, movementTypeId), vatAccountId: "200" }, chosenKind: "pending", chosenPair: null, decidedAt });
    const rejectedOf = (rows: DecisionRow[]) => learnFromDecisions(rows, NOW).get(KEY)?.rejected;
    it("tres rechazadas del mismo tipo y cuenta: ese par, sin las cuentas de IVA ni de percepción", () => {
      expect(rejectedOf([no("310"), no("310"), no("310")])).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("dos no alcanzan", () => {
      expect(rejectedOf([no("310"), no("310")])).toBeUndefined();
    });
    it("con el 80 % del peso de las rechazadas: cuatro de cinco sí, tres de cuatro no", () => {
      expect(rejectedOf([no("310"), no("310"), no("310"), no("310"), no("320")])).toEqual({ movementTypeId: "7", accountId: "310" });
      expect(rejectedOf([no("310"), no("310"), no("310"), no("320")])).toBeUndefined();
    });
    it("por peso: dos rechazos viejos pesan como uno de hoy", () => {
      // 310: 1 + 1 + 1 = 3; 320: 0,5 + 0,5 = 1 → 75 %
      expect(rejectedOf([no("310"), no("310"), no("310"), no("320", "2026-01-11"), no("320", "2026-01-11")])).toBeUndefined();
      // 310: 1 + 1 + 1 + 1 = 4; 320: 0,5 + 0,5 = 1 → 80 %
      expect(rejectedOf([no("310"), no("310"), no("310"), no("310"), no("320", "2026-01-11"), no("320", "2026-01-11")])).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("la última rechazada es la más reciente, no la última que llega", () => {
      expect(rejectedOf([no("310"), no("310"), no("310", "2025-01-01")])).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("la última rechazada tiene que ser de menos de 365 días", () => {
      expect(rejectedOf(["2025-01-01", "2025-02-01", "2025-07-10"].map((d) => no("310", d)))).toBeUndefined();
      expect(rejectedOf(["2025-01-01", "2025-02-01", "2025-07-11"].map((d) => no("310", d)))).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("se cuentan solo las rechazadas: las elegidas no diluyen el rechazo", () => {
      expect(rejectedOf([no("310"), no("310"), no("310"), dec(), dec()])).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("una rechazada sin par propuesto no cuenta, ni para llegar a tres ni para el 80 %", () => {
      const pending = dec({ result: "rejected", proposedKind: "pending", proposedPair: null, chosenKind: "dbg", chosenPair: null, decidedAt: NOW });
      expect(rejectedOf([no("310"), no("310"), pending])).toBeUndefined();
      expect(rejectedOf([no("310"), no("310"), no("310"), pending, pending])).toEqual({ movementTypeId: "7", accountId: "310" });
    });
    it("el tipo de movimiento cuenta: el mismo número de cuenta con otro tipo es otro par", () => {
      expect(rejectedOf([no("310"), no("310"), no("310", NOW, "8")])).toBeUndefined();
    });
  });
  it("dos pares que difieren solo en el tipo de movimiento no se suman", () => {
    const rows = [dec({ decidedAt: NOW }), dec({ decidedAt: NOW }), dec({ chosenPair: pair("100", "8"), decidedAt: NOW })];
    expect(learnFromDecisions(rows, NOW).get(KEY)?.confidence).toBe("weak");
  });
  describe("se vota por tipo y cuenta; la cuenta de IVA y la de percepción se eligen aparte, entre las que votaron el par ganador", () => {
    const withTax = (vatAccountId: string | null, perceptionAccountId: string | null): AccountPair => ({ ...pair("100"), vatAccountId, perceptionAccountId });
    it("dos con percepción y dos sin, mismo tipo y misma cuenta: grounded, con la percepción de las que la informaron", () => {
      const rows = [dec({ chosenPair: withTax(null, "201") }), dec({ chosenPair: withTax(null, "201") }), dec({ chosenPair: withTax(null, null) }), dec({ chosenPair: withTax(null, null) })];
      expect(learnFromDecisions(rows, NOW).get(KEY)).toEqual({ pair: withTax(null, "201"), confidence: "grounded", kind: "dbg" });
    });
    it("la cuenta de IVA y la de percepción, cada una por su peso: pueden salir de decisiones distintas", () => {
      const rows = [dec({ chosenPair: withTax("200", null), decidedAt: NOW }), dec({ chosenPair: withTax("200", "202"), decidedAt: "2026-01-11" }), dec({ chosenPair: withTax("203", "201"), decidedAt: "2026-01-11" }), dec({ chosenPair: withTax(null, "201"), decidedAt: "2026-01-11" })];
      // IVA: 200 con 1 + 0,5 contra 203 con 0,5; percepción: 201 con 0,5 + 0,5 contra 202 con 0,5
      expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(withTax("200", "201"));
    });
    it("con el mismo peso gana la cuenta de IVA más reciente, llegue antes o después", () => {
      const day = (vatAccountId: string, decidedAt: string) => dec({ chosenPair: withTax(vatAccountId, null), decidedAt });
      expect(learnFromDecisions([day("203", "2026-01-11"), day("203", "2026-01-11"), day("200", NOW)], NOW).get(KEY)?.pair?.vatAccountId).toBe("200");
      expect(learnFromDecisions([day("200", NOW), day("203", "2026-01-11"), day("203", "2026-01-11")], NOW).get(KEY)?.pair?.vatAccountId).toBe("200");
    });
    it("dos sin cuenta de IVA y una con ella: la de la que la informó, las otras no votan por «ninguna»", () => {
      const rows = [dec({ chosenPair: withTax(null, null) }), dec({ chosenPair: withTax(null, null) }), dec({ chosenPair: withTax("200", null) })];
      expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(withTax("200", null));
    });
    it("la cuenta de IVA de una decisión que votó otro par no cuenta", () => {
      const rows = [dec({ chosenPair: withTax(null, null), decidedAt: NOW }), dec({ chosenPair: withTax(null, null), decidedAt: NOW }), dec({ chosenPair: { ...pair("300"), vatAccountId: "200" }, decidedAt: NOW })];
      expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toEqual(withTax(null, null));
    });
    it("una rechazada resta del par propuesto aunque sus cuentas de IVA y de percepción sean otras", () => {
      const rows = [dec({ decidedAt: NOW }), dec({ result: "rejected", proposedPair: withTax("200", "201"), chosenKind: "pending", chosenPair: null, decidedAt: NOW })];
      expect(learnFromDecisions(rows, NOW).get(KEY)?.pair).toBeNull();
    });
  });
});

const CATALOGS: Catalogs = {
  movementTypes: [{ id: "7", description: "Débito Bancario Gtos", coefficient: 1 }, { id: "8", description: "Crédito Bancario", coefficient: -1 }],
  accounts: [{ id: "100", code: "9900102", description: "COMISIONES DEL BANCO" }, { id: "101", code: "9900103", description: "INTERESES DEL BANCO" }, { id: "102", code: "9900104", description: "IMP. DEB Y CRED EN CUENTA" }, { id: "103", code: "9900105", description: "IMPUESTO SELLOS PROVINCIA" }, { id: "104", code: "9900106", description: "COMISIONES VENDEDORES" }],
  taxAccounts: [{ id: "200", code: "9900201", description: "IVA CREDITO COMPRAS" }, { id: "201", code: "9900202", description: "PERCEPCIONES DE IVA SUFRIDAS" }],
};
const h = (over: Partial<HistoryDbg> = {}): HistoryDbg => ({ id: "1", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1, amountCents: 121000, vatCents: 21000, perceptionCents: 0, accountCode: "9900102", accountName: "COMISIONES DEL BANCO", detail: null, ...over });

describe("la historia de DBG", () => {
  it.each([
    [h(), "comision"],
    [h({ accountName: "IMP. DEB Y CRED EN CUENTA", vatCents: 0 }), "impuesto-debitos"],
    [h({ accountName: "IMPUESTO SOBRE DEBITOS Y CREDITOS", vatCents: 0 }), "impuesto-debitos"],
    [h({ accountName: "IMPUESTO DEBITOS Y CREDITOS", vatCents: 0 }), "impuesto-debitos"],
    [h({ accountName: "IMP S/DEBITOS", vatCents: 0 }), "impuesto-debitos"],
    [h({ accountName: "IMPUESTO D/C", vatCents: 0 }), "impuesto-debitos"],
    [h({ accountName: "IMP. DEB Y CRED EN CUENTA", vatCents: 0, coefficient: -1, movementType: "Crédito Bancario" }), "devolucion-impuesto"],
    [h({ accountName: "IMPUESTO LEY 25413", vatCents: 0 }), "impuesto-25413"],
    [h({ accountName: "IMPUESTO SELLOS PROVINCIA", vatCents: 0 }), "sellos"],
    [h({ accountName: "SELLO PROVINCIAL", vatCents: 0 }), "sellos"],
    [h({ accountName: "INTERESES DEL BANCO" }), "intereses"],
    [h({ accountName: "INTERES DESCUBIERTO", vatCents: 0 }), "intereses"],
    [h({ accountName: "SIRCREB RETENIDO", vatCents: 0 }), "sircreb"],
    [h({ accountName: "RECAUDACION IIBB", vatCents: 0 }), "recaudacion-iibb"],
    [h({ accountName: "IMPUESTO A LOS INGRESOS BRUTOS", vatCents: 0 }), "recaudacion-iibb"],
    [h({ accountName: "IMPUESTO GANANCIAS A PAGAR", vatCents: 0 }), null],
    [h({ accountName: "OTROS GASTOS DIVERSOS", movementType: "Comisiones", vatCents: 0 }), "comision"],
    [h({ accountName: "OTROS GASTOS DIVERSOS", vatCents: 21000 }), "comision"],
    [h({ accountName: "COMISIONES DEL BANCO", movementType: "Recaudación IIBB" }), "comision"],
    [h({ accountName: "OTROS GASTOS DIVERSOS", movementType: "Ingresos Brutos", vatCents: 0 }), null],
    [h({ accountName: "OTROS GASTOS DIVERSOS", vatCents: 0 }), null],
    [h({ accountName: "OTROS GASTOS DIVERSOS", vatCents: -1 }), null],
  ])("infiere el tipo canónico por el nombre de la cuenta y el IVA: %j → %s", (dbg, type) => {
    expect(inferHistoryType(dbg)).toBe(type);
  });
  it("por grupo, el par de más importe acumulado, llevado a ids del catálogo", () => {
    const history = [h({ id: "1", amountCents: 100 }), h({ id: "2", accountCode: "9900106", accountName: "COMISIONES VENDEDORES", amountCents: 50 }), h({ id: "3", accountCode: "9900106", accountName: "COMISIONES VENDEDORES", amountCents: 60 })];
    expect(pairFromHistory(history, CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("104"));
  });
  it("un DBG de la historia con importe 0 no le gana a uno con importe, venga antes o después", () => {
    const zero = h({ id: "1", accountCode: "9900106", accountName: "COMISIONES VENDEDORES", amountCents: 0 });
    const some = h({ id: "2", amountCents: 1 });
    expect(pairFromHistory([zero, some], CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("100"));
    expect(pairFromHistory([some, zero], CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("100"));
    expect(pairFromHistory([zero, zero, some], CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("100"));
  });
  it("el impuesto de la historia sirve para débitos, créditos y el 25.413; SIRCREB para las recaudaciones de IIBB", () => {
    expect(historyGroup("impuesto-creditos")).toBe(historyGroup("impuesto-debitos"));
    expect(historyGroup("impuesto-25413")).toBe("impuesto");
    expect(historyGroup("devolucion-impuesto")).toBe("impuesto");
    expect(historyGroup("impuesto-debitos")).toBe("impuesto");
    expect(historyGroup("recaudacion-iibb")).toBe(historyGroup("sircreb"));
    expect(historyGroup("percepcion-iibb")).toBe("iibb");
    expect(historyGroup("sircreb")).toBe("iibb");
    expect(historyGroup("comision")).toBe("comision");
    const m = pairFromHistory([h({ accountCode: "9900104", accountName: "IMP. DEB Y CRED EN CUENTA", vatCents: 0 })], CATALOGS, NOW);
    expect(m.get(historyKey("impuesto-creditos", 1))).toEqual(pair("102"));
    expect([...m.keys()]).toEqual(["impuesto|1"]);
  });
  it("la clave de la historia es el grupo y el coeficiente", () => {
    expect(historyKey("devolucion-impuesto", -1)).toBe("impuesto|-1");
    expect(historyKey("impuesto-debitos", 1)).toBe("impuesto|1");
    expect(historyKey("comision", 1)).toBe("comision|1");
  });
  it("una devolución (crédito) no recibe el par de débito del grupo impuesto; con historia de créditos, el suyo", () => {
    const debit = h({ accountCode: "9900104", accountName: "IMP. DEB Y CRED EN CUENTA", vatCents: 0, amountCents: 999999 });
    expect(pairFromHistory([debit], CATALOGS, NOW).has(historyKey("devolucion-impuesto", -1))).toBe(false);
    const credit = h({ accountCode: "9900104", accountName: "IMP. DEB Y CRED EN CUENTA", vatCents: 0, amountCents: 100, coefficient: -1, movementType: "Crédito Bancario" });
    const m = pairFromHistory([debit, credit], CATALOGS, NOW);
    expect(m.get(historyKey("devolucion-impuesto", -1))).toEqual(pair("102", "8"));
    expect(m.get(historyKey("impuesto-debitos", 1))).toEqual(pair("102", "7"));
  });
  it("un DBG de la historia con el coeficiente contrario al de su tipo de gasto en el catálogo no cuenta", () => {
    expect(pairFromHistory([h({ coefficient: -1 })], CATALOGS, NOW).size).toBe(0);
    expect(pairFromHistory([h({ coefficient: 1, movementType: "Crédito Bancario" })], CATALOGS, NOW).size).toBe(0);
  });
  it("dos tipos de gasto con el mismo nombre y distinto coeficiente: cada DBG toma el de su coeficiente", () => {
    const catalogs: Catalogs = { ...CATALOGS, movementTypes: [{ id: "7", description: "Banco", coefficient: 1 }, { id: "8", description: "Banco", coefficient: -1 }] };
    expect(pairFromHistory([h({ movementType: "Banco" })], catalogs, NOW).get(historyKey("comision", 1))?.movementTypeId).toBe("7");
    expect(pairFromHistory([h({ movementType: "Banco", coefficient: -1 })], catalogs, NOW).get(historyKey("comision", -1))?.movementTypeId).toBe("8");
  });
  it("un DBG de la historia con una cuenta que no está en el catálogo no cuenta; tampoco uno con un tipo de gasto que no está", () => {
    expect(pairFromHistory([h({ accountCode: "9999999" })], CATALOGS, NOW).has(historyKey("comision", 1))).toBe(false);
    expect(pairFromHistory([h({ movementType: "Otro tipo" })], CATALOGS, NOW).has(historyKey("comision", 1))).toBe(false);
  });
  it("tampoco cuenta uno sin código de cuenta ni uno cuyo tipo no se infiere", () => {
    expect(pairFromHistory([h({ accountCode: null })], CATALOGS, NOW).size).toBe(0);
    expect(pairFromHistory([h({ accountName: "OTROS GASTOS DIVERSOS", vatCents: 0 })], CATALOGS, NOW).size).toBe(0);
  });
  it("la cuenta se lleva por código a la imputable del catálogo, no a una de IVA", () => {
    expect(pairFromHistory([h({ accountCode: "9900201" })], CATALOGS, NOW).size).toBe(0);
  });
  it("el tipo de gasto se compara normalizado", () => {
    expect(pairFromHistory([h({ movementType: "débito bancario gtos." })], CATALOGS, NOW).get(historyKey("comision", 1))?.movementTypeId).toBe("7");
  });
  describe("lo reciente pesa más: cada DBG vale su importe por 0,5 ** (días / 180), con los días hasta now", () => {
    const other = { accountCode: "9900106", accountName: "COMISIONES VENDEDORES" };
    it("uno nuevo con menos importe le gana a uno de hace un año con más", () => {
      const history = [h({ id: "1", date: "2025-07-10", amountCents: 150 }), h({ id: "2", ...other, date: "2026-07-10", amountCents: 100 })];
      expect(pairFromHistory(history, CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("104"));
    });
    it("a 180 días el peso es la mitad: con 201 el viejo gana, con 199 pierde", () => {
      const recent = h({ id: "2", ...other, date: "2026-07-10", amountCents: 100 });
      expect(pairFromHistory([h({ id: "1", date: "2026-01-11", amountCents: 201 }), recent], CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("100"));
      expect(pairFromHistory([h({ id: "1", date: "2026-01-11", amountCents: 199 }), recent], CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("104"));
    });
    it("uno con fecha posterior a now pesa como uno de hoy, no más", () => {
      const history = [h({ id: "1", date: "2026-08-09", amountCents: 100 }), h({ id: "2", ...other, date: "2026-07-10", amountCents: 111 })];
      expect(pairFromHistory(history, CATALOGS, NOW).get(historyKey("comision", 1))).toEqual(pair("104"));
    });
  });
  describe("dónde pone la empresa un IVA o una percepción: el par de los DBG que los llevan, por lo que llevan", () => {
    it("el IVA va donde la empresa pone más IVA, aunque otro par tenga más importe", () => {
      const history = [h({ id: "1", amountCents: 1000000, vatCents: 100 }), h({ id: "2", accountCode: "9900103", accountName: "INTERESES DEL BANCO", amountCents: 1000, vatCents: 200 })];
      const m = pairFromHistory(history, CATALOGS, NOW);
      expect(m.get(historyKey("iva", 1))).toEqual(pair("101"));
      expect(m.get(historyKey("comision", 1))).toEqual(pair("100"));
    });
    it("la percepción, por la percepción que llevan", () => {
      const history = [h({ id: "1", vatCents: 900, perceptionCents: 100 }), h({ id: "2", accountCode: "9900103", accountName: "INTERESES DEL BANCO", vatCents: 100, perceptionCents: 200 })];
      const m = pairFromHistory(history, CATALOGS, NOW);
      expect(m.get(historyKey("percepcion-iva", 1))).toEqual(pair("101"));
      expect(m.get(historyKey("iva", 1))).toEqual(pair("100"));
    });
    it("un DBG sin IVA ni percepción no enseña dónde van; uno con IVA aunque su tipo no se infiera, sí", () => {
      expect([...pairFromHistory([h({ vatCents: 0 })], CATALOGS, NOW).keys()]).toEqual(["comision|1"]);
      expect([...pairFromHistory([h({ accountCode: "9900103", accountName: "INTERESES DEL BANCO", vatCents: 0, perceptionCents: 0 })], CATALOGS, NOW).keys()]).toEqual(["intereses|1"]);
      const unknown = { ...h({ vatCents: 0, perceptionCents: 50 }), accountName: "OTROS GASTOS DIVERSOS" };
      expect([...pairFromHistory([unknown], CATALOGS, NOW).keys()]).toEqual(["percepcion-iva|1"]);
    });
    it("con la misma vida media: el IVA reciente le gana al viejo", () => {
      const history = [h({ id: "1", date: "2025-07-10", vatCents: 150 }), h({ id: "2", accountCode: "9900103", accountName: "INTERESES DEL BANCO", date: "2026-07-10", vatCents: 100 })];
      expect(pairFromHistory(history, CATALOGS, NOW).get(historyKey("iva", 1))).toEqual(pair("101"));
    });
  });
  it("los grupos no se mezclan", () => {
    const m = pairFromHistory([h(), h({ accountCode: "9900105", accountName: "IMPUESTO SELLOS PROVINCIA", vatCents: 0, amountCents: 999999 })], CATALOGS, NOW);
    expect(m.get(historyKey("comision", 1))).toEqual(pair("100"));
    expect(m.get(historyKey("sellos", 1))).toEqual(pair("103"));
  });
});

describe("el catálogo como último recurso", () => {
  it("la única cuenta cuyo nombre tiene las palabras del tipo; con varias, null", () => {
    expect(pairFromCatalog(CATALOGS, "sellos", 1)).toEqual(pair("103"));
    expect(pairFromCatalog(CATALOGS, "comision", 1).accountId).toBeNull(); // COMISIONES DEL BANCO y COMISIONES VENDEDORES
    expect(pairFromCatalog(CATALOGS, "impuesto-debitos", 1).accountId).toBe("102");
  });
  it.each([
    ["comision", "COMISIONES DEL BANCO"],
    ["intereses", "INTERESES DEL BANCO"],
    ["sellos", "IMPUESTO SELLOS PROVINCIA"],
    ["sellos", "SELLO PROVINCIAL"],
    ["sircreb", "SIRCREB RETENIDO"],
    ["recaudacion-iibb", "SIRCREB RETENIDO"],
    ["recaudacion-iibb", "RECAUDACION IIBB"],
    ["percepcion-iibb", "PERCEPCION INGRESOS BRUTOS"],
    ["impuesto-debitos", "IMPUESTO SOBRE DEBITOS Y CREDITOS"],
    ["impuesto-creditos", "IMPUESTO SOBRE DEBITOS Y CREDITOS"],
    ["impuesto-25413", "IMPUESTO SOBRE DEBITOS Y CREDITOS"],
    ["impuesto-25413", "IMPUESTO LEY 25413"],
    ["devolucion-impuesto", "IMP. DEB Y CRED EN CUENTA"],
  ])("el tipo %s encuentra la cuenta «%s»", (type, description) => {
    const catalogs: Catalogs = { ...CATALOGS, accounts: [{ id: "1", code: "1", description }, { id: "2", code: "2", description: "OTROS GASTOS DIVERSOS" }] };
    expect(pairFromCatalog(catalogs, type, 1).accountId).toBe("1");
  });
  it.each([
    ["sircreb", "RECAUDACION IIBB"],
    ["percepcion-iibb", "SIRCREB RETENIDO"],
    ["impuesto-debitos", "IMPUESTO SELLOS PROVINCIA"],
    ["impuesto-debitos", "IMPUESTO GANANCIAS A PAGAR"],
    ["intereses", "COMISIONES DEL BANCO"],
  ])("el tipo %s no toma la cuenta «%s»", (type, description) => {
    const catalogs: Catalogs = { ...CATALOGS, accounts: [{ id: "1", code: "1", description }] };
    expect(pairFromCatalog(catalogs, type, 1).accountId).toBeNull();
  });
  it("un tipo sin palabras propias (iva, terceros) no toma cuenta del catálogo", () => {
    const one: Catalogs = { ...CATALOGS, accounts: [CATALOGS.accounts[0]] };
    expect(pairFromCatalog(one, "iva", 1).accountId).toBeNull();
    expect(pairFromCatalog(one, "transferencia-recibida", 1).accountId).toBeNull();
  });
  it("las cuentas de IVA no son imputables para el catálogo", () => {
    const catalogs: Catalogs = { ...CATALOGS, accounts: [], taxAccounts: [{ id: "9", code: "9", description: "IMPUESTO SELLOS PROVINCIA" }] };
    expect(pairFromCatalog(catalogs, "sellos", 1).accountId).toBeNull();
  });
  it("el tipo de movimiento: el único con el coeficiente del signo; un crédito no toma un tipo de débito", () => {
    expect(pairFromCatalog(CATALOGS, "devolucion-impuesto", -1).movementTypeId).toBe("8");
    expect(pairFromCatalog(CATALOGS, "sellos", 1).movementTypeId).toBe("7");
    const onlyDebit: Catalogs = { ...CATALOGS, movementTypes: [CATALOGS.movementTypes[0]] };
    expect(pairFromCatalog(onlyDebit, "devolucion-impuesto", -1).movementTypeId).toBeNull();
    const twoDebits: Catalogs = { ...CATALOGS, movementTypes: [CATALOGS.movementTypes[0], { id: "9", description: "Gastos", coefficient: 1 }] };
    expect(pairFromCatalog(twoDebits, "sellos", 1).movementTypeId).toBeNull();
  });
  it("las cuentas de IVA y percepción por nombre: «iva» sin «percep», y «percep» con «iva»", () => {
    expect(taxAccountsByName(CATALOGS)).toEqual({ vatAccountId: "200", perceptionAccountId: "201" });
    expect(taxAccountsByName({ ...CATALOGS, taxAccounts: [...CATALOGS.taxAccounts, { id: "202", code: "x", description: "IVA SALDO TECNICO" }] }).vatAccountId).toBeNull();
  });
  it("una percepción que no es de IVA no es la percepción de IVA; dos percepciones de IVA, null", () => {
    const iibb = { id: "203", code: "y", description: "PERCEPCION IIBB" };
    expect(taxAccountsByName({ ...CATALOGS, taxAccounts: [...CATALOGS.taxAccounts, iibb] })).toEqual({ vatAccountId: "200", perceptionAccountId: "201" });
    const twice = { id: "204", code: "z", description: "PERCEPCIONES DE IVA RG" };
    expect(taxAccountsByName({ ...CATALOGS, taxAccounts: [...CATALOGS.taxAccounts, twice] }).perceptionAccountId).toBeNull();
  });
  it("sin cuentas de IVA, las dos en null; «iva» tiene que ser palabra entera", () => {
    expect(taxAccountsByName({ ...CATALOGS, taxAccounts: [] })).toEqual({ vatAccountId: null, perceptionAccountId: null });
    expect(taxAccountsByName({ ...CATALOGS, taxAccounts: [{ id: "1", code: "1", description: "ACTIVA" }, { id: "2", code: "2", description: "PERCEPCION ACTIVA" }] })).toEqual({ vatAccountId: null, perceptionAccountId: null });
  });
});
