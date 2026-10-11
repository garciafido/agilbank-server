import { conformToSnapshotShape, ShapeDescriptor } from "../conformToSnapshotShape";

const intS: ShapeDescriptor = { kind: "scalar", type: "integer" };
const strS: ShapeDescriptor = { kind: "scalar", type: "string" };

describe("conformToSnapshotShape", () => {
  it("scalar numérico: '', null, NaN-string → null; string-num → num; num → num", () => {
    expect(conformToSnapshotShape("", intS)).toBe(null);
    expect(conformToSnapshotShape(null, intS)).toBe(null);
    expect(conformToSnapshotShape(undefined, intS)).toBe(null);
    expect(conformToSnapshotShape("abc", intS)).toBe(null);
    expect(conformToSnapshotShape("5", intS)).toBe(5);
    expect(conformToSnapshotShape(5, intS)).toBe(5);
  });

  it("scalar string: passthrough; ausente → null", () => {
    expect(conformToSnapshotShape("hola", strS)).toBe("hola");
    expect(conformToSnapshotShape(undefined, strS)).toBe(null);
  });

  it("list: ausente/null → []; presente → items conformados, descarta nulls (ítems non-null)", () => {
    const listOfInt: ShapeDescriptor = { kind: "list", itemShape: intS };
    expect(conformToSnapshotShape(undefined, listOfInt)).toEqual([]);
    expect(conformToSnapshotShape(null, listOfInt)).toEqual([]);
    // "" conforma a null y se descarta (los ítems de [Int!] no admiten null)
    expect(conformToSnapshotShape(["1", "", 3], listOfInt)).toEqual([1, 3]);
  });

  it("list de objetos: descarta elementos nulos del data viejo", () => {
    const listOfObj: ShapeDescriptor = { kind: "list", itemShape: { kind: "object", fields: { x: intS } } };
    expect(conformToSnapshotShape([{ x: "1" }, null, { x: "2" }], listOfObj)).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it("object: recurse, lista ausente→[], scalar ausente→null, preserva claves extra", () => {
    const shape: ShapeDescriptor = {
      kind: "object",
      fields: {
        contractDuration: intS,
        publishers: { kind: "list", itemShape: { kind: "object", fields: { percentage: intS } } },
        name: strS,
      },
    };
    const out = conformToSnapshotShape(
      { contractDuration: "", name: "X", contractNumber: "0001" },
      shape
    );
    expect(out.contractDuration).toBe(null);
    expect(out.publishers).toEqual([]);
    expect(out.name).toBe("X");
    expect(out.contractNumber).toBe("0001");
  });

  it("object null/array donde se espera object → null", () => {
    const shape: ShapeDescriptor = { kind: "object", fields: { x: intS } };
    expect(conformToSnapshotShape(null, shape)).toBe(null);
    expect(conformToSnapshotShape([1, 2], shape)).toBe(null);
  });

  it("multilang: no agrega clave base; preserva las claves sufijadas del data_", () => {
    const shape: ShapeDescriptor = {
      kind: "object",
      fields: { name: { kind: "multilang", suffixes: ["_es", "_en", "_pt"] } },
    };
    const out = conformToSnapshotShape({ name_es: "Hola", name_en: "Hi" }, shape);
    expect(out.name_es).toBe("Hola");
    expect(out.name_en).toBe("Hi");
    expect("name" in out).toBe(false);
  });

  it("ref / enum / file: passthrough", () => {
    expect(conformToSnapshotShape({ id: "x" }, { kind: "ref" })).toEqual({ id: "x" });
    expect(conformToSnapshotShape("VAL", { kind: "enum" })).toBe("VAL");
    expect(conformToSnapshotShape({ filename: "a.pdf" }, { kind: "file" })).toEqual({ filename: "a.pdf" });
  });
});
