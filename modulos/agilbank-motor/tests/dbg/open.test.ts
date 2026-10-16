import { openPending, PENDING_3B, PENDING_LEARNED, PENDING_THIRD_PARTY } from "../../src/dbg/open";
import type { Catalogs, DecisionRow, HistoryDbg } from "../../src/dbg/types";
import type { Proposal } from "../../src/reconcile/types";
import { line } from "../reconcile/fixtures";

const t = (code: string) => ({ code, source: "table" as const });
const row = (id: string, order: number, code: string, amountCents: number, over = {}) => line({ id, order, type: t(code), amountCents, date: "2026-07-10", bank: { code: null, text: code.toUpperCase().replace(/-/g, " "), extras: [] }, ...over });
const pend = (lineId: string): Proposal => ({ kind: "pending", lineId, reason: "No hay un valor pendiente que coincida.", marks: [] });
const CATALOGS: Catalogs = {
  movementTypes: [{ id: "7", description: "Débito Bancario Gtos", coefficient: 1 }],
  accounts: [{ id: "100", code: "9900102", description: "COMISIONES DEL BANCO" }, { id: "102", code: "9900104", description: "IMP. DEB Y CRED EN CUENTA" }],
  taxAccounts: [{ id: "200", code: "9900201", description: "IVA CREDITO COMPRAS" }, { id: "201", code: "9900202", description: "PERCEPCIONES DE IVA SUFRIDAS" }],
};
const open = (lines: ReturnType<typeof line>[], over: Partial<Parameters<typeof openPending>[0]> = {}) =>
  openPending({ lines, proposals: lines.map((l) => pend(l.id)), bankCode: "191", catalogs: CATALOGS, history: [], decisions: [], readingWarning: false, now: "2026-07-15", ...over });
const dbgOf = (ps: Proposal[], id: string) => ps.find((p) => p.lineId === id) as Extract<Proposal, { kind: "dbg" }>;

