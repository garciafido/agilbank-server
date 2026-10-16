import { reconcile } from "../../src/reconcile/reconcile";
import { DEFAULT_RECONCILE_OPTIONS, type ReconcileContext } from "../../src/reconcile/types";
import { PENDING_3B, PENDING_THIRD_PARTY } from "../../src/dbg/open";
import { line, val } from "./fixtures";

const ctx = (over: Partial<ReconcileContext> = {}): ReconcileContext => ({ lineIds: null, values: [], parties: [], ownAccounts: [], batchIds: [], windowDays: 5, catalogs: null, history: [], ...over });
const run = (lines: ReturnType<typeof line>[], context: ReconcileContext, readingWarning = false) => reconcile({ lines, context, batches: [], readingWarning, bankCode: null, decisions: [] }).proposals;

describe("reconcile: uno a uno", () => {
  it("AC-12: un cheque, un ECHEQ, una transferencia, un depósito, un cupón y un DBG, cada uno con su renglón", () => {
    const kinds = ["Cheque", "Cheque", "Transferencia bancaria", "Depósito", "Cupón", "Débito bancario"];
    const lines = kinds.map((_, i) => line({ id: `l${i}`, amountCents: (i + 1) * 1000, date: "2026-07-10" }));
    const values = kinds.map((kind, i) => val({ id: `v${i}`, kind, isEcheq: i === 1, amountCents: (i + 1) * 1000 }));
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => [p.lineId, p.kind === "match" ? p.valueIds : p.kind])).toEqual(kinds.map((_, i) => [`l${i}`, [`v${i}`]]));
  });
  it("AC-13: un valor que difiere en 0,01 no aparea", () => {
    expect(run([line({ amountCents: 100000 })], ctx({ values: [val({ amountCents: 100001 })] }))[0].kind).toBe("pending");
  });
  it("AC-14: sin número, el mismo importe a 6 días no aparea por la ventana: solo como importe único en el período, si lo es", () => {
    const far = val({ id: "far", voucherDate: "2026-05-01" });
    expect(run([line({ date: "2026-07-16" })], ctx({ values: [val({ voucherDate: "2026-07-10" }), far] }))[0].kind).toBe("pending");
    expect(run([line({ date: "2026-07-16" })], ctx({ values: [val({ voucherDate: "2026-07-10" })] }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["single-amount"] }));
  });
  it("AC-15: un cheque con el mismo número e importe 20 días después aparea, con el número entre lo que coincidió", () => {
    const p = run([line({ date: "2026-07-30", amountCents: -500000, reference: "4512" })], ctx({ values: [val({ amountCents: -500000, number: "4512", valueDate: "2026-07-10" })] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", valueIds: ["v1"], confidence: "verified", coincidence: { amount: true, number: "4512", days: 20 } }));
  });
  it("AC-16: el ECHEQ 47820519 y el renglón 820519", () => {
    const p = run([line({ reference: "820519", amountCents: -7000 })], ctx({ values: [val({ number: "47820519", amountCents: -7000 })] }))[0];
    expect(p.kind === "match" && p.coincidence.number).toBe("820519");
  });
  it("importe único en la ventana: grounded, con los días", () => {
    const p = run([line({ date: "2026-07-12" })], ctx({ values: [val()] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, days: 2 } }));
  });
  it("dos renglones iguales en la ventana y un solo valor: los dos a revisar, con el valor como candidato", () => {
    const out = run([line({ id: "a" }), line({ id: "b", date: "2026-07-11" })], ctx({ values: [val()] }));
    expect(out).toEqual([
      expect.objectContaining({ kind: "review", lineId: "a", candidates: [["v1"]] }),
      expect.objectContaining({ kind: "review", lineId: "b", candidates: [["v1"]] }),
    ]);
  });
  it("desempata la contraparte: dos valores iguales, uno con el CUIT del renglón", () => {
    const out = run(
      [line({ counterparty: { cuit: "20222222223", name: null, cbu: null } })],
      ctx({ values: [val({ id: "v1", supplierId: "7" }), val({ id: "v2", supplierId: "8" })], parties: [{ id: "7", role: "supplier", cuit: "20222222223", cbu: null }, { id: "8", role: "supplier", cuit: "27333333334", cbu: null }] }),
    );
    expect(out[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["v1"], coincidence: { amount: true, days: 0, cuit: "20222222223" } }));
  });
  it("intercambiables: tres valores y tres renglones iguales se emparejan por fecha, weak y con la marca", () => {
    const lines = ["2026-07-10", "2026-07-11", "2026-07-12"].map((date, i) => line({ id: `l${i}`, date }));
    const values = ["2026-07-12", "2026-07-10", "2026-07-11"].map((voucherDate, i) => val({ id: `v${i}`, voucherDate }));
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.confidence, p.marks] : p.kind))).toEqual([
      ["l0", "v1", "weak", ["interchangeable"]], ["l1", "v2", "weak", ["interchangeable"]], ["l2", "v0", "weak", ["interchangeable"]],
    ]);
  });
  it("un valor en disputa no lo toma otra pasada", () => {
    // a y b reclaman v1 por número en la pasada 1; c, sin número, cae en la ventana de v1: no lo toma, va a revisar con él.
    const out = run([line({ id: "a", reference: "4512" }), line({ id: "b", reference: "4512", date: "2026-07-25" }), line({ id: "c", date: "2026-07-11" })], ctx({ values: [val({ number: "4512" })] }));
    expect(out.map((p) => p.kind)).toEqual(["review", "review", "review"]);
    expect(out[2]).toEqual({ kind: "review", lineId: "c", reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v1"]] });
  });
  it("cada valor se usa una sola vez en la respuesta", () => {
    const out = run([line({ id: "a", reference: "4512" }), line({ id: "b" })], ctx({ values: [val({ number: "4512" })] }));
    const used = out.flatMap((p) => (p.kind === "match" ? p.valueIds : []));
    expect(new Set(used).size).toBe(used.length);
    expect(out[0].kind).toBe("match");
  });
  it("solo los renglones pedidos, en el orden de la lectura", () => {
    const out = run([line({ id: "a" }), line({ id: "b", amountCents: 5 })], ctx({ lineIds: ["b"], values: [val()] }));
    expect(out.map((p) => p.lineId)).toEqual(["b"]);
  });
  it("con una lectura con aviso, el apareo sale weak con la marca lectura-con-aviso", () => {
    const p = run([line({ reference: "4512" })], ctx({ values: [val({ number: "4512" })] }), true)[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["reading-warning"] }));
  });
});

describe("reconcile: las pasadas por dentro", () => {
  it("lo que queda sin valor sale pendiente con su motivo y sin marcas", () => {
    expect(run([line()], ctx())).toEqual([{ kind: "pending", lineId: "l1", reason: PENDING_THIRD_PARTY, marks: [] }]);
  });
  it("dos renglones con el mismo número reclaman el mismo valor: los dos a revisar, con el motivo", () => {
    const out = run([line({ id: "a", reference: "4512" }), line({ id: "b", reference: "4512", date: "2026-07-25" })], ctx({ values: [val({ number: "4512" })] }));
    const review = (lineId: string) => ({ kind: "review", lineId, reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v1"]] });
    expect(out).toEqual([review("a"), review("b")]);
  });
  it("el apareo por número arma la propuesta completa: el renglón, el valor, verified y sin marcas", () => {
    expect(run([line({ reference: "4512" })], ctx({ values: [val({ number: "4512" })] }))).toEqual([
      { kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["v1"], confidence: "verified", coincidence: { amount: true, number: "4512", days: 0 }, marks: [] },
    ]);
  });
  it("un valor con el número igual pero sin ninguna fecha aparea sin informar días", () => {
    const p = run([line({ reference: "4512" })], ctx({ values: [val({ number: "4512", voucherDate: null })] }))[0];
    expect(p.kind === "match" && p.coincidence).toEqual({ amount: true, number: "4512" });
  });
  it("un número que no coincide no aparea por número: el importe único lo toma como grounded", () => {
    const p = run([line({ reference: "4512" })], ctx({ values: [val({ number: "9999" })] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, days: 0 } }));
  });
  it("un renglón apareado por número no compite en la pasada siguiente", () => {
    const out = run([line({ id: "a", reference: "4512" }), line({ id: "b" })], ctx({ values: [val({ id: "v1", number: "4512" }), val({ id: "v2" })] }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds, p.confidence] : p.kind))).toEqual([["a", ["v1"], "verified"], ["b", ["v2"], "grounded"]]);
  });
  it("la confianza mira el renglón: sin control, el número queda en grounded", () => {
    expect(run([line({ chains: null, reference: "4512" })], ctx({ values: [val({ number: "4512" })] }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded" }));
  });
  it("la confianza mira el renglón: uno que no encadena deja el importe único en weak con la marca", () => {
    expect(run([line({ chains: false })], ctx({ values: [val()] }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["unchecked-line"] }));
  });
  it("la contraparte por CBU desempata y la propuesta es grounded, del renglón solo", () => {
    const cbu = "0170000000000000000001";
    const out = run(
      [line({ counterparty: { cuit: null, name: null, cbu } })],
      ctx({ values: [val({ id: "v1", customerId: "3" }), val({ id: "v2", customerId: "4" })], parties: [{ id: "3", role: "customer", cuit: null, cbu }, { id: "4", role: "customer", cuit: null, cbu: null }] }),
    );
    expect(out).toEqual([{ kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["v1"], confidence: "grounded", coincidence: { amount: true, days: 0, cbu }, marks: [] }]);
  });
  it("dos valores con la contraparte del renglón: no desempata", () => {
    const cp = { cuit: "20222222223", name: null, cbu: null };
    const out = run([line({ counterparty: cp })], ctx({ values: [val({ id: "v1", drawerCuit: cp.cuit }), val({ id: "v2", drawerCuit: cp.cuit })] }));
    expect(out).toEqual([{ kind: "review", lineId: "l1", reason: "Hay más de un valor que coincide con el renglón.", candidates: [["v1"], ["v2"]] }]);
  });
  it("intercambiables: dos y dos se emparejan, con la propuesta completa", () => {
    const out = run([line({ id: "a" }), line({ id: "b", date: "2026-07-11" })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", voucherDate: "2026-07-11" })] }));
    const match = (lineId: string, valueId: string, days: number) => ({ kind: "match", lineId, groupLineIds: [lineId], valueIds: [valueId], confidence: "weak", coincidence: { amount: true, days }, marks: ["interchangeable"] });
    expect(out).toEqual([match("a", "v1", 0), match("b", "v2", 0)]);
  });
  it("intercambiables: el orden es por fecha del renglón aunque la lectura venga desordenada, y después por orden", () => {
    const lines = [line({ id: "late", order: 1, date: "2026-07-14" }), line({ id: "second", order: 3, date: "2026-07-10" }), line({ id: "first", order: 2, date: "2026-07-10" })];
    const values = [val({ id: "vc", voucherDate: "2026-07-14" }), val({ id: "vb", voucherDate: "2026-07-10" }), val({ id: "va", voucherDate: "2026-07-10" })];
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0]] : p.kind))).toEqual([["late", "vc"], ["second", "vb"], ["first", "va"]]);
  });
  it("intercambiables: si un par queda fuera de la ventana, ninguno se empareja", () => {
    const lines = ["2026-07-10", "2026-07-11", "2026-07-25"].map((date, i) => line({ id: `l${i}`, date }));
    const values = ["2026-07-01", "2026-07-10", "2026-07-11"].map((voucherDate, i) => val({ id: `v${i}`, voucherDate }));
    expect(run(lines, ctx({ values })).map((p) => (p.kind === "review" ? p.candidates : p.kind))).toEqual([[["v1"], ["v2"]], [["v1"], ["v2"]], "pending"]);
  });
  it("intercambiables: con más renglones que valores no se empareja ninguno", () => {
    const lines = ["2026-07-10", "2026-07-11", "2026-07-12"].map((date, i) => line({ id: `l${i}`, date }));
    const values = ["2026-07-10", "2026-07-11"].map((voucherDate, i) => val({ id: `v${i}`, voucherDate }));
    expect(run(lines, ctx({ values })).map((p) => p.kind === "review" && [p.reason, p.candidates])).toEqual(lines.map(() => ["Hay más de un valor que coincide con el renglón.", [["v0"], ["v1"]]]));
  });
  it("intercambiables: la confianza mira cada renglón", () => {
    const out = run([line({ id: "a", chains: false }), line({ id: "b", date: "2026-07-11" })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", voucherDate: "2026-07-11" })] }));
    expect(out.map((p) => p.kind === "match" && p.marks)).toEqual([["interchangeable", "unchecked-line"], ["interchangeable"]]);
  });
});

describe("reconcile: la evidencia que contradice, el extracto entero y el punto fijo", () => {
  const X = { cuit: "20222222223", name: null, cbu: null };
  const CHEQUE = { code: "cheque-pagado", source: "table" as const };
  it("un cheque con un CUIT del renglón distinto del CUIT del valor: no es candidato aunque el importe y la fecha coincidan", () => {
    expect(run([line({ counterparty: X, type: CHEQUE })], ctx({ values: [val({ kind: "Cheque", drawerCuit: "27333333334" })] }))[0].kind).toBe("pending");
  });
  it("el importe único informa el CUIT cuando también coincide", () => {
    const p = run([line({ counterparty: X })], ctx({ values: [val({ drawerCuit: X.cuit })] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, days: 0, cuit: X.cuit } }));
  });
  it("intercambiables: si el emparejamiento por fecha deja un par de cheques con CUIT contradictorio, el grupo no se empareja", () => {
    const lines = [line({ id: "a", order: 1, counterparty: X, type: CHEQUE }), line({ id: "b", order: 2, type: CHEQUE }), line({ id: "c", order: 3, type: CHEQUE })];
    const values = [val({ id: "v1", kind: "Cheque", drawerCuit: "27333333334" }), val({ id: "v2", kind: "Cheque" }), val({ id: "v3", kind: "Cheque" })];
    // Ninguno aparea: cada uno va a revisar con los que ve, y a no ve el cheque del otro CUIT.
    expect(run(lines, ctx({ values })).map((p) => p.kind === "review" && p.candidates)).toEqual([[["v2"], ["v3"]], [["v1"], ["v2"], ["v3"]], [["v1"], ["v2"], ["v3"]]]);
  });
  it("los renglones no pedidos compiten igual: pedir uno solo no esconde la ambigüedad", () => {
    const out = run([line({ id: "a" }), line({ id: "b", date: "2026-07-11" })], ctx({ lineIds: ["b"], values: [val()] }));
    expect(out).toEqual([expect.objectContaining({ kind: "review", lineId: "b", candidates: [["v1"]] })]);
  });
  it("las pasadas se repiten: el renglón que se queda con un solo candidato cuando otro se resuelve, aparea", () => {
    // a ve a v14 y v15 en la ventana; b solo a v15, lo toma, y a se queda con v14.
    const out = run([line({ id: "a", date: "2026-07-10" }), line({ id: "b", date: "2026-07-20" })], ctx({ values: [val({ id: "v14", voucherDate: "2026-07-14" }), val({ id: "v15", voucherDate: "2026-07-15" })] }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds, p.confidence, p.coincidence.days] : p.kind))).toEqual([["a", ["v14"], "grounded", 4], ["b", ["v15"], "grounded", 5]]);
  });
  it("las pasadas se repiten dentro de un tramo hasta el punto fijo: tres renglones que se liberan uno al otro", () => {
    // c solo ve v3; resuelto c, b solo ve v2; resuelto b, a solo ve v1. Tres vueltas del primer tramo, todas grounded.
    const lines = [line({ id: "a", date: "2026-07-08" }), line({ id: "b", date: "2026-07-12" }), line({ id: "c", date: "2026-07-19" })];
    const values = [val({ id: "v1", voucherDate: "2026-07-05" }), val({ id: "v2", voucherDate: "2026-07-10" }), val({ id: "v3", voucherDate: "2026-07-15" })];
    expect(run(lines, ctx({ values })).map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.confidence] : p.kind))).toEqual([["a", "v1", "grounded"], ["b", "v2", "grounded"], ["c", "v3", "grounded"]]);
  });
  it("con una lectura con aviso, el pendiente también lleva la marca", () => {
    expect(run([line()], ctx(), true)).toEqual([{ kind: "pending", lineId: "l1", reason: "No hay un valor pendiente que coincida.", marks: ["reading-warning"] }]);
  });
});

