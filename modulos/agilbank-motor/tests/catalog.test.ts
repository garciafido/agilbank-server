import { catalog, catalogProblems, resolveType, type BankSynonyms, type Catalog } from "../src/catalog/catalog";

describe("las tablas del canónico", () => {
  it("son consistentes: todo tipo existe, ningún concepto lleva a dos tipos, los bancos tienen tres dígitos", () => {
    expect(catalogProblems(catalog)).toEqual([]);
  });

  it("detectan un sinónimo que apunta a un tipo que no existe", () => {
    const roto = { ...catalog, synonyms: { ...catalog.synonyms, general: [{ prefix: "algo", type: "no-existe" }] } };
    expect(catalogProblems(roto)).toContain('El sinónimo general «algo» apunta al tipo «no-existe», que no está en el catálogo.');
  });

  it("detectan un prefijo repetido con dos tipos en el mismo banco", () => {
    const banco = catalog.synonyms.banks["014"];
    const roto = {
      ...catalog,
      synonyms: {
        ...catalog.synonyms,
        banks: { ...catalog.synonyms.banks, "014": { ...banco, texts: [...banco.texts, { prefix: "transf de", type: "comision" }] } },
      },
    };
    expect(catalogProblems(roto)).toContain("El banco 014 tiene el prefijo «transf de» con dos tipos.");
  });

  it("detectan un final repetido con dos tipos (repetido con el mismo no es problema), uno sin normalizar y uno que apunta a un tipo que no existe", () => {
    const banco = catalog.synonyms.banks["014"];
    const endings = [
      { suffix: "bco ref", type: "transferencia-recibida" },
      { suffix: "bco ref", type: "transferencia-recibida" },
      { suffix: "bco ref", type: "comision" },
      { suffix: "Bco. Ref.", type: "comision" },
      { suffix: "ref", type: "no-existe" },
    ];
    const roto = { ...catalog, synonyms: { ...catalog.synonyms, banks: { ...catalog.synonyms.banks, "014": { ...banco, endings } } } };
    expect(catalogProblems(roto)).toEqual([
      "El banco 014 tiene el final «bco ref» con dos tipos.",
      "El final «Bco. Ref.» no está normalizado: debería ser «bco ref».",
      "El final «ref» del banco 014 apunta al tipo «no-existe», que no está en el catálogo.",
    ]);
  });

  it("detectan un prefijo que no está normalizado", () => {
    const roto = { ...catalog, synonyms: { ...catalog.synonyms, general: [{ prefix: "Transf. De", type: "comision" }] } };
    expect(catalogProblems(roto)).toContain("El prefijo «Transf. De» no está normalizado: debería ser «transf de».");
  });

  it("resuelven un tipo que depende del signo", () => {
    expect(resolveType({ "+": "fci-rescate", "-": "fci-suscripcion" }, 100)).toBe("fci-rescate");
    expect(resolveType({ "+": "fci-rescate", "-": "fci-suscripcion" }, -100)).toBe("fci-suscripcion");
    expect(resolveType("comision", -100)).toBe("comision");
  });

  it("un importe en cero toma el tipo de las entradas", () => {
    expect(resolveType({ "+": "fci-rescate", "-": "fci-suscripcion" }, 0)).toBe("fci-rescate");
  });
});

describe("catalogProblems, cada control", () => {
  const banco = (s: Partial<BankSynonyms>): Catalog => ({
    ...catalog,
    synonyms: { ...catalog.synonyms, banks: { "999": { codes: {}, texts: [], ...s } }, general: [] },
  });

  it("un banco con un código que no es de tres dígitos", () => {
    const conBancos = (codes: string[]): Catalog => ({ ...catalog, banks: codes.map((code) => ({ code, name: `Banco ${code}`, cuit: null, aliases: [] })) });
    expect(catalogProblems(conBancos(["191", "007"]))).toEqual([]);
    expect(catalogProblems(conBancos(["1919", "x191", "19"]))).toEqual([
      "El banco «Banco 1919» tiene el código «1919», que no es de tres dígitos.",
      "El banco «Banco x191» tiene el código «x191», que no es de tres dígitos.",
      "El banco «Banco 19» tiene el código «19», que no es de tres dígitos.",
    ]);
  });

  it("un código de operación que apunta a un tipo que no existe, también en un tipo según el signo", () => {
    expect(catalogProblems(banco({ codes: { "10": "comision", "11": { "+": "fci-rescate", "-": "fci-suscripcion" } } }))).toEqual([]);
    expect(catalogProblems(banco({ codes: { "10": "no-existe", "11": { "+": "fci-rescate", "-": "tampoco" } } }))).toEqual([
      "El código 10 del banco 999 apunta al tipo «no-existe», que no está en el catálogo.",
      "El código 11 del banco 999 apunta al tipo «tampoco», que no está en el catálogo.",
    ]);
  });

  it("un prefijo que apunta a un tipo que no existe, y uno repetido con el mismo tipo no es problema", () => {
    expect(catalogProblems(banco({ texts: [{ prefix: "transf de", type: "comision" }, { prefix: "transf de", type: "comision" }] }))).toEqual([]);
    expect(catalogProblems(banco({ texts: [{ prefix: "transf de", type: { "+": "no-existe", "-": "comision" } }] }))).toEqual([
      "El prefijo «transf de» del banco 999 apunta al tipo «no-existe», que no está en el catálogo.",
    ]);
  });

  it("un final repetido con dos tipos", () => {
    expect(catalogProblems(banco({ endings: [{ suffix: "bco ref", type: "comision" }, { suffix: "bco ref", type: "sellos" }] }))).toEqual([
      "El banco 999 tiene el final «bco ref» con dos tipos.",
    ]);
  });

  it("un sinónimo general con un tipo que existe no es problema", () => {
    const general: Catalog = { ...catalog, synonyms: { ...catalog.synonyms, general: [{ prefix: "algo", type: "comision" }] } };
    expect(catalogProblems(general)).toEqual([]);
  });

  it("un no-movimiento sin normalizar", () => {
    const roto: Catalog = { ...catalog, synonyms: { ...catalog.synonyms, nonMovements: ["Saldo Anterior"] } };
    expect(catalogProblems(roto)).toEqual(["El prefijo «Saldo Anterior» no está normalizado: debería ser «saldo anterior»."]);
  });
});