describe("openPending", () => {
  it("AC-22: la comisión y el impuesto salen dbg; la transferencia recibida, pendiente con su motivo", () => {
    const ps = open([row("c", 1, "comision", -100000), row("i", 2, "impuesto-debitos", -600), row("t", 3, "transferencia-recibida", 50000)]);
    expect(ps.map((p) => p.kind)).toEqual(["dbg", "dbg", "pending"]);
    expect(ps[2]).toEqual(expect.objectContaining({ reason: PENDING_THIRD_PARTY }));
  });
  it("AC-23: 20 renglones del impuesto dan 20 dbg, uno por renglón", () => {
    const ls = Array.from({ length: 20 }, (_, i) => row(`t${i}`, i + 1, "impuesto-debitos", -600));
    expect(open(ls).filter((p) => p.kind === "dbg")).toHaveLength(20);
  });
  it("AC-25: comisión 12.800 + IVA 2.688 + percepción 384 → un dbg de 15.872 con IVA 2.688 y percepción 384, en los tres renglones, el cargo primero", () => {
    const ps = open([row("c", 1, "comision", -1280000), row("i", 2, "iva", -268800), row("p", 3, "percepcion-iva", -38400)]);
    for (const id of ["c", "i", "p"]) {
      expect(dbgOf(ps, id)).toEqual(expect.objectContaining({ groupLineIds: ["c", "i", "p"], amountCents: -1587200, vatCents: -268800, perceptionCents: -38400, groupKey: "7|100|2026-07" }));
    }
  });
  it("AC-24: tipo y cuenta son ids del catálogo; con el catálogo por nombre sale weak y origen catalogo; las cuentas de IVA y percepción, por nombre", () => {
    const d = dbgOf(open([row("c", 1, "comision", -100000)]), "c");
    expect(d.pair).toEqual({ movementTypeId: "7", accountId: "100", vatAccountId: "200", perceptionAccountId: "201" });
    expect(d).toEqual(expect.objectContaining({ confidence: "weak", origin: "catalog" }));
  });
  it("sin catálogo: dbg sin tipo ni cuenta, origen ninguno, weak", () => {
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { catalogs: null }), "c")).toEqual(expect.objectContaining({ pair: { movementTypeId: null, accountId: null, vatAccountId: null, perceptionAccountId: null }, origin: "none", confidence: "weak" }));
  });
  it("la historia manda sobre el catálogo: origen historia, weak", () => {
    const history = [{ id: "1", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1 as const, amountCents: 100, vatCents: 21, perceptionCents: 0, accountCode: "9900104", accountName: "IMP. DEB Y CRED EN CUENTA", detail: null }];
    const d = dbgOf(open([row("c", 1, "impuesto-debitos", -600)], { history }), "c");
    expect(d).toEqual(expect.objectContaining({ pair: expect.objectContaining({ accountId: "102" }), origin: "history", confidence: "weak" }));
  });
  it("AC-30 y las decisiones mandan sobre todo: tres iguales → grounded, origen decision; una sola → weak", () => {
    const dec = (decidedAt: string): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: "191||comision", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: null }, decidedAt });
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { decisions: [dec("2026-07-01")] }), "c")).toEqual(expect.objectContaining({ origin: "decision", confidence: "weak", pair: expect.objectContaining({ accountId: "102" }) }));
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { decisions: [dec("2026-07-01"), dec("2026-06-01"), dec("2026-05-01")] }), "c").confidence).toBe("grounded");
  });
  it("las decisiones de la empresa invierten la familia: un concepto de terceros decidido tres veces como dbg sale dbg, y una comisión decidida tres veces pendiente sale pendiente", () => {
    const asDbg = (decidedAt: string): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: "191||debito automatico", result: "corrected", proposedKind: "pending", proposedPair: null, chosenKind: "dbg", chosenPair: { movementTypeId: "7", accountId: "100", vatAccountId: null, perceptionAccountId: null }, decidedAt });
    expect(open([row("d", 1, "debito-automatico", -5000)], { decisions: ["2026-07-01", "2026-06-01", "2026-05-01"].map(asDbg) })[0].kind).toBe("dbg");
    const asPending = (decidedAt: string): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: "191||comision", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "pending", chosenPair: null, decidedAt });
    expect(open([row("c", 1, "comision", -100000)], { decisions: ["2026-07-01", "2026-06-01", "2026-05-01"].map(asPending) })[0]).toEqual(expect.objectContaining({ kind: "pending" }));
  });
  it("un crédito no toma un tipo de débito: devolución con un catálogo solo de débitos → tipo null", () => {
    expect(dbgOf(open([row("r", 1, "devolucion-impuesto", 600)]), "r").pair.movementTypeId).toBeNull();
  });
  it("un renglón que no encadena deja el dbg weak con renglon-sin-control, también si es el IVA del grupo", () => {
    const ps = open([row("c", 1, "comision", -100000, { chains: true }), row("i", 2, "iva", -21000, { chains: false })]);
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ confidence: "weak", marks: ["unchecked-line"] }));
  });
  it("con lectura con aviso, nada se abre: pendiente con lectura-con-aviso", () => {
    const ps = open([row("c", 1, "comision", -100000)], { readingWarning: true, proposals: [{ kind: "pending", lineId: "c", reason: "x", marks: ["reading-warning"] }] });
    expect(ps[0]).toEqual(expect.objectContaining({ kind: "pending", marks: ["reading-warning"] }));
  });
  it("leasing, préstamo y FCI quedan pendientes con el motivo del 3b; sin-clasificar, con el suyo", () => {
    const ps = open([row("l", 1, "leasing", -1000), row("f", 2, "fci-rescate", 1000), row("s", 3, "sin-clasificar", -1)]);
    expect(ps.map((p) => (p as { reason: string }).reason)).toEqual([PENDING_3B, PENDING_3B, "No se pudo clasificar el concepto."]);
  });
  it("match y review no se tocan; el pendiente de cuentas propias conserva su motivo y marca", () => {
    const m: Proposal = { kind: "match", lineId: "m", groupLineIds: ["m"], valueIds: ["v"], confidence: "verified", coincidence: { amount: true }, marks: [] };
    const r: Proposal = { kind: "review", lineId: "r", reason: "Hay más de un valor que coincide con el renglón.", candidates: [["v1"], ["v2"]] };
    const own: Proposal = { kind: "pending", lineId: "o", reason: "Transferencia entre cuentas propias sin valor cargado.", marks: ["own-accounts"] };
    const ps = open([row("m", 1, "comision", -1), row("r", 2, "comision", -2), row("o", 3, "transferencia-cuenta-propia", -1)], { proposals: [m, r, own] });
    expect(ps).toEqual([m, r, own]);
  });
});

