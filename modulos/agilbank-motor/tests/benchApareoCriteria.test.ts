import { checkCase, extractFileOf } from "../bench/apareoCriteria";

describe("checkCase", () => {
  const expected = { inStatement: new Set(["1", "2", "3", "4"]), notInStatement: new Set(["9"]) };
  it("cobertura y precisión sobre los pisos: sin fallas", () => {
    expect(checkCase({ matched: new Set(["1", "2", "3"]) }, expected, { coverage: 0.75, precision: 1, approved: true })).toEqual([]);
  });
  it("cobertura bajo el piso", () => {
    expect(checkCase({ matched: new Set(["1"]) }, expected, { coverage: 0.75, precision: 1, approved: true })).toEqual([expect.stringContaining("cobertura")]);
  });
  it("un valor no reflejado apareado falla, salvo en un caso sin aprobar", () => {
    expect(checkCase({ matched: new Set(["1", "2", "3", "9"]) }, expected, { coverage: 0.75, precision: 0.7, approved: true })).toEqual([expect.stringContaining("no reflejado")]);
    expect(checkCase({ matched: new Set(["1", "2", "3", "9"]) }, expected, { coverage: 0.75, precision: 0, approved: false })).toEqual([]);
  });
  it("precisión bajo el piso", () => {
    expect(checkCase({ matched: new Set(["1", "8"]) }, expected, { coverage: 0.25, precision: 0.9, approved: true })).toEqual([expect.stringContaining("precisión")]);
  });
});

describe("extractFileOf", () => {
  const md = (row: string) => `# Caso 9: inventado\n\n| Campo | Valor |\n|---|---|\n| Banco | Uno |\n${row}\n| Renglones del extracto | 10 |\n`;
  it("el archivo de la fila Extracto, sin la carpeta", () => {
    expect(extractFileOf(md("| Extracto | `Ejemplos Extractos/resumen de prueba 01.xlsx` |"))).toBe("resumen de prueba 01.xlsx");
  });
  it("con una aclaración después del nombre, toma solo el nombre", () => {
    expect(extractFileOf(md("| Extracto | `Ejemplos Extractos/prueba.pdf`. El archivo `(1)` es otro. |"))).toBe("prueba.pdf");
  });
  it("sin la fila Extracto, o sin la carpeta de los extractos, null; otra fila que nombra el extracto no cuenta", () => {
    expect(extractFileOf(md("| Renglones del extracto | 964 |"))).toBeNull();
    expect(extractFileOf(md("| Extracto | `otra/prueba.pdf` |"))).toBeNull();
    expect(extractFileOf("| Extracto bancario | `Ejemplos Extractos/x.pdf` |")).toBeNull();
  });
});
