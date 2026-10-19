import { balanceUnseen, isPartialReading, unseenEnd } from "../src/partialReading";
import type { ReadingChecks, Warning } from "../src/types";

const warning = (code: Warning["code"]): Warning => ({ code, detail: "x", blocksProposals: false });

describe("isPartialReading", () => {
  it("es parcial solo con el aviso lectura-parcial, entre los que sea", () => {
    expect(isPartialReading({ warnings: [warning("lectura-parcial")] })).toBe(true);
    expect(isPartialReading({ warnings: [warning("sin-saldos"), warning("lectura-parcial"), warning("no-cierra")] })).toBe(true);
  });

  it("sin el aviso no es parcial, aunque traiga otros que frenan", () => {
    expect(isPartialReading({ warnings: [] })).toBe(false);
    expect(isPartialReading({ warnings: [warning("no-cierra"), warning("sin-saldos"), warning("cuenta-distinta")] })).toBe(false);
  });
});

const checks = (over: Partial<ReadingChecks> = {}): ReadingChecks => ({
  direction: "chronological", balanceIs: "after", linesWithBalance: 2, linesThatChain: 1, closesWithOwnBalances: true, closesWithProntoNet: null,
  printedBalances: { openingCents: null, closingCents: null }, lineBalances: { openingCents: 100, closingCents: 200 }, ...over,
});
const parcial = [warning("lectura-parcial")];

describe("unseenEnd", () => {
  // El PDF se lee desde la página 1: lo que falta es el final del archivo.
  it("en un extracto cronológico, lo que no se vio es el final", () => {
    expect(unseenEnd({ warnings: parcial, checks: checks() })).toBe("closing");
  });

  it("en uno inverso, lo más nuevo va arriba: lo que no se vio es el principio", () => {
    expect(unseenEnd({ warnings: parcial, checks: checks({ direction: "reverse" }) })).toBe("opening");
  });

  it("sin los controles no se sabe el sentido: se toma el cronológico, como el contexto de los jueces", () => {
    expect(unseenEnd({ warnings: parcial, checks: null })).toBe("closing");
  });

  it("sin la lectura parcial, se vieron las dos puntas", () => {
    expect(unseenEnd({ warnings: [], checks: checks() })).toBeNull();
    expect(unseenEnd({ warnings: [warning("no-cierra")], checks: checks({ direction: "reverse" }) })).toBeNull();
  });
});

describe("balanceUnseen", () => {
  it("en el cronológico, un saldo final que no está impreso sale del último renglón leído: no se vio; el inicial sí", () => {
    expect(balanceUnseen({ warnings: parcial, checks: checks() }, "closing")).toBe(true);
    expect(balanceUnseen({ warnings: parcial, checks: checks() }, "opening")).toBe(false);
    expect(balanceUnseen({ warnings: parcial, checks: null }, "closing")).toBe(true);
    expect(balanceUnseen({ warnings: parcial, checks: null }, "opening")).toBe(false);
  });

  it("en el inverso, un saldo inicial que no está impreso sale del renglón más viejo leído: no se vio; el final sí", () => {
    const inverso = { warnings: parcial, checks: checks({ direction: "reverse" }) };
    expect(balanceUnseen(inverso, "opening")).toBe(true);
    expect(balanceUnseen(inverso, "closing")).toBe(false);
  });

  it("uno impreso y leído se vio, aunque sea cero, en los dos sentidos", () => {
    for (const cents of [200, 0]) {
      expect(balanceUnseen({ warnings: parcial, checks: checks({ printedBalances: { openingCents: null, closingCents: cents } }) }, "closing")).toBe(false);
      expect(balanceUnseen({ warnings: parcial, checks: checks({ direction: "reverse", printedBalances: { openingCents: cents, closingCents: null } }) }, "opening")).toBe(false);
    }
  });

  it("el impreso que cuenta es el de la punta que no se vio", () => {
    expect(balanceUnseen({ warnings: parcial, checks: checks({ printedBalances: { openingCents: 100, closingCents: null } }) }, "closing")).toBe(true);
    expect(balanceUnseen({ warnings: parcial, checks: checks({ direction: "reverse", printedBalances: { openingCents: null, closingCents: 200 } }) }, "opening")).toBe(true);
  });

  it("sin la lectura parcial, se vio salga de donde salga", () => {
    for (const punta of ["opening", "closing"] as const) {
      expect(balanceUnseen({ warnings: [], checks: checks() }, punta)).toBe(false);
      expect(balanceUnseen({ warnings: [], checks: checks({ direction: "reverse" }) }, punta)).toBe(false);
      expect(balanceUnseen({ warnings: [warning("no-cierra")], checks: null }, punta)).toBe(false);
    }
  });
});