describe("openPending: el par aprendido se valida contra el catálogo del pedido", () => {
  const PAIR = { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: "201" };
  const decided = (key: string, pair: DecisionRow["chosenPair"]) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: key, result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: pair, decidedAt }));
  const comision = (pair: DecisionRow["chosenPair"], over: Partial<Parameters<typeof openPending>[0]> = {}) => dbgOf(open([row("c", 1, "comision", -100000)], { decisions: decided("191||comision", pair), ...over }), "c");
  const fromCatalog = { pair: { movementTypeId: "7", accountId: "100", vatAccountId: "200", perceptionAccountId: "201" }, origin: "catalog", confidence: "weak" };
  it("un par válido se usa: origen decision y grounded", () => {
    expect(comision(PAIR)).toEqual(expect.objectContaining({ pair: PAIR, origin: "decision", confidence: "grounded" }));
  });
  it("un tipo de movimiento que ya no está en el catálogo descarta el par: cae al catálogo", () => {
    expect(comision({ ...PAIR, movementTypeId: "99" })).toEqual(expect.objectContaining(fromCatalog));
  });
  it("una cuenta que ya no está en el catálogo descarta el par: cae al catálogo", () => {
    expect(comision({ ...PAIR, accountId: "999" })).toEqual(expect.objectContaining(fromCatalog));
  });
  it("un par sin tipo o sin cuenta no es del catálogo: cae al catálogo", () => {
    expect(comision({ ...PAIR, movementTypeId: null })).toEqual(expect.objectContaining(fromCatalog));
    expect(comision({ ...PAIR, accountId: null })).toEqual(expect.objectContaining(fromCatalog));
  });
  it("un tipo con el coeficiente contrario al renglón descarta el par: un débito no toma un tipo de crédito", () => {
    const catalogs: Catalogs = { ...CATALOGS, movementTypes: [...CATALOGS.movementTypes, { id: "8", description: "Crédito Bancario", coefficient: -1 }] };
    expect(comision({ ...PAIR, movementTypeId: "8" }, { catalogs })).toEqual(expect.objectContaining(fromCatalog));
  });
  it("un crédito no toma un tipo de débito aprendido: cae al catálogo, que no tiene tipo de crédito", () => {
    const d = dbgOf(open([row("r", 1, "devolucion-impuesto", 600)], { decisions: decided("191||devolucion impuesto", PAIR) }), "r");
    expect(d).toEqual(expect.objectContaining({ origin: "catalog", pair: expect.objectContaining({ movementTypeId: null, accountId: "102" }) }));
  });
  it("un crédito con un tipo de crédito aprendido lo usa", () => {
    const catalogs: Catalogs = { ...CATALOGS, movementTypes: [...CATALOGS.movementTypes, { id: "8", description: "Crédito Bancario", coefficient: -1 }] };
    const d = dbgOf(open([row("r", 1, "devolucion-impuesto", 600)], { catalogs, decisions: decided("191||devolucion impuesto", { ...PAIR, movementTypeId: "8" }) }), "r");
    expect(d).toEqual(expect.objectContaining({ origin: "decision", pair: expect.objectContaining({ movementTypeId: "8", accountId: "102" }) }));
  });
  it("un par descartado cae a la historia antes que al catálogo", () => {
    const history = [{ id: "1", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1 as const, amountCents: 100, vatCents: 21, perceptionCents: 0, accountCode: "9900104", accountName: "COMISIONES Y GASTOS", detail: null }];
    expect(comision({ ...PAIR, accountId: "999" }, { history })).toEqual(expect.objectContaining({ origin: "history", confidence: "weak", pair: expect.objectContaining({ accountId: "102" }) }));
  });
  it("las cuentas de IVA y percepción aprendidas que no están en el catálogo se reemplazan por las que salen por nombre", () => {
    expect(comision({ ...PAIR, vatAccountId: "998", perceptionAccountId: "999" }).pair).toEqual(PAIR);
    expect(comision({ ...PAIR, vatAccountId: null, perceptionAccountId: null }).pair).toEqual(PAIR);
  });
  it("las cuentas de IVA y percepción aprendidas que están en el catálogo se conservan, aunque no sean las del nombre", () => {
    expect(comision({ ...PAIR, vatAccountId: "201", perceptionAccountId: "200" }).pair).toEqual({ ...PAIR, vatAccountId: "201", perceptionAccountId: "200" });
  });
  it("sin catálogo en el pedido, el par aprendido se usa tal cual", () => {
    const pair = { movementTypeId: "99", accountId: "999", vatAccountId: null, perceptionAccountId: "998" };
    expect(comision(pair, { catalogs: null })).toEqual(expect.objectContaining({ pair, origin: "decision", confidence: "grounded" }));
  });
  it("la preferencia por dbg vale aunque el par se descarte: un concepto de terceros sale dbg con el tipo del catálogo y sin cuenta, origen ninguno", () => {
    const ps = open([row("d", 1, "debito-automatico", -5000)], { decisions: decided("191||debito automatico", { ...PAIR, accountId: "999" }) });
    expect(dbgOf(ps, "d")).toEqual(expect.objectContaining({ kind: "dbg", origin: "none", confidence: "weak", pair: { movementTypeId: "7", accountId: null, vatAccountId: "200", perceptionAccountId: "201" } }));
  });
});

