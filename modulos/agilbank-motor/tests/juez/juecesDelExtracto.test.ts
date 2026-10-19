import { contextoDelExtracto, dictaminarExtracto, juecesDelExtracto, lecturaDelExtracto } from "../../src/juez/juecesDelExtracto";
import { readStatement } from "../../src/readStatement";
import type { StatementLine, StatementReading } from "../../src/types";

// Todo inventado: los CBU, los importes y los conceptos no son de ninguna cuenta.
const linea = (id: string, order: number, amountCents: number, balanceCents: number | null, chains: boolean | null): StatementLine => ({
  id, order, date: `2026-07-${String(order).padStart(2, "0")}`, valueDate: null,
  type: { code: "comision", source: "table" } as StatementLine["type"],
  amountCents, balanceCents, reference: null, counterparty: null, bank: { code: null, text: "X", extras: [] }, chains,
  provenance: { origin: "text", sheet: null, page: null, pageTo: null, fromRow: order, toRow: order },
});

// Las dos puntas impresas: una que no lo está sale de un saldo de renglón y no es un campo de la Lectura.
const lectura = (lines: StatementLine[], over: Partial<StatementReading> = {}): StatementReading => {
  const cierre = 1000 + lines.reduce((s, l) => s + l.amountCents, 0);
  return {
    fingerprint: "f", verdict: "verified", reason: null,
    header: { bankCode: "191", bankName: null, account: null, cbu: "1910000000000000000000", currency: null, periodFrom: "2026-07-01", periodTo: "2026-07-31", openingBalanceCents: 1000, closingBalanceCents: cierre },
    lines, warnings: [],
    checks: { direction: "chronological", balanceIs: "after", linesWithBalance: lines.length, linesThatChain: lines.filter((l) => l.chains).length, closesWithOwnBalances: true, closesWithProntoNet: null, printedBalances: { openingCents: 1000, closingCents: cierre }, lineBalances: { openingCents: null, closingCents: null } },
    ...over,
  } as StatementReading;
};
const sinImpresos = { printedBalances: { openingCents: null, closingCents: null } };

const conChecks = (r: StatementReading, checks: Partial<NonNullable<StatementReading["checks"]>>): StatementReading => ({ ...r, checks: { ...r.checks!, ...checks } });
const conHeader = (r: StatementReading, header: Partial<NonNullable<StatementReading["header"]>>): StatementReading => ({ ...r, header: { ...r.header!, ...header } });
const dictamen = (r: StatementReading) => dictaminarExtracto(r, { estricto: true });
const delJuez = (r: StatementReading, juez: string) => dictamen(r).controles.filter((c) => c.juez === juez);
const control = (r: StatementReading, id: string) => dictamen(r).controles.find((c) => c.id === id)!;