describe("reconcile: la ventana contra cualquier fecha del valor", () => {
  const DEPOSIT = { code: "deposito-cheques", source: "table" as const };
  const FCI = { code: "fci-rescate", source: "table" as const };
  it("primero la fecha de referencia: A ve el valor por el depósito y aparea; B, que solo lo ve por el comprobante, no se lo disputa", () => {
    const out = run([line({ id: "A", date: "2026-07-20" }), line({ id: "B", date: "2026-07-10" })], ctx({ values: [val({ voucherDate: "2026-07-10", depositDate: "2026-07-20" })] }));
    expect(out).toEqual([
      { kind: "match", lineId: "A", groupLineIds: ["A"], valueIds: ["v1"], confidence: "grounded", coincidence: { amount: true, days: 0 }, marks: [] },
      { kind: "pending", lineId: "B", reason: PENDING_THIRD_PARTY, marks: [] },
    ]);
  });
  it("un renglón que ve un valor por la referencia y otro solo por el comprobante aparea con el de la referencia", () => {
    const values = [val({ id: "v1", voucherDate: "2026-06-01", depositDate: "2026-07-12" }), val({ id: "v2", voucherDate: "2026-07-08", depositDate: "2026-07-30" })];
    expect(run([line({ id: "L", date: "2026-07-10" })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["v1"], confidence: "grounded", coincidence: { amount: true, days: 2 } }));
  });
  it("el segundo tramo aparea lo que solo cae en la ventana por el comprobante, con los días de la fecha más cercana", () => {
    // L se lleva v1 por la referencia en el primer tramo; M ve v2 solo por el comprobante.
    const values = [val({ id: "v1", voucherDate: "2026-06-01", depositDate: "2026-07-12" }), val({ id: "v2", voucherDate: "2026-07-08", depositDate: "2026-07-30" })];
    const out = run([line({ id: "L", date: "2026-07-10" }), line({ id: "M", date: "2026-07-04" })], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.confidence, p.coincidence.days] : p.kind))).toEqual([["L", "v1", "grounded", 2], ["M", "v2", "grounded", 4]]);
  });
  it("el segundo tramo cuenta los valores en disputa: un renglón que ve uno por el comprobante va a revisar", () => {
    // x e y disputan v1 por número; z ve v1 solo por el comprobante.
    const lines = [line({ id: "x", reference: "4512", date: "2026-07-20" }), line({ id: "y", reference: "4512", date: "2026-07-25" }), line({ id: "z", date: "2026-07-10" })];
    const out = run(lines, ctx({ values: [val({ number: "4512", voucherDate: "2026-07-10", depositDate: "2026-07-20" })] }));
    expect(out[2]).toEqual({ kind: "review", lineId: "z", reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v1"]] });
  });
  it("intercambiables: primero por la referencia; un grupo que solo cae en la ventana por el comprobante se empareja después", () => {
    const lines = [line({ id: "a", date: "2026-07-10" }), line({ id: "b", date: "2026-07-11" })];
    const values = [val({ id: "v1", voucherDate: "2026-07-10", depositDate: "2026-07-25" }), val({ id: "v2", voucherDate: "2026-07-11", depositDate: "2026-07-26" })];
    expect(run(lines, ctx({ values })).map((p) => (p.kind === "match" ? [p.valueIds[0], p.coincidence.days, p.marks] : p.kind))).toEqual([["v1", 0, ["interchangeable"]], ["v2", 0, ["interchangeable"]]]);
  });
  it("un valor cuya fecha de comprobante cae en la ventana aunque la de depósito no: aparea, con los días de la más cercana", () => {
    const p = run([line({ date: "2026-07-10" })], ctx({ values: [val({ voucherDate: "2026-07-08", depositDate: "2026-07-17" })] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, days: 2 } }));
  });
  it("dos renglones que disputan un valor por la referencia van a revisar, aunque por el comprobante serían intercambiables", () => {
    // Por la referencia, a y b solo ven a v1 (v2 se deposita a 7 u 8 días): el primer tramo los manda a revisar.
    const out = run([line({ id: "a", date: "2026-07-10" }), line({ id: "b", date: "2026-07-11" })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", voucherDate: "2026-07-11", depositDate: "2026-07-18" })] }));
    expect(out.map((p) => p.kind === "review" && p.candidates)).toEqual([[["v1"]], [["v1"]]]);
  });
  it("la suma libre toma un valor por la fecha del comprobante aunque el depósito caiga lejos", () => {
    const values = [val({ id: "a", amountCents: 3000, voucherDate: "2026-07-18", depositDate: "2026-07-28" }), val({ id: "b", amountCents: 7000, voucherDate: "2026-07-20" })];
    expect(run([line({ amountCents: 10000, date: "2026-07-20", type: DEPOSIT })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["b", "a"] }));
  });
  it("la suma libre cuenta una sola vez un valor con dos fechas en la ventana", () => {
    const values = [val({ id: "a", amountCents: 3000, depositDate: "2026-07-11" }), val({ id: "b", amountCents: 7000 })];
    expect(run([line({ amountCents: 10000, type: DEPOSIT })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["b", "a"] }));
  });
  it("varios renglones: el valor ve los renglones por cualquiera de sus fechas, con los días de la más cercana", () => {
    const out = run([line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI })], ctx({ values: [val({ amountCents: 100000, voucherDate: "2026-07-12", depositDate: "2026-07-20" })] }));
    expect(out.map((p) => (p.kind === "match" ? [p.groupLineIds, p.coincidence.days] : p.kind))).toEqual([[["a", "b"], 2], [["a", "b"], 2]]);
  });
  it("varios renglones: un valor con dos fechas cercanas no ve dos veces el mismo grupo", () => {
    const out = run([line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI })], ctx({ values: [val({ amountCents: 100000, valueDate: "2026-07-11" })] }));
    expect(out.map((p) => p.kind)).toEqual(["match", "match"]);
  });
  it("varios renglones: un valor sin la fecha de referencia pero con otra fecha en la ventana también agrupa", () => {
    const out = run([line({ id: "a", amountCents: -60000, type: { code: "fci-suscripcion", source: "table" } }), line({ id: "b", amountCents: -40000, type: { code: "fci-suscripcion", source: "table" } })], ctx({ values: [val({ amountCents: -100000, voucherDate: null, depositDate: "2026-07-10" })] }));
    expect(out.map((p) => p.kind)).toEqual(["match", "match"]);
  });
});

describe("reconcile: la ventana del pedido", () => {
  const DEPOSIT = { code: "deposito-cheques", source: "table" as const };
  const FCI = { code: "fci-rescate", source: "table" as const };
  // Un valor del mismo importe lejos de todo: sin él, el importe único en el período aparearía fuera de la ventana.
  const far = val({ id: "far", voucherDate: "2026-05-01" });
  it("con 10 días, un valor a 8 días aparea; con 5 no", () => {
    const go = (windowDays: number) => run([line({ date: "2026-07-18" })], ctx({ values: [val(), far], windowDays }))[0];
    expect(go(10)).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, days: 8 } }));
    expect(go(5).kind).toBe("pending");
  });
  it("con 0 días, solo el mismo día", () => {
    expect(run([line()], ctx({ values: [val(), far], windowDays: 0 }))[0].kind).toBe("match");
    expect(run([line({ date: "2026-07-11" })], ctx({ values: [val(), far], windowDays: 0 }))[0].kind).toBe("pending");
  });
  it("intercambiables: con 10 días, pares a 8 días se emparejan", () => {
    const out = run([line({ id: "a", date: "2026-07-18" }), line({ id: "b", date: "2026-07-19" })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", voucherDate: "2026-07-11" })], windowDays: 10 }));
    expect(out.map((p) => (p.kind === "match" ? [p.valueIds[0], p.coincidence.days] : p.kind))).toEqual([["v1", 8], ["v2", 8]]);
  });
  it("la boleta: con 10 días, un valor a 8 días la ancla", () => {
    const values = [3000, 7000].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9" }));
    expect(run([line({ amountCents: 10000, date: "2026-07-18" })], ctx({ values, windowDays: 10 }))[0].kind).toBe("match");
    expect(run([line({ amountCents: 10000, date: "2026-07-18" })], ctx({ values }))[0].kind).toBe("pending");
  });
  it("la suma libre: con 10 días busca entre los valores a 10 días, no a 11", () => {
    const values = [val({ id: "a", amountCents: 3000, voucherDate: "2026-07-10" }), val({ id: "b", amountCents: 7000, voucherDate: "2026-07-30" })];
    expect(run([line({ amountCents: 10000, date: "2026-07-20", type: DEPOSIT })], ctx({ values, windowDays: 10 }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["b", "a"] }));
    expect(run([line({ amountCents: 10000, date: "2026-07-21", type: DEPOSIT })], ctx({ values, windowDays: 10 }))[0].kind).toBe("pending");
  });
  it("varios renglones: con 10 días el valor ve los renglones a 10 días, no a 11", () => {
    const at = (date: string) => run([line({ id: "a", amountCents: 60000, date, type: FCI }), line({ id: "b", amountCents: 40000, date, type: FCI })], ctx({ values: [val({ amountCents: 100000 })], windowDays: 10 }));
    expect(at("2026-07-20").map((p) => p.kind === "match" && p.coincidence.days)).toEqual([10, 10]);
    expect(at("2026-07-21").map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
});

describe("reconcile: un CUIT distinto en una transferencia es un tercero que paga", () => {
  const X = { cuit: "20222222223", name: null, cbu: null };
  const OTHER = "27333333334";
  const t = (code: string) => ({ code, source: "table" as const });
  it("una transferencia con un CUIT distinto aparea weak, con la marca", () => {
    expect(run([line({ counterparty: X })], ctx({ values: [val({ drawerCuit: OTHER })] }))).toEqual([
      { kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["v1"], confidence: "weak", coincidence: { amount: true, days: 0 }, marks: ["third-party"] },
    ]);
  });
  it("transferencia es el tipo del valor: un cheque con otro CUIT sigue excluido aunque el renglón sea una transferencia", () => {
    const go = (code: string, kind: string) => run([line({ counterparty: X, type: t(code) })], ctx({ values: [val({ kind, drawerCuit: OTHER })] }))[0];
    expect(go("transferencia-recibida", "Cheque").kind).toBe("pending");
    expect(go("cheque-pagado", "Transferencia bancaria")).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["third-party"] }));
    expect(go("cheque-pagado", "Cheque").kind).toBe("pending");
  });
  it("una contradicción no desempata: la transferencia del tercero sigue siendo candidata", () => {
    // v1 sin CUIT y v2 de otro CUIT: dos candidatos, ninguno único; con el CUIT del renglón, v1 gana por la contraparte.
    expect(run([line({ counterparty: X })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", drawerCuit: OTHER })] }))[0]).toEqual(expect.objectContaining({ kind: "review", candidates: [["v1"], ["v2"]] }));
    expect(run([line({ counterparty: X })], ctx({ values: [val({ id: "v1", drawerCuit: X.cuit }), val({ id: "v2", drawerCuit: OTHER })] }))[0]).toEqual(
      expect.objectContaining({ kind: "match", valueIds: ["v1"], confidence: "grounded", marks: [] }),
    );
  });
  it("la contraparte por CBU con un CUIT distinto aparea, pero weak y con la marca", () => {
    const cbu = "0170000000000000000001";
    const parties = [{ id: "3", role: "customer" as const, cuit: OTHER, cbu }];
    const out = run([line({ counterparty: { ...X, cbu } })], ctx({ values: [val({ id: "v1", customerId: "3" }), val({ id: "v2" })], parties }));
    expect(out[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["v1"], confidence: "weak", coincidence: { amount: true, days: 0, cbu }, marks: ["third-party"] }));
  });
  it("el número no mira la contraparte: sigue verified", () => {
    expect(run([line({ counterparty: X, reference: "4512" })], ctx({ values: [val({ number: "4512", drawerCuit: OTHER })] }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "verified", marks: [] }));
  });
  it("intercambiables: el par con un tercero lleva la marca, los otros no", () => {
    const lines = [line({ id: "a", order: 1, counterparty: X }), line({ id: "b", order: 2 })];
    const values = [val({ id: "v1", drawerCuit: OTHER }), val({ id: "v2" })];
    expect(run(lines, ctx({ values })).map((p) => p.kind === "match" && [p.valueIds[0], p.confidence, p.marks])).toEqual([["v1", "weak", ["interchangeable", "third-party"]], ["v2", "weak", ["interchangeable"]]]);
  });
  it("la boleta con la transferencia de un tercero aparea weak, con la marca", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9", drawerCuit: OTHER }), val({ id: "b", amountCents: 7000, depositId: "B9" })];
    expect(run([line({ amountCents: 10000, type: t("deposito-cheques"), counterparty: X })], ctx({ values }))[0]).toEqual(
      expect.objectContaining({ kind: "match", valueIds: ["a", "b"], confidence: "weak", coincidence: { amount: true, deposit: "B9" }, marks: ["third-party"] }),
    );
  });
  it("la boleta sin terceros sigue grounded aunque el renglón traiga CUIT", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9", drawerCuit: X.cuit }), val({ id: "b", amountCents: 7000, depositId: "B9" })];
    expect(run([line({ amountCents: 10000, type: t("deposito-cheques"), counterparty: X })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", marks: [] }));
  });
  it("la suma libre toma la transferencia de un tercero y sale con la marca", () => {
    const values = [val({ id: "a", amountCents: 3000, drawerCuit: OTHER }), val({ id: "b", amountCents: 7000 })];
    expect(run([line({ amountCents: 10000, type: t("deposito-cheques"), counterparty: X })], ctx({ values }))[0]).toEqual(
      expect.objectContaining({ kind: "match", valueIds: ["b", "a"], confidence: "weak", marks: ["third-party"] }),
    );
  });
  it("el lote subido toma la transferencia de un tercero y sale con la marca", () => {
    const parties = [{ id: "7", role: "supplier" as const, cuit: OTHER, cbu: null }];
    const batch = { id: "L1", transfers: [{ cuit: OTHER, number: null, amountCents: -30000, failed: false, payDate: "2026-07-10" }, { cuit: null, number: null, amountCents: -20000, failed: false, payDate: "2026-07-10" }] };
    const values = [val({ id: "a", amountCents: -30000, supplierId: "7" }), val({ id: "b", kind: "Orden de pago", amountCents: -20000 })];
    const p = reconcile({ lines: [line({ amountCents: -50000, type: t("pago-masivo"), counterparty: X })], context: ctx({ values, parties, batchIds: ["L1"] }), batches: [batch], readingWarning: false, bankCode: null, decisions: [] }).proposals[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "b"], confidence: "weak", coincidence: { amount: true, batch: "L1" }, marks: ["third-party"] }));
  });
  it("varios renglones: un valor de transferencia de un tercero agrupa, con la marca en cada renglón", () => {
    const FCI = t("fci-rescate");
    const out = run([line({ id: "a", amountCents: 60000, type: FCI, counterparty: X }), line({ id: "b", amountCents: 40000, type: FCI })], ctx({ values: [val({ amountCents: 100000, drawerCuit: OTHER })] }));
    expect(out.map((p) => p.kind === "match" && [p.groupLineIds, p.confidence, p.marks])).toEqual([[["a", "b"], "weak", ["third-party"]], [["a", "b"], "weak", ["third-party"]]]);
  });
  it("la marca va después de la base y antes de las del renglón y la lectura", () => {
    const p = run([line({ counterparty: X, chains: false })], ctx({ values: [val({ drawerCuit: OTHER })] }), true)[0];
    expect(p.kind === "match" && p.marks).toEqual(["third-party", "unchecked-line", "reading-warning"]);
  });
});