describe("openPending: los bordes", () => {
  const thrice = (key: string, over: Partial<DecisionRow>) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: key, result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: null, decidedAt, ...over }));
  it("los motivos de los pendientes, tal como salen", () => {
    const ps = open([row("t", 1, "transferencia-recibida", 5000), row("p", 2, "prestamo", -1000), row("s", 3, "fci-suscripcion", -1000)]);
    expect(ps.map((p) => (p as { reason: string }).reason)).toEqual([
      "Movimiento con un tercero sin valor en ProntoNet.",
      "Leasing, préstamo o fondo común: la propuesta para crearlo llega en la próxima etapa.",
      "Leasing, préstamo o fondo común: la propuesta para crearlo llega en la próxima etapa.",
    ]);
  });
  it("lo que la empresa registra como pendiente lleva ese motivo, sea del banco o de terceros", () => {
    const asPending = { proposedKind: "dbg" as const, chosenKind: "pending" as const };
    const ps = open([row("c", 1, "comision", -100000), row("t", 2, "transferencia-recibida", 5000)], { decisions: [...thrice("191||comision", asPending), ...thrice("191||transferencia recibida", asPending).map((d) => ({ ...d, lineRef: `T:${d.decidedAt}` }))] });
    expect(ps).toEqual([
      { kind: "pending", lineId: "c", reason: "La empresa lo registra como pendiente de contabilidad.", marks: [] },
      { kind: "pending", lineId: "t", reason: "La empresa lo registra como pendiente de contabilidad.", marks: [] },
    ]);
  });
  it("un cargo ya apareado no se lleva el IVA pendiente: el IVA sale DBG solo", () => {
    const m: Proposal = { kind: "match", lineId: "c", groupLineIds: ["c"], valueIds: ["v"], confidence: "verified", coincidence: { amount: true }, marks: [] };
    const ps = open([row("c", 1, "comision", -100000), row("i", 2, "iva", -21000)], { proposals: [m, pend("i")] });
    expect(ps[0]).toBe(m);
    expect(dbgOf(ps, "i")).toEqual(expect.objectContaining({ groupLineIds: ["i"], amountCents: -21000, vatCents: -21000, perceptionCents: 0 }));
  });
  it("un grupo que encadena no lleva marcas; sin catálogo, la clave del grupo tiene el tipo y la cuenta vacíos", () => {
    expect(dbgOf(open([row("c", 1, "comision", -100000)]), "c").marks).toEqual([]);
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { catalogs: null }), "c").groupKey).toBe("||2026-07");
  });
  it("un par grounded por decisiones baja a weak si un renglón del grupo no encadena", () => {
    const pair = { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: "201" };
    const ps = open([row("c", 1, "comision", -100000), row("i", 2, "iva", -21000, { chains: false })], { decisions: thrice("191||comision", { chosenPair: pair }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ origin: "decision", confidence: "weak", marks: ["unchecked-line"], groupLineIds: ["c", "i"] }));
  });
  it("un par aprendido sin cuenta no es grounded aunque lo decidan tres veces", () => {
    const pair = { movementTypeId: "7", accountId: null, vatAccountId: null, perceptionAccountId: null };
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { catalogs: null, decisions: thrice("191||comision", { chosenPair: pair }) }), "c")).toEqual(expect.objectContaining({ origin: "decision", confidence: "weak", pair }));
  });
});

