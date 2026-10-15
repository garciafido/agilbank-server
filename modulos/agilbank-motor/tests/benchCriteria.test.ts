import { checkFile, pendingInTable, type Observed } from "../bench/criteria";
import { PENDING_CONCEPTS, type BenchFile } from "../bench/files";
import { catalog, type Catalog } from "../src/catalog/catalog";

const file = (f: Partial<BenchFile> = {}): BenchFile & { label: string } => ({ fingerprint: "x", label: "Archivo", expectedVerdict: "weak", ...f });
const seen = (o: Partial<Observed> = {}): Observed => ({ lines: 100, withCuit: 10, chained: 50, verdict: "weak", codes: [], ms: 1000, ...o });

describe("checkFile: lo que el banco exige de cada archivo", () => {
  it("lo esperado, sin fallas", () => {
    expect(checkFile(file({ expectedLines: 100, expectedWarnings: ["sin-saldos"] }), seen({ codes: ["sin-saldos"] }), 0)).toEqual({ failures: [], timeWarnings: [] });
  });

  it("los renglones, el veredicto y los avisos esperados", () => {
    const r = checkFile(file({ expectedLines: 90, expectedVerdict: "verified", expectedWarnings: ["no-cierra"] }), seen(), 0);
    expect(r.failures).toEqual(["Archivo: 100 renglones, se esperaban 90", "Archivo: weak, se esperaba verified", "Archivo: falta el aviso no-cierra"]);
  });

  describe("pisos", () => {
    it.each([
      ["minLines", { minLines: 100 }, seen({ lines: 99 }), "Archivo: 99 renglones, se esperaban 100 o más"],
      ["minLinesWithCuit", { minLinesWithCuit: 10 }, seen({ withCuit: 9 }), "Archivo: 9 renglones con CUIT, se esperaban 10 o más"],
      ["minLinesThatChain", { minLinesThatChain: 50 }, seen({ chained: 49 }), "Archivo: encadenan 49 renglones, se esperaban 50 o más"],
    ] as const)("%s: justo por debajo falla, justo en el piso pasa", (_name, expected, below, message) => {
      expect(checkFile(file(expected), below, 0).failures).toEqual([message]);
      expect(checkFile(file(expected), seen(), 0).failures).toEqual([]);
    });
  });

  describe("lectura-parcial", () => {
    it("un aviso lectura-parcial que el archivo no espera falla", () => {
      expect(checkFile(file(), seen({ codes: ["lectura-parcial"] }), 0).failures).toEqual(["Archivo: salió el aviso lectura-parcial y no se esperaba"]);
    });
    it("si el archivo lo espera, pasa", () => {
      expect(checkFile(file({ expectedWarnings: ["lectura-parcial"] }), seen({ codes: ["lectura-parcial"] }), 0).failures).toEqual([]);
    });
  });

  describe("el tiempo", () => {
    const timed = file({ maxSeconds: 300 });
    it("con la máquina libre, pasar el techo falla", () => {
      expect(checkFile(timed, seen({ ms: 301_000 }), 1.99)).toEqual({ failures: ["Archivo: 301 s, el techo es 300 s"], timeWarnings: [] });
      expect(checkFile(timed, seen({ ms: 300_000 }), 0)).toEqual({ failures: [], timeWarnings: [] });
    });
    it("con carga 2 o más, pasar el techo es advertencia", () => {
      expect(checkFile(timed, seen({ ms: 301_000 }), 2)).toEqual({ failures: [], timeWarnings: ["Archivo: 301 s, el techo es 300 s"] });
    });
    it("pasar el doble del techo falla igual, con la carga", () => {
      expect(checkFile(timed, seen({ ms: 600_000 }), 8.56)).toEqual({ failures: [], timeWarnings: ["Archivo: 600 s, el techo es 300 s"] });
      expect(checkFile(timed, seen({ ms: 600_001 }), 8.56)).toEqual({
        failures: ["Archivo: 600 s, más del doble del techo de 300 s (carga 8.56 al empezar)"],
        timeWarnings: [],
      });
    });
    it("con la máquina libre, el doble del techo da una sola falla", () => {
      expect(checkFile(timed, seen({ ms: 700_000 }), 0).failures).toHaveLength(1);
    });
    it("sin maxSeconds no hay techo", () => {
      expect(checkFile(file(), seen({ ms: 10_000_000 }), 9)).toEqual({ failures: [], timeWarnings: [] });
    });
  });
});

describe("pendingInTable: un pendiente que entró a la tabla sale de la lista", () => {
  const pending = [{ bank: "017", text: "imp ley", reason: "x" }, { bank: "017", text: "honorarios", reason: "x" }];
  const withPrefix = (bank: string, prefix: string): Catalog => {
    const b = catalog.synonyms.banks[bank];
    return { ...catalog, synonyms: { ...catalog.synonyms, banks: { ...catalog.synonyms.banks, [bank]: { ...b, texts: [...b.texts, { prefix, type: "impuesto-debitos" }] } } } };
  };

  it("la lista de hoy sigue fuera de la tabla", () => {
    expect(pendingInTable(PENDING_CONCEPTS, catalog)).toEqual([]);
  });

  it("un prefijo del banco que lo cubre lo saca, aunque sea más corto que el texto", () => {
    expect(pendingInTable(pending, withPrefix("017", "imp ley")).map((p) => p.text)).toEqual(["imp ley"]);
    expect(pendingInTable(pending, withPrefix("017", "imp")).map((p) => p.text)).toEqual(["imp ley"]);
  });

  it("un prefijo de otro banco no cuenta", () => {
    expect(pendingInTable(pending, withPrefix("191", "imp ley"))).toEqual([]);
  });

  it("un sinónimo general lo cubre", () => {
    const general = { ...catalog, synonyms: { ...catalog.synonyms, general: [{ prefix: "honorarios", type: "comision" }] } };
    expect(pendingInTable(pending, general).map((p) => p.text)).toEqual(["honorarios"]);
  });
});
