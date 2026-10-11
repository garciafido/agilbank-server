import * as api from "../src";

describe("el índice público", () => {
  it("exporta lo que usan los que reciben el módulo", () => {
    expect(typeof api.readStatement).toBe("function");
    expect(typeof api.toPublicReading).toBe("function");
    expect(typeof api.fingerprintOf).toBe("function");
    expect(typeof api.catalogProblems).toBe("function");
    expect(api.catalog.types.length).toBeGreaterThan(0);
  });

  it("no exporta los detalles del motor", () => {
    expect(Object.keys(api).sort()).toEqual(["catalog", "catalogProblems", "fingerprintOf", "readStatement", "toPublicReading"]);
  });
});