describe("openPending: lo aprendido sobre dbg o pendiente vale por grupo", () => {
  const thrice = (key: string, over: Partial<DecisionRow>) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: key, result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: null, decidedAt, ...over }));
  const group = () => [row("c", 1, "comision", -1280000), row("i", 2, "iva", -268800), row("p", 3, "percepcion-iva", -38400)];
  it("la comisión decidida pendiente se lleva su IVA y su percepción: los tres pendientes con el mismo motivo", () => {
    const ps = open(group(), { decisions: thrice("191||comision", { chosenKind: "pending" }) });
    expect(ps).toEqual(["c", "i", "p"].map((lineId) => ({ kind: "pending", lineId, reason: PENDING_LEARNED, marks: [] })));
  });
  it("la comisión decidida dbg lleva su IVA y su percepción en el mismo grupo", () => {
    const ps = open(group(), { decisions: thrice("191||comision", { chosenPair: { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: "201" } }) });
    for (const id of ["c", "i", "p"]) expect(dbgOf(ps, id)).toEqual(expect.objectContaining({ groupLineIds: ["c", "i", "p"], origin: "decision" }));
  });
});

describe("openPending: el DBG no es más fuerte que su cuenta de IVA o de percepción", () => {
  const thrice = (pair: DecisionRow["chosenPair"]) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: "191||comision", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: pair, decidedAt }));
  const PAIR = { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: "201" };
  const withVat = () => [row("c", 1, "comision", -100000), row("i", 2, "iva", -21000)];
  const withPerception = () => [row("c", 1, "comision", -100000), row("p", 2, "percepcion-iva", -3000)];
  it("con IVA en el grupo y la cuenta de IVA aprendida válida, sigue grounded", () => {
    expect(dbgOf(open(withVat(), { decisions: thrice(PAIR) }), "c")).toEqual(expect.objectContaining({ confidence: "grounded", pair: PAIR }));
  });
  it("sin IVA en el grupo, que falte la cuenta de IVA aprendida no importa: grounded", () => {
    expect(dbgOf(open([row("c", 1, "comision", -100000)], { decisions: thrice({ ...PAIR, vatAccountId: null }) }), "c").confidence).toBe("grounded");
  });
  it("con IVA en el grupo y sin cuenta de IVA aprendida, la que sale por nombre la deja weak", () => {
    expect(dbgOf(open(withVat(), { decisions: thrice({ ...PAIR, vatAccountId: null }) }), "c")).toEqual(expect.objectContaining({ confidence: "weak", pair: PAIR }));
  });
  it("con IVA en el grupo y una cuenta de IVA aprendida que ya no está en el catálogo, weak", () => {
    expect(dbgOf(open(withVat(), { decisions: thrice({ ...PAIR, vatAccountId: "998" }) }), "c")).toEqual(expect.objectContaining({ confidence: "weak", pair: PAIR }));
  });
  it("con IVA en el grupo y ninguna cuenta de IVA en el catálogo: weak, con la cuenta de IVA null", () => {
    const d = dbgOf(open(withVat(), { catalogs: { ...CATALOGS, taxAccounts: [] }, decisions: thrice(PAIR) }), "c");
    expect(d).toEqual(expect.objectContaining({ confidence: "weak", pair: expect.objectContaining({ vatAccountId: null }) }));
  });
  it("lo mismo con la percepción: aprendida válida grounded; ausente o ajena, weak", () => {
    expect(dbgOf(open(withPerception(), { decisions: thrice(PAIR) }), "c").confidence).toBe("grounded");
    expect(dbgOf(open(withPerception(), { decisions: thrice({ ...PAIR, perceptionAccountId: null }) }), "c").confidence).toBe("weak");
    expect(dbgOf(open(withPerception(), { decisions: thrice({ ...PAIR, perceptionAccountId: "999" }) }), "c").confidence).toBe("weak");
  });
  it("sin catálogo, una cuenta de IVA aprendida null con IVA en el grupo deja weak; una no null, grounded", () => {
    expect(dbgOf(open(withVat(), { catalogs: null, decisions: thrice({ ...PAIR, vatAccountId: null }) }), "c").confidence).toBe("weak");
    expect(dbgOf(open(withVat(), { catalogs: null, decisions: thrice(PAIR) }), "c").confidence).toBe("grounded");
  });
  it("sin catálogo, lo mismo con la percepción", () => {
    expect(dbgOf(open(withPerception(), { catalogs: null, decisions: thrice({ ...PAIR, perceptionAccountId: null }) }), "c").confidence).toBe("weak");
    expect(dbgOf(open(withPerception(), { catalogs: null, decisions: thrice(PAIR) }), "c").confidence).toBe("grounded");
  });
});