describe("la Lectura del extracto", () => {
  it("los saldos de punta, los movimientos y los saldos de renglón en centavos, con la moneda del encabezado o ARS", () => {
    const l = lecturaDelExtracto(lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, null, null)]));
    const campo = (id: string) => l.campos.find((c) => c.id === id);
    expect(campo("saldoInicial")).toEqual({ id: "saldoInicial", valor: { tipo: "centavos", valor: 1000, moneda: "ARS" }, veredicto: "grounded" });
    expect(campo("saldoFinal")!.valor).toEqual({ tipo: "centavos", valor: 850, moneda: "ARS" });
    expect(campo("saldo:L1")).toEqual({ id: "saldo:L1", valor: { tipo: "centavos", valor: 900, moneda: "ARS" }, veredicto: "grounded" });
    expect(campo("saldo:L2")).toBeUndefined();
    expect(l.listas).toEqual([{
      id: "movimientos",
      elementos: [
        { id: "L1", valor: { tipo: "centavos", valor: -100, moneda: "ARS" }, veredicto: "grounded" },
        { id: "L2", valor: { tipo: "centavos", valor: -50, moneda: "ARS" }, veredicto: "grounded" },
      ],
    }]);
    const enDolares = lecturaDelExtracto(conHeader(lectura([linea("L1", 1, -100, 900, true)]), { currency: "USD" }));
    expect(enDolares.campos.concat(enDolares.listas[0].elementos).filter((c) => c.valor?.tipo === "centavos").map((c) => (c.valor as { moneda: string }).moneda)).toEqual(["USD", "USD", "USD", "USD"]);
  });

  it("los movimientos van en el orden del extracto aunque lleguen desordenados", () => {
    const l = lecturaDelExtracto(lectura([linea("L2", 2, -50, 850, true), linea("L1", 1, -100, 900, true)]));
    expect(l.listas[0].elementos.map((e) => e.id)).toEqual(["L1", "L2"]);
  });

  it("los datos de la cuenta como texto y el período como fecha; lo ausente, vacío y abstained", () => {
    const l = lecturaDelExtracto(conHeader(lectura([]), { account: "123-4", bankCode: null, periodTo: null, openingBalanceCents: null }));
    const campo = (id: string) => l.campos.find((c) => c.id === id);
    expect(campo("cbu")).toEqual({ id: "cbu", valor: { tipo: "texto", valor: "1910000000000000000000" }, veredicto: "grounded" });
    expect(campo("cuenta")).toEqual({ id: "cuenta", valor: { tipo: "texto", valor: "123-4" }, veredicto: "grounded" });
    expect(campo("banco")).toEqual({ id: "banco", valor: null, veredicto: "abstained" });
    expect(campo("periodoDesde")).toEqual({ id: "periodoDesde", valor: { tipo: "fecha", valor: "2026-07-01" }, veredicto: "grounded" });
    expect(campo("periodoHasta")).toEqual({ id: "periodoHasta", valor: null, veredicto: "abstained" });
    expect(campo("saldoInicial")).toEqual({ id: "saldoInicial", valor: null, veredicto: "abstained" });
    expect(l.campos.map((c) => c.id).sort()).toEqual(["banco", "cbu", "cuenta", "periodoDesde", "periodoHasta", "saldoFinal", "saldoInicial"]);
  });

  it("una punta que no está impresa sale de un saldo de renglón: no es un campo propio", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 850, true)]);
    const puntas = (x: StatementReading) => lecturaDelExtracto(x).campos.filter((c) => !["cbu", "cuenta", "banco", "periodoDesde", "periodoHasta"].includes(c.id)).map((c) => c.id);
    expect(puntas(conChecks(r, { printedBalances: { openingCents: null, closingCents: 850 } }))).toEqual(["saldoFinal", "saldo:L1", "saldo:L2"]);
    expect(puntas(conChecks(r, { printedBalances: { openingCents: 1000, closingCents: null } }))).toEqual(["saldoInicial", "saldo:L1", "saldo:L2"]);
    expect(puntas(conChecks(r, sinImpresos))).toEqual(["saldo:L1", "saldo:L2"]);
    expect(puntas({ ...r, checks: null })).toEqual(["saldoInicial", "saldoFinal", "saldo:L1", "saldo:L2"]);
    const sinNada = conHeader(conChecks(r, sinImpresos), { openingBalanceCents: null, closingBalanceCents: null });
    expect(lecturaDelExtracto(sinNada).campos.filter((c) => c.id.startsWith("saldo") && !c.id.includes(":"))).toEqual([
      { id: "saldoInicial", valor: null, veredicto: "abstained" },
      { id: "saldoFinal", valor: null, veredicto: "abstained" },
    ]);
  });

  it("sin encabezado, solo la lista vacía", () => {
    const r = { fingerprint: "f", verdict: "abstained", reason: "x", header: null, lines: [], warnings: [], checks: null } as StatementReading;
    expect(lecturaDelExtracto(r)).toEqual({ campos: [], listas: [{ id: "movimientos", elementos: [] }] });
  });
});