describe("reconcile: importe único en el período", () => {
  const X = { cuit: "20222222223", name: null, cbu: null };
  const t = (code: string) => ({ code, source: "table" as const });
  it("un renglón y un valor únicos con su importe, fuera de la ventana: weak, con la marca y los días", () => {
    expect(run([line({ date: "2026-07-30" })], ctx({ values: [val()] }))).toEqual([
      { kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["v1"], confidence: "weak", coincidence: { amount: true, days: 20 }, marks: ["single-amount"] },
    ]);
  });
  it("no depende de la ventana del pedido", () => {
    expect(run([line({ date: "2026-07-12" })], ctx({ values: [val()], windowDays: 0 }))[0]).toEqual(expect.objectContaining({ kind: "match", marks: ["single-amount"] }));
  });
  it("un valor sin fechas también, sin días", () => {
    expect(run([line()], ctx({ values: [val({ voucherDate: null })] }))[0]).toEqual(expect.objectContaining({ kind: "match", coincidence: { amount: true }, marks: ["single-amount"] }));
  });
  it("con la contraparte que coincide, la informa", () => {
    expect(run([line({ date: "2026-07-30", counterparty: X })], ctx({ values: [val({ drawerCuit: X.cuit })] }))[0]).toEqual(expect.objectContaining({ kind: "match", coincidence: { amount: true, days: 20, cuit: X.cuit } }));
  });
  it("dos renglones con ese importe: ninguno aparea", () => {
    expect(run([line({ id: "a", date: "2026-07-30" }), line({ id: "b", date: "2026-06-20" })], ctx({ values: [val()] })).map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("dos valores con ese importe: no aparea", () => {
    expect(run([line({ date: "2026-07-30" })], ctx({ values: [val({ id: "v1" }), val({ id: "v2", voucherDate: "2026-06-01" })] }))[0].kind).toBe("pending");
  });
  it("del otro signo no es el mismo importe", () => {
    expect(run([line({ date: "2026-07-30", amountCents: -100000 })], ctx({ values: [val()] }))[0].kind).toBe("pending");
  });
  it("cuentan todos los renglones del extracto, no solo los pedidos", () => {
    expect(run([line({ id: "a", date: "2026-07-30" }), line({ id: "b", date: "2026-06-20" })], ctx({ lineIds: ["a"], values: [val()] }))).toEqual([expect.objectContaining({ kind: "pending", lineId: "a" })]);
  });
  it("un valor en disputa con ese importe cuenta: no hay único", () => {
    // x e y disputan v1 por número; z, lejos de los dos valores, es el único renglón libre del importe y v2 el único valor libre.
    const lines = [line({ id: "x", reference: "4512" }), line({ id: "y", reference: "4512", date: "2026-07-25" }), line({ id: "z", date: "2026-08-30" })];
    const values = [val({ id: "v1", number: "4512" }), val({ id: "v2", voucherDate: "2026-06-01" })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "pending", lineId: "z", reason: PENDING_THIRD_PARTY, marks: [] });
    expect(run(lines, ctx({ values: [values[0]] }))[2].kind).toBe("pending");
  });
  it("único en todo el extracto: el otro renglón del importe ya apareó en la ventana y aun así cuenta, no se lleva un valor de abril", () => {
    const out = run([line({ id: "L1", date: "2026-07-05" }), line({ id: "L2", date: "2026-07-28" })], ctx({ values: [val({ id: "v1", voucherDate: "2026-07-05" }), val({ id: "viejo", voucherDate: "2026-04-10" })] }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.confidence] : p.kind))).toEqual([["L1", "v1", "grounded"], "pending"]);
  });
  it("único en todos los valores del pedido: un valor del importe que apareó en una boleta también cuenta", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9" }), val({ id: "b", amountCents: 7000, depositId: "B9" }), val({ id: "c", amountCents: 3000, voucherDate: "2026-04-10" })];
    const out = run([line({ id: "D", amountCents: 10000 }), line({ id: "L", amountCents: 3000, date: "2026-07-30" })], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds] : p.kind))).toEqual([["D", ["a", "b"]], "pending"]);
  });
  it("un renglón ya resuelto no cambia de valor aunque sea el único de su importe", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9" }), val({ id: "b", amountCents: 7000, depositId: "B9" }), val({ id: "c", amountCents: 10000, voucherDate: "2026-04-10" })];
    expect(run([line({ id: "D", amountCents: 10000 })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "b"], confidence: "grounded" }));
  });
  it("un valor candidato de una revisión de la pasada 5 queda en disputa: el renglón único de su importe no se lo lleva", () => {
    // D va a revisar con b+a y d+c; L es el único renglón de 3.000 y a el único valor.
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 }), val({ id: "c", amountCents: 4000 }), val({ id: "d", amountCents: 6000 })];
    const out = run([line({ id: "D", amountCents: 10000, type: t("deposito-cheques") }), line({ id: "L", amountCents: 3000, date: "2026-08-29" })], ctx({ values }));
    expect(out).toEqual([
      { kind: "review", lineId: "D", reason: "Hay más de una combinación de valores que suma el importe.", candidates: [["b", "a"], ["d", "c"]] },
      { kind: "pending", lineId: "L", reason: PENDING_THIRD_PARTY, marks: [] },
    ]);
  });
  it("un valor candidato de una revisión por tiempo de la pasada 5 también queda en disputa", () => {
    // D suma los tres mayores de 40 valores; la búsqueda los encuentra primero y se corta por tiempo antes de probar que
    // son únicos. L es el único renglón de 1.039 y w39 el único valor.
    const clock = () => { let n = 0; return () => (n += 1); };
    const values = Array.from({ length: 40 }, (_, i) => val({ id: `w${i}`, amountCents: 1000 + i }));
    const lines = [line({ id: "D", amountCents: 1039 + 1038 + 1037, type: t("deposito-cheques") }), line({ id: "L", amountCents: 1039, date: "2026-08-29" })];
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(), budgetMsPerLine: 1, budgetMsTotal: 100000 }).proposals;
    expect(out).toEqual([
      { kind: "review", lineId: "D", reason: "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.", candidates: [["w39", "w38", "w37"]] },
      { kind: "pending", lineId: "L", reason: PENDING_THIRD_PARTY, marks: [] },
    ]);
  });
  it("dos sumas que comparten un valor: los otros valores de las dos también quedan en disputa", () => {
    // x suma b+a e y suma b+c: comparten b. L es el único renglón de 3.000 y a el único valor.
    const DEPOSIT = t("deposito-cheques");
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 }), val({ id: "c", amountCents: 2000 })];
    const out = run([line({ id: "x", amountCents: 10000, type: DEPOSIT }), line({ id: "y", amountCents: 9000, type: DEPOSIT }), line({ id: "L", amountCents: 3000, date: "2026-08-29" })], ctx({ values }));
    expect(out.map((p) => (p.kind === "review" ? p.candidates : p.kind))).toEqual([[["b", "a"]], [["b", "c"]], "pending"]);
  });
  it("pasada 6: el valor de un tercer reclamo, que no se muestra entre los candidatos, también queda en disputa", () => {
    // a+b = 3.000, a+c = 5.000, b+c = 6.000 y a+b+c = 7.000: cada renglón muestra dos, v7 no figura. L es el único de 7.000.
    const FCI = t("fci-rescate");
    const lines = [line({ id: "a", amountCents: 1000, type: FCI }), line({ id: "b", amountCents: 2000, type: FCI }), line({ id: "c", amountCents: 4000, type: FCI }), line({ id: "L", amountCents: 7000, date: "2026-08-29" })];
    const out = run(lines, ctx({ values: [3000, 5000, 6000, 7000].map((c) => val({ id: `v${c / 1000}`, amountCents: c })) }));
    expect(out.flatMap((p) => (p.kind === "review" ? p.candidates.flat() : [])).includes("v7")).toBe(false);
    expect(out[3].kind).toBe("pending");
  });
  it("un valor candidato de una revisión de la pasada 6 queda en disputa: el renglón único de su importe no se lo lleva", () => {
    const FCI = t("fci-rescate");
    const lines = [30000, 70000, 70000].map((c, i) => line({ id: `r${i}`, amountCents: c, type: FCI }));
    const out = run([...lines, line({ id: "L", amountCents: 100000, date: "2026-08-29" })], ctx({ values: [val({ id: "v1", amountCents: 100000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["review", "review", "review", "pending"]);
  });
  // Con un techo por búsqueda de 0, cada búsqueda se corta al empezar y el plazo del pedido sigue en pie: las pasadas posteriores corren.
  const SPLIT_CUT = "La búsqueda de una suma de renglones pasó el tiempo disponible: hay que revisarlo a mano.";
  it("los renglones de una búsqueda de la pasada 6 cortada por el techo no aparean por importe único: van a revisar", () => {
    // La búsqueda de v1 entre a y b se corta; a es el único renglón de 60.000 y w el único valor.
    const clock = () => { let n = 0; return () => (n += 1); };
    const FCI = t("fci-rescate");
    const values = [val({ id: "v1", amountCents: 100000 }), val({ id: "w", amountCents: 60000, voucherDate: "2026-04-01" })];
    const out = reconcile({ lines: [line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI })], context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(), budgetMsPerLine: 0, budgetMsTotal: 100000 }).proposals;
    expect(out).toEqual([{ kind: "review", lineId: "a", reason: SPLIT_CUT, candidates: [] }, { kind: "review", lineId: "b", reason: SPLIT_CUT, candidates: [] }]);
  });
  it("el valor de una búsqueda de la pasada 6 cortada por el techo queda en disputa: el renglón único de su importe no se lo lleva", () => {
    // Sin techo, a y b suman v1; L es el único renglón de 100.000, a 80 días, y v1 el único valor.
    const clock = () => { let n = 0; return () => (n += 1); };
    const FCI = t("fci-rescate");
    const lines = [line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI }), line({ id: "L", amountCents: 100000, date: "2026-09-28" })];
    const go = (budgetMsPerLine: number) => reconcile({ lines, context: ctx({ values: [val({ id: "v1", amountCents: 100000 })] }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(), budgetMsPerLine, budgetMsTotal: 100000 }).proposals;
    expect(go(1000).map((p) => (p.kind === "match" ? p.valueIds : p.kind))).toEqual([["v1"], ["v1"], "pending"]);
    expect(go(0).map((p) => p.kind)).toEqual(["review", "review", "pending"]);
  });
  it("un valor de una búsqueda de la pasada 5 cortada por el techo queda en disputa aunque la búsqueda no lo haya puesto en una combinación", () => {
    // Sin techo, D suma a + b; L es el único renglón de 60.000, a 80 días, y a el único valor.
    const clock = () => { let n = 0; return () => (n += 1); };
    const values = [val({ id: "a", amountCents: 60000 }), val({ id: "b", amountCents: 40000 })];
    const lines = [line({ id: "D", amountCents: 100000, type: t("deposito-cheques") }), line({ id: "L", amountCents: 60000, date: "2026-09-28" })];
    const go = (budgetMsPerLine: number) => reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(), budgetMsPerLine, budgetMsTotal: 100000 }).proposals;
    expect(go(1000).map((p) => (p.kind === "match" ? p.valueIds : p.kind))).toEqual([["a", "b"], "pending"]);
    expect(go(0).map((p) => p.kind)).toEqual(["review", "pending"]);
  });
  it("el techo de las sumas por pedido es de 6 s, y el de cada renglón de 2 s", () => {
    expect(DEFAULT_RECONCILE_OPTIONS).toEqual(expect.objectContaining({ budgetMsPerLine: 2000, budgetMsTotal: 6000 }));
  });
  it("un valor que dos sumas dejaron en disputa no lo toma el renglón único de su importe", () => {
    // x e y suman p + q y los dejan en disputa; L es el único renglón de 6.000 y p el único valor.
    const DEPOSIT = t("deposito-cheques");
    const lines = [line({ id: "x", amountCents: 10000, type: DEPOSIT }), line({ id: "y", amountCents: 10000, date: "2026-07-11", type: DEPOSIT }), line({ id: "L", amountCents: 6000, date: "2026-08-30" })];
    expect(run(lines, ctx({ values: [val({ id: "p", amountCents: 6000 }), val({ id: "q", amountCents: 4000 })] }))[2].kind).toBe("pending");
  });
  it("corre después de las sumas: la boleta del depósito gana, el renglón lejano no le roba un valor", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9" }), val({ id: "b", amountCents: 7000, depositId: "B9" })];
    const out = run([line({ id: "D", amountCents: 10000 }), line({ id: "L", amountCents: 3000, date: "2026-07-30" })], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds, p.confidence] : p.kind))).toEqual([["D", ["a", "b"], "grounded"], "pending"]);
  });
  it("corre después de la suma libre y de los renglones agrupados", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 }), val({ id: "f", amountCents: 100000 })];
    const FCI = t("fci-rescate");
    const lines = [line({ id: "D", amountCents: 10000, type: t("deposito-cheques") }), line({ id: "L", amountCents: 3000, date: "2026-07-30" }), line({ id: "r1", amountCents: 60000, type: FCI }), line({ id: "r2", amountCents: 40000, type: FCI }), line({ id: "F", amountCents: 100000, date: "2026-08-30" })];
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds] : p.kind))).toEqual([["D", ["b", "a"]], "pending", ["r1", ["f"]], ["r2", ["f"]], "pending"]);
  });
  it("un cheque con un CUIT que contradice sigue afuera; una transferencia sale también con la marca del tercero", () => {
    const go = (code: string, kind: string) => run([line({ date: "2026-07-30", type: t(code), counterparty: X })], ctx({ values: [val({ kind, drawerCuit: "27333333334" })] }))[0];
    expect(go("cheque-pagado", "Cheque").kind).toBe("pending");
    expect(go("transferencia-recibida", "Transferencia bancaria")).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["single-amount", "third-party"] }));
  });
  it("la confianza mira el renglón y la lectura", () => {
    expect(run([line({ date: "2026-07-30", chains: false })], ctx({ values: [val()] }), true)[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["single-amount", "unchecked-line", "reading-warning"] }));
  });
});

describe("reconcile: un valor en disputa sigue siendo candidato", () => {
  it("A y B ven solo v1 y lo disputan; L ve v1 y v2: L va a revisar con los dos, no aparea con v2", () => {
    const lines = [line({ id: "A", date: "2026-07-01" }), line({ id: "B", date: "2026-07-02" }), line({ id: "L", date: "2026-07-10" })];
    const values = [val({ id: "v1", voucherDate: "2026-07-05" }), val({ id: "v2", voucherDate: "2026-07-15" })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "review", lineId: "L", reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v1"], ["v2"]] });
  });
  it("intercambiables: un grupo con un valor en disputa del mismo importe en la ventana no se empareja", () => {
    // x e y disputan v1 por número; a y b, sin número, tienen v1, v2 y v3 en la ventana.
    const lines = [line({ id: "x", reference: "4512" }), line({ id: "y", reference: "4512", date: "2026-07-25" }), line({ id: "a" }), line({ id: "b", date: "2026-07-11" })];
    const values = [val({ id: "v1", number: "4512" }), val({ id: "v2" }), val({ id: "v3", voucherDate: "2026-07-11" })];
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => p.kind)).toEqual(["review", "review", "review", "review"]);
    expect(out.filter((p) => p.kind === "match")).toEqual([]);
  });
  it("intercambiables: un valor en disputa fuera de la ventana del grupo no le impide emparejarse", () => {
    // x e y disputan v1 (del 1) por número; a y b, del 20 y el 21, no lo ven y se emparejan con v2 y v3.
    const lines = [line({ id: "x", reference: "4512", date: "2026-07-01" }), line({ id: "y", reference: "4512", date: "2026-07-02" }), line({ id: "a", date: "2026-07-20" }), line({ id: "b", date: "2026-07-21" })];
    const values = [val({ id: "v1", number: "4512", voucherDate: "2026-07-01" }), val({ id: "v2", voucherDate: "2026-07-20" }), val({ id: "v3", voucherDate: "2026-07-21" })];
    expect(run(lines, ctx({ values })).map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.marks] : p.kind))).toEqual(["review", "review", ["a", "v2", ["interchangeable"]], ["b", "v3", ["interchangeable"]]]);
  });
});