describe("openPending: el IVA y la percepción sueltos llevan la forma de la historia", () => {
  const hist = (over: Partial<HistoryDbg>): HistoryDbg => ({ id: "1", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1, amountCents: 121000, vatCents: 21000, perceptionCents: 3000, accountCode: "9900102", accountName: "COMISIONES DEL BANCO", detail: null, ...over });
  const loose = (code: string, cents: number) => [row("x", 1, code, cents)];
  it("un IVA suelto va a la cuenta y el tipo donde la empresa pone el IVA, con la cuenta de IVA por nombre y todo su importe como IVA", () => {
    const d = dbgOf(open(loose("iva", -21000), { history: [hist({})] }), "x");
    expect(d).toEqual(expect.objectContaining({
      groupLineIds: ["x"], pair: { movementTypeId: "7", accountId: "100", vatAccountId: "200", perceptionAccountId: "201" },
      amountCents: -21000, vatCents: -21000, perceptionCents: 0, origin: "history", confidence: "weak",
    }));
  });
  it("una percepción suelta, igual: todo su importe como percepción", () => {
    const d = dbgOf(open(loose("percepcion-iva", -3000), { history: [hist({})] }), "x");
    expect(d).toEqual(expect.objectContaining({ pair: expect.objectContaining({ accountId: "100", perceptionAccountId: "201" }), amountCents: -3000, vatCents: 0, perceptionCents: -3000, origin: "history" }));
  });
  it("sin historia con IVA, el IVA suelto lleva solo la cuenta de IVA por nombre: sin cuenta, origen ninguno, weak", () => {
    const d = dbgOf(open(loose("iva", -21000), { history: [hist({ vatCents: 0, perceptionCents: 0 })] }), "x");
    expect(d).toEqual(expect.objectContaining({ pair: { movementTypeId: "7", accountId: null, vatAccountId: "200", perceptionAccountId: "201" }, vatCents: -21000, origin: "none", confidence: "weak" }));
  });
  it("Kigo: un IVA suelto decidido sin cuenta de IVA queda weak; con la cuenta de IVA decidida, grounded", () => {
    const thrice = (pair: DecisionRow["chosenPair"]) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `S0:${decidedAt}`, conceptKey: "191||iva", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: pair, decidedAt }));
    const PAIR = { movementTypeId: "7", accountId: "100", vatAccountId: "200", perceptionAccountId: null };
    expect(dbgOf(open(loose("iva", -21000), { decisions: thrice(PAIR) }), "x").confidence).toBe("grounded");
    expect(dbgOf(open(loose("iva", -21000), { decisions: thrice({ ...PAIR, vatAccountId: null }) }), "x").confidence).toBe("weak");
  });
});