describe("cadena de saldos", () => {
  it("un control por renglón con saldo, con su posición", () => {
    const d = dictaminarExtracto(lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 850, true)]), { estricto: true });
    const cs = d.controles.filter((c) => c.juez === "cadena-de-saldos");
    expect(cs.map((c) => [c.id, c.estado, c.posicion])).toEqual([
      ["saldo del renglón L1", "cierra", { informa: true, valor: { renglon: "L1" } }],
      ["saldo del renglón L2", "cierra", { informa: true, valor: { renglon: "L2" } }],
    ]);
  });

  it("el que encadena es verified, sin sospechosos ni faltas; el que no, weak; ninguno trae residuo", () => {
    const [l1, l2] = delJuez(lectura([linea("L1", 1, -100, 950, false), linea("L2", 2, -50, 900, true)]), "cadena-de-saldos");
    expect([l1.veredicto, l1.residuo, l1.motivo]).toEqual(["weak", null, "el saldo anterior más el movimiento no da el saldo del renglón"]);
    expect([l2.veredicto, l2.residuo, l2.sospechosos, l2.faltan, l2.motivo]).toEqual(["verified", null, { informa: false }, [], "el saldo anterior más el movimiento da el saldo del renglón"]);
  });

  it("las partes son el saldo de donde arranca, los movimientos del tramo y el saldo del renglón", () => {
    const cs = delJuez(lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 850, true)]), "cadena-de-saldos");
    expect(cs.map((c) => c.partes)).toEqual([["saldoInicial", "L1", "saldo:L1"], ["saldo:L1", "L2", "saldo:L2"]]);
  });

  it("los renglones sin saldo no tienen control: entran en el tramo del siguiente con saldo", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -20, null, null), linea("L3", 3, -30, 850, true)]);
    const cs = delJuez(r, "cadena-de-saldos");
    expect(cs.map((c) => [c.id, c.partes])).toEqual([
      ["saldo del renglón L1", ["saldoInicial", "L1", "saldo:L1"]],
      ["saldo del renglón L3", ["saldo:L1", "L2", "L3", "saldo:L3"]],
    ]);
  });

  it("el primer saldo sin saldo inicial es el ancla: no se controla, y el siguiente arranca de él", () => {
    const r = lectura([linea("L1", 1, -100, 900, null), linea("L2", 2, -50, 850, true)]);
    expect(delJuez(r, "cadena-de-saldos").map((c) => [c.id, c.partes])).toEqual([["saldo del renglón L2", ["saldo:L1", "L2", "saldo:L2"]]]);
  });

  it("con el saldo de antes, el tramo es el movimiento del renglón anterior", () => {
    const r = conChecks(lectura([linea("L1", 1, -100, 1000, true), linea("L2", 2, -50, 900, true)]), { balanceIs: "before" });
    expect(delJuez(r, "cadena-de-saldos").map((c) => c.partes)).toEqual([["saldoInicial", "saldo:L1"], ["saldo:L1", "L1", "saldo:L2"]]);
  });

  it("se rompe k y encadena k+1: el sospechoso es el importe k, o falta una fila", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 900, false), linea("L3", 3, -10, 890, true)]);
    const k = control(r, "saldo del renglón L2");
    expect(k.sospechosos).toEqual({ informa: true, valor: ["L2"] });
    expect(k.faltan).toContainEqual({ elementoDe: "movimientos" });
  });

  it("en el primer eslabón nada corrobora el saldo inicial: también es sospechoso", () => {
    const d = dictaminarExtracto(lectura([linea("L1", 1, -100, 950, false), linea("L2", 2, -50, 900, true)]), { estricto: true });
    const k = d.controles.find((c) => c.id === "saldo del renglón L1")!;
    expect(k.sospechosos).toEqual({ informa: true, valor: ["saldoInicial", "L1"] });
    expect(k.faltan).toContainEqual({ elementoDe: "movimientos" });
  });

  it("sin saldo inicial, el primer saldo de renglón es el ancla y queda sospechoso si el primer eslabón no encadena", () => {
    const r = lectura([linea("L1", 1, -100, 910, null), linea("L2", 2, -10, 890, false), linea("L3", 3, -20, 870, true)]);
    expect(control(r, "saldo del renglón L2").sospechosos).toEqual({ informa: true, valor: ["saldo:L1", "L2"] });
  });

  it("con renglones sin saldo, los sospechosos son todos los movimientos del tramo", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -20, null, null), linea("L3", 3, -30, 800, false), linea("L4", 4, -10, 790, true)]);
    const k = control(r, "saldo del renglón L3");
    expect(k.sospechosos).toEqual({ informa: true, valor: ["L2", "L3"] });
    expect(k.faltan).toEqual([{ elementoDe: "movimientos" }]);
  });

  it("con el saldo de antes y sin movimientos en el tramo, el sospechoso es el saldo de donde arranca", () => {
    const r = conChecks(lectura([linea("L1", 1, -100, 999, false), linea("L2", 2, -50, 899, true)]), { balanceIs: "before" });
    expect(control(r, "saldo del renglón L1").sospechosos).toEqual({ informa: true, valor: ["saldoInicial"] });
  });

  it("se rompen k y k+1: el sospechoso del k+1 es el saldo k", () => {
    const d = dictaminarExtracto(lectura([linea("L1", 1, -100, 950, false), linea("L2", 2, -50, 850, false)]), { estricto: true });
    expect(d.controles.find((c) => c.id === "saldo del renglón L2")!.sospechosos).toEqual({ informa: true, valor: ["saldo:L1"] });
  });

  it("se rompen k y k+1 y encadena k+2: el k+1 culpa al saldo k, no a su importe; el k no informa", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -10, 880, false), linea("L3", 3, -10, 880, false), linea("L4", 4, -10, 870, true)]);
    expect(control(r, "saldo del renglón L2").sospechosos).toEqual({ informa: false });
    const k1 = control(r, "saldo del renglón L3");
    expect(k1.sospechosos).toEqual({ informa: true, valor: ["saldo:L2"] });
    expect(k1.faltan).toEqual([]);
    expect(dictamen(r).sospechososPorInterseccion).toEqual(["saldo:L2"]);
  });

  it("el último que no encadena no tiene siguiente: no informa sospechosos", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 800, false)]);
    const k = control(r, "saldo del renglón L2");
    expect([k.sospechosos, k.faltan]).toEqual([{ informa: false }, []]);
  });

  it("en un extracto en orden inverso, el siguiente es el de la fecha posterior, no el de abajo", () => {
    const lines = [linea("L2", 1, -50, 900, true), linea("L1", 2, -100, 950, false)];
    const r = lectura(lines, { checks: { ...lectura(lines).checks!, direction: "reverse" } });
    const k = dictaminarExtracto(r, { estricto: true }).controles.find((c) => c.id === "saldo del renglón L1")!;
    expect(k.sospechosos).toEqual({ informa: true, valor: ["saldoInicial", "L1"] });
    expect(dictamen(r).controles.find((c) => c.id === "saldo del renglón L2")!.partes).toEqual(["saldo:L1", "L2", "saldo:L2"]);
  });

  it("en orden inverso, los renglones sin saldo entran en el tramo del de fecha posterior", () => {
    const lines = [linea("L3", 1, -30, 850, true), linea("L2", 2, -20, null, null), linea("L1", 3, -100, 900, true)];
    const r = conChecks(lectura(lines), { direction: "reverse" });
    expect(control(r, "saldo del renglón L3").partes).toEqual(["saldo:L1", "L2", "L3", "saldo:L3"]);
  });

  it("sin balanceIs se toma el saldo de después", () => {
    const r = conChecks(lectura([linea("L1", 1, -100, 900, true)]), { balanceIs: null });
    expect(control(r, "saldo del renglón L1").partes).toEqual(["saldoInicial", "L1", "saldo:L1"]);
  });
});

