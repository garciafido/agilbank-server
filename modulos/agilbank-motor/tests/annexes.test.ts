import { annexEntries, applyAnnexes } from "../src/annexes";
import { line } from "./helpers";
import type { Cell, Grid } from "../src/types";

const ANNEX = ["Fecha", "Empresa", "Referencia", "Importe"];
const g = (rows: Cell[][]): Grid => ({ origin: "text", sheet: null, rows });

describe("annexEntries", () => {
  it("toma la fecha, el importe en valor absoluto y el CUIT con el nombre que le sigue", () => {
    expect(annexEntries(g([ANNEX, ["02/07/2026", "30712345671 ACME SA", "VARIOS", "40,00"]]))).toEqual([
      { date: "2026-07-02", amountCents: 4000, cuit: "30712345671", name: "ACME SA", reference: "VARIOS" },
    ]);
  });
  it("una fila sin CUIT válido, sin fecha o sin importe no es una entrada", () => {
    expect(annexEntries(g([ANNEX, ["02/07/2026", "SEGUROS GENERICOS", "R", "45,10"], ["x", "30712345671 A", "R", "1,00"], ["02/07/2026", "30712345671 A", "R", null], ["02/07/2026", "30712345672 B", "R", "1,00"]]))).toEqual([]);
  });
  it("sin columna de fecha o de importe en el encabezado, nada", () => {
    expect(annexEntries(g([["Empresa", "Referencia", "Cuenta"], ["30712345671 A", "R", "C"]]))).toEqual([]);
  });
  it("no busca el CUIT en la columna de referencia: un CUIT ahí es una referencia", () => {
    expect(annexEntries(g([ANNEX, ["02/07/2026", "SERVICIO", "30712345671", "1,00"]]))).toEqual([]);
  });
});

describe("annexEntries: columnas", () => {
  const row = ["02/07/2026", "30712345671 ACME SA", "VARIOS", "40,00"];
  it("un anexo vacío no tiene entradas", () => {
    expect(annexEntries(g([]))).toEqual([]);
  });
  it("el importe puede venir en una columna de crédito o de débito", () => {
    expect(annexEntries(g([["Fecha", "Empresa", "Crédito"], ["02/07/2026", "30712345671 A", "40,00"]]))).toHaveLength(1);
    expect(annexEntries(g([["Fecha", "Empresa", "Débito"], ["02/07/2026", "30712345671 A", "-40,00"]]))[0].amountCents).toBe(4000);
  });
  it("las columnas pueden estar en cualquier posición, incluida la primera", () => {
    expect(annexEntries(g([["Importe", "Fecha", "Empresa"], ["40,00", "02/07/2026", "30712345671 ACME SA"]]))).toEqual([
      { date: "2026-07-02", amountCents: 4000, cuit: "30712345671", name: "ACME SA", reference: null },
    ]);
    expect(annexEntries(g([["Referencia", "Fecha", "Empresa", "Importe"], ["VARIOS", "02/07/2026", "30712345671 ACME SA", "40,00"]]))[0].reference).toBe("VARIOS");
  });
  it("una referencia vacía es null, y sin columna de referencia también", () => {
    expect(annexEntries(g([ANNEX, ["02/07/2026", "30712345671 ACME SA", "  ", "40,00"]]))[0].reference).toBeNull();
    expect(annexEntries(g([["Fecha", "Empresa", "Importe"], ["02/07/2026", "30712345671 ACME SA", "40,00"]]))[0].reference).toBeNull();
  });
  it("el CUIT no se busca en la columna del importe", () => {
    expect(annexEntries(g([ANNEX, ["02/07/2026", "SIN CUIT", "R", "30712345671"]]))).toEqual([]);
  });
  it("un rótulo que no es texto en el encabezado no rompe", () => {
    expect(annexEntries(g([["Fecha", 5, "Empresa", "Importe"], row.slice(0, 1).concat(["x"], row.slice(1, 2), row.slice(3))]))).toHaveLength(1);
  });
});