describe("openPending: el IVA del total del día", () => {
  const far = (i: number) => row(`s${i}`, i, "sellos", -1);
  const text = (t: string) => ({ bank: { code: null, text: t, extras: [] } });
  const day = () => [row("i", 1, "iva", -12600), far(2), far(3), far(4), row("c1", 5, "comision", -30000), row("c2", 6, "comision", -20000, text("COMISION B")), row("c3", 7, "comision", -10000)];
  const thrice = (key: string, over: Partial<DecisionRow>) => ["2026-07-01", "2026-06-01", "2026-05-01"].map((decidedAt): DecisionRow => ({ lineRef: `${key}:${decidedAt}`, conceptKey: key, result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: null, decidedAt, ...over }));
  const PAIR = { movementTypeId: "7", accountId: "102", vatAccountId: "200", perceptionAccountId: "201" };
  it("los cargos del día y su IVA son un DBG, idéntico en cada renglón, con el primer cargo primero y el IVA al final", () => {
    const ps = open(day());
    for (const id of ["c1", "c2", "c3", "i"]) {
      expect(dbgOf(ps, id)).toEqual(expect.objectContaining({ lineId: id, groupLineIds: ["c1", "c2", "c3", "i"], amountCents: -72600, vatCents: -12600, perceptionCents: 0, origin: "catalog" }));
    }
  });
  it("si lo aprendido manda a un cargo del día a pendiente y al primero no, el grupo se deshace: cada cargo por su lado y el IVA suelto", () => {
    const ps = open(day(), { decisions: thrice("191||comision b", { chosenKind: "pending" }) });
    expect(ps.find((p) => p.lineId === "c2")).toEqual(expect.objectContaining({ kind: "pending", reason: PENDING_LEARNED }));
    expect(dbgOf(ps, "c1").groupLineIds).toEqual(["c1"]);
    expect(dbgOf(ps, "c3").groupLineIds).toEqual(["c3"]);
    expect(dbgOf(ps, "i")).toEqual(expect.objectContaining({ groupLineIds: ["i"], vatCents: -12600 }));
  });
  it("si el primero va a pendiente y los demás no, también se deshace", () => {
    const ps = open(day(), { decisions: thrice("191||comision", { chosenKind: "pending" }) });
    expect(ps.find((p) => p.lineId === "c1")?.kind).toBe("pending");
    expect(ps.find((p) => p.lineId === "c3")?.kind).toBe("pending");
    expect(dbgOf(ps, "c2").groupLineIds).toEqual(["c2"]);
    expect(dbgOf(ps, "i").groupLineIds).toEqual(["i"]);
  });
  it("si todos van a pendiente, van juntos con el motivo del primero", () => {
    const decisions = [...thrice("191||comision", { chosenKind: "pending" }), ...thrice("191||comision b", { chosenKind: "pending" })];
    const ps = open(day(), { decisions });
    for (const id of ["c1", "c2", "c3", "i"]) expect(ps.find((p) => p.lineId === id)).toEqual(expect.objectContaining({ kind: "pending", reason: PENDING_LEARNED }));
  });
  it("Kigo: el par aprendido del primer cargo es grounded si ningún otro cargo del día aprendió otro par", () => {
    expect(dbgOf(open(day(), { decisions: thrice("191||comision", { chosenPair: PAIR }) }), "c2")).toEqual(expect.objectContaining({ pair: PAIR, confidence: "grounded", origin: "decision" }));
    const same = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: PAIR })];
    expect(dbgOf(open(day(), { decisions: same }), "c2").confidence).toBe("grounded");
  });
  it("Kigo: si otro cargo del día aprendió otra cuenta u otro tipo, el grupo baja a weak con el par del primero", () => {
    const otherAccount = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: { ...PAIR, accountId: "100" } })];
    expect(dbgOf(open(day(), { decisions: otherAccount }), "c1")).toEqual(expect.objectContaining({ pair: PAIR, confidence: "weak", origin: "decision" }));
    const catalogs: Catalogs = { ...CATALOGS, movementTypes: [...CATALOGS.movementTypes, { id: "9", description: "Otro débito", coefficient: 1 }] };
    const otherType = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: { ...PAIR, movementTypeId: "9" } })];
    expect(dbgOf(open(day(), { catalogs, decisions: otherType }), "c1").confidence).toBe("weak");
  });
  it("Kigo: si otro cargo del día aprendió otra cuenta de IVA o de percepción, también baja a weak", () => {
    const otherVat = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: { ...PAIR, vatAccountId: "201" } })];
    expect(dbgOf(open(day(), { decisions: otherVat }), "c1")).toEqual(expect.objectContaining({ pair: PAIR, confidence: "weak" }));
    const otherPerception = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: { ...PAIR, perceptionAccountId: "200" } })];
    expect(dbgOf(open(day(), { decisions: otherPerception }), "c1").confidence).toBe("weak");
  });
  it("un par aprendido de otro cargo del día que el catálogo ya no admite no cuenta como contradicción", () => {
    const decisions = [...thrice("191||comision", { chosenPair: PAIR }), ...thrice("191||comision b", { chosenPair: { ...PAIR, accountId: "999" } })];
    expect(dbgOf(open(day(), { decisions }), "c1").confidence).toBe("grounded");
  });
});

