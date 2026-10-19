import { acotar, masDebil } from "../../src/juez/firmeza";

describe("masDebil", () => {
  it("sin partes no acota: devuelve verified", () => {
    expect(masDebil([])).toBe("verified");
  });
  it("la más débil de las leídas", () => {
    expect(masDebil(["verified", "grounded"])).toBe("grounded");
    expect(masDebil(["grounded", "weak", "verified"])).toBe("weak");
  });
  it("unavailable domina: no pudimos mirar", () => {
    expect(masDebil(["verified", "abstained", "unavailable"])).toBe("unavailable");
  });
  it("abstained domina sobre las leídas: miramos y no está", () => {
    expect(masDebil(["verified", "weak", "abstained"])).toBe("abstained");
  });
  it("un veredicto desconocido cuenta como unavailable: no se puede interpretar", () => {
    expect(masDebil(["bogus" as never])).toBe("unavailable");
    expect(masDebil(["weak", "bogus" as never])).toBe("unavailable");
  });
});

describe("acotar", () => {
  it("nunca sube: verified acotado a grounded da grounded, weak acotado a verified sigue weak", () => {
    expect(acotar("verified", "grounded")).toBe("grounded");
    expect(acotar("weak", "verified")).toBe("weak");
  });
  it("con tope abstained o unavailable, el resultado queda en ese tope", () => {
    expect(acotar("verified", "abstained")).toBe("abstained");
    expect(acotar("verified", "unavailable")).toBe("unavailable");
  });
});