describe("saldos de punta", () => {
  it("su estado coincide con closesWithOwnBalances", () => {
    const ok = lectura([linea("L1", 1, -100, 900, true)]);
    expect(dictaminarExtracto(ok, { estricto: true }).controles.find((c) => c.id === "final = inicial + movimientos")!.estado).toBe("cierra");
    const mal = lectura([linea("L1", 1, -100, 900, true)], { header: { ...ok.header!, closingBalanceCents: 777 }, checks: { ...ok.checks!, closesWithOwnBalances: false } });
    expect(dictaminarExtracto(mal, { estricto: true }).controles.find((c) => c.id === "final = inicial + movimientos")!.estado).toBe("no-cierra");
  });

  it("el control de punta lleva los saldos y todos los movimientos, verified si cierra y el residuo si no", () => {
    const r = lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, 30, 930, true)]);
    const c = control(r, "final = inicial + movimientos");
    expect([c.juez, c.partes, c.veredicto, c.residuo]).toEqual(["saldos-de-punta", ["saldoFinal", "saldoInicial", "L1", "L2"], "verified", 0]);
    const mal = control(conHeader(r, { closingBalanceCents: 1000 }), "final = inicial + movimientos");
    expect([mal.estado, mal.veredicto, mal.residuo]).toEqual(["no-cierra", "weak", 70]);
  });

  it("con un solo saldo de renglón y ningún saldo impreso, las dos puntas salen de él: cierra por construcción", () => {
    const r = conChecks(lectura([linea("L1", 1, -100, null, null), linea("L2", 2, -30, 870, null), linea("L3", 3, 20, null, null)]), {
      linesWithBalance: 1, ...sinImpresos,
    });
    const c = control(r, "final = inicial + movimientos");
    expect([c.estado, c.veredicto, c.residuo, c.partes, c.motivo]).toEqual([
      "cierra-por-construccion", "abstained", 0, ["saldo:L2"], "el saldo inicial y el final salen del mismo saldo de renglón: la suma cierra por construcción",
    ]);
  });

  // L1 sin saldo, L2 870, L3 sin saldo, L4: el inicial sale de L2 y el final de L4.
  const deRenglon = (saldoEs: "after" | "before", saldoL4: number, sentido: "chronological" | "reverse" = "chronological") => {
    const lines = [linea("L1", 1, -100, null, null), linea("L2", 2, -30, 870, null), linea("L3", 3, 20, null, null), linea("L4", 4, -10, saldoL4, true)];
    const enArchivo = sentido === "reverse" ? lines.map((l, k) => ({ ...l, order: 4 - k })).reverse() : lines;
    return conChecks(lectura(enArchivo), { balanceIs: saldoEs, direction: sentido, ...sinImpresos });
  };

  it("sin saldos impresos, las puntas son los saldos de renglón y entran los movimientos que van entre ellos", () => {
    const c = control(deRenglon("after", 880), "final = inicial + movimientos");
    expect([c.estado, c.veredicto, c.partes]).toEqual(["cierra", "verified", ["saldo:L4", "saldo:L2", "L3", "L4"]]);
    expect(control(deRenglon("after", 881), "final = inicial + movimientos")).toMatchObject({ estado: "no-cierra", residuo: 1 });
  });

  it("con el saldo de antes, el movimiento del primer saldo entra y el del último no", () => {
    expect(control(deRenglon("before", 860), "final = inicial + movimientos")).toMatchObject({ estado: "cierra", partes: ["saldo:L4", "saldo:L2", "L2", "L3"] });
  });

  it("en orden inverso, las puntas de renglón son las de la fecha más vieja y la más nueva", () => {
    expect(control(deRenglon("after", 880, "reverse"), "final = inicial + movimientos")).toMatchObject({ estado: "cierra", partes: ["saldo:L4", "saldo:L2", "L4", "L3"] });
  });

  it("con una sola punta impresa, la otra es el saldo de renglón", () => {
    const r = deRenglon("after", 880);
    const punta = (printedBalances: { openingCents: number | null; closingCents: number | null }) => control(conChecks(r, { printedBalances }), "final = inicial + movimientos");
    expect(punta({ openingCents: 1000, closingCents: null })).toMatchObject({ estado: "cierra", partes: ["saldo:L4", "saldoInicial", "L1", "L2", "L3", "L4"] });
    expect(punta({ openingCents: null, closingCents: 880 })).toMatchObject({ estado: "cierra", partes: ["saldoFinal", "saldo:L2", "L3", "L4"] });
    const conImpresos = punta({ openingCents: 1000, closingCents: 880 });
    expect([conImpresos.estado, conImpresos.veredicto, conImpresos.partes]).toEqual(["cierra", "verified", ["saldoFinal", "saldoInicial", "L1", "L2", "L3", "L4"]]);
  });

  it("sin saldo inicial o sin saldo final no hay control de punta", () => {
    const r = lectura([linea("L1", 1, -100, 900, true)]);
    expect(delJuez(conHeader(r, { openingBalanceCents: null }), "saldos-de-punta")).toEqual([]);
    expect(delJuez(conHeader(r, { closingBalanceCents: null }), "saldos-de-punta")).toEqual([]);
  });

  it("ProntoNet es un tercero: verified si cierra, weak si no, nada si no se comparó", () => {
    const r = lectura([linea("L1", 1, -100, 900, true)]);
    const pn = (v: boolean | null) => delJuez(conChecks(r, { closesWithProntoNet: v }), "saldos-de-punta").find((c) => c.id === "saldos de ProntoNet");
    expect(pn(true)).toMatchObject({
      estado: "cierra", veredicto: "verified", partes: [], residuo: null, faltan: [], motivo: "los saldos coinciden con los de ProntoNet",
      sospechosos: { informa: false }, posicion: { informa: false },
    });
    expect(pn(false)).toMatchObject({ estado: "no-cierra", veredicto: "weak", partes: [], motivo: "los saldos no coinciden con los de ProntoNet" });
    expect(pn(null)).toBeUndefined();
  });
});

