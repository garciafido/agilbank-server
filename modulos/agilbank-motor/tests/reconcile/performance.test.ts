import { reconcile } from "../../src/reconcile/reconcile";
import { line, val } from "./fixtures";

it("1.500 renglones y 20.000 valores en menos de 10 s, con importes repetidos", () => {
  const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, amountCents: -((i % 300) + 1) * 1000, date: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}`, reference: i % 3 === 0 ? String(100000 + i) : null }));
  const values = Array.from({ length: 20000 }, (_, i) => val({ id: `v${i}`, amountCents: -((i % 400) + 1) * 1000, number: i % 3 === 0 ? String(100000 + i) : null, voucherDate: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}` }));
  const t0 = Date.now();
  const out = reconcile({ lines, context: { lineIds: null, values, parties: [], ownAccounts: [], batchIds: [], windowDays: 5, catalogs: null, history: [] }, batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals;
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(out).toHaveLength(1500);
}, 20_000);

/** Un día de 54 renglones: 8 rescates, 6 suscripciones, 3 cuotas con 11 partes, 10 gastos e impuestos y 16 transferencias. */
const DAY = [
  ...Array(8).fill("fci-rescate"), ...Array(6).fill("fci-suscripcion"),
  "leasing", "leasing", "prestamo", "intereses", "intereses", "iva", "iva", "iva", "percepcion-iva", "percepcion-iva", "comision", "comision", "sellos", "debito-automatico",
  "impuesto-debitos", "impuesto-debitos", "impuesto-debitos", "pago-servicio", "pago-servicio", "impuesto-creditos", "impuesto-creditos", "pago-arca", "pago-arca", "sircreb",
  ...Array(16).fill("transferencia-recibida"),
];