describe("reconcile: un renglón contra varios valores", () => {
  const DEPOSIT = { code: "deposito-cheques", source: "table" as const };
  const BULK = { code: "pago-masivo", source: "table" as const };
  const SEVERAL = "Hay más de una combinación de valores que suma el importe.";
  const DISPUTED = "Más de un renglón coincide con el mismo valor.";
  const X = { cuit: "20222222223", name: null, cbu: null };
  const clock = (step: number) => {
    let t = 0;
    return () => (t += step);
  };

  it("AC-17: tres cheques depositados el día 10 y un renglón por el total el 12, sin detalle", () => {
    const values = [3000, 4500, 2500].map((c, i) => val({ id: `c${i}`, kind: "Cheque", amountCents: c, depositDate: "2026-07-10", voucherDate: "2026-07-01" }));
    const p = run([line({ amountCents: 10000, date: "2026-07-12", type: DEPOSIT })], ctx({ values }))[0];
    expect(p).toEqual({ kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["c1", "c0", "c2"], confidence: "weak", coincidence: { amount: true }, marks: [] });
  });
  it("con la boleta de depósito, grounded y la boleta entre lo que coincidió", () => {
    const values = [3000, 7000].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9", depositDate: "2026-07-10" }));
    const p = run([line({ amountCents: 10000 })], ctx({ values }))[0];
    expect(p).toEqual({ kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["c0", "c1"], confidence: "grounded", coincidence: { amount: true, deposit: "B9" }, marks: [] });
  });
  it("con el lote de ProntoNet, grounded y el lote entre lo que coincidió", () => {
    const values = [-3000, -7000].map((c, i) => val({ id: `o${i}`, amountCents: c, batchId: "L4" }));
    const p = run([line({ amountCents: -10000 })], ctx({ values }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", valueIds: ["o0", "o1"], confidence: "grounded", coincidence: { amount: true, batch: "L4" } }));
  });
  it("la boleta no supera al renglón ni a la lectura", () => {
    const values = [3000, 7000].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9" }));
    expect(run([line({ amountCents: 10000, chains: false })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["unchecked-line"] }));
    expect(run([line({ amountCents: 10000 })], ctx({ values }), true)[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["reading-warning"] }));
  });
  it("la suma libre lleva la marca de una lectura con aviso", () => {
    const values = [3000, 7000].map((c, i) => val({ id: `c${i}`, amountCents: c }));
    expect(run([line({ amountCents: 10000, type: DEPOSIT })], ctx({ values }), true)[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["reading-warning"] }));
  });
  it("una boleta sin ningún valor en la ventana no aparea", () => {
    const values = [3000, 7000].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9", depositDate: "2026-07-01" }));
    expect(run([line({ amountCents: 10000, date: "2026-07-20" })], ctx({ values }))[0].kind).toBe("pending");
  });
  it("una boleta que suma de más o de menos no aparea", () => {
    const values = [3000, 7000, 1].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9" }));
    expect(run([line({ amountCents: 10000 })], ctx({ values }))[0].kind).toBe("pending");
  });
  it("una boleta suma solo los valores del signo del renglón", () => {
    const values = [12000, -2000].map((c, i) => val({ id: `c${i}`, amountCents: c, depositId: "B9" }));
    expect(run([line({ amountCents: 10000 })], ctx({ values }))[0].kind).toBe("pending");
    // Con otro valor del importe lejos, el importe único en el período no lo toma.
    expect(run([line({ amountCents: -2000, date: "2026-07-25" })], ctx({ values: [...values, val({ id: "far", amountCents: -2000, voucherDate: "2026-05-01" })] }))[0].kind).toBe("pending");
  });
  it("una boleta aparea con que uno de sus valores caiga en la ventana", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9", depositDate: "2026-07-10" }), val({ id: "b", amountCents: 7000, depositId: "B9", voucherDate: "2026-06-25", depositDate: "2026-07-01" })];
    expect(run([line({ amountCents: 10000 })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "b"] }));
  });
  it("una boleta y un lote con el mismo id no se mezclan, ni dos lotes entre sí", () => {
    const values = [val({ id: "a", amountCents: -3000, depositId: "X1" }), val({ id: "b", amountCents: -7000, batchId: "X1" }), val({ id: "c", amountCents: -4000, batchId: "L2" })];
    expect(run([line({ amountCents: -10000 })], ctx({ values }))[0].kind).toBe("pending");
    expect(run([line({ amountCents: -11000 })], ctx({ values }))[0].kind).toBe("pending");
  });
  it("un valor ya apareado no entra en una suma", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 })];
    const out = run([line({ id: "x", amountCents: 3000 }), line({ id: "d", amountCents: 10000, type: DEPOSIT })], ctx({ values }));
    expect(out.map((p) => p.kind)).toEqual(["match", "pending"]);
  });
  it("valores en la ventana que no suman el importe: pendiente", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 4000 })];
    expect(run([line({ amountCents: 10000, type: DEPOSIT })], ctx({ values }))[0].kind).toBe("pending");
  });
  it.each([{ depositId: "B9" }, { batchId: "L4" }])("un grupo de un solo valor (%o) no desempata dos valores con el importe exacto", (group) => {
    const values = [val({ id: "a", amountCents: 10000, ...group }), val({ id: "b", amountCents: 10000 })];
    expect(run([line({ amountCents: 10000 })], ctx({ values }))).toEqual([{ kind: "review", lineId: "l1", reason: "Hay más de un valor que coincide con el renglón.", candidates: [["a"], ["b"]] }]);
  });
  it("dos boletas que suman el importe: a revisar con las dos", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B1" }), val({ id: "b", amountCents: 7000, depositId: "B1" }), val({ id: "c", amountCents: 4000, depositId: "B2" }), val({ id: "d", amountCents: 6000, depositId: "B2" })];
    expect(run([line({ amountCents: 10000 })], ctx({ values }))[0]).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL, candidates: [["a", "b"], ["c", "d"]] });
  });
  it("una boleta con un valor de CUIT que contradice al renglón no aparea, y ese valor tampoco entra en la suma libre", () => {
    const values = [val({ id: "a", kind: "Cheque", amountCents: 3000, depositId: "B9", drawerCuit: "27333333334" }), val({ id: "b", kind: "Cheque", amountCents: 7000, depositId: "B9" })];
    expect(run([line({ amountCents: 10000, type: DEPOSIT, counterparty: X })], ctx({ values }))[0].kind).toBe("pending");
  });
  it("la suma libre deja afuera el valor con un CUIT que contradice: sin él, la combinación es única", () => {
    const values = [val({ id: "otro", kind: "Cheque", amountCents: 3000, drawerCuit: "27333333334" }), val({ id: "b", kind: "Cheque", amountCents: 7000 }), val({ id: "c", kind: "Cheque", amountCents: 3000, drawerCuit: X.cuit })];
    expect(run([line({ amountCents: 10000, type: DEPOSIT, counterparty: X })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["b", "c"] }));
  });
  it("AC-18: 63 órdenes de pago y un renglón de pago masivo por su total", () => {
    const values = Array.from({ length: 63 }, (_, i) => val({ id: `op${i}`, amountCents: -(10_000 + i * 37), voucherDate: "2026-07-09" }));
    const total = values.reduce((a, v) => a + v.amountCents, 0);
    const p = run([line({ amountCents: total, date: "2026-07-10", type: BULK })], ctx({ values }))[0];
    expect(p.kind === "match" && p.valueIds).toHaveLength(63);
  });
  it("AC-20: dos combinaciones distintas suman el importe: a revisar, sin valores, con las dos como candidatos", () => {
    // b+a y b+c suman 30.000; a+c no, y ningún valor tiene el importe exacto.
    const values = [val({ id: "a", amountCents: 10000 }), val({ id: "b", amountCents: 20000 }), val({ id: "c", amountCents: 10000 })];
    const p = run([line({ amountCents: 30000, type: DEPOSIT })], ctx({ values }))[0];
    expect(p).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL, candidates: [["b", "a"], ["b", "c"]] });
  });
  it("dos valores con el importe exacto y una suma que también lo da: a revisar, la suma no es única", () => {
    const values = [val({ id: "a", amountCents: 10000 }), val({ id: "b", amountCents: 10000 }), val({ id: "c", amountCents: 4000 }), val({ id: "d", amountCents: 6000 })];
    expect(run([line({ amountCents: 10000, type: DEPOSIT })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "review", reason: SEVERAL, candidates: [["a"], ["b"]] }));
  });
  it("la suma libre mira la ventana de 5 días hacia cada lado", () => {
    const values = [
      val({ id: "in5", amountCents: 3000, voucherDate: "2026-07-05" }), val({ id: "in15", amountCents: 7000, voucherDate: "2026-07-15" }),
      val({ id: "out4", amountCents: 3000, voucherDate: "2026-07-04" }), val({ id: "out16", amountCents: 7000, voucherDate: "2026-07-16" }),
    ];
    expect(run([line({ amountCents: 10000, type: DEPOSIT })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["in15", "in5"] }));
  });
  it("la suma libre busca entre hasta 200 valores del signo del renglón", () => {
    const amounts = Array.from({ length: 200 }, (_, i) => 10_000 + i * 37);
    const total = amounts.reduce((a, b) => a + b, 0);
    const values = amounts.map((c, i) => val({ id: `v${i}`, amountCents: c }));
    const opposite = val({ id: "neg", amountCents: -5 });
    expect(run([line({ amountCents: total, type: DEPOSIT })], ctx({ values: [...values, opposite] }))[0].kind).toBe("match");
    // Con 201 no se busca: va a revisar con el motivo, porque no se miró, no porque no haya valor.
    expect(run([line({ amountCents: total + 1, type: DEPOSIT })], ctx({ values: [...values, val({ id: "uno", amountCents: 1 })] }))[0]).toEqual({
      kind: "review", lineId: "l1", reason: "No se buscó una suma de valores: hay más de 200 en la ventana. Hay que revisarlo a mano.", candidates: [],
    });
  });
  it("dos renglones que ven la misma suma: los dos a revisar y los valores en disputa", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 })];
    const out = run([line({ id: "x", amountCents: 10000, type: DEPOSIT }), line({ id: "y", amountCents: 10000, date: "2026-07-11", type: DEPOSIT })], ctx({ values }));
    expect(out).toEqual([
      { kind: "review", lineId: "x", reason: DISPUTED, candidates: [["b", "a"]] },
      { kind: "review", lineId: "y", reason: DISPUTED, candidates: [["b", "a"]] },
    ]);
  });
  it("una boleta y una suma libre que comparten un valor: los dos renglones a revisar", () => {
    const values = [val({ id: "a", amountCents: 3000, depositId: "B9" }), val({ id: "b", amountCents: 7000, depositId: "B9" }), val({ id: "c", amountCents: 2000 })];
    const out = run([line({ id: "x", amountCents: 10000 }), line({ id: "y", amountCents: 5000, type: DEPOSIT })], ctx({ values }));
    expect(out.map((p) => [p.kind, p.kind === "review" && p.reason])).toEqual([["review", DISPUTED], ["review", DISPUTED]]);
  });
  it("una suma que lleva un valor en disputa va a revisar: ese valor puede ser de otro renglón", () => {
    // x e y disputan v1 por número; d suma v1 y v2.
    const lines = [line({ id: "x", amountCents: 3000, reference: "4512" }), line({ id: "y", amountCents: 3000, reference: "4512", date: "2026-07-25" }), line({ id: "d", amountCents: 10000, type: DEPOSIT })];
    const values = [val({ id: "v1", amountCents: 3000, number: "4512" }), val({ id: "v2", amountCents: 7000 })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "review", lineId: "d", reason: DISPUTED, candidates: [["v2", "v1"]] });
  });
  it("una boleta que lleva un valor en disputa va a revisar", () => {
    const lines = [line({ id: "x", amountCents: 3000, reference: "4512" }), line({ id: "y", amountCents: 3000, reference: "4512", date: "2026-07-25" }), line({ id: "d", amountCents: 10000 })];
    const values = [val({ id: "v1", amountCents: 3000, number: "4512", depositId: "B9" }), val({ id: "v2", amountCents: 7000, depositId: "B9" })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "review", lineId: "d", reason: DISPUTED, candidates: [["v1", "v2"]] });
  });
  it("pasado el techo por renglón, a revisar con el motivo, nunca un apareo", () => {
    const values = Array.from({ length: 40 }, (_, i) => val({ id: `v${i}`, amountCents: 1000 + i, voucherDate: "2026-07-10" }));
    const out = reconcile({ lines: [line({ amountCents: 20_001, type: DEPOSIT })], context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 3, budgetMsTotal: 100 }).proposals;
    expect(out[0]).toEqual({ kind: "review", lineId: "l1", reason: "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.", candidates: [] });
  });
  it("el techo por renglón se cuenta desde que empieza ese renglón", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 })];
    const go = (budgetMsPerLine: number) =>
      reconcile({ lines: [line({ amountCents: 10000, type: DEPOSIT })], context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(20), budgetMsPerLine, budgetMsTotal: 1000 }).proposals[0].kind;
    expect(go(100)).toBe("match");
    expect(go(15)).toBe("review");
  });
  it("pasado el techo del pedido, el renglón va a revisar aunque le sobre el suyo", () => {
    const values = [val({ id: "a", amountCents: 3000 }), val({ id: "b", amountCents: 7000 })];
    const out = reconcile({ lines: [line({ amountCents: 10000, type: DEPOSIT })], context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal: 1 }).proposals;
    expect(out[0]).toEqual({ kind: "review", lineId: "l1", reason: "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.", candidates: [] });
  });
  it("un renglón que no es depósito ni pago masivo no busca sumas: sale DBG, no a revisar por tiempo", () => {
    const values = Array.from({ length: 40 }, (_, i) => val({ id: `v${i}`, amountCents: 1000 + i, voucherDate: "2026-07-10" }));
    const p = run([line({ amountCents: 2001, type: { code: "comision", source: "table" } })], ctx({ values }))[0];
    expect(p.kind).toBe("dbg");
  });
  it("un pago masivo también busca sumas", () => {
    const values = [val({ id: "a", amountCents: -3000 }), val({ id: "b", amountCents: -7000 })];
    expect(run([line({ amountCents: -10000, type: BULK })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["b", "a"] }));
  });
});