describe("una lectura parcial", () => {
  const parcial = (r: StatementReading): StatementReading => ({
    ...r, warnings: [{ code: "lectura-parcial", detail: "Se leyeron 2 de 5 páginas.", blocksProposals: true }],
  });
  const r = parcial(conChecks(lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 860, false)]), { closesWithProntoNet: true }));

  it("la punta, ProntoNet y los movimientos no se pudieron mirar enteros", () => {
    const d = dictamen(r);
    for (const id of ["final = inicial + movimientos", "saldos de ProntoNet", "hay movimientos"]) {
      expect(d.controles.find((c) => c.id === id)).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "unavailable", residuo: null, motivo: "la lectura quedó parcial" });
    }
    expect(d.controles.find((c) => c.id === "hay movimientos")!.faltan).toEqual([{ elementoDe: "movimientos" }]);
  });

  it("la cadena de los renglones leídos y los campos del encabezado se juzgan igual", () => {
    expect(delJuez(r, "cadena-de-saldos").map((c) => [c.id, c.estado, c.veredicto])).toEqual([
      ["saldo del renglón L1", "cierra", "verified"],
      ["saldo del renglón L2", "no-cierra", "weak"],
    ]);
    expect(control(r, "cbu presente").estado).toBe("cierra");
  });

  it("el fin del período es la fecha del último renglón leído: no se pudo mirar", () => {
    const campo = lecturaDelExtracto(r).campos.find((c) => c.id === "periodoHasta");
    expect(campo).toEqual({ id: "periodoHasta", valor: null, veredicto: "unavailable" });
    expect(control(r, "periodoHasta presente")).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "unavailable", faltan: [{ campo: "periodoHasta" }] });
  });

  it("el CBU que falta pudo estar en lo que no se leyó; el que está sigue grounded", () => {
    const sinCbu = conHeader(r, { cbu: null });
    expect(lecturaDelExtracto(sinCbu).campos.find((c) => c.id === "cbu")).toEqual({ id: "cbu", valor: null, veredicto: "unavailable" });
    expect(control(sinCbu, "cbu presente")).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "unavailable" });
    expect(lecturaDelExtracto(r).campos.find((c) => c.id === "cbu")).toMatchObject({ valor: { tipo: "texto" }, veredicto: "grounded" });
  });

  it("en un extracto inverso, lo que no se vio es el principio: el inicio del período no se pudo mirar y el fin sí", () => {
    const inverso = conChecks(r, { direction: "reverse" });
    const campos = lecturaDelExtracto(inverso).campos;
    expect(campos.find((c) => c.id === "periodoDesde")).toEqual({ id: "periodoDesde", valor: null, veredicto: "unavailable" });
    expect(campos.find((c) => c.id === "periodoHasta")).toEqual({ id: "periodoHasta", valor: { tipo: "fecha", valor: "2026-07-31" }, veredicto: "grounded" });
    expect(control(inverso, "periodoDesde presente")).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "unavailable", faltan: [{ campo: "periodoDesde" }] });
    expect(control(inverso, "periodoHasta presente")).toMatchObject({ estado: "cierra", veredicto: "grounded" });
  });

  it("en un extracto inverso, un saldo impreso y leído sigue siendo un campo; uno sacado de un renglón no lo es", () => {
    const inverso = conChecks(r, { direction: "reverse" });
    expect(lecturaDelExtracto(inverso).campos.filter((c) => /^saldo(Inicial|Final)$/.test(c.id)).map((c) => [c.id, c.veredicto])).toEqual([["saldoInicial", "grounded"], ["saldoFinal", "grounded"]]);
    const deRenglon = conChecks(r, { direction: "reverse", ...sinImpresos });
    expect(lecturaDelExtracto(deRenglon).campos.filter((c) => /^saldo(Inicial|Final)$/.test(c.id))).toEqual([]);
  });

  it("sin lectura parcial, el fin del período ausente y el CBU ausente siguen siendo abstained", () => {
    const completa = conHeader(lectura([linea("L1", 1, -100, 900, true)]), { cbu: null, periodTo: null });
    const campos = lecturaDelExtracto(completa).campos;
    expect(campos.find((c) => c.id === "cbu")!.veredicto).toBe("abstained");
    expect(campos.find((c) => c.id === "periodoHasta")!.veredicto).toBe("abstained");
  });

  it("otro aviso no la vuelve parcial", () => {
    const otra = { ...r, warnings: [{ code: "sin-saldos" as const, detail: "x", blocksProposals: false }] };
    expect(control(otra, "final = inicial + movimientos").estado).toBe("cierra");
    expect(contextoDelExtracto(otra).parcial).toBe(false);
  });
});

