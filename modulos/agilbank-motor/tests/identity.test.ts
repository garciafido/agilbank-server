import { assignIds, comparableReference, fingerprintOf } from "../src/identity";

const m = (date: string, amountCents: number, reference: string | null = null) => ({ date, amountCents, reference });

describe("fingerprintOf", () => {
  it("es el SHA-256 de los bytes", () => {
    expect(fingerprintOf(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(fingerprintOf(Buffer.alloc(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("comparableReference", () => {
  it.each([
    [null, ""],
    ["", ""],
    ["123457", "123457"],
    ["000123", "123"],
    ["1234567890", "567890"],
    ["12-34 56", "123456"],
    ["0000000", ""],
    ["ECHEQ 0012345678", "345678"],
  ])("%j se compara como %j", (reference, expected) => {
    expect(comparableReference(reference)).toBe(expected);
  });

  it("el echeq cortado a seis cifras en el Excel es el mismo que el entero de otro canal", () => {
    expect(comparableReference("000000987654")).toBe(comparableReference("987654"));
    expect(comparableReference("12987654")).toBe(comparableReference("987654"));
  });

  it("primero se corta a las seis últimas cifras y después se sacan los ceros", () => {
    expect(comparableReference("1000123")).toBe("123");
    expect(comparableReference("1000123")).toBe(comparableReference("000123"));
    expect(comparableReference("7000000")).toBe("");
  });
});

describe("assignIds", () => {
  const chronologicalOf = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("un id por renglón, con la forma del contrato", () => {
    const ids = assignIds("cta", [m("2026-07-01", 100), m("2026-07-02", -10)], [0, 1]);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => /^r-[0-9a-f]{20}$/.test(id))).toBe(true);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("el mismo renglón da el mismo id siempre", () => {
    expect(assignIds("cta", [m("2026-07-01", 100, "55")], [0])).toEqual(assignIds("cta", [m("2026-07-01", 100, "55")], [0]));
  });

  it("cambia con la cuenta, la fecha y el importe", () => {
    const base = assignIds("cta", [m("2026-07-01", 100, "55")], [0])[0];
    expect(assignIds("otra", [m("2026-07-01", 100, "55")], [0])[0]).not.toBe(base);
    expect(assignIds("cta", [m("2026-07-02", 100, "55")], [0])[0]).not.toBe(base);
    expect(assignIds("cta", [m("2026-07-01", 101, "55")], [0])[0]).not.toBe(base);
  });

  it("la referencia no entra en la clave: un canal que no la trae da el mismo id", () => {
    const a = assignIds("cta", [m("2026-07-01", 100, "55")], [0])[0];
    expect(assignIds("cta", [m("2026-07-01", 100, "56")], [0])[0]).toBe(a);
    expect(assignIds("cta", [m("2026-07-01", 100, null)], [0])[0]).toBe(a);
    expect(assignIds("cta", [m("2026-07-01", 100, "SIN NUMERO")], [0])[0]).toBe(a);
  });

  describe("entre renglones con la misma fecha y el mismo importe, el ordinal sigue la referencia", () => {
    const pair = (first: string | null, second: string | null) => assignIds("cta", [m("2026-07-02", -210, first), m("2026-07-02", -210, second)], [0, 1]);

    it("con referencia o sin ella, el mismo conjunto de ids", () => {
      const withReference = pair("5003", "5002");
      const without = pair(null, null);
      expect(new Set(withReference)).toEqual(new Set(without));
      expect(new Set(withReference).size).toBe(2);
    });

    it("la referencia menor lleva el ordinal 1, aunque venga después en el archivo", () => {
      const without = pair(null, null);
      expect(pair("5003", "5002")).toEqual([without[1], without[0]]);
      expect(pair("5002", "5003")).toEqual(without);
    });

    it("las referencias se comparan como números, por sus últimas seis cifras", () => {
      const without = pair(null, null);
      expect(pair("10", "9")).toEqual([without[1], without[0]]);
      expect(pair("0001234568", "234567")).toEqual([without[1], without[0]]);
      expect(pair("ECHEQ 12", "ECHEQ 3")).toEqual([without[1], without[0]]);
    });

    it("con la misma referencia, o sin cifras, manda el orden cronológico", () => {
      const without = pair(null, null);
      expect(pair("77", "77")).toEqual(without);
      expect(pair("A", "B")).toEqual(without);
    });

    it("un canal que corta la referencia a seis cifras con ceros adelante da los mismos ids para los mismos renglones", () => {
      expect(pair("000123", "000999")).toEqual(pair("1000123", "999"));
      expect(pair("000999", "000123")).toEqual(pair("999", "1000123"));
    });

    it("los que traen referencia van antes que los que no", () => {
      const without = pair(null, null);
      expect(pair(null, "9")).toEqual([without[1], without[0]]);
      expect(pair("9", null)).toEqual(without);
    });
  });

  it("el ordinal separa renglones iguales y se cuenta en el orden cronológico, no en el del archivo", () => {
    const rows = [m("2026-07-02", -210), m("2026-07-02", -210), m("2026-07-01", 20000)];
    const reverseOrder = assignIds("cta", rows, [2, 1, 0]);
    const chronological = assignIds("cta", [rows[2], rows[1], rows[0]], [0, 1, 2]);
    expect(new Set(reverseOrder).size).toBe(3);
    expect(reverseOrder[2]).toBe(chronological[0]);
    expect(reverseOrder[1]).toBe(chronological[1]);
    expect(reverseOrder[0]).toBe(chronological[2]);
  });

  it("con el ordinal invertido el id de cada renglón igual sería otro", () => {
    const rows = [m("2026-07-02", -210), m("2026-07-02", -210)];
    const a = assignIds("cta", rows, [1, 0]);
    const b = assignIds("cta", rows, [0, 1]);
    expect(a[1]).toBe(b[0]);
    expect(a[0]).toBe(b[1]);
    expect(a[0]).not.toBe(a[1]);
  });

  it("los renglones distintos no comparten ordinal", () => {
    const ids = assignIds("cta", [m("2026-07-01", 1), m("2026-07-01", 2), m("2026-07-01", 1)], chronologicalOf(3));
    expect(new Set(ids).size).toBe(3);
  });
});

describe("assignIds: el id es parte del contrato", () => {
  it("el id de un renglón no cambia de una versión a otra: es el SHA-256 de «cuenta|fecha|centavos|ordinal», recortado", () => {
    expect(assignIds("cta", [m("2026-07-01", 100, "55")], [0])).toEqual(["r-53191650d65e3c2dca7c"]);
  });

  it("el segundo renglón igual lleva el ordinal 2", () => {
    const rows = [m("2026-07-02", -210), m("2026-07-02", -210)];
    expect(assignIds("cta", rows, [0, 1])).toEqual(["r-ef1d0d1d938a085dce64", "r-7387ecba8d6241207047"]);
  });
});