describe("reconcile: varios renglones contra un valor", () => {
  const FCI = { code: "fci-rescate", source: "table" as const };
  const t = (code: string) => ({ code, source: "table" as const });
  it("el rescate de un FCI en dos renglones del mismo día: un apareo weak que agrupa los dos", () => {
    const out = run([line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI })], ctx({ values: [val({ kind: "Fondo de inversion", amountCents: 100000 })] }));
    for (const p of out) expect(p).toEqual(expect.objectContaining({ kind: "match", valueIds: ["v1"], groupLineIds: ["a", "b"], confidence: "weak" }));
  });
  it("el DB de una OP de leasing contra la cuota, los intereses, el IVA y la percepción del día", () => {
    const parts = [-525579, -334678, -180654, -25808];
    const types = ["leasing", "intereses", "iva", "percepcion-iva"];
    const lines = parts.map((c, i) => line({ id: `r${i}`, amountCents: c, type: t(types[i]) }));
    const out = run(lines, ctx({ values: [val({ kind: "Débito bancario", amountCents: parts.reduce((a, b) => a + b, 0) })] }));
    expect(out.every((p) => p.kind === "match" && p.groupLineIds.length === 4)).toBe(true);
  });
  it("renglones de días distintos no se suman", () => {
    const out = run([line({ id: "a", amountCents: 60000, date: "2026-07-10", type: FCI }), line({ id: "b", amountCents: 40000, date: "2026-07-11", type: FCI })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("dos combinaciones de renglones: no se propone ninguna", () => {
    const out = run([30000, 70000, 70000].map((c, i) => line({ id: `r${i}`, amountCents: c, type: FCI })), ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out.some((p) => p.kind === "match")).toBe(false);
  });
  it("más de 6 renglones no se suman", () => {
    const out = run(Array.from({ length: 7 }, (_, i) => line({ id: `r${i}`, amountCents: 1000, type: FCI })), ctx({ values: [val({ amountCents: 7000 })] }));
    expect(out.some((p) => p.kind === "match")).toBe(false);
  });
  it("dos transferencias del mismo día que suman un valor no se agrupan", () => {
    const out = run([line({ id: "a", amountCents: 60000 }), line({ id: "b", amountCents: 40000 })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("renglones de tipos distintos sin una cuota de leasing o préstamo no se agrupan: una comisión y su IVA no son un valor: salen DBG", () => {
    const out = run([line({ id: "a", amountCents: -10000, type: t("comision") }), line({ id: "b", amountCents: -2100, type: t("iva") })], ctx({ values: [val({ amountCents: -12100 })] }));
    expect(out.map((p) => p.kind)).toEqual(["dbg", "dbg"]);
  });
});

describe("reconcile: varios renglones contra un valor, por dentro", () => {
  const FCI = { code: "fci-rescate", source: "table" as const };
  const t = (code: string) => ({ code, source: "table" as const });
  const DEPOSIT = t("deposito-cheques");
  const SPLIT_SEVERAL = "Hay más de una combinación de renglones que suma un valor.";
  // Lo que queda sin valor se abre: FCI, leasing y préstamo con el motivo del 3b; una transferencia, de terceros.
  const pending = (lineId: string, reason = PENDING_3B) => ({ kind: "pending", lineId, reason, marks: [] });
  const DISPUTED = "Más de un renglón coincide con el mismo valor.";
  const X = { cuit: "20222222223", name: null, cbu: null };
  const clock = (step: number) => {
    let t = 0;
    return () => (t += step);
  };
  const fci = (id: string, amountCents: number, over = {}) => line({ id, amountCents, type: FCI, ...over });
  const split = (lineId: string, groupLineIds: string[], days: number, over = {}) => ({
    kind: "match", lineId, groupLineIds, valueIds: ["v1"], confidence: "weak", coincidence: { amount: true, days }, marks: [], ...over,
  });

  it("la propuesta completa: cada renglón con el grupo en el orden del extracto, el valor, weak y los días", () => {
    const out = run([fci("b", 40000, { order: 2 }), fci("a", 60000, { order: 1 })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out).toEqual([split("b", ["b", "a"], 0), split("a", ["b", "a"], 0)]);
  });
  it("los renglones tienen que caer en la ventana del valor: a 5 días suman, a 6 no", () => {
    const at = (date: string) => run([fci("a", 60000, { date }), fci("b", 40000, { date })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(at("2026-07-15")).toEqual([split("a", ["a", "b"], 5), split("b", ["a", "b"], 5)]);
    expect(at("2026-07-16").map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("solo se suman renglones del signo del valor", () => {
    const out = run([fci("a", 60000), fci("b", 40000), line({ id: "c", amountCents: -40000, type: t("fci-suscripcion") })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["match", "match", "pending"]);
  });
  it("dos rescates y una suscripción del mismo día no se agrupan: el FCI tiene que ser del mismo tipo", () => {
    const out = run([fci("a", 60000), line({ id: "b", amountCents: 40000, type: t("fci-suscripcion") })], ctx({ values: [val({ amountCents: 100000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("una cuota de préstamo con sus sellos, su comisión y el débito automático se agrupan", () => {
    const parts: Array<[string, number]> = [["prestamo", -50000], ["sellos", -1000], ["comision", -2000], ["debito-automatico", -3000]];
    const out = run(parts.map(([code, c], i) => line({ id: `r${i}`, amountCents: c, type: t(code) })), ctx({ values: [val({ amountCents: -56000 })] }));
    expect(out.map((p) => p.kind === "match" && p.groupLineIds)).toEqual(parts.map(() => ["r0", "r1", "r2", "r3"]));
  });
  it.each(["transferencia-enviada", "fci-suscripcion"])("una cuota con un renglón %s del mismo día no se agrupa: no es parte de la cuota", (code) => {
    const out = run([line({ id: "a", amountCents: -50000, type: t("leasing") }), line({ id: "b", amountCents: -6000, type: t(code) })], ctx({ values: [val({ amountCents: -56000 })] }));
    expect(out.map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("hasta 6 renglones se suman", () => {
    const out = run(Array.from({ length: 6 }, (_, i) => fci(`r${i}`, 1000 * (i + 1))), ctx({ values: [val({ amountCents: 21000 })] }));
    expect(out.every((p) => p.kind === "match" && p.groupLineIds.length === 6)).toBe(true);
  });
  it("dos combinaciones de renglones: los renglones de las dos van a revisar con el valor, y el que no suma queda pendiente", () => {
    const out = run([fci("a", 30000), fci("b", 70000), fci("c", 70000), fci("d", 5000)], ctx({ values: [val({ amountCents: 100000 })] }));
    const review = (lineId: string) => ({ kind: "review", lineId, reason: SPLIT_SEVERAL, candidates: [["v1"]] });
    expect(out).toEqual([review("a"), review("b"), review("c"), expect.objectContaining({ kind: "pending", lineId: "d" })]);
  });
  it("una combinación en cada uno de dos días de la ventana: tampoco es única", () => {
    const lines = [fci("a", 60000, { date: "2026-07-08" }), fci("b", 40000, { date: "2026-07-08" }), fci("c", 60000, { date: "2026-07-12" }), fci("d", 40000, { date: "2026-07-12" })];
    expect(run(lines, ctx({ values: [val({ amountCents: 100000 })] })).map((p) => p.kind === "review" && p.reason)).toEqual([SPLIT_SEVERAL, SPLIT_SEVERAL, SPLIT_SEVERAL, SPLIT_SEVERAL]);
  });
  it("una combinación que no se agrupa no tapa a otras dos que sí: van a revisar", () => {
    // Suman -12.100 la comisión con su IVA (no se agrupan), el leasing con sus intereses y el préstamo con sus sellos.
    const parts: Array<[string, string, number]> = [["c", "comision", -10000], ["i", "iva", -2100], ["l", "leasing", -9000], ["n", "intereses", -3100], ["p", "prestamo", -8000], ["s", "sellos", -4100]];
    const out = run(parts.map(([id, code, c]) => line({ id, amountCents: c, type: t(code) })), ctx({ values: [val({ amountCents: -12100 })] }));
    expect(out.map((p) => [p.lineId, p.kind, p.kind === "review" && p.reason])).toEqual([
      ["c", "dbg", false], ["i", "dbg", false], ["l", "review", SPLIT_SEVERAL], ["n", "review", SPLIT_SEVERAL], ["p", "review", SPLIT_SEVERAL], ["s", "review", SPLIT_SEVERAL],
    ]);
  });
  it("dos valores cuyas combinaciones comparten un renglón: todos sus renglones van a revisar", () => {
    const values = [val({ id: "v1", amountCents: 100000 }), val({ id: "v2", amountCents: 90000 })];
    expect(run([fci("a", 60000), fci("b", 40000), fci("c", 30000)], ctx({ values }))).toEqual([
      { kind: "review", lineId: "a", reason: SPLIT_SEVERAL, candidates: [["v1"], ["v2"]] },
      { kind: "review", lineId: "b", reason: SPLIT_SEVERAL, candidates: [["v1"]] },
      { kind: "review", lineId: "c", reason: SPLIT_SEVERAL, candidates: [["v2"]] },
    ]);
  });
  it("un renglón con un CUIT que contradice al del valor no entra en la combinación", () => {
    const values = [val({ kind: "Fondo de inversion", amountCents: 100000, drawerCuit: "27333333334" })];
    expect(run([fci("a", 60000, { counterparty: X }), fci("b", 40000)], ctx({ values })).map((p) => p.kind)).toEqual(["pending", "pending"]);
    // Sin a, la única combinación es b con c.
    const out = run([fci("a", 60000, { counterparty: X }), fci("b", 40000), fci("c", 60000)], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? p.groupLineIds : p.kind))).toEqual(["pending", ["b", "c"], ["b", "c"]]);
  });
  it("un renglón con el CUIT del valor sí entra", () => {
    const out = run([fci("a", 60000, { counterparty: X }), fci("b", 40000)], ctx({ values: [val({ amountCents: 100000, drawerCuit: X.cuit })] }));
    expect(out.map((p) => p.kind)).toEqual(["match", "match"]);
  });
  it("la confianza mira cada renglón del grupo y la lectura", () => {
    expect(run([fci("a", 60000, { chains: false }), fci("b", 40000)], ctx({ values: [val({ amountCents: 100000 })] })).map((p) => p.kind === "match" && p.marks)).toEqual([["unchecked-line"], ["unchecked-line"]]);
    expect(run([fci("a", 60000), fci("b", 40000)], ctx({ values: [val({ amountCents: 100000 })] }), true).map((p) => p.kind === "match" && p.marks)).toEqual([["reading-warning"], ["reading-warning"]]);
  });
  it("un valor que apareó la pasada de varios valores no se vuelve a usar", () => {
    // D aparea la boleta p+q; a y b suman p.
    const values = [val({ id: "p", amountCents: 60000, depositId: "B9" }), val({ id: "q", amountCents: 40000, depositId: "B9" })];
    const out = run([line({ id: "D", amountCents: 100000 }), fci("a", 30000), fci("b", 30000)], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? p.valueIds : p.kind))).toEqual([["p", "q"], "pending", "pending"]);
  });
  it("un valor que la pasada de varios valores dejó en disputa: el grupo que lo suma va a revisar", () => {
    // x e y suman p+q, que quedan en disputa; a y b suman p.
    const values = [val({ id: "p", amountCents: 60000 }), val({ id: "q", amountCents: 40000 })];
    const out = run([line({ id: "x", amountCents: 100000, type: DEPOSIT }), line({ id: "y", amountCents: 100000, type: DEPOSIT }), fci("a", 30000), fci("b", 30000)], ctx({ values }));
    expect(out.slice(2)).toEqual([
      { kind: "review", lineId: "a", reason: DISPUTED, candidates: [["p"]] },
      { kind: "review", lineId: "b", reason: DISPUTED, candidates: [["p"]] },
    ]);
  });
  it("de dos sumas que comparten un valor, todos sus valores quedan en disputa: el grupo que suma el otro va a revisar", () => {
    // x aparea la boleta p+q e y la suma q+r: comparten q, y p y r también quedan en disputa. a y b suman p.
    const values = [val({ id: "p", amountCents: 60000, depositId: "B9" }), val({ id: "q", amountCents: 40000, depositId: "B9" }), val({ id: "r", amountCents: 10000 })];
    const out = run([line({ id: "x", amountCents: 100000 }), line({ id: "y", amountCents: 50000, type: DEPOSIT }), fci("a", 30000), fci("b", 30000)], ctx({ values }));
    expect(out.map((p) => (p.kind === "review" ? [p.reason, p.candidates] : p.kind))).toEqual([
      [DISPUTED, [["p", "q"]]], [DISPUTED, [["q", "r"]]], [DISPUTED, [["p"]]], [DISPUTED, [["p"]]],
    ]);
  });
  const SPLIT_CUT = "La búsqueda de una suma de renglones pasó el tiempo disponible: hay que revisarlo a mano.";
  const TIMED_OUT = "No se terminó de buscar: el apareo pasó el tiempo disponible. Hay que revisarlo a mano.";
  const unsearched = (lineId: string, reason: string) => ({ kind: "review", lineId, reason, candidates: [] });
  /** Cero hasta la llamada `from`, después `then`: la búsqueda de un valor se corta y la de otro no. */
  const jumpAt = (from: number, then: number) => {
    let n = 0;
    return () => (++n >= from ? then : 0);
  };
  it("pasado el techo por búsqueda, la pasada no aparea: los renglones de la búsqueda van a revisar, no quedan pendientes", () => {
    const lines = [fci("a", 60000), fci("b", 40000), line({ id: "c", amountCents: -5000, type: t("fci-suscripcion") }), line({ id: "d", amountCents: 5000 }), fci("e", 1000, { date: "2026-07-12" })];
    const go = (budgetMsPerLine: number) => reconcile({ lines, context: ctx({ values: [val({ amountCents: 100000 })] }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(20), budgetMsPerLine, budgetMsTotal: 1000 }).proposals;
    expect(go(100).map((p) => p.kind)).toEqual(["match", "match", "pending", "pending", "pending"]);
    expect(go(15)).toEqual([unsearched("a", SPLIT_CUT), unsearched("b", SPLIT_CUT), pending("c"), pending("d", PENDING_THIRD_PARTY), pending("e")]);
  });
  it("un renglón que entra en una búsqueda cortada por el techo no aparea aunque otro valor lo agrupe: la combinación pudo no ser única", () => {
    // v1 agrupa a y b; la búsqueda de v2 entre los mismos renglones se corta.
    const out = reconcile({ lines: [fci("a", 60000), fci("b", 40000)], context: ctx({ values: [val({ id: "v1", amountCents: 100000 }), val({ id: "v2", amountCents: 50000 })] }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: jumpAt(5, 5000), budgetMsPerLine: 1000, budgetMsTotal: 100000 }).proposals;
    expect(out).toEqual([unsearched("a", SPLIT_CUT), unsearched("b", SPLIT_CUT)]);
  });
  it("un renglón de la combinación única que quedó en una búsqueda cortada no aparea, aunque el otro no estuviera en ella: los tres van a revisar", () => {
    // v1 agrupa a y b; v2 no ve a b (su CUIT contradice) y su búsqueda entre a y c se corta.
    const lines = [fci("a", 60000), fci("b", 40000, { counterparty: X }), fci("c", 30000)];
    const values = [val({ id: "v1", amountCents: 100000 }), val({ id: "v2", kind: "Fondo de inversion", amountCents: 90000, drawerCuit: "27333333334" })];
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: jumpAt(5, 5000), budgetMsPerLine: 1000, budgetMsTotal: 100000 }).proposals;
    expect(out).toEqual([unsearched("a", SPLIT_CUT), unsearched("b", SPLIT_CUT), unsearched("c", SPLIT_CUT)]);
  });
  it("con el plazo del pedido vencido en la pasada 6, no aparea ningún grupo: lo que queda sin resolver va a revisar por tiempo", () => {
    // v1 agrupa a y b; la búsqueda de v2 entre a y c vence el plazo del pedido. Sin el plazo, v1 aparearía a y b.
    const lines = [fci("a", 60000), fci("b", 40000, { counterparty: X }), fci("c", 30000)];
    const values = [val({ id: "v1", amountCents: 100000 }), val({ id: "v2", kind: "Fondo de inversion", amountCents: 90000, drawerCuit: "27333333334" })];
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal: 3 }).proposals;
    expect(out).toEqual([unsearched("a", SPLIT_CUT), unsearched("b", TIMED_OUT), unsearched("c", SPLIT_CUT)]);
  });
  // Con clock(1) y un techo del pedido de 2, alcanza para una sola búsqueda: la de v1, si nadie busca antes.
  it.each([
    ["una comisión y su IVA de un día sin cuota", [line({ id: "c", amountCents: -10000, date: "2026-07-12", type: t("comision") }), line({ id: "i", amountCents: -2100, date: "2026-07-12", type: t("iva") })], -12100, "2026-07-12"],
    ["renglones del otro signo", [], -50000, "2026-07-10"],
    ["un rescate solo en su día", [fci("c", 3000, { date: "2026-07-25" })], 5000, "2026-07-25"],
  ])("lo que no puede sumar no gasta el techo: %s", (_name, others, cents, voucherDate) => {
    const values = [val({ id: "vX", amountCents: cents as number, voucherDate: voucherDate as string }), val({ id: "v1", amountCents: 100000 })];
    const lines = [fci("a", 60000), fci("b", 40000), ...(others as ReturnType<typeof line>[])];
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal: 2 }).proposals;
    expect(out.slice(0, 2).map((p) => p.kind === "match" && p.valueIds)).toEqual([["v1"], ["v1"]]);
  });
  describe("los gastos de un día sin cuota y el techo de la pasada de varios valores", () => {
    // D busca entre 40 valores una suma que no existe; cada día del 18 al 22 tiene una comisión, su IVA y un impuesto, y hay valores de esos días.
    const far = Array.from({ length: 40 }, (_, i) => val({ id: `w${i}`, amountCents: 1000 + i, voucherDate: "2026-07-01" }));
    const days = ["18", "19", "20", "21", "22"];
    const costs = days.flatMap((d, i) => [
      line({ id: `c${i}`, date: `2026-07-${d}`, amountCents: -10000 - i, type: t("comision") }),
      line({ id: `i${i}`, date: `2026-07-${d}`, amountCents: -2100 - i, type: t("iva") }),
      line({ id: `s${i}`, date: `2026-07-${d}`, amountCents: -500 - i, type: t("sellos") }),
    ]);
    const near = days.map((d, i) => val({ id: `n${i}`, amountCents: -12600 - 2 * i, voucherDate: `2026-07-${d}` }));
    const go = (budgetMsPerLine: number, budgetMsTotal: number) =>
      reconcile({ lines: [line({ id: "D", amountCents: 20_001, date: "2026-07-01", type: DEPOSIT }), ...costs], context: ctx({ values: [...far, ...near] }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine, budgetMsTotal }).proposals;
    it("si D gasta solo su techo, ningún gasto ni impuesto va a revisar: no se buscan sumas para ellos y salen DBG", () => {
      expect(go(50, 100000).slice(1).map((p) => [p.lineId, p.kind])).toEqual(costs.map((l) => [l.id, "dbg"]));
    });
    it("si D gasta el plazo del pedido, los gastos que quedan van a revisar por tiempo", () => {
      expect(go(1000, 100).slice(1)).toEqual(costs.map((l) => unsearched(l.id, TIMED_OUT)));
    });
  });
  it("un día sin cuota no agrupa sus gastos en un apareo aunque sumen un valor: salen DBG", () => {
    const out = run([line({ id: "c", amountCents: -10000, type: t("comision") }), line({ id: "i", amountCents: -2100, type: t("iva") }), line({ id: "s", amountCents: -500, type: t("sellos") })], ctx({ values: [val({ amountCents: -12600 })] }));
    expect(out.map((p) => p.kind)).toEqual(["dbg", "dbg", "dbg"]);
  });
  it("un renglón que entra en las combinaciones de muchos valores va a revisar con dos candidatos como mucho", () => {
    // 1.000, 2.000, 4.000 y 8.000: cada suma es de una sola combinación. a entra en las de los cuatro valores.
    const lines = [fci("a", 1000), fci("b", 2000), fci("c", 4000), fci("d", 8000)];
    const values = [3000, 5000, 9000, 7000].map((c) => val({ id: `v${c}`, amountCents: c }));
    expect(run(lines, ctx({ values }))).toEqual([
      { kind: "review", lineId: "a", reason: SPLIT_SEVERAL, candidates: [["v3000"], ["v5000"]] },
      { kind: "review", lineId: "b", reason: SPLIT_SEVERAL, candidates: [["v3000"], ["v7000"]] },
      { kind: "review", lineId: "c", reason: SPLIT_SEVERAL, candidates: [["v5000"], ["v7000"]] },
      { kind: "review", lineId: "d", reason: SPLIT_SEVERAL, candidates: [["v9000"]] },
    ]);
  });
  it("un día con más de 40 renglones de un mismo grupo no se agrupa", () => {
    // 60.000 + 40.000 es la única combinación: los renglones de 1 centavo no llegan a nada.
    const day = (n: number) => [fci("a", 60000), fci("b", 40000), ...Array.from({ length: n - 2 }, (_, i) => fci(`z${i}`, 1))];
    expect(run(day(40), ctx({ values: [val({ amountCents: 100000 })] })).slice(0, 2).map((p) => p.kind)).toEqual(["match", "match"]);
    const SPLIT_POOL = "No se buscó una suma de renglones: el día tiene más de 40 del mismo grupo. Hay que revisarlo a mano.";
    expect(run(day(41), ctx({ values: [val({ amountCents: 100000 })] })).slice(0, 3)).toEqual([unsearched("a", SPLIT_POOL), unsearched("b", SPLIT_POOL), unsearched("z0", SPLIT_POOL)]);
  });
  it("un día con más de 40 renglones de un grupo que ningún valor mira no va a revisar", () => {
    // El valor es del otro signo, o de otro mes: no habría buscado en ese día.
    const day = [fci("a", 60000), fci("b", 40000), ...Array.from({ length: 39 }, (_, i) => fci(`z${i}`, 1))];
    expect(run(day, ctx({ values: [val({ amountCents: -100000 })] })).slice(0, 2)).toEqual([pending("a"), pending("b")]);
    expect(run(day, ctx({ values: [val({ amountCents: 100000, voucherDate: "2026-05-01" })] })).slice(0, 2)).toEqual([pending("a"), pending("b")]);
  });
  it("el tope de 40 es de cada grupo del día: una cuota no se cae por los rescates del mismo día", () => {
    const lines = [line({ id: "l", amountCents: -50000, type: t("leasing") }), line({ id: "n", amountCents: -6000, type: t("intereses") }), ...Array.from({ length: 41 }, (_, i) => fci(`z${i}`, 1))];
    expect(run(lines, ctx({ values: [val({ amountCents: -56000 })] })).slice(0, 2).map((p) => p.kind)).toEqual(["match", "match"]);
  });
  it("un renglón del grupo de un valor en disputa que otro valor también agrupa va a revisar por las dos combinaciones", () => {
    // x e y dejan p en disputa; p agrupa a y b, y v2 agrupa a y c.
    const values = [val({ id: "p", amountCents: 60000 }), val({ id: "q", amountCents: 40000 }), val({ id: "v2", amountCents: 55000 })];
    const lines = [line({ id: "x", amountCents: 100000, type: DEPOSIT }), line({ id: "y", amountCents: 100000, type: DEPOSIT }), fci("a", 35000), fci("b", 25000), fci("c", 20000)];
    expect(run(lines, ctx({ values })).slice(2)).toEqual([
      { kind: "review", lineId: "a", reason: SPLIT_SEVERAL, candidates: [["p"], ["v2"]] },
      { kind: "review", lineId: "b", reason: DISPUTED, candidates: [["p"]] },
      { kind: "review", lineId: "c", reason: SPLIT_SEVERAL, candidates: [["v2"]] },
    ]);
  });
  it("la suscripción de un FCI en dos renglones también se agrupa", () => {
    const sus = t("fci-suscripcion");
    const out = run([line({ id: "a", amountCents: -60000, type: sus }), line({ id: "b", amountCents: -40000, type: sus })], ctx({ values: [val({ amountCents: -100000 })] }));
    expect(out.map((p) => p.kind === "match" && p.groupLineIds)).toEqual([["a", "b"], ["a", "b"]]);
  });
  it("el techo del pedido es uno solo: si la pasada de varios valores lo gastó, el grupo no aparea", () => {
    // D busca entre 40 valores una suma que no existe (1.000 a 1.039 nunca dan 20.001) hasta gastar el techo del pedido.
    const far = Array.from({ length: 40 }, (_, i) => val({ id: `w${i}`, amountCents: 1000 + i, voucherDate: "2026-07-01" }));
    const values = [...far, val({ id: "v1", amountCents: 100000, voucherDate: "2026-07-20" })];
    const fcis = [fci("a", 60000, { date: "2026-07-20" }), fci("b", 40000, { date: "2026-07-20" })];
    const go = (lines: ReturnType<typeof line>[]) => reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal: 100 }).proposals;
    expect(go(fcis).map((p) => p.kind)).toEqual(["match", "match"]);
    expect(go([line({ id: "D", amountCents: 20_001, date: "2026-07-01", type: DEPOSIT }), ...fcis]).map((p) => p.kind === "review" && p.reason)).toEqual([
      "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.", TIMED_OUT, TIMED_OUT,
    ]);
  });
});

describe("reconcile: cuentas propias y pendiente (RF-20, RNF-01)", () => {
  const own = [{ id: "B", cbu: "1910000000000000000002", number: null }];
  const fromOwn = { cuit: null, name: null, cbu: "1910000000000000000002" };
  it("AC-21: una transferencia desde otra cuenta propia aparea con el valor de esta cuenta, con la marca", () => {
    const p = run([line({ counterparty: fromOwn })], ctx({ values: [val({ paymentOrderType: "OT" })], ownAccounts: own }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", marks: expect.arrayContaining(["own-accounts"]) }));
  });
  it("una transferencia entre cuentas propias sin valor cargado: pendiente con su motivo", () => {
    const p = run([line({ counterparty: fromOwn })], ctx({ ownAccounts: own }))[0];
    expect(p).toEqual({ kind: "pending", lineId: "l1", reason: "Transferencia entre cuentas propias sin valor cargado.", marks: ["own-accounts"] });
  });
  it("RNF-01: todo renglón pedido vuelve con una propuesta", () => {
    const lines = Array.from({ length: 30 }, (_, i) => line({ id: `r${i}`, amountCents: (i % 7) * 100 + 1, date: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}` }));
    const values = Array.from({ length: 20 }, (_, i) => val({ id: `v${i}`, amountCents: (i % 5) * 100 + 1 }));
    const out = run(lines, ctx({ values }));
    expect(out.map((p) => p.lineId)).toEqual(lines.map((l) => l.id));
  });
  it("el pendiente de cuentas propias conserva la marca de una lectura con aviso", () => {
    expect(run([line({ counterparty: fromOwn })], ctx({ ownAccounts: own }), true)).toEqual([
      { kind: "pending", lineId: "l1", reason: "Transferencia entre cuentas propias sin valor cargado.", marks: ["own-accounts", "reading-warning"] },
    ]);
  });
  it("el apareo de cuentas propias lleva su marca después de las de la confianza", () => {
    const p = run([line({ counterparty: fromOwn, reference: "4512" })], ctx({ values: [val({ number: "4512" })], ownAccounts: own }), true)[0];
    expect(p).toEqual({ kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["v1"], confidence: "weak", coincidence: { amount: true, number: "4512", days: 0 }, marks: ["reading-warning", "own-accounts"] });
  });
  it("un CBU que no es de una cuenta propia no lleva la marca", () => {
    const other = { cuit: null, name: null, cbu: "0170000000000000000001" };
    expect(run([line({ counterparty: other })], ctx({ ownAccounts: own }))).toEqual([{ kind: "pending", lineId: "l1", reason: PENDING_THIRD_PARTY, marks: [] }]);
    expect(run([line({ counterparty: other })], ctx({ values: [val()], ownAccounts: own }))[0]).toEqual(expect.objectContaining({ kind: "match", marks: [] }));
  });
  it("en un grupo, la marca va solo en el renglón de la cuenta propia", () => {
    const FCI = { code: "fci-rescate", source: "table" as const };
    const out = run([line({ id: "a", amountCents: 60000, type: FCI, counterparty: fromOwn }), line({ id: "b", amountCents: 40000, type: FCI })], ctx({ values: [val({ amountCents: 100000 })], ownAccounts: own }));
    expect(out.map((p) => p.kind === "match" && p.marks)).toEqual([["own-accounts"], []]);
  });
  it("un renglón de cuenta propia que va a revisar sigue a revisar", () => {
    const out = run([line({ id: "a", counterparty: fromOwn }), line({ id: "b", date: "2026-07-11" })], ctx({ values: [val()], ownAccounts: own }));
    expect(out.map((p) => p.kind)).toEqual(["review", "review"]);
  });
});

describe("reconcile: un lote subido (RF-18)", () => {
  it("AC-19: la transferencia con error no se propone; las otras arman el pago masivo", () => {
    const batch = { id: "L1", transfers: [
      { cuit: "20222222223", number: "1", amountCents: -30000, failed: false, payDate: "2026-07-10" },
      { cuit: "27333333334", number: "2", amountCents: -20000, failed: false, payDate: "2026-07-10" },
      { cuit: "23444444449", number: "3", amountCents: -10000, failed: true, payDate: "2026-07-10" },
    ] };
    const parties = [{ id: "7", role: "supplier" as const, cuit: "20222222223", cbu: null }, { id: "8", role: "supplier" as const, cuit: "27333333334", cbu: null }, { id: "9", role: "supplier" as const, cuit: "23444444449", cbu: null }];
    const values = [val({ id: "op7", amountCents: -30000, supplierId: "7" }), val({ id: "op8", amountCents: -20000, supplierId: "8" }), val({ id: "op9", amountCents: -10000, supplierId: "9" })];
    const p = reconcile({ lines: [line({ amountCents: -50000 })], context: ctx({ values, parties, batchIds: ["L1"] }), batches: [batch], readingWarning: false, bankCode: null, decisions: [] }).proposals[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded", coincidence: { amount: true, batch: "L1" } }));
    expect(p.kind === "match" && [...p.valueIds].sort()).toEqual(["op7", "op8"]);
  });
});

describe("reconcile: un lote subido, por dentro", () => {
  const SEVERAL = "Hay más de una combinación de valores que suma el importe.";
  const DISPUTED = "Más de un renglón coincide con el mismo valor.";
  const A = "20222222223";
  const B = "27333333334";
  const parties = [{ id: "7", role: "supplier" as const, cuit: A, cbu: null }, { id: "8", role: "supplier" as const, cuit: B, cbu: null }];
  const t = (cuit: string | null, amountCents: number, failed = false) => ({ cuit, number: null, amountCents, failed, payDate: "2026-07-10" });
  const L1 = { id: "L1", transfers: [t(A, 30000), t(B, 20000)] };
  const ops = () => [val({ id: "op7", amountCents: -30000, supplierId: "7" }), val({ id: "op8", amountCents: -20000, supplierId: "8" })];
  const go = (lines: ReturnType<typeof line>[], values: ReturnType<typeof val>[], batches = [L1], over: Partial<ReconcileContext> = {}, readingWarning = false) =>
    reconcile({ lines, context: ctx({ values, parties, batchIds: batches.map((b) => b.id), ...over }), batches, readingWarning, bankCode: null, decisions: [] }).proposals;

  it("la propuesta completa: el renglón, los valores en el orden del lote, grounded y el lote entre lo que coincidió", () => {
    expect(go([line({ amountCents: -50000 })], ops())).toEqual([
      { kind: "match", lineId: "l1", groupLineIds: ["l1"], valueIds: ["op7", "op8"], confidence: "grounded", coincidence: { amount: true, batch: "L1" }, marks: [] },
    ]);
  });
  it("un lote que el pedido no nombra no se usa", () => {
    expect(go([line({ amountCents: -50000 })], ops(), [L1], { batchIds: [] })[0].kind).toBe("pending");
    expect(go([line({ amountCents: -50000 })], ops(), [L1], { batchIds: ["L2"] })[0].kind).toBe("pending");
  });
  it("si la suma da contando la transferencia con error, no aparea: el banco no la pagó", () => {
    const batch = { id: "L1", transfers: [t(A, 30000), t(B, 20000, true)] };
    expect(go([line({ amountCents: -50000 })], ops(), [batch])[0].kind).toBe("pending");
  });
  it("un lote que suma de más o de menos no aparea", () => {
    expect(go([line({ amountCents: -50001 })], ops())[0].kind).toBe("pending");
    expect(go([line({ amountCents: -49999 })], ops())[0].kind).toBe("pending");
  });
  it("un renglón que entra plata no es un pago masivo: no usa el lote", () => {
    const values = [val({ id: "a", amountCents: 30000, supplierId: "7" }), val({ id: "b", amountCents: 20000, supplierId: "8" })];
    expect(go([line({ amountCents: 50000 })], values)[0].kind).toBe("pending");
  });
  it("un valor del otro signo no es el de la transferencia", () => {
    const values = [val({ id: "op7", amountCents: 30000, supplierId: "7" }), val({ id: "op8", amountCents: -20000, supplierId: "8" })];
    expect(go([line({ amountCents: -50000 })], values)[0].kind).toBe("pending");
  });
  it("la transferencia con CUIT busca el valor de ese CUIT: con otro CUIT o sin CUIT no es el suyo", () => {
    expect(go([line({ amountCents: -50000 })], [val({ id: "op7", amountCents: -30000, supplierId: "8" }), ops()[1]])[0].kind).toBe("pending");
    expect(go([line({ amountCents: -50000 })], [val({ id: "op7", amountCents: -30000 }), ops()[1]])[0].kind).toBe("pending");
  });
  it("el CUIT del valor sale del proveedor o del librador", () => {
    const values = [val({ id: "op7", amountCents: -30000, drawerCuit: A }), ops()[1]];
    expect(go([line({ amountCents: -50000 })], values)[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["op7", "op8"] }));
  });
  it("dos valores del mismo CUIT e importe para una transferencia: no aparea", () => {
    const values = [...ops(), val({ id: "otra", amountCents: -30000, supplierId: "7", voucherDate: "2026-06-01" })];
    expect(go([line({ amountCents: -50000 })], values)[0].kind).toBe("pending");
  });
  it("dos transferencias del mismo CUIT e importe se llevan sus dos valores; con un tercero, no aparea", () => {
    const batch = { id: "L1", transfers: [t(A, 30000), t(A, 30000)] };
    const two = [val({ id: "a", amountCents: -30000, supplierId: "7" }), val({ id: "b", amountCents: -30000, supplierId: "7" })];
    expect(go([line({ amountCents: -60000 })], two, [batch])[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "b"] }));
    expect(go([line({ amountCents: -60000 })], [...two, val({ id: "c", amountCents: -30000, supplierId: "7" })], [batch])[0].kind).toBe("pending");
  });
  it("sin CUIT en la transferencia alcanza el importe, si el valor es único", () => {
    const batch = { id: "L1", transfers: [t(null, 30000), t(B, 20000)] };
    expect(go([line({ amountCents: -50000 })], ops(), [batch])[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["op7", "op8"] }));
    const twice = [...ops(), val({ id: "otra", amountCents: -30000, voucherDate: "2026-06-01" })];
    expect(go([line({ amountCents: -50000 })], twice, [batch])[0].kind).toBe("pending");
  });
  it("sin CUIT, la transferencia se lleva el valor que no tomó la del mismo importe con CUIT", () => {
    const batch = { id: "L1", transfers: [t(null, 30000), t(A, 30000)] };
    const values = [val({ id: "suyo", amountCents: -30000, supplierId: "7" }), val({ id: "otro", amountCents: -30000, supplierId: "8" })];
    expect(go([line({ amountCents: -60000 })], values, [batch])[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["otro", "suyo"] }));
    expect(go([line({ amountCents: -60000 })], [...values, val({ id: "tercero", amountCents: -30000 })], [batch])[0].kind).toBe("pending");
  });
  it("un valor con un CUIT que contradice al renglón no entra: sin él, el de la transferencia sin CUIT es único", () => {
    const batch = { id: "L1", transfers: [t(null, 30000), t(null, 20000)] };
    const op = (over: Partial<ReturnType<typeof val>>) => val({ kind: "Orden de pago", ...over });
    const values = [op({ id: "contra", amountCents: -30000, drawerCuit: "23444444449" }), op({ id: "a", amountCents: -30000, drawerCuit: A }), op({ id: "b", amountCents: -20000 })];
    // Ni transferencia (el CUIT distinto no sería un tercero) ni pago masivo (la suma libre lo resolvería sin el lote).
    const debit = { code: "debito-automatico", source: "table" as const };
    expect(go([line({ amountCents: -50000, type: debit, counterparty: { cuit: A, name: null, cbu: null } })], values, [batch])[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "b"] }));
    expect(go([line({ amountCents: -50000, type: debit })], values, [batch])[0].kind).toBe("pending");
  });
  it("un valor que ya apareó otra pasada no entra en el lote", () => {
    const out = go([line({ id: "x", amountCents: -30000 }), line({ id: "l", amountCents: -50000 })], ops());
    expect(out.map((p) => p.kind)).toEqual(["match", "pending"]);
  });
  it("la boleta o el lote de ProntoNet y el lote subido con valores distintos: a revisar con las dos combinaciones", () => {
    const values = [val({ id: "a", amountCents: -25000, batchId: "P1" }), val({ id: "b", amountCents: -25000, batchId: "P1" }), ...ops()];
    expect(go([line({ amountCents: -50000 })], values)[0]).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL, candidates: [["a", "b"], ["op7", "op8"]] });
  });
  it("el lote de ProntoNet y el lote subido con los mismos valores son una sola combinación, aunque vengan en otro orden", () => {
    const values = ops().map((v) => ({ ...v, batchId: "P1" }));
    const reversed = { id: "L1", transfers: [t(B, 20000), t(A, 30000)] };
    expect(go([line({ amountCents: -50000 })], values, [reversed])[0]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["op7", "op8"], coincidence: { amount: true, batch: "P1" } }));
  });
  it("dos lotes subidos que suman el importe con valores distintos: a revisar; el mismo lote dos veces, no", () => {
    const L2 = { id: "L2", transfers: [t(null, 50000)] };
    const values = [...ops(), val({ id: "u", amountCents: -50000, voucherDate: "2026-06-01" })];
    // Un segundo renglón del importe: sin él, u es el único valor del importe y el importe único en el período lo aparea antes.
    const other = line({ id: "m", amountCents: -50000, date: "2026-08-20" });
    expect(go([line({ amountCents: -50000 }), other], values, [L1, L2])[0]).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL, candidates: [["op7", "op8"], ["u"]] });
    expect(go([line({ amountCents: -50000 })], ops(), [L1, { ...L1, id: "L1b" }])[0]).toEqual(expect.objectContaining({ kind: "match", coincidence: { amount: true, batch: "L1" } }));
  });
  it("dos renglones con el importe del lote: los dos a revisar y los valores en disputa", () => {
    const out = go([line({ id: "x", amountCents: -50000 }), line({ id: "y", amountCents: -50000, date: "2026-08-10" })], ops());
    expect(out).toEqual([
      { kind: "review", lineId: "x", reason: DISPUTED, candidates: [["op7", "op8"]] },
      { kind: "review", lineId: "y", reason: DISPUTED, candidates: [["op7", "op8"]] },
    ]);
  });
  it("un lote que lleva un valor en disputa va a revisar", () => {
    // x e y disputan op7 por número; el lote lo necesita.
    const lines = [line({ id: "x", amountCents: -30000, reference: "4512" }), line({ id: "y", amountCents: -30000, reference: "4512", date: "2026-08-25" }), line({ id: "l", amountCents: -50000 })];
    const values = [val({ id: "op7", amountCents: -30000, supplierId: "7", number: "4512" }), ops()[1]];
    expect(go(lines, values)[2]).toEqual({ kind: "review", lineId: "l", reason: DISPUTED, candidates: [["op7", "op8"]] });
  });
  it("el lote no supera al renglón ni a la lectura", () => {
    expect(go([line({ amountCents: -50000, chains: false })], ops())[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["unchecked-line"] }));
    expect(go([line({ amountCents: -50000 })], ops(), [L1], {}, true)[0]).toEqual(expect.objectContaining({ kind: "match", confidence: "weak", marks: ["reading-warning"] }));
  });
});

describe("reconcile: el plazo del pedido cubre todo el apareo", () => {
  const TIMED_OUT = "No se terminó de buscar: el apareo pasó el tiempo disponible. Hay que revisarlo a mano.";
  const timedOut = (lineId: string) => ({ kind: "review", lineId, reason: TIMED_OUT, candidates: [] });
  /** El plazo arranca en 0 y vence en la llamada `at` al reloj: el reloj se mira cada tantos pasos, no en cada uno. */
  const expiresAt = (at: number) => {
    let n = 0;
    return { now: () => (++n >= at ? 1e12 : 0), budgetMsPerLine: 2000, budgetMsTotal: 6000 };
  };
  const day = (i: number) => new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10);
  const go = (lines: ReturnType<typeof line>[], values: ReturnType<typeof val>[], options = expiresAt(2)) =>
    reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, options).proposals;

  it("vencido en las pasadas de la ventana, ningún renglón aparea: todos van a revisar por tiempo", () => {
    // 1.100 renglones, cada uno con su único valor en la ventana: sin plazo, todos grounded.
    const lines = Array.from({ length: 1100 }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 1000 + i }));
    const values = lines.map((l, i) => val({ id: `v${i}`, amountCents: l.amountCents }));
    expect(go(lines, values, { ...expiresAt(1e9) }).every((p) => p.kind === "match" && p.confidence === "grounded")).toBe(true);
    expect(go(lines, values)).toEqual(lines.map((l) => timedOut(l.id)));
  });
  it("vencido en el punto fijo, lo que ya apareó queda y el resto va a revisar por tiempo; nunca pendiente", () => {
    // Una escalera: cada vuelta libera un renglón. El plazo vence en algún momento de las vueltas.
    const lines = Array.from({ length: 1200 }, (_, i) => line({ id: `L${i}`, order: i + 1, date: day(2 * i), amountCents: -5000 }));
    const values = lines.map((_, i) => val({ id: `v${i}`, amountCents: -5000, voucherDate: day(2 * i + 1) }));
    const out = reconcile({ lines, context: ctx({ values, windowDays: 1 }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, expiresAt(40)).proposals;
    const matched = out.filter((p) => p.kind === "match");
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan(1200);
    expect(matched.every((p) => p.kind === "match" && p.valueIds[0] === `v${p.lineId.slice(1)}`)).toBe(true);
    expect(out.filter((p) => p.kind !== "match")).toEqual(out.filter((p) => p.kind !== "match").map((p) => timedOut(p.lineId)));
  });
  it.each([["intercambiables", 700], ["importe único en el período", 1100]])("vencido en la pasada de %s, aparea lo anterior al plazo y el resto va a revisar por tiempo", (pass, n) => {
    // Intercambiables: grupos de dos renglones y dos valores del mismo día. Importe único: cada renglón con su valor a 40 días.
    const pairs = pass === "intercambiables";
    const lines = Array.from({ length: pairs ? 2 * n : n }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 1000 + (pairs ? Math.floor(i / 2) : i), date: day(pairs ? 0 : 40) }));
    const values = lines.map((l, i) => val({ id: `v${i}`, amountCents: l.amountCents, voucherDate: day(0) }));
    // El plazo vence en la k-ésima mirada del reloj: alguna cae dentro de la pasada, que deja apareado un prefijo.
    const runs = Array.from({ length: 30 }, (_, k) => go(lines, values, expiresAt(k + 2)));
    const mixed = runs.filter((out) => out.some((p) => p.kind === "match") && out.some((p) => p.kind === "review"));
    expect(mixed.length).toBeGreaterThan(0);
    for (const out of runs) {
      expect(out.every((p) => (p.kind === "match" ? p.marks[0] === (pairs ? "interchangeable" : "single-amount") : p.kind === "review" && p.reason === TIMED_OUT))).toBe(true);
      const firstReview = out.findIndex((p) => p.kind === "review");
      if (firstReview >= 0) expect(out.slice(firstReview).every((p) => p.kind === "review")).toBe(true);
    }
  });
  it("vencido el plazo, una cuenta propia sin valor también va a revisar: no se sabe si el valor falta", () => {
    const own = [{ id: "B", cbu: "1910000000000000000002", number: null }];
    const lines = Array.from({ length: 1100 }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 1000 + i, counterparty: { cuit: null, name: null, cbu: "1910000000000000000002" } }));
    const out = reconcile({ lines, context: ctx({ values: lines.map((l, i) => val({ id: `v${i}`, amountCents: l.amountCents })), ownAccounts: own }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, expiresAt(2)).proposals;
    expect(out[0]).toEqual(timedOut("r0"));
  });
});

describe("reconcile: un renglón con más candidatos de los que pueden darle un único", () => {
  const CROWDED = "No se pudo buscar un valor único: hay más de 50 del mismo importe que podrían ser de este renglón. Hay que revisarlo a mano.";
  const many = (n: number, over = {}) => Array.from({ length: n }, (_, i) => val({ id: `v${i}`, ...over }));
  it("con más de 50 valores del importe en la ventana va a revisar con el motivo; con 50 se buscan, y va a revisar con ellos", () => {
    expect(run([line()], ctx({ values: many(51) }))).toEqual([{ kind: "review", lineId: "l1", reason: CROWDED, candidates: [] }]);
    expect(run([line()], ctx({ values: many(50) }))[0]).toEqual(expect.objectContaining({ kind: "review", reason: "Hay más de un valor que coincide con el renglón." }));
  });
  it("los valores fuera de la ventana, ya apareados o de un CUIT que contradice no cuentan", () => {
    const far = many(60, { voucherDate: "2026-05-01" }).map((v, i) => ({ ...v, id: `far${i}` }));
    const against = many(60, { kind: "Cheque", drawerCuit: "27333333334" }).map((v, i) => ({ ...v, id: `x${i}` }));
    const cp = { cuit: "20222222223", name: null, cbu: null };
    expect(run([line({ counterparty: cp, type: { code: "cheque-pagado", source: "table" } })], ctx({ values: [...far, ...against, ...many(2)] }))[0]).toEqual(expect.objectContaining({ reason: "Hay más de un valor que coincide con el renglón.", candidates: [["v0"], ["v1"]] }));
    // 50 los toman otros renglones por número: quedan 2.
    const taken = many(52).map((v, i) => ({ ...v, number: i < 50 ? String(10000 + i) : null }));
    const byNumber = taken.slice(0, 50).map((v, i) => line({ id: `n${i}`, order: i + 2, reference: v.number, date: "2026-06-01" }));
    expect(run([line({ id: "L" }), ...byNumber], ctx({ values: taken }))[0]).toEqual(expect.objectContaining({ reason: "Hay más de un valor que coincide con el renglón.", candidates: [["v50"], ["v51"]] }));
  });
  it("con más de 50 valores con el mismo número e importe, el número tampoco aparea", () => {
    const values = many(51, { number: "4512", voucherDate: "2026-05-01" });
    expect(run([line({ reference: "4512" })], ctx({ values }))).toEqual([{ kind: "review", lineId: "l1", reason: CROWDED, candidates: [] }]);
  });
  it("sigue disponible para las intercambiables: 51 renglones y 51 valores del mismo día se emparejan", () => {
    const lines = Array.from({ length: 51 }, (_, i) => line({ id: `r${i}`, order: i + 1 }));
    const out = run(lines, ctx({ values: many(51) }));
    expect(out.every((p) => p.kind === "match" && p.marks[0] === "interchangeable")).toBe(true);
  });
  it("si ve un valor en disputa, va a revisar con él, como cualquier renglón", () => {
    // x e y disputan v0 por número; L ve 52 valores del importe, entre ellos v0.
    const values = many(52).map((v, i) => (i === 0 ? { ...v, number: "4512" } : v));
    const lines = [line({ id: "x", reference: "4512" }), line({ id: "y", reference: "4512", date: "2026-07-25" }), line({ id: "L" })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "review", lineId: "L", reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v0"]] });
  });
});

describe("reconcile: un renglón con varios valores que no se pudieron separar va a revisar con ellos", () => {
  const SEVERAL_VALUES = "Hay más de un valor que coincide con el renglón.";
  const many = (n: number, over = {}) => Array.from({ length: n }, (_, i) => val({ id: `v${i}`, ...over }));
  const each = (ids: string[]) => ids.map((id) => [id]);
  const X = { cuit: "20222222223", name: null, cbu: null };
  it("con dos valores del importe en la ventana, a revisar con los dos, sin marcas", () => {
    expect(run([line()], ctx({ values: many(2, { voucherDate: "2026-07-11" }) }), true)).toEqual([{ kind: "review", lineId: "l1", reason: SEVERAL_VALUES, candidates: [["v0"], ["v1"]] }]);
  });
  it("con 50, a revisar con los 50; con 51, a revisar sin buscar y sin candidatos", () => {
    expect(run([line()], ctx({ values: many(50) }))).toEqual([{ kind: "review", lineId: "l1", reason: SEVERAL_VALUES, candidates: each(many(50).map((v) => v.id)) }]);
    expect(run([line()], ctx({ values: many(51) }))[0]).toEqual(expect.objectContaining({ kind: "review", candidates: [] }));
  });
  it("dos renglones del mismo importe y tres valores: los dos a revisar con los tres", () => {
    const out = run([line({ id: "A" }), line({ id: "B", order: 2 })], ctx({ values: many(3) }));
    expect(out).toEqual(["A", "B"].map((lineId) => ({ kind: "review", lineId, reason: SEVERAL_VALUES, candidates: [["v0"], ["v1"], ["v2"]] })));
  });
  it("sin ningún candidato en la ventana sigue pendiente, aunque haya valores del importe afuera o de otro importe", () => {
    const values = [...many(2, { voucherDate: "2026-06-01" }), val({ id: "other", amountCents: 100001 })];
    expect(run([line()], ctx({ values }))).toEqual([{ kind: "pending", lineId: "l1", reason: PENDING_THIRD_PARTY, marks: [] }]);
  });
  it("los candidatos son los de la ventana, en el orden del pedido: ni los de afuera, ni los de un CUIT que contradice, ni los ya apareados", () => {
    const values = [
      val({ id: "far", voucherDate: "2026-06-01" }),
      val({ id: "b", voucherDate: "2026-07-14" }),
      val({ id: "against", kind: "Cheque", drawerCuit: "27333333334" }),
      val({ id: "taken", number: "4512" }),
      val({ id: "a", voucherDate: "2026-07-08" }),
    ];
    const lines = [line({ id: "L", counterparty: X, type: { code: "cheque-pagado", source: "table" } }), line({ id: "N", order: 2, reference: "4512", date: "2026-06-01" })];
    expect(run(lines, ctx({ values }))[0]).toEqual({ kind: "review", lineId: "L", reason: SEVERAL_VALUES, candidates: [["b"], ["a"]] });
  });
  it("un valor que el renglón ve solo por una fecha secundaria también es candidato", () => {
    // Un valor recibido se ve por la fecha del depósito; los dos se depositaron en junio.
    const values = [val({ id: "v0", depositDate: "2026-06-01" }), val({ id: "v1", voucherDate: "2026-07-12", depositDate: "2026-06-02" })];
    expect(run([line()], ctx({ values }))[0]).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL_VALUES, candidates: [["v0"], ["v1"]] });
  });
  it("una transferencia de cuenta propia con dos valores en la ventana va a revisar, no a pendiente de cuentas propias", () => {
    const own = [{ id: "B", cbu: "1910000000000000000002", number: null }];
    const p = run([line({ counterparty: { cuit: null, name: null, cbu: "1910000000000000000002" } })], ctx({ values: many(2), ownAccounts: own }))[0];
    expect(p).toEqual({ kind: "review", lineId: "l1", reason: SEVERAL_VALUES, candidates: [["v0"], ["v1"]] });
  });
  it("sus valores no quedan en disputa: una suma de otro renglón todavía puede usar uno", () => {
    // L ve a (del 12) y b (del 6); el depósito D, del 16, ve a y c, no b, y suma a + c.
    const values = [val({ id: "a", voucherDate: "2026-07-12" }), val({ id: "b", voucherDate: "2026-07-06" }), val({ id: "c", amountCents: 50000, voucherDate: "2026-07-17" })];
    const lines = [line({ id: "L" }), line({ id: "D", order: 2, date: "2026-07-16", amountCents: 150000, type: { code: "deposito-cheques", source: "table" } })];
    const out = run(lines, ctx({ values }));
    expect(out[1]).toEqual(expect.objectContaining({ kind: "match", valueIds: ["a", "c"] }));
    // Lo que quedó abierto sigue siendo del renglón: un pendiente diría que no hay valor.
    expect(out[0]).toEqual({ kind: "review", lineId: "L", reason: SEVERAL_VALUES, candidates: [["b"]] });
  });
  it("si todos sus candidatos se usaron en otra pasada, queda pendiente", () => {
    // L ve a (del 12) y b (del 8); D, del 16, suma a + c; E, del 4, suma b + e.
    const values = [val({ id: "a", voucherDate: "2026-07-12" }), val({ id: "b", voucherDate: "2026-07-08" }), val({ id: "c", amountCents: 50000, voucherDate: "2026-07-17" }), val({ id: "e", amountCents: 50000, voucherDate: "2026-07-03" })];
    const deposit = (id: string, date: string, order: number) => line({ id, order, date, amountCents: 150000, type: { code: "deposito-cheques", source: "table" } });
    const out = run([line({ id: "L" }), deposit("D", "2026-07-16", 2), deposit("E", "2026-07-04", 3)], ctx({ values }));
    expect(out.slice(1).map((p) => p.kind === "match" && p.valueIds)).toEqual([["a", "c"], ["b", "e"]]);
    expect(out[0]).toEqual({ kind: "pending", lineId: "L", reason: PENDING_THIRD_PARTY, marks: [] });
  });
  it("pasado el plazo, va a revisar por tiempo y no por sus candidatos", () => {
    let n = 0;
    const options = { now: () => (++n >= 2 ? 1e12 : 0), budgetMsPerLine: 2000, budgetMsTotal: 6000 };
    const lines = Array.from({ length: 1100 }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 1000 + i }));
    const values = lines.flatMap((l, i) => [val({ id: `v${i}`, amountCents: l.amountCents }), val({ id: `w${i}`, amountCents: l.amountCents })]);
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, options).proposals;
    expect(out.every((p) => p.kind === "review" && p.reason.startsWith("No se terminó de buscar") && p.candidates.length === 0)).toBe(true);
  });
});

describe("reconcile: el plazo y los topes, en los bordes", () => {
  const TIMED_OUT = "No se terminó de buscar: el apareo pasó el tiempo disponible. Hay que revisarlo a mano.";
  const OVER_BUDGET = "La búsqueda de una suma de valores pasó el tiempo disponible: hay que revisarlo a mano.";
  const SPLIT_CUT = "La búsqueda de una suma de renglones pasó el tiempo disponible: hay que revisarlo a mano.";
  const SPLIT_POOL = "No se buscó una suma de renglones: el día tiene más de 40 del mismo grupo. Hay que revisarlo a mano.";
  const CROWDED = "No se pudo buscar un valor único: hay más de 50 del mismo importe que podrían ser de este renglón. Hay que revisarlo a mano.";
  const t = (code: string) => ({ code, source: "table" as const });
  const FCI = t("fci-rescate");
  const unsearched = (lineId: string, reason: string) => ({ kind: "review", lineId, reason, candidates: [] });
  const clock = (step: number) => {
    let n = 0;
    return () => (n += step);
  };

  it("el plazo pasa cuando el reloj lo supera, no cuando lo alcanza", () => {
    const lines = Array.from({ length: 1100 }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 1000 + i }));
    const values = lines.map((l, i) => val({ id: `v${i}`, amountCents: l.amountCents }));
    let n = 0;
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: () => (++n === 1 ? 0 : 6000), budgetMsPerLine: 2000, budgetMsTotal: 6000 }).proposals;
    expect(out.every((p) => p.kind === "match")).toBe(true);
  });
  it("vencido el plazo en la pasada 5, no aparea lo que ya encontró ni manda a revisar lo que no miró", () => {
    // X aparea su boleta antes de que D gaste el plazo; Y, después, tendría dos boletas.
    const values = [
      val({ id: "x1", amountCents: 3000, depositId: "BX" }), val({ id: "x2", amountCents: 7000, depositId: "BX" }),
      ...Array.from({ length: 40 }, (_, i) => val({ id: `w${i}`, amountCents: 1000 + i, voucherDate: "2026-07-01" })),
      val({ id: "y1", amountCents: 12000, depositId: "B1" }), val({ id: "y2", amountCents: 8000, depositId: "B1" }), val({ id: "y3", amountCents: 15000, depositId: "B2" }), val({ id: "y4", amountCents: 5000, depositId: "B2" }),
    ];
    const lines = [line({ id: "X", amountCents: 10000 }), line({ id: "D", amountCents: 20_001, date: "2026-07-01", type: t("deposito-cheques") }), line({ id: "Y", amountCents: 20000, order: 3 })];
    const go = (budgetMsTotal: number) => reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal }).proposals;
    expect(go(1e9).map((p) => (p.kind === "review" ? p.reason : p.kind))).toEqual(["match", OVER_BUDGET, "Hay más de una combinación de valores que suma el importe."]);
    expect(go(100)).toEqual([unsearched("X", TIMED_OUT), { kind: "review", lineId: "D", reason: OVER_BUDGET, candidates: [] }, unsearched("Y", TIMED_OUT)]);
  });
  it("vencido el plazo en la pasada 6, los renglones que mirarían los valores siguientes van a revisar por tiempo", () => {
    // La búsqueda de v2 vence el plazo; v3 agruparía c y d, otro día.
    const lines = [line({ id: "a", amountCents: 60000, type: FCI }), line({ id: "b", amountCents: 40000, type: FCI }), line({ id: "c", amountCents: 7000, date: "2026-07-20", type: FCI }), line({ id: "d", amountCents: 3000, date: "2026-07-20", type: FCI })];
    const values = [val({ id: "v2", amountCents: 50000 }), val({ id: "v3", amountCents: 10000, voucherDate: "2026-07-20" })];
    const out = reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: clock(1), budgetMsPerLine: 1000, budgetMsTotal: 1 }).proposals;
    expect(out).toEqual([unsearched("a", SPLIT_CUT), unsearched("b", SPLIT_CUT), unsearched("c", TIMED_OUT), unsearched("d", TIMED_OUT)]);
  });
  it("vencido en una pasada de intercambiables con un solo grupo grande, el grupo no se empareja", () => {
    // 1.100 renglones y 1.100 valores del mismo importe y del mismo día: cada renglón tiene demasiados candidatos y solo
    // los intercambiables los aparean. El plazo vence en la k-ésima mirada del reloj; en ninguna se empareja a medias.
    const lines = Array.from({ length: 1100 }, (_, i) => line({ id: `r${i}`, order: i + 1 }));
    const values = lines.map((_, i) => val({ id: `v${i}` }));
    const outs = Array.from({ length: 40 }, (_, k) => {
      let n = 0;
      return reconcile({ lines, context: ctx({ values }), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: () => (++n >= k + 50 ? 1e12 : 0), budgetMsPerLine: 2000, budgetMsTotal: 6000 }).proposals;
    });
    for (const out of outs) expect(new Set(out.map((p) => p.kind)).size).toBe(1);
    expect(outs.some((out) => out[0].kind === "match")).toBe(true);
    expect(outs.some((out) => out[0].kind === "review")).toBe(true);
  });
  it("con dos motivos para no buscar, gana el primero", () => {
    // Un depósito con 210 valores del mismo importe en la ventana: no compite por un único (pasada 2) ni suma (pasada 5).
    const values = Array.from({ length: 210 }, (_, i) => val({ id: `v${i}`, amountCents: 1000 }));
    expect(run([line({ amountCents: 1000, type: t("deposito-cheques") })], ctx({ values }))).toEqual([unsearched("l1", CROWDED)]);
  });
  it("el número del valor tiene que terminar en el del renglón, no solo compartir los últimos dígitos", () => {
    const p = run([line({ reference: "14512" })], ctx({ values: [val({ number: "24512" })] }))[0];
    expect(p).toEqual(expect.objectContaining({ kind: "match", confidence: "grounded" }));
  });
  it("con 50 valores del mismo número e importe, el número no aparea pero tampoco es demasiado", () => {
    const values = Array.from({ length: 50 }, (_, i) => val({ id: `v${i}`, number: "4512", voucherDate: "2026-05-01" }));
    expect(run([line({ reference: "4512" })], ctx({ values }))[0]).toEqual(expect.objectContaining({ kind: "pending" }));
  });
  it("las vueltas del punto fijo también vuelven a mirar los candidatos por número", () => {
    // L ve por número a v1 y v2; M solo a v1 y se lo lleva; en la vuelta siguiente, L se queda con v2. Los dos lejos de toda ventana.
    const values = [val({ id: "v1", number: "14512", voucherDate: "2026-04-01" }), val({ id: "v2", number: "4512", voucherDate: "2026-04-02" })];
    const out = run([line({ id: "L", reference: "4512" }), line({ id: "M", reference: "14512" })], ctx({ values }));
    expect(out.map((p) => (p.kind === "match" ? [p.lineId, p.valueIds[0], p.confidence] : p.kind))).toEqual([["L", "v2", "verified"], ["M", "v1", "verified"]]);
  });
  it("los candidatos de una revisión van en el orden del pedido, no en el de las fechas", () => {
    // A y B disputan v1; L ve v2 (del 15, primero en el pedido) y v1 (del 5).
    const lines = [line({ id: "A", date: "2026-07-01" }), line({ id: "B", date: "2026-07-02" }), line({ id: "L", date: "2026-07-10" })];
    const values = [val({ id: "v2", voucherDate: "2026-07-15" }), val({ id: "v1", voucherDate: "2026-07-05" })];
    expect(run(lines, ctx({ values }))[2]).toEqual({ kind: "review", lineId: "L", reason: "Más de un renglón coincide con el mismo valor.", candidates: [["v2"], ["v1"]] });
  });
  it("un renglón con demasiados candidatos no va a revisar por un valor en disputa que no ve", () => {
    // x e y disputan far por número, en marzo; L ve 52 valores de julio.
    const values = [val({ id: "far", number: "4512", voucherDate: "2026-03-01" }), ...Array.from({ length: 52 }, (_, i) => val({ id: `v${i}` }))];
    const lines = [line({ id: "x", reference: "4512", date: "2026-03-01" }), line({ id: "y", reference: "4512", date: "2026-03-02" }), line({ id: "L" })];
    expect(run(lines, ctx({ values }))[2]).toEqual(unsearched("L", CROWDED));
  });
  it("el tope del grupo del día: con 40 se busca, y si no suma queda pendiente", () => {
    const day = [fci("a", 60000), fci("b", 40000), ...Array.from({ length: 38 }, (_, i) => fci(`z${i}`, 1))];
    expect(run(day, ctx({ values: [val({ amountCents: 99999 })] })).slice(0, 2).map((p) => p.kind)).toEqual(["pending", "pending"]);
  });
  it("cada día que pasa el tope va a revisar, aunque haya otro antes", () => {
    const day = (d: string, p: string) => Array.from({ length: 41 }, (_, i) => fci(`${p}${i}`, 1, { date: d }));
    const values = [val({ id: "w1", amountCents: 100000, voucherDate: "2026-07-01" }), val({ id: "w2", amountCents: 100000, voucherDate: "2026-07-20" })];
    const out = run([...day("2026-07-01", "a"), ...day("2026-07-20", "b")], ctx({ values }));
    expect(out.every((p) => p.kind === "review" && p.reason === SPLIT_POOL)).toBe(true);
  });
  it("un grupo que pasa el tope con un solo renglón del signo del valor no va a revisar: no había nada que sumar", () => {
    const lines = [fci("a", 60000), ...Array.from({ length: 41 }, (_, i) => fci(`z${i}`, -1))];
    expect(run(lines, ctx({ values: [val({ amountCents: 100000 })] }))[0]).toEqual(expect.objectContaining({ kind: "pending" }));
  });
  const fci = (id: string, amountCents: number, over = {}) => line({ id, amountCents, type: FCI, ...over });
});

describe("reconcile abre los pendientes", () => {
  it("un renglón de comisión sin valor sale dbg; uno de transferencia sin valor, pendiente", () => {
    const out = reconcile({ lines: [line({ id: "c", type: { code: "comision", source: "table" }, amountCents: -1000 }), line({ id: "t", amountCents: 5000 })], context: ctx(), batches: [], readingWarning: false, bankCode: "191", decisions: [] }).proposals;
    expect(out.map((p) => p.kind)).toEqual(["dbg", "pending"]);
  });
  it("el techo vencido no abre nada: todo a revisar por tiempo", () => {
    let t = 0;
    const out = reconcile({ lines: [line({ id: "c", type: { code: "comision", source: "table" }, amountCents: -1000 })], context: ctx(), batches: [], readingWarning: false, bankCode: "191", decisions: [] }, { now: () => (t += 10_000), budgetMsPerLine: 1, budgetMsTotal: 1 }).proposals;
    expect(out[0].kind).toBe("review");
  });
});