describe("completitud", () => {
  it("la cuenta, el período y los movimientos", () => {
    const cs = delJuez(lectura([linea("L1", 1, -100, 900, true)]), "completitud");
    expect(cs.find((c) => c.id === "hay movimientos")).toMatchObject({ motivo: "el extracto trae movimientos", faltan: [], sospechosos: { informa: false }, posicion: { informa: false } });
    expect(cs.map((c) => [c.id, c.estado, c.veredicto])).toEqual([
      ["cbu presente", "cierra", "grounded"],
      ["hay movimientos", "cierra", "grounded"],
      ["periodoDesde presente", "cierra", "grounded"],
      ["periodoHasta presente", "cierra", "grounded"],
    ]);
  });

  it("lo que falta se anota", () => {
    const r = conHeader(lectura([]), { cbu: null, periodFrom: null, periodTo: null });
    const cs = delJuez(r, "completitud");
    expect(cs.map((c) => [c.id, c.estado, c.faltan])).toEqual([
      ["cbu presente", "no-cierra", [{ campo: "cbu" }]],
      ["hay movimientos", "no-cierra", [{ elementoDe: "movimientos" }]],
      ["periodoDesde presente", "no-cierra", [{ campo: "periodoDesde" }]],
      ["periodoHasta presente", "no-cierra", [{ campo: "periodoHasta" }]],
    ]);
    expect(cs.find((c) => c.id === "hay movimientos")).toMatchObject({ veredicto: "abstained", motivo: "el extracto no trae movimientos" });
  });

  it("una lectura abstenida sin encabezado no se juzga: sin faltas, con el motivo", () => {
    const r = { fingerprint: "f", verdict: "abstained", reason: "No se encontró una tabla.", header: null, lines: [], warnings: [], checks: null } as StatementReading;
    const cs = delJuez(r, "completitud");
    expect(cs.map((c) => c.id)).toEqual(["cbu presente", "hay movimientos", "periodoDesde presente", "periodoHasta presente"]);
    for (const c of cs) {
      expect(c).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "abstained", faltan: [], partes: [], motivo: "no hay lectura del extracto: No se encontró una tabla." });
    }
  });

  it("una lectura que no se pudo mirar dice unavailable, no abstained", () => {
    const r = { fingerprint: "f", verdict: "unavailable", reason: null, header: null, lines: [], warnings: [], checks: null } as StatementReading;
    const cs = delJuez(r, "completitud");
    expect(cs).toHaveLength(4);
    for (const c of cs) expect(c).toMatchObject({ estado: "no-se-puede-juzgar", veredicto: "unavailable", faltan: [], motivo: "no se pudo leer el extracto" });
  });

  it("sin encabezado pero sin abstenerse, se juzga: falta lo que no se leyó", () => {
    const r = { fingerprint: "f", verdict: "weak", reason: null, header: null, lines: [], warnings: [], checks: null } as unknown as StatementReading;
    expect(contextoDelExtracto(r).sinLectura).toBeNull();
    expect(delJuez(r, "completitud").find((c) => c.id === "cbu presente")).toMatchObject({ estado: "no-cierra", faltan: [{ campo: "cbu" }] });
  });

  it("una lectura con encabezado se juzga aunque no esté verificada", () => {
    const r = lectura([], { verdict: "abstained" });
    expect(delJuez(r, "completitud").find((c) => c.id === "cbu presente")!.estado).toBe("cierra");
  });
});

it("una lectura sin encabezado ni controles sale sin controles de saldo y sin tirar", () => {
  const r = { fingerprint: "f", verdict: "unavailable", reason: "x", header: null, lines: [], warnings: [], checks: null } as StatementReading;
  const d = dictaminarExtracto(r, { estricto: true });
  expect(d.controles.filter((c) => c.juez === "cadena-de-saldos" || c.juez === "saldos-de-punta")).toEqual([]);
});

