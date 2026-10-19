import { buildWarnings, type CheckInput } from "../src/checks";
import type { Judgement } from "../src/judge";
import type { StatementHeader, StatementLine } from "../src/types";

// Todo inventado. Se leyeron dos renglones de una lectura cortada.
const line = (order: number, amountCents: number, balanceCents: number, date: string): StatementLine => ({
  id: `L${order}`, order, date, valueDate: null, type: { code: "otro", source: "catalog" } as unknown as StatementLine["type"],
  amountCents, balanceCents, reference: null, counterparty: null, bank: { code: null, text: "x", extras: [] }, chains: order === 1 ? null : true,
  provenance: { origin: "pdf", sheet: null, page: 1, pageTo: 1, fromRow: 0, toRow: 0 },
});
const lines = [line(1, 10000, 110000, "2026-07-01"), line(2, 10000, 120000, "2026-07-28")];
const header = (closingBalanceCents: number): StatementHeader => ({
  bankCode: "191", bankName: "B", account: null, cbu: null, currency: "Pesos", periodFrom: "2026-07-01", periodTo: "2026-07-28", openingBalanceCents: 100000, closingBalanceCents,
});
const judgement = (closingCents: number | null) => ({ checked: 2, rows: { checkpoints: [] }, balanceIs: "after", openingCents: 100000, closingCents }) as unknown as Judgement;

// El saldo final impreso en la página 1 (200000) no es el inicial más los renglones leídos.
const impresoEnLaPrimera = (partial: boolean): CheckInput => ({
  judgement: judgement(200000), lines, header: header(200000), account: undefined, fileCbus: [], accounts: [], hasLabeledBalanceColumn: true, partial,
});
// El corte cae en los últimos cinco días del período de ProntoNet: el último renglón leído pasa por el fin del extracto.
const conProntoNet = (partial: boolean, saldos = true): CheckInput => ({
  judgement: judgement(null), lines, header: saldos ? header(120000) : { ...header(120000), closingBalanceCents: null },
  account: { openingBalance: 1000, closingBalance: 2000, periodFrom: "2026-07-01", periodTo: "2026-07-31" },
  fileCbus: [], accounts: [], hasLabeledBalanceColumn: true, partial,
});

describe("buildWarnings: el aviso no-cierra", () => {
  it("con la lectura entera, el de los saldos propios y los de ProntoNet salen", () => {
    expect(buildWarnings(impresoEnLaPrimera(false)).warnings.map((w) => w.detail)).toEqual([
      "El saldo inicial más los renglones da $ 1.200,00, y el saldo final es $ 2.000,00: hay una diferencia de $ 800,00.",
    ]);
    expect(buildWarnings(conProntoNet(false)).warnings.map((w) => w.detail)).toEqual([
      "Los saldos del archivo ($ 1.000,00 y $ 1.200,00) no son los del resumen de ProntoNet ($ 1.000,00 y $ 2.000,00).",
    ]);
    expect(buildWarnings({ ...conProntoNet(false, false), header: { ...header(120000), openingBalanceCents: null } }).warnings.map((w) => w.detail)).toEqual([
      "Partiendo del saldo inicial de ProntoNet y sumando los renglones se llega a $ 1.200,00, no a $ 2.000,00: hay una diferencia de $ 800,00.",
    ]);
  });

  // Los renglones que faltan pueden ser la diferencia: no hay con qué afirmar que no cierra, y el detalle
  // imprimiría un saldo que la lectura pública oculta. lectura-parcial ya frena las propuestas.
  it("con la lectura parcial no sale ninguno de los tres", () => {
    expect(buildWarnings(impresoEnLaPrimera(true)).warnings).toEqual([]);
    expect(buildWarnings(conProntoNet(true)).warnings).toEqual([]);
    expect(buildWarnings({ ...conProntoNet(true, false), header: { ...header(120000), openingBalanceCents: null } }).warnings).toEqual([]);
  });

  it("con la lectura parcial, los otros avisos salen igual", () => {
    const cuentaDistinta = { ...impresoEnLaPrimera(true), account: { cbu: "1910000000000000000001" }, fileCbus: ["1910000000000000000002"] };
    expect(buildWarnings(cuentaDistinta).warnings.map((w) => w.code)).toEqual(["cuenta-distinta"]);
  });
});