describe("applyAnnexes", () => {
  const entry = { date: "2026-07-02", amountCents: 4000, cuit: "30712345671", name: "ACME SA", reference: null };

  it("completa la contraparte del único renglón con la misma fecha y el mismo importe", () => {
    const out = applyAnnexes([line({ id: "a" }), line({ id: "b", amountCents: 5000 })], [entry]);
    expect(out[0].counterparty).toEqual({ cuit: "30712345671", name: "ACME SA", cbu: null });
    expect(out[1].counterparty).toBeNull();
  });
  it("vale para un débito: se compara el importe sin signo", () => {
    expect(applyAnnexes([line({ amountCents: -4000 })], [entry])[0].counterparty?.cuit).toBe("30712345671");
  });
  it("con dos renglones iguales no adivina; si la referencia desempata, sí", () => {
    expect(applyAnnexes([line({ id: "a" }), line({ id: "b" })], [entry]).every((l) => l.counterparty === null)).toBe(true);
    const out = applyAnnexes([line({ id: "a", reference: "X1" }), line({ id: "b", reference: "VARIOS" })], [{ ...entry, reference: "VARIOS" }]);
    expect(out.map((l) => l.counterparty?.cuit ?? null)).toEqual([null, "30712345671"]);
  });
  it("no pisa un CUIT que el renglón ya trae, pero conserva su CBU al completar", () => {
    const own = { cuit: "20123456786", name: "OTRO", cbu: null };
    expect(applyAnnexes([line({ counterparty: own })], [entry])[0].counterparty).toEqual(own);
    const conCbu = applyAnnexes([line({ counterparty: { cuit: null, name: null, cbu: "0170001500000123456784" } })], [entry]);
    expect(conCbu[0].counterparty).toEqual({ cuit: "30712345671", name: "ACME SA", cbu: "0170001500000123456784" });
  });
  it("exige la misma fecha", () => {
    expect(applyAnnexes([line({ date: "2026-07-03" })], [entry])[0].counterparty).toBeNull();
  });
  it("una entrada sin referencia no desempata por una referencia ausente", () => {
    const out = applyAnnexes([line({ id: "a", reference: "X1" }), line({ id: "b", reference: null })], [entry]);
    expect(out.every((l) => l.counterparty === null)).toBe(true);
  });
  it("dos entradas para el mismo movimiento no se resuelven por orden: no se completa", () => {
    const out = applyAnnexes([line({ id: "a" })], [entry, { ...entry, cuit: "20123456786", name: "OTRO" }]);
    expect(out[0].counterparty).toBeNull();
  });
  it("la unicidad cuenta todos los renglones del mismo día e importe, aunque ya tengan CUIT", () => {
    const own = { cuit: "20123456786", name: "OTRO", cbu: null };
    const out = applyAnnexes([line({ id: "a", amountCents: 4000, counterparty: own }), line({ id: "b", amountCents: -4000 })], [entry]);
    expect(out[0].counterparty).toEqual(own);
    expect(out[1].counterparty).toBeNull();
  });
  it("si el único renglón que coincide ya trae CUIT, la entrada no se aplica", () => {
    const own = { cuit: "20123456786", name: "OTRO", cbu: null };
    expect(applyAnnexes([line({ counterparty: own })], [entry])[0].counterparty).toEqual(own);
  });
  it("con dos entradas y dos renglones, la referencia empareja a cada uno si es única de los dos lados", () => {
    const e2 = { ...entry, cuit: "20123456786", name: "OTRO", reference: "R2" };
    const out = applyAnnexes([line({ id: "a", reference: "R1" }), line({ id: "b", reference: "R2" })], [{ ...entry, reference: "R1" }, e2]);
    expect(out.map((l) => l.counterparty?.cuit)).toEqual(["30712345671", "20123456786"]);
  });
  it("si dos entradas tienen la misma referencia, esa referencia no empareja", () => {
    const out = applyAnnexes([line({ id: "a", reference: "R1" }), line({ id: "b", reference: "R2" })], [{ ...entry, reference: "R1" }, { ...entry, cuit: "20123456786", name: "OTRO", reference: "R1" }]);
    expect(out.every((l) => l.counterparty === null)).toBe(true);
  });
  it("si dos renglones comparten la referencia de la entrada, no se adivina", () => {
    const out = applyAnnexes([line({ id: "a", reference: "R1" }), line({ id: "b", reference: "R1" })], [{ ...entry, reference: "R1" }]);
    expect(out.every((l) => l.counterparty === null)).toBe(true);
  });
  it("entradas e importes de otro día o de otro importe no se mezclan", () => {
    const other = { ...entry, date: "2026-07-03", cuit: "20123456786", name: "OTRO" };
    const out = applyAnnexes([line({ id: "a" }), line({ id: "b", date: "2026-07-03" })], [entry, other]);
    expect(out.map((l) => l.counterparty?.cuit)).toEqual(["30712345671", "20123456786"]);
  });
});