describe("la declaración", () => {
  it("tres jueces con su versión, sin despeje: el banco del CBU no se controla, porque el encabezado lo saca del mismo CBU", () => {
    const r = lectura([linea("L1", 1, -100, 900, true)]);
    expect(juecesDelExtracto(contextoDelExtracto(r)).map((j) => j.id)).toEqual(["cadena-de-saldos", "saldos-de-punta", "completitud"]);
    expect(dictamen(r).version.jueces).toEqual({ "cadena-de-saldos": "1", completitud: "1", "saldos-de-punta": "1" });
    expect(juecesDelExtracto(contextoDelExtracto(r)).every((j) => j.proponer === undefined)).toBe(true);
    expect(dictamen(r).propuestas).toEqual([]);
  });

  it("el contexto: el sentido, el saldo, lo que encadena, ProntoNet y si hay lectura", () => {
    const r = conChecks(lectura([linea("L1", 1, -100, 900, true), linea("L2", 2, -50, 800, false), linea("L3", 3, -5, null, null)]), { direction: "reverse", balanceIs: "before", closesWithProntoNet: false });
    expect(contextoDelExtracto(r)).toEqual({
      direccion: "reverse", saldoEs: "before", encadena: new Map([["L1", true], ["L2", false]]), prontoNet: false, sinLectura: null,
      parcial: false,
    });
    const vacia = { fingerprint: "f", verdict: "abstained", reason: null, header: null, lines: [], warnings: [], checks: null } as StatementReading;
    expect(contextoDelExtracto(vacia)).toEqual({
      direccion: "chronological", saldoEs: "after", encadena: new Map(), prontoNet: null,
      sinLectura: { veredicto: "abstained", motivo: "no hay lectura del extracto" }, parcial: false,
    });
  });

  it("solo una lectura abstenida o no mirada, sin encabezado y sin controles, queda sin lectura", () => {
    const r = lectura([linea("L1", 1, -100, 900, true)]);
    expect(contextoDelExtracto({ ...r, verdict: "abstained", checks: null }).sinLectura).toBeNull();
    expect(contextoDelExtracto({ ...r, verdict: "abstained", header: null }).sinLectura).toBeNull();
    expect(contextoDelExtracto({ ...r, verdict: "weak", header: null }).sinLectura).toBeNull();
  });

  it("los jueces miran la lista de movimientos y no otra, y sin ella no tiran", () => {
    const jueces = juecesDelExtracto(contextoDelExtracto(lectura([])));
    const juzgar = (id: string, l: Parameters<(typeof jueces)[number]["juzgar"]>[0]) => jueces.find((j) => j.id === id)!.juzgar(l);
    const pesos = (id: string, valor: number) => ({ id, valor: { tipo: "centavos" as const, valor, moneda: "ARS" }, veredicto: "grounded" as const });
    const otra = { id: "otra", elementos: [pesos("X1", 5)] };
    expect(juzgar("completitud", { campos: [], listas: [otra] }).find((c) => c.id === "hay movimientos")!.estado).toBe("no-cierra");
    expect(juzgar("cadena-de-saldos", { campos: [], listas: [] })).toEqual([]);
    expect(juzgar("saldos-de-punta", { campos: [pesos("saldoInicial", 1), pesos("saldoFinal", 6)], listas: [otra, { id: "movimientos", elementos: [] }] })[0].partes).toEqual(["saldoFinal", "saldoInicial"]);
    expect(juzgar("saldos-de-punta", { campos: [pesos("saldoInicial", 1)], listas: [] })).toEqual([]);
    expect(juzgar("saldos-de-punta", { campos: [pesos("saldoFinal", 1)], listas: [{ id: "movimientos", elementos: [pesos("X1", 5)] }] })).toEqual([]);
  });

  it("sin estricto, el dictamen sale igual", () => {
    const r = lectura([linea("L1", 1, -100, 900, true)]);
    expect(dictaminarExtracto(r)).toEqual(dictamen(r));
  });
});