describe("openPending: lo que enseñan las decisiones sobre el IVA, la percepción y lo rechazado", () => {
  const COMMISSION = { movementTypeId: "7", accountId: "100" };
  const group = () => [row("c", 1, "comision", -1280000), row("i", 2, "iva", -268800), row("p", 3, "percepcion-iva", -38400)];
  const days = ["2026-07-01", "2026-06-01", "2026-05-01", "2026-04-01", "2026-03-01"];
  const decision = (i: number, over: Partial<DecisionRow>): DecisionRow => ({ lineRef: `S0:l${i}`, conceptKey: "191||comision", result: "corrected", proposedKind: "dbg", proposedPair: null, chosenKind: "dbg", chosenPair: null, decidedAt: days[i], ...over });
  const rejected = (n: number, proposed: { movementTypeId: string; accountId: string }, chosen: Partial<DecisionRow> = { chosenKind: "pending" }) =>
    Array.from({ length: n }, (_, i) => decision(i, { result: "rejected", proposedPair: { ...proposed, vatAccountId: "200", perceptionAccountId: "201" }, ...chosen }));
  const history = [{ id: "1", date: "2026-05-31", movementType: "Débito Bancario Gtos", coefficient: 1 as const, amountCents: 100, vatCents: 21, perceptionCents: 0, accountCode: "9900104", accountName: "COMISIONES Y GASTOS", detail: null }];

  it("dos decisiones con percepción y dos sin, mismo tipo y misma cuenta: el grupo con percepción sale grounded con la percepción de las que la informaron", () => {
    const decisions = [0, 1, 2, 3].map((i) => decision(i, { chosenPair: { ...COMMISSION, vatAccountId: "200", perceptionAccountId: i < 2 ? "201" : null } }));
    expect(dbgOf(open(group(), { decisions }), "c")).toEqual(expect.objectContaining({ origin: "decision", confidence: "grounded", pair: { ...COMMISSION, vatAccountId: "200", perceptionAccountId: "201" } }));
  });
  it("si ninguna decisión informó la cuenta de percepción, el grupo que la necesita baja a weak", () => {
    const decisions = [0, 1, 2].map((i) => decision(i, { chosenPair: { ...COMMISSION, vatAccountId: "200", perceptionAccountId: null } }));
    expect(dbgOf(open(group(), { decisions }), "c")).toEqual(expect.objectContaining({ origin: "decision", confidence: "weak" }));
  });
  it("cinco rechazadas de la cuenta del catálogo que dejan pendiente: la sexta vez sale pendiente, por la preferencia de la empresa", () => {
    const ps = open([row("c", 1, "comision", -100000)], { decisions: rejected(5, COMMISSION) });
    expect(ps[0]).toEqual(expect.objectContaining({ kind: "pending", reason: PENDING_LEARNED }));
  });
  it("tres rechazadas del par del catálogo: no se vuelve a proponer; sin otra fuente, dbg sin cuenta y origen ninguno", () => {
    const ps = open([row("c", 1, "comision", -100000)], { decisions: rejected(3, COMMISSION, { chosenKind: "dbg", chosenPair: { ...COMMISSION, accountId: "102", vatAccountId: null, perceptionAccountId: null } }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ kind: "dbg", origin: "none", confidence: "weak", pair: { movementTypeId: "7", accountId: null, vatAccountId: "200", perceptionAccountId: "201" } }));
  });
  it("tres rechazadas del par de la historia: se pasa al catálogo", () => {
    const ps = open([row("c", 1, "comision", -100000)], { history, decisions: rejected(3, { movementTypeId: "7", accountId: "102" }, { chosenKind: "dbg" }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ origin: "catalog", pair: expect.objectContaining({ accountId: "100" }) }));
  });
  it("si la historia y el catálogo proponen el par rechazado, sin cuenta", () => {
    const own = [{ ...history[0], accountCode: "9900102" }];
    const ps = open([row("c", 1, "comision", -100000)], { history: own, decisions: rejected(3, COMMISSION, { chosenKind: "dbg" }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ origin: "none", pair: expect.objectContaining({ accountId: null }) }));
  });
  it("dos rechazadas no alcanzan: la historia vuelve a proponer su par", () => {
    const ps = open([row("c", 1, "comision", -100000)], { history, decisions: rejected(2, { movementTypeId: "7", accountId: "102" }, { chosenKind: "dbg" }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ origin: "history", pair: expect.objectContaining({ accountId: "102" }) }));
  });
  it("lo rechazado se compara por tipo y cuenta: otro tipo de movimiento con la misma cuenta no se descarta", () => {
    const ps = open([row("c", 1, "comision", -100000)], { decisions: rejected(3, { movementTypeId: "8", accountId: "100" }, { chosenKind: "dbg" }) });
    expect(dbgOf(ps, "c")).toEqual(expect.objectContaining({ origin: "catalog", pair: expect.objectContaining({ accountId: "100" }) }));
  });
});

describe("openPending: el par del catálogo se busca una vez por tipo y coeficiente", () => {
  it("en la misma conciliación, un débito y un crédito del mismo tipo toman cada uno el tipo de movimiento de su coeficiente", () => {
    const catalogs: Catalogs = { ...CATALOGS, movementTypes: [...CATALOGS.movementTypes, { id: "8", description: "Crédito Bancario", coefficient: -1 }] };
    const ps = open([row("d", 1, "impuesto-debitos", -600), row("c", 2, "impuesto-debitos", 600), row("e", 3, "impuesto-debitos", -700)], { catalogs });
    expect(["d", "c", "e"].map((id) => dbgOf(ps, id).pair.movementTypeId)).toEqual(["7", "8", "7"]);
  });
});