it("1.500 renglones de FCI, cuotas y gastos densos contra 20.000 valores: en menos de 10 s y con una respuesta chica", () => {
  // Medido el 15-10-2026: 2,7–3,9 s con jest y 0,6 s en node; 0,19 MB de JSON y a lo sumo 2 candidatos por renglón.
  const lines = Array.from({ length: 1500 }, (_, i) => {
    const code = DAY[i % DAY.length];
    const sign = code === "fci-rescate" || code === "transferencia-recibida" ? 1 : -1;
    return line({ id: `r${i}`, amountCents: sign * (((i * 7919) % 3000) + 1) * 100, date: `2026-07-${String(1 + (Math.floor(i / DAY.length) % 28)).padStart(2, "0")}`, type: { code, source: "table" } });
  });
  const values = Array.from({ length: 20000 }, (_, i) => val({ id: `v${i}`, amountCents: (i % 2 ? -1 : 1) * (((i * 104729) % 6000) + 1) * 100, voucherDate: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}` }));
  const t0 = Date.now();
  const out = reconcile({ lines, context: { lineIds: null, values, parties: [], ownAccounts: [], batchIds: [], windowDays: 5, catalogs: null, history: [] }, batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals;
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(out).toHaveLength(1500);
  expect(out.some((p) => p.kind === "review")).toBe(true);
  expect(Math.max(...out.map((p) => (p.kind === "review" ? p.candidates.length : 0)))).toBeLessThanOrEqual(2);
  expect(JSON.stringify(out).length).toBeLessThan(1_000_000);
}, 20_000);

it("con ventanaDias 31: 1.500 depósitos contra 20.000 valores con sus tres fechas, en menos de 10 s", () => {
  const day = (i: number) => `2026-07-${String(1 + (i % 28)).padStart(2, "0")}`;
  const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, amountCents: (((i * 7919) % 3000) + 1) * 100, date: day(i), type: { code: "deposito-cheques", source: "table" } }));
  const values = Array.from({ length: 20000 }, (_, i) => val({ id: `v${i}`, amountCents: (((i * 104729) % 6000) + 1) * 100, voucherDate: day(i), valueDate: day(i + 3), depositDate: day(i + 7) }));
  const t0 = Date.now();
  const out = reconcile({ lines, context: { lineIds: null, values, parties: [], ownAccounts: [], batchIds: [], windowDays: 31, catalogs: null, history: [] }, batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals;
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(out).toHaveLength(1500);
}, 30_000);

describe("los casos que el revisor midió por encima de un minuto", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 6, 1) + n * 86_400_000).toISOString().slice(0, 10);
  const ctx = (values: ReturnType<typeof val>[], windowDays = 5) => ({ lineIds: null, values, parties: [], ownAccounts: [], batchIds: [], windowDays, catalogs: null, history: [] });
  const timed = <T>(f: () => T): { out: T; ms: number } => {
    const t0 = Date.now();
    const out = f();
    return { out, ms: Date.now() - t0 };
  };
  const CROWDED = "No se pudo buscar un valor único: hay más de 50 del mismo importe que podrían ser de este renglón. Hay que revisarlo a mano.";
  const TIMED_OUT = "No se terminó de buscar: el apareo pasó el tiempo disponible. Hay que revisarlo a mano.";

  it("1.500 renglones y 20.000 valores del mismo importe, todos fuera de la ventana: en menos de 10 s, ningún apareo y cada comisión sale DBG", () => {
    // Medido el 15-10-2026: 66,7 s en node antes del índice por día; 0,16 s después.
    const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, order: i + 1, date: day(i % 28), amountCents: -5000, type: { code: "comision", source: "table" } }));
    const values = Array.from({ length: 20000 }, (_, i) => val({ id: `v${i}`, amountCents: -5000, voucherDate: day(400 + (i % 200)) }));
    const { out, ms } = timed(() => reconcile({ lines, context: ctx(values), batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals);
    expect(ms).toBeLessThan(10_000);
    expect(out.map((p) => [p.lineId, p.kind])).toEqual(lines.map((l) => [l.id, "dbg"]));
  }, 30_000);

  it("1.500 renglones y 20.000 valores del mismo importe en la ventana: en menos de 10 s, ningún apareo y todos a revisar porque no puede haber un único", () => {
    const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, order: i + 1, date: day(i % 28), amountCents: -5000 }));
    const values = Array.from({ length: 20000 }, (_, i) => val({ id: `v${i}`, amountCents: -5000, voucherDate: day(i % 28), valueDate: day(i % 30), depositDate: day(i % 29) }));
    const { out, ms } = timed(() => reconcile({ lines, context: ctx(values, 31), batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals);
    expect(ms).toBeLessThan(10_000);
    expect(out).toEqual(lines.map((l) => ({ kind: "review", lineId: l.id, reason: CROWDED, candidates: [] })));
  }, 30_000);

  it("1.500 renglones del mismo importe que ven 50 valores cada uno: en menos de 10 s, todos a revisar con los 50 y con una respuesta de menos de 1 MB", () => {
    const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, order: i + 1, date: day(0), amountCents: -5000 }));
    const values = Array.from({ length: 50 }, (_, i) => val({ id: `v${i}`, amountCents: -5000, voucherDate: day(0) }));
    const { out, ms } = timed(() => reconcile({ lines, context: ctx(values), batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals);
    expect(ms).toBeLessThan(10_000);
    expect(out.every((p) => p.kind === "review" && p.candidates.length === 50)).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThan(1_000_000);
  }, 30_000);

  /** Cada renglón ve dos valores, y cada vuelta del punto fijo libera al siguiente: la cuenta era cúbica. */
  const ladder = (n: number) => ({
    lines: Array.from({ length: n }, (_, i) => line({ id: `L${i}`, order: i + 1, date: day(2 * i), amountCents: -5000 })),
    values: Array.from({ length: n }, (_, i) => val({ id: `v${i}`, amountCents: -5000, voucherDate: day(2 * i + 1) })),
  });
  it("una escalera de 1.500 renglones de un importe: en menos de 10 s, y cada renglón con su valor", () => {
    // Medido el 15-10-2026: 800 renglones, 165 s en node antes; 1.500, 0,7 s después.
    const { lines, values } = ladder(1500);
    const { out, ms } = timed(() => reconcile({ lines, context: ctx(values, 1), batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals);
    expect(ms).toBeLessThan(10_000);
    expect(out.map((p) => (p.kind === "match" ? p.valueIds : p.kind))).toEqual(lines.map((_, i) => [`v${i}`]));
  }, 30_000);

  it("con el plazo vencido a mitad de la escalera: en menos de 10 s, lo apareado es correcto y el resto va a revisar por tiempo", () => {
    const { lines, values } = ladder(1500);
    const { out, ms } = timed(() => reconcile({ lines, context: ctx(values, 1), batches: [], readingWarning: false, bankCode: null, decisions: [] }, { now: Date.now, budgetMsPerLine: 2000, budgetMsTotal: 1 }).proposals);
    expect(ms).toBeLessThan(10_000);
    for (const [i, p] of out.entries()) {
      if (p.kind === "match") expect(p.valueIds).toEqual([`v${i}`]);
      else expect(p).toEqual({ kind: "review", lineId: `L${i}`, reason: TIMED_OUT, candidates: [] });
    }
    expect(out.some((p) => p.kind === "review")).toBe(true);
  }, 30_000);

  it("16 MB de cuentas propias contra 1.500 renglones con CBU: en menos de 2 s, porque no se recorren las cuentas por renglón", () => {
    // Medido el 15-10-2026: 450.000 cuentas, 11,5 s en node antes del Set; 0,13 s después. Un renglón que no es de una
    // cuenta propia es el caso caro: había que mirar todas.
    const ownAccounts = Array.from({ length: 380_000 }, (_, i) => ({ id: String(i), cbu: String(1e21 + i), number: null }));
    const lines = Array.from({ length: 1500 }, (_, i) => line({ id: `r${i}`, order: i + 1, amountCents: 100 + i, counterparty: { cuit: null, name: null, cbu: String(1e21 + (i % 10 ? 1e6 + i : i)) } }));
    const { out, ms } = timed(() => reconcile({ lines, context: { ...ctx([]), ownAccounts }, batches: [], readingWarning: false, bankCode: null, decisions: [] }).proposals);
    expect(ms).toBeLessThan(2_000);
    expect(out.map((p) => p.kind === "pending" && p.marks)).toEqual(lines.map((_, i) => (i % 10 ? [] : ["own-accounts"])));
  }, 60_000);
});

it("los DBG con todos los topes: 1.500 renglones de banco, 10.000 cuentas, 5.000 de historia y 5.000 decisiones, en menos de 2 s", () => {
  // Medido el 16-10-2026: 23,9 s antes, porque el par del catálogo se buscaba normalizando las 10.000 cuentas en cada grupo.
  // El caso caro: ni la historia (sus cuentas no están en el catálogo) ni las decisiones (su tipo tampoco) dan el par.
  const BANK = ["comision", "iva", "percepcion-iva", "intereses", "sellos", "impuesto-debitos", "impuesto-creditos", "sircreb", "recaudacion-iibb", "percepcion-iibb", "impuesto-25413", "devolucion-impuesto"];
  const day = (i: number) => `2026-07-${String(1 + (i % 28)).padStart(2, "0")}`;
  const lines = Array.from({ length: 1500 }, (_, i) => {
    const code = BANK[i % BANK.length];
    return line({ id: `r${i}`, order: i + 1, date: day(Math.floor(i / 50)), amountCents: (code === "devolucion-impuesto" ? 1 : -1) * (((i * 7919) % 3000) + 1) * 100, type: { code, source: "table" }, bank: { code: String(i % 40), text: `CONCEPTO ${code} ${i % 7}`, extras: [] } });
  });
  const WORDS = ["COMISIONES", "INTERESES", "SELLOS", "IMP DEB Y CRED", "IIBB", "SIRCREB", "GASTOS", "VARIOS"];
  const catalogs = {
    movementTypes: Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, description: `Tipo de gasto ${i}`, coefficient: (i % 2 ? -1 : 1) as 1 | -1 })),
    accounts: Array.from({ length: 9900 }, (_, i) => ({ id: `a${i}`, code: String(990_000 + i), description: `${WORDS[i % WORDS.length]} CUENTA ${i}` })),
    taxAccounts: Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, code: String(980_000 + i), description: i % 2 ? `PERCEPCION IVA ${i}` : `IVA CREDITO ${i}` })),
  };
  const history = Array.from({ length: 5000 }, (_, i) => ({ id: `h${i}`, date: day(i), movementType: `Tipo de gasto ${(i % 50) * 2}`, coefficient: 1 as const, amountCents: 1000 + i, vatCents: i % 3 ? 0 : 210, perceptionCents: 0, accountCode: String(970_000 + i), accountName: `${WORDS[i % WORDS.length]} CUENTA`, detail: null }));
  const decisions = Array.from({ length: 5000 }, (_, i) => ({
    lineRef: `S${i % 50}:r${i}`, conceptKey: `|${i % 40}|concepto ${BANK[i % BANK.length].replace(/-/g, " ")}`, result: (i % 5 ? "corrected" : "rejected") as "corrected" | "rejected",
    proposedKind: "dbg" as const, proposedPair: { movementTypeId: "t999", accountId: `a${i % 9900}`, vatAccountId: null, perceptionAccountId: null },
    chosenKind: (i % 11 ? "dbg" : "pending") as "dbg" | "pending", chosenPair: { movementTypeId: "t999", accountId: `a${(i * 31) % 9900}`, vatAccountId: `x${i % 100}`, perceptionAccountId: null }, decidedAt: day(i),
  }));
  const t0 = Date.now();
  const out = reconcile({ lines, context: { lineIds: null, values: [], parties: [], ownAccounts: [], batchIds: [], windowDays: 5, catalogs, history }, batches: [], readingWarning: false, bankCode: null, decisions }).proposals;
  expect(Date.now() - t0).toBeLessThan(2_000);
  expect(out).toHaveLength(1500);
  expect(out.filter((p) => p.kind === "dbg").length).toBeGreaterThan(1000);
}, 60_000);