describe("paridad con lo que publica AgilBank", () => {
  const csv = (...lines: string[]) => Buffer.from(lines.join("\n") + "\n");
  const casos: Array<[string, Buffer]> = [
    ["un «Saldo al» después de cada día, que cierra y encadena", csv(
      "Fecha;Concepto;Importe;Saldo",
      "01/07/2026;Transf recibida;100,00;1.100,00",
      "01/07/2026;Comision;-10,00;1.090,00",
      "Saldo al 01/07/2026;;;1.090,00",
      "02/07/2026;Transf recibida;50,00;1.140,00",
      "Saldo al 02/07/2026;;;1.140,00",
      "03/07/2026;Comision;-20,00;1.120,00",
      "Saldo al 03/07/2026;;;1.120,00",
    )],
    ["saldos que no encadenan en el medio", csv(
      "Fecha;Concepto;Importe;Saldo",
      "01/07/2026;Transf recibida;100,00;1.100,00",
      "02/07/2026;Comision;-10,00;1.090,00",
      "03/07/2026;Comision;-10,00;1.085,00",
      "04/07/2026;Comision;-10,00;1.070,00",
      "05/07/2026;Comision;-10,00;1.060,00",
      "06/07/2026;Comision;-10,00;1.050,00",
    )],
    ["el saldo final impreso que no es la suma", csv(
      "Fecha;Concepto;Importe;Saldo",
      "Saldo anterior;;;1.000,00",
      "01/07/2026;Transf recibida;100,00;1.100,00",
      "02/07/2026;Comision;-10,00;1.090,00",
      "Saldo final;;;1.500,00",
    )],
    ["con el saldo de antes", csv(
      "Fecha;Concepto;Importe;Saldo",
      "01/07/2026;Uno;100,00;1.000,00",
      "01/07/2026;Dos;-30,00;1.100,00",
      "02/07/2026;Tres;-20,00;1.070,00",
    )],
    ["del más nuevo al más viejo, con un saldo de arriba que no cierra", csv(
      "Fecha;Concepto;Importe;Saldo", ";;;1.200,00", "02/07/2026;Comision;-10,00;1.090,00", "01/07/2026;Transf recibida;100,00;1.100,00",
    )],
    ["un solo saldo de renglón y ningún saldo impreso", csv(
      "Fecha;Concepto;Importe;Saldo", "01/07/2026;A;100,00;", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;",
    )],
    ["el primer saldo de renglón mal", csv(
      "Fecha;Concepto;Importe;Saldo", "01/07/2026;A;100,00;1.107,70", "02/07/2026;B;-30,00;1.070,00", "03/07/2026;C;-20,00;1.050,00",
    )],
    ["un importe mal en un tramo de renglones sin saldo", csv(
      "Fecha;Concepto;Débito;Crédito;Saldo",
      "Saldo anterior;;;;1.000,00",
      "01/07/2026;Comision;10,00;;",
      "01/07/2026;Transf recibida;;200,00;",
      "01/07/2026;IVA;2,10;;1.187,90",
      "02/07/2026;Sellos;5,00;;",
      "02/07/2026;Transf emitida;300,00;;",
      "02/07/2026;Deposito;;50,00;1.202,90",
      "03/07/2026;Comision;10,00;;",
      "03/07/2026;Transf recibida;;7,10;",
      "03/07/2026;IVA;2,10;;1.197,90",
    )],
  ];

  const caso = (nombre: string) => casos.find(([n]) => n === nombre)![1];

  it.each(casos)("%s", async (_, file) => {
    const r = await readStatement(file);
    expect(r.checks).not.toBeNull();
    const d = dictamen(r);
    const cadena = d.controles.filter((c) => c.juez === "cadena-de-saldos");
    expect(cadena.filter((c) => c.estado === "cierra")).toHaveLength(r.checks!.linesThatChain);
    expect(cadena).toHaveLength(r.lines.filter((l) => l.chains !== null).length);
    for (const l of r.lines.filter((x) => x.chains !== null)) {
      expect(cadena.find((c) => c.id === `saldo del renglón ${l.id}`)!.estado).toBe(l.chains ? "cierra" : "no-cierra");
    }
    const punta = d.controles.find((c) => c.id === "final = inicial + movimientos");
    expect(punta?.estado === "cierra").toBe(r.checks!.closesWithOwnBalances === true);
    expect(punta === undefined || punta.estado === "cierra-por-construccion").toBe(r.checks!.closesWithOwnBalances === null);
  });

  it("en el tramo con un importe mal, los sospechosos son los movimientos del tramo, que incluyen al que está mal", async () => {
    const r = await readStatement(caso("un importe mal en un tramo de renglones sin saldo"));
    const rota = r.lines.find((l) => l.chains === false)!;
    const k = dictamen(r).controles.find((c) => c.id === `saldo del renglón ${rota.id}`)!;
    expect(k.sospechosos).toEqual({ informa: true, valor: r.lines.slice(3, 6).map((l) => l.id) });
    expect(r.lines[4].bank.text).toBe("Transf emitida");
  });

  it("dos saldos que no encadenan seguidos: el sospechoso es el saldo del primero, también por intersección", async () => {
    const r = await readStatement(caso("saldos que no encadenan en el medio"));
    expect(dictamen(r).controles.find((c) => c.id === "cbu presente")!.estado).toBe("no-cierra");
    expect(r.lines.map((l) => l.chains)).toEqual([null, true, false, false, true, true]);
    const d = dictamen(r);
    expect(d.controles.find((c) => c.id === `saldo del renglón ${r.lines[3].id}`)!.sospechosos).toEqual({ informa: true, valor: [`saldo:${r.lines[2].id}`] });
    expect(d.sospechososPorInterseccion).toEqual([`saldo:${r.lines[2].id}`]);
  });

  it("un solo saldo de renglón: la punta cierra por construcción y no verifica nada", async () => {
    const r = await readStatement(caso("un solo saldo de renglón y ningún saldo impreso"));
    expect(r.checks).toMatchObject({ linesWithBalance: 1, closesWithOwnBalances: null, printedBalances: { openingCents: null, closingCents: null } });
    expect(dictamen(r).controles.find((c) => c.id === "final = inicial + movimientos")).toMatchObject({ estado: "cierra-por-construccion", veredicto: "abstained" });
  });

  it("el primer saldo de renglón mal: es el ancla, nada lo corrobora y queda sospechoso", async () => {
    const r = await readStatement(caso("el primer saldo de renglón mal"));
    expect(r.lines.map((l) => l.chains)).toEqual([null, false, true]);
    const d = dictamen(r);
    const k = d.controles.find((c) => c.id === `saldo del renglón ${r.lines[1].id}`)!;
    expect(k.sospechosos).toEqual({ informa: true, valor: [`saldo:${r.lines[0].id}`, r.lines[1].id] });
    expect(d.controles.find((c) => c.id === "final = inicial + movimientos")).toMatchObject({ estado: "no-cierra", partes: [`saldo:${r.lines[2].id}`, `saldo:${r.lines[0].id}`, r.lines[1].id, r.lines[2].id] });
    expect(d.sospechososPorInterseccion).toContain(`saldo:${r.lines[0].id}`);
  });

  it("con ProntoNet que cierra, su control es verified", async () => {
    const r = await readStatement(caso("un «Saldo al» después de cada día, que cierra y encadena"), {
      account: { openingBalance: 1000, closingBalance: 1120, periodFrom: "2026-07-01", periodTo: "2026-07-03" },
    });
    expect(r.checks!.closesWithProntoNet).toBe(true);
    expect(dictamen(r).controles.find((c) => c.id === "saldos de ProntoNet")).toMatchObject({ estado: "cierra", veredicto: "verified" });
  });
});
