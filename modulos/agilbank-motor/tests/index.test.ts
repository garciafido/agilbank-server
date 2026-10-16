import * as api from "../src";

describe("el índice público", () => {
  it("exporta lo que usan los que reciben el módulo", () => {
    expect(typeof api.readStatement).toBe("function");
    expect(typeof api.toPublicReading).toBe("function");
    expect(typeof api.fingerprintOf).toBe("function");
    expect(typeof api.catalogProblems).toBe("function");
    expect(typeof api.agilbankRoutes).toBe("function");
    expect(typeof api.reconcile).toBe("function");
    expect(typeof api.readBatch).toBe("function");
    expect(typeof api.toPublicReconciliation).toBe("function");
    expect(typeof api.openPending).toBe("function");
    expect(api.SCOPE_DECIDE).toBe("ab:decidir");
    expect(api.catalog.types.length).toBeGreaterThan(0);
  });

  it("no exporta los detalles del motor", () => {
    expect(Object.keys(api).sort()).toEqual(["SCOPE_DECIDE", "agilbankRoutes", "catalog", "catalogProblems", "configureBackgroundReading", "fingerprintOf", "markStatementFailed", "openPending", "readBatch", "readStatement", "readStatementStage", "reconcile", "toPublicReading", "toPublicReconciliation"]);
  });
});
