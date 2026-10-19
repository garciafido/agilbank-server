// agilmind-lectura/tests/juez/interseccion.test.ts
import { coordinar } from "../../src/juez/coordinar";
import { TOPE_POR_DEFECTO, type Campo, type ControlDelJuez, type Juez, type Lectura } from "../../src/juez/contrato";

const pesos = (id: string, valor: number): Campo => ({ id, valor: { tipo: "centavos", valor, moneda: "ARS" }, veredicto: "grounded" });
const control = (id: string, partes: string[], estado: ControlDelJuez["estado"]): ControlDelJuez => ({
  id, estado, residuo: estado === "cierra" ? 0 : 100, partes, faltan: [], sospechosos: { informa: false }, posicion: { informa: false },
  veredicto: estado === "cierra" ? "verified" : "weak", motivo: "m",
});
const juez = (cs: (l: Lectura) => ControlDelJuez[], id = "j"): Juez => ({ id, version: "1", juzgar: cs });
const decl = (j: Juez | Juez[], alternativasDeLista = TOPE_POR_DEFECTO.alternativasDeLista) =>
  ({ jueces: Array.isArray(j) ? j : [j], despeja: new Set<string>(), tope: { ...TOPE_POR_DEFECTO, alternativasDeLista } });
const base: Lectura = { campos: [pesos("total", 1310), pesos("neto", 1000), pesos("iva", 210), pesos("otros", 0)], listas: [] };

describe("sospechosos por intersección", () => {
  it("un control que cierra descarta sus partes; queda lo que está en todos los que fallan", () => {
    const d = coordinar(base, decl(juez(() => [
      control("total = neto + iva + otros", ["total", "neto", "iva", "otros"], "no-cierra"),
      control("renglones = neto", ["neto"], "cierra"),
    ])));
    expect(d.sospechososPorInterseccion).toEqual(["iva", "otros", "total"]);
  });
  it("sin controles que fallen, ninguno", () => {
    const d = coordinar(base, decl(juez(() => [control("c", ["total"], "cierra")])));
    expect(d.sospechososPorInterseccion).toEqual([]);
  });
  it("un control de completitud que no cierra y no tiene partes no apaga los sospechosos de la suma", () => {
    const d = coordinar(base, decl(juez(() => [
      control("total = neto + iva", ["total", "neto", "iva"], "no-cierra"),
      control("cbu presente", [], "no-cierra"),
    ])));
    expect(d.sospechososPorInterseccion).toEqual(["iva", "neto", "total"]);
  });
  it("si los únicos controles que no cierran no tienen partes, no hay sospechosos", () => {
    const d = coordinar(base, decl(juez(() => [
      control("cbu presente", [], "no-cierra"),
      control("fecha presente", [], "no-cierra"),
    ])));
    expect(d.sospechososPorInterseccion).toEqual([]);
  });
  it("un control sin juzgar no cuenta como falla", () => {
    const d = coordinar(base, decl(juez(() => [control("c", ["total", "neto"], "no-se-puede-juzgar")])));
    expect(d.sospechososPorInterseccion).toEqual([]);
  });
  it("solo queda lo común a todos los que fallan, venga del juez que venga", () => {
    const a = juez(() => [control("a", ["total", "neto", "iva"], "no-cierra")], "a");
    const b = juez(() => [control("b", ["iva", "otros", "total"], "no-cierra")], "b");
    expect(coordinar(base, decl([a, b])).sospechososPorInterseccion).toEqual(["iva", "total"]);
  });
  it("un control sin juzgar no descarta partes: lo que no se miró no exonera", () => {
    const d = coordinar(base, decl(juez(() => [
      control("f", ["total", "neto"], "no-cierra"),
      control("g", ["neto"], "no-se-puede-juzgar"),
    ])));
    expect(d.sospechososPorInterseccion).toEqual(["neto", "total"]);
  });
  it("un control que cierra pero se baja a sin juzgar por una parte unavailable no descarta", () => {
    const l: Lectura = { campos: [...base.campos, { ...pesos("u", 0), veredicto: "unavailable" }], listas: [] };
    const d = coordinar(l, decl(juez(() => [
      control("f", ["total", "neto"], "no-cierra"),
      control("k", ["neto", "u"], "cierra"),
    ])));
    expect(d.controles.find((c) => c.id === "k")!.estado).toBe("no-se-puede-juzgar");
    expect(d.sospechososPorInterseccion).toEqual(["neto", "total"]);
  });
  it("un control que cierra por construcción no descarta sus partes", () => {
    const d = coordinar(base, decl(juez(() => [
      control("f", ["total", "neto"], "no-cierra"),
      control("g", ["neto"], "cierra-por-construccion"),
    ])));
    expect(d.sospechososPorInterseccion).toEqual(["neto", "total"]);
  });
  it("un juez que falló al juzgar no aporta sospechosos", () => {
    const roto = juez(() => { throw new Error("x"); }, "roto");
    const d = coordinar(base, decl([roto, juez(() => [control("f", ["total"], "no-cierra")])]));
    expect(d.sospechososPorInterseccion).toEqual(["total"]);
  });
  it("las alternativas de las listas no cuentan: se calcula sobre los controles principales", () => {
    const l: Lectura = { campos: [pesos("neto", 1000)], listas: [{
      id: "renglones", elementos: [pesos("r1", 1000)],
      alternativas: [{ elementos: [pesos("a1", 999)], veredicto: "grounded", origen: { camino: "t" } }],
    }] };
    const j = juez((x) => {
      const filas = x.listas[0].elementos;
      const total = filas.reduce((s, f) => s + (f.valor as { valor: number }).valor, 0);
      return [control("Σ = neto", ["neto", ...filas.map((f) => f.id)], total === 1000 ? "cierra" : "no-cierra")];
    });
    expect(coordinar(l, decl(j)).sospechososPorInterseccion).toEqual([]);
  });
});

describe("alternativas de lista", () => {
  const fila = (id: string, valor: number) => pesos(id, valor);
  const conTabla: Lectura = {
    campos: [pesos("neto", 1000)],
    listas: [{
      id: "renglones",
      elementos: [fila("r1", 600)],
      alternativas: [
        { elementos: [fila("a1", 600), fila("a2", 400)], veredicto: "grounded", origen: { camino: "tesseract" } },
        { elementos: [fila("b1", 999)], veredicto: "grounded", origen: { camino: "pp-ocr" } },
      ],
    }],
  };
  const suma = juez((l) => {
    const filas = l.listas.find((x) => x.id === "renglones")!.elementos;
    const total = filas.reduce((s, f) => s + (f.valor as { valor: number }).valor, 0);
    return [control("Σ renglones = neto", ["neto", ...filas.map((f) => f.id)], total === 1000 ? "cierra" : "no-cierra")];
  });

  it("cada alternativa se juzga por separado y el coordinador no elige", () => {
    const d = coordinar(conTabla, decl(suma));
    expect(d.controles[0].estado).toBe("no-cierra");
    expect(d.porAlternativa.map((a) => [a.lista, a.alternativa, a.controles[0].estado])).toEqual([
      ["renglones", 0, "cierra"],
      ["renglones", 1, "no-cierra"],
    ]);
  });
  it("las alternativas de más se cortan y se avisa", () => {
    const d = coordinar(conTabla, decl(suma, 1));
    expect(d.porAlternativa).toHaveLength(1);
    expect(d.truncada).toBe(true);
  });
  it("con tantas alternativas como el tope no se avisa", () => {
    const d = coordinar(conTabla, decl(suma, 2));
    expect(d.porAlternativa).toHaveLength(2);
    expect(d.truncada).toBe(false);
  });
  it("sin alternativas no hay nada por alternativa", () => {
    const d = coordinar({ ...conTabla, listas: [{ id: "renglones", elementos: [fila("r1", 600)] }] }, decl(suma));
    expect(d.porAlternativa).toEqual([]);
    expect(d.truncada).toBe(false);
  });
  it("de cada alternativa quedan solo los controles que tocan esa lista o sus elementos", () => {
    const otro = juez(() => [control("neto = neto", ["neto"], "cierra")], "otro");
    const d = coordinar(conTabla, decl([suma, otro]));
    expect(d.controles).toHaveLength(2);
    expect(d.porAlternativa.map((a) => a.controles.map((c) => c.id))).toEqual([["Σ renglones = neto"], ["Σ renglones = neto"]]);
  });
  it("un control que cita la lista por su id también cuenta", () => {
    const porLista = juez(() => [control("lista", ["renglones"], "no-se-puede-juzgar")], "pl");
    const d = coordinar(conTabla, decl(porLista));
    expect(d.porAlternativa[0].controles.map((c) => c.id)).toEqual(["lista"]);
  });
  it("la lectura de cada alternativa deja intactas las demás listas y la entrada", () => {
    const vista: Lectura[] = [];
    const espia = juez((l) => { vista.push(l); return []; });
    const copia = structuredClone(conTabla);
    coordinar(conTabla, decl(espia));
    expect(conTabla).toEqual(copia);
    expect(vista.map((l) => l.listas[0].elementos.map((e) => e.id))).toEqual([["r1"], ["a1", "a2"], ["b1"]]);
    expect(vista[1].campos.map((c) => c.id)).toEqual(["neto"]);
  });
  it("la alternativa reemplaza solo su lista: las otras listas llegan con sus elementos", () => {
    const l: Lectura = { ...conTabla, listas: [...conTabla.listas, { id: "otra", elementos: [fila("o1", 5)] }] };
    const vista: string[][] = [];
    coordinar(l, decl(juez((x) => { vista.push(x.listas.find((y) => y.id === "otra")!.elementos.map((e) => e.id)); return []; })));
    expect(vista).toEqual([["o1"], ["o1"], ["o1"]]);
  });
  it("un juez que falla al juzgar una alternativa deja su control de falla en esa alternativa, sin filtrar por partes", () => {
    let llamadas = 0;
    const roto = juez((l) => {
      if (l.listas[0].elementos[0].id === "a1") throw new Error("boom");
      llamadas++;
      return [];
    }, "roto");
    const d = coordinar(conTabla, decl([roto, suma]));
    const [primera, segunda] = d.porAlternativa;
    expect(primera.controles.map((c) => [c.juez, c.estado, c.veredicto])).toEqual([
      ["j", "cierra", "verified"],
      ["roto", "no-se-puede-juzgar", "unavailable"],
    ]);
    expect(primera.controles.find((c) => c.juez === "roto")!.motivo).toContain("boom");
    expect(segunda.controles.map((c) => c.juez)).toEqual(["j"]);
    expect(d.controles.every((c) => c.juez !== "roto")).toBe(true);
    expect(llamadas).toBe(2);
  });
  it("con estricto, el juez roto al juzgar una alternativa propaga el error", () => {
    const roto = juez((l) => { if (l.listas[0].elementos[0].id === "a1") throw new Error("boom"); return []; }, "roto");
    expect(() => coordinar(conTabla, { ...decl(roto), estricto: true })).toThrow("boom");
  });
  it("no se propone sobre las alternativas: proponer ve solo la lectura principal", () => {
    let vistas = 0;
    const j: Juez = {
      id: "p", version: "1", juzgar: () => [],
      proponer: (l) => { vistas++; expect(l.listas[0].elementos.map((e) => e.id)).toEqual(["r1"]); return { propuestas: [], ambiguas: [], truncada: false }; },
    };
    coordinar(conTabla, { ...decl(j), despeja: new Set(["p"]) });
    expect(vistas).toBe(1);
  });

  describe("qué controles usan la lista", () => {
    const alt = (elementos: Campo[], veredicto: Campo["veredicto"] = "grounded") => ({ elementos, veredicto, origen: { camino: "t" } });
    const tabla = (alts: ReturnType<typeof alt>[]): Lectura => ({ campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 600)], alternativas: alts }] });

    it("una alternativa vacía conserva el control que no cierra", () => {
      const d = coordinar(tabla([alt([])]), decl(suma));
      expect(d.porAlternativa).toHaveLength(1);
      expect(d.porAlternativa[0].controles.map((c) => [c.id, c.estado])).toEqual([["Σ renglones = neto", "no-cierra"]]);
    });
    it("un control que declara faltar elementos de la lista entra aunque no cite elementos", () => {
      const j = juez(() => [{ ...control("faltan filas", ["neto"], "no-se-puede-juzgar"), faltan: [{ elementoDe: "renglones" }] }]);
      const d = coordinar(tabla([alt([fila("a1", 1000)])]), decl(j));
      expect(d.porAlternativa[0].controles.map((c) => c.id)).toEqual(["faltan filas"]);
    });
    it("un control que cita un elemento de la lista principal entra", () => {
      const j = juez(() => [control("cita r1", ["neto", "r1"], "no-cierra")]);
      const d = coordinar(tabla([alt([fila("a1", 1000)])]), decl(j));
      expect(d.porAlternativa[0].controles.map((c) => [c.id, c.estado])).toEqual([["cita r1", "no-se-puede-juzgar"]]);
    });
    it("un control que cita un elemento solo de la alternativa entra aunque su id cambie con la lectura", () => {
      const porFila = juez((l) => l.listas[0].elementos.map((e) => control(`fila ${e.id}`, [e.id], "cierra")));
      const d = coordinar(tabla([alt([fila("a1", 1)])]), decl(porFila));
      expect(d.porAlternativa[0].controles.map((c) => c.id)).toEqual(["fila a1"]);
    });
    it("un control que declara faltar otra cosa, o elementos de otra lista, no entra", () => {
      const j = juez(() => [
        { ...control("otra lista", ["neto"], "no-se-puede-juzgar"), faltan: [{ elementoDe: "otra" }] },
        { ...control("un campo", ["neto"], "no-se-puede-juzgar"), faltan: [{ campo: "renglones" }] },
      ]);
      expect(coordinar(tabla([alt([fila("a1", 1)])]), decl(j)).porAlternativa[0].controles).toEqual([]);
    });
    it("un control ajeno a la lista no entra, ni siquiera en una alternativa vacía", () => {
      const j = juez(() => [control("neto", ["neto"], "cierra")]);
      expect(coordinar(tabla([alt([])]), decl(j)).porAlternativa[0].controles).toEqual([]);
    });
  });

  describe("el veredicto de la alternativa cuenta como parte", () => {
    const alt = (veredicto: Campo["veredicto"]) => ({ elementos: [fila("a1", 600), fila("a2", 400)], veredicto, origen: { camino: "t" } });
    const tabla = (v: Campo["veredicto"]): Lectura => ({ campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 600)], alternativas: [alt(v)] }] });

    it("una alternativa weak con elementos grounded deja la parte más débil en weak", () => {
      const c = coordinar(tabla("weak"), decl(suma)).porAlternativa[0].controles[0];
      expect([c.estado, c.parteMasDebil]).toEqual(["cierra", "weak"]);
    });
    it("una alternativa unavailable deja el control sin juzgar y unavailable", () => {
      const c = coordinar(tabla("unavailable"), decl(suma)).porAlternativa[0].controles[0];
      expect([c.estado, c.veredicto, c.parteMasDebil]).toEqual(["no-se-puede-juzgar", "unavailable", "unavailable"]);
    });
    it.each([
      ["unavailable", "la alternativa no se pudo leer"],
      ["abstained", "la alternativa no tiene lectura"],
    ] as const)("una alternativa vacía %s deja sus controles sin juzgar con ese veredicto y sin residuo", (v, motivo) => {
      const vacia: Lectura = { campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 1000)], alternativas: [{ elementos: [], veredicto: v, origen: { camino: "t" } }] }] };
      const [c] = coordinar(vacia, decl(suma)).porAlternativa[0].controles;
      expect([c.estado, c.veredicto, c.residuo, c.parteMasDebil]).toEqual(["no-se-puede-juzgar", v, null, v]);
      expect(c.motivo).toBe(`m · ${motivo}`);
    });
    it("una alternativa abstained con elementos también: no se afirma nada sobre una lectura que no existe", () => {
      const [c] = coordinar(tabla("abstained"), decl(suma)).porAlternativa[0].controles;
      expect([c.estado, c.veredicto, c.residuo]).toEqual(["no-se-puede-juzgar", "abstained", null]);
    });
    it("el control de falla de un juez roto sigue unavailable aunque la alternativa sea abstained", () => {
      const roto = juez(() => { throw new Error("boom"); }, "roto");
      const [c] = coordinar(tabla("abstained"), decl(roto)).porAlternativa[0].controles;
      expect([c.estado, c.veredicto]).toEqual(["no-se-puede-juzgar", "unavailable"]);
    });
    it("una alternativa weak no cambia el estado ni el residuo, ni el motivo", () => {
      const [c] = coordinar(tabla("weak"), decl(suma)).porAlternativa[0].controles;
      expect([c.estado, c.residuo, c.motivo]).toEqual(["cierra", 0, "m"]);
    });
    it("una alternativa grounded no baja a los elementos firmes y no toca la lectura principal", () => {
      const l = tabla("grounded");
      const d = coordinar(l, decl(suma));
      expect(d.porAlternativa[0].controles[0].parteMasDebil).toBe("grounded");
      expect(l.listas[0].alternativas![0].elementos.every((e) => e.veredicto === "grounded")).toBe(true);
    });
  });

  describe("una alternativa mal formada", () => {
    const alt = (elementos: Campo[]) => ({ elementos, veredicto: "grounded" as const, origen: { camino: "t" } });
    const tabla = (alts: ReturnType<typeof alt>[]): Lectura => ({ campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 1000)], alternativas: alts }] });

    it("con un id repetido sale con un solo control de falla unavailable y el dictamen sigue", () => {
      const d = coordinar(tabla([alt([fila("x", 500), fila("x", 500)]), alt([fila("a1", 1000)])]), decl(suma));
      expect(d.controles.map((c) => c.estado)).toEqual(["cierra"]);
      const [mala, buena] = d.porAlternativa;
      expect(mala.controles).toHaveLength(1);
      expect(mala.controles[0]).toEqual({
        id: "coordinador: alternativa 0 de renglones mal formada", estado: "no-se-puede-juzgar", residuo: null, partes: [], faltan: [],
        sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "unavailable", parteMasDebil: "unavailable",
        juez: "coordinador", motivo: "la alternativa no se pudo juzgar: id repetido: x",
      });
      expect(mala.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", parteMasDebil: "unavailable", partes: [], residuo: null }));
      expect(mala.controles[0].motivo).toContain("id repetido: x");
      expect(buena.controles.map((c) => c.estado)).toEqual(["cierra"]);
    });
    it("con un id que choca con un campo suelto también", () => {
      const d = coordinar(tabla([alt([fila("neto", 1000)])]), decl(suma));
      expect(d.porAlternativa[0].controles).toHaveLength(1);
      expect(d.porAlternativa[0].controles[0].motivo).toContain("id repetido: neto");
    });
    it("cuenta para el tope igual que una buena", () => {
      const d = coordinar(tabla([alt([fila("x", 1), fila("x", 1)]), alt([fila("a1", 1000)])]), decl(suma, 1));
      expect(d.porAlternativa).toHaveLength(1);
      expect(d.truncada).toBe(true);
    });
  });

  describe("el tope", () => {
    const l: Lectura = { campos: [pesos("neto", 1000)], listas: [] };
    it.each([[NaN], [-1], [1.5], [undefined], ["2"], [Infinity]])("alternativasDeLista %p tira tope inválido", (v) => {
      expect(() => coordinar(l, { ...decl(suma), tope: { ...TOPE_POR_DEFECTO, alternativasDeLista: v as number } })).toThrow("tope inválido: alternativasDeLista");
    });
    it.each(["candidatosPorCampo", "camposConCandidatos", "combinaciones"] as const)("%s inválido tira tope inválido", (k) => {
      const d = decl(suma);
      expect(() => coordinar(l, { ...d, tope: { ...d.tope, [k]: -1 } })).toThrow(`tope inválido: ${k}`);
      expect(() => coordinar(l, { ...d, tope: { ...d.tope, [k]: NaN } })).toThrow(`tope inválido: ${k}`);
    });
    it("un tope ausente tira tope inválido", () => {
      expect(() => coordinar(l, { ...decl(suma), tope: undefined as never })).toThrow("tope inválido");
    });
    it("cero es válido: ninguna alternativa se juzga y se avisa", () => {
      const conAlt: Lectura = { campos: [], listas: [{ id: "renglones", elementos: [fila("r1", 1)], alternativas: [{ elementos: [], veredicto: "grounded", origen: { camino: "t" } }] }] };
      const d = coordinar(conAlt, decl(juez(() => []), 0));
      expect(d.porAlternativa).toEqual([]);
      expect(d.truncada).toBe(true);
    });
  });

  it("la lectura de una alternativa no lleva las alternativas de ninguna lista", () => {
    const alt = (id: string) => ({ elementos: [fila(id, 1)], veredicto: "grounded" as const, origen: { camino: "t" } });
    const l: Lectura = { campos: [], listas: [
      { id: "a", elementos: [fila("a0", 1)], alternativas: [alt("a1")] },
      { id: "b", elementos: [fila("b0", 1)], alternativas: [alt("b1")] },
    ] };
    const vistas: Lectura[] = [];
    coordinar(l, decl(juez((x) => { vistas.push(x); return []; })));
    expect(vistas).toHaveLength(3);
    expect(vistas[0].listas.some((x) => x.alternativas)).toBe(true);
    for (const v of vistas.slice(1)) expect(v.listas.some((x) => x.alternativas)).toBe(false);
  });

  it("el control de falla se reconoce por juez e id: el control de otro juez con ese id no entra", () => {
    const x = juez(() => { throw new Error("boom"); }, "x");
    const y = juez(() => [control("x: no se pudo juzgar", [], "cierra")], "y");
    const d = coordinar(conTabla, decl([x, y]));
    expect(d.porAlternativa[0].controles.map((c) => c.juez)).toEqual(["x"]);
  });

  it("un juez que muta su lectura en una alternativa no altera la entrada ni la lectura de las siguientes", () => {
    const copia = structuredClone(conTabla);
    const vistas: string[][] = [];
    const muta = juez((l) => {
      vistas.push(l.listas[0].elementos.map((e) => e.id));
      l.listas[0].elementos.push(fila("intruso", 1));
      l.campos.length = 0;
      l.listas[0].alternativas = [];
      return [];
    });
    coordinar(conTabla, decl(muta));
    expect(conTabla).toEqual(copia);
    expect(vistas).toEqual([["r1"], ["a1", "a2"], ["b1"]]);
  });

  describe("orden estable", () => {
    const alt = (id: string, v: number) => ({ elementos: [fila(id, v)], veredicto: "grounded" as const, origen: { camino: "t" } });
    const lista = (id: string, alts: ReturnType<typeof alt>[]) => ({ id, elementos: [fila(`${id}0`, 1)], alternativas: alts });
    const cuenta = (id: string) => juez((l) => {
      const ls = l.listas.find((x) => x.id === id)!;
      return [control(`${id} suma`, [`${id}`, ...ls.elementos.map((e) => e.id)], ls.elementos.length === 1 ? "cierra" : "no-cierra")];
    }, `cuenta-${id}`);
    const jueces = [cuenta("A"), cuenta("B")];
    const l: Lectura = { campos: [pesos("neto", 1000), pesos("iva", 1)], listas: [lista("A", [alt("A1", 1), alt("A2", 2)]), lista("B", [alt("B1", 3)])] };

    it("permutar jueces, campos y listas da el mismo porAlternativa", () => {
      const x = coordinar(l, decl(jueces));
      const y = coordinar({ campos: [...l.campos].reverse(), listas: [...l.listas].reverse() }, decl([...jueces].reverse()));
      expect(y.porAlternativa).toEqual(x.porAlternativa);
      expect(x.porAlternativa.map((a) => [a.lista, a.alternativa])).toEqual([["A", 0], ["A", 1], ["B", 0]]);
    });
    it("permutar las alternativas de una lista las renumera: el índice es el de la entrada", () => {
      const swap: Lectura = { ...l, listas: [lista("A", [alt("A2", 2), alt("A1", 1)]), l.listas[1]] };
      const x = coordinar(l, decl(jueces)).porAlternativa;
      const y = coordinar(swap, decl(jueces)).porAlternativa;
      expect(y[0].controles.map((c) => c.partes)).toEqual(x[1].controles.map((c) => c.partes));
      expect(y[1].controles.map((c) => c.partes)).toEqual(x[0].controles.map((c) => c.partes));
    });
  });

  describe("la tabla entera es parte de todo control que la usa", () => {
    const alt = (elementos: Campo[], veredicto: unknown) => ({ elementos, veredicto: veredicto as Campo["veredicto"], origen: { camino: "t" } });
    const tabla = (alts: ReturnType<typeof alt>[]): Lectura => ({ campos: [{ ...pesos("neto", 0), veredicto: "verified" }], listas: [{ id: "renglones", elementos: [fila("r1", 600)], alternativas: alts }] });

    it("una alternativa vacía weak deja la parte más débil en weak aunque el control no cite elementos", () => {
      const [c] = coordinar(tabla([alt([], "weak")]), decl(suma)).porAlternativa[0].controles;
      expect([c.estado, c.veredicto, c.parteMasDebil]).toEqual(["no-cierra", "weak", "weak"]);
    });
    it("un control que entra por faltar elementos de la lista también queda acotado por la alternativa", () => {
      const faltan = juez(() => [{ ...control("faltan filas", ["neto"], "no-cierra"), faltan: [{ elementoDe: "renglones" }] }]);
      const [c] = coordinar(tabla([alt([fila("a1", 1000)], "weak")]), decl(faltan)).porAlternativa[0].controles;
      expect(c.parteMasDebil).toBe("weak");
    });
    it("un control que entra por el id de uno principal también", () => {
      const j = juez((l) => [control("c", l.listas[0].elementos[0].id === "r1" ? ["neto", "r1"] : ["neto"], "no-cierra")]);
      const l = tabla([alt([fila("a1", 1000)], "weak")]);
      const [c] = coordinar(l, decl(j)).porAlternativa[0].controles;
      expect(c.parteMasDebil).toBe("weak");
    });
    it.each([["bogus"], [undefined], [null]])("un veredicto de alternativa %p cuenta como unavailable, con o sin elementos", (v) => {
      for (const elementos of [[], [fila("a1", 1000)]]) {
        const [c] = coordinar(tabla([alt(elementos, v)]), decl(suma)).porAlternativa[0].controles;
        expect([c.estado, c.veredicto, c.parteMasDebil, c.residuo]).toEqual(["no-se-puede-juzgar", "unavailable", "unavailable", null]);
        expect(c.motivo).toContain("la alternativa no se pudo leer");
      }
    });
    it("el control de falla de un juez roto no se toca", () => {
      const roto = juez(() => { throw new Error("boom"); }, "roto");
      const [c] = coordinar(tabla([alt([], "weak")]), decl(roto)).porAlternativa[0].controles;
      expect([c.veredicto, c.parteMasDebil, c.motivo]).toEqual(["unavailable", "unavailable", "el juez falló: boom"]);
    });
  });

  describe("el faltan de un juez se valida: lo mal formado es falla del juez", () => {
    const l: Lectura = { campos: [pesos("neto", 1)], listas: [{ id: "renglones", elementos: [fila("r1", 1)], alternativas: [{ elementos: [fila("a1", 1)], veredicto: "grounded", origen: { camino: "t" } }] }] };
    it.each([[null], ["x"], [{}], [{ campo: 1 }], [{ elementoDe: null }], [7]])("faltan [%p] no tumba el dictamen", (f) => {
      const j = juez(() => [{ ...control("c", ["neto"], "cierra"), faltan: [f as never] }]);
      const d = coordinar(l, decl(j));
      expect(d.controles.map((c) => [c.juez, c.estado, c.veredicto])).toEqual([["j", "no-se-puede-juzgar", "unavailable"]]);
      expect(d.controles[0].motivo).toContain("control mal formado: c");
      expect(d.porAlternativa[0].controles.map((c) => c.estado)).toEqual(["no-se-puede-juzgar"]);
    });
    it("un juez que lo emite solo al ver la alternativa tampoco la tumba", () => {
      const soloAlt = juez((x) => x.listas[0].elementos[0].id === "a1" ? [{ ...control("c", ["neto"], "cierra"), faltan: [null as never] }] : []);
      const d = coordinar(l, decl(soloAlt));
      expect(d.porAlternativa[0].controles.map((c) => [c.juez, c.veredicto])).toEqual([["j", "unavailable"]]);
    });
    it("un faltan bien formado sigue valiendo", () => {
      const j = juez(() => [{ ...control("c", ["neto"], "no-se-puede-juzgar"), faltan: [{ campo: "z" }, { elementoDe: "renglones" }] }]);
      expect(coordinar(l, decl(j)).controles[0].faltan).toEqual([{ campo: "z" }, { elementoDe: "renglones" }]);
    });
  });

  it("el control de otro juez con el mismo id que uno principal de la lista no entra en la alternativa", () => {
    const a = juez(() => [control("total", ["neto", "r1"], "no-cierra")], "a");
    const b = juez((l) => (l.listas[0].elementos[0]?.id === "r1" ? [] : [control("total", ["neto"], "cierra")]), "b");
    const l: Lectura = { campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 600)], alternativas: [{ elementos: [fila("a1", 1000)], veredicto: "grounded", origen: { camino: "t" } }] }] };
    const d = coordinar(l, decl([a, b]));
    expect(d.porAlternativa[0].controles.map((c) => [c.juez, c.id])).toEqual([["a", "total"]]);
  });

  describe("alternativa con la forma rota", () => {
    const con = (alternativas: unknown): Lectura => ({ campos: [pesos("neto", 1000)], listas: [{ id: "renglones", elementos: [fila("r1", 1000)], alternativas: alternativas as never }] });
    const buena = { elementos: [fila("a1", 1000)], veredicto: "grounded", origen: { camino: "t" } };
    const sinLista = "alternativa sin lista de elementos";
    const sinForma = "elemento de la alternativa sin forma";
    it.each([
      ["null", null, sinLista],
      ["sin elementos", { veredicto: "grounded", origen: { camino: "t" } }, sinLista],
      ["elementos que no es lista", { ...buena, elementos: {} }, sinLista],
      ["un elemento null", { ...buena, elementos: [null] }, sinForma],
      ["un elemento sin id", { ...buena, elementos: [{ valor: null, veredicto: "grounded" }] }, sinForma],
    ])("%s sale como mal formada y las demás se juzgan", (_, rota, causa) => {
      const d = coordinar(con([rota, buena]), decl(suma));
      expect(d.controles.map((c) => c.estado)).toEqual(["cierra"]);
      expect(d.porAlternativa[0].controles.map((c) => [c.juez, c.estado, c.veredicto])).toEqual([["coordinador", "no-se-puede-juzgar", "unavailable"]]);
      expect(d.porAlternativa[0].controles[0].id).toBe("coordinador: alternativa 0 de renglones mal formada");
      expect(d.porAlternativa[0].controles[0].motivo).toBe(`la alternativa no se pudo juzgar: ${causa}`);
      expect(d.porAlternativa[1].controles.map((c) => c.estado)).toEqual(["cierra"]);
    });
    it("alternativas que no es una lista sale como una sola mal formada", () => {
      const d = coordinar(con({}), decl(suma));
      expect(d.porAlternativa).toHaveLength(1);
      expect(d.porAlternativa[0]).toEqual(expect.objectContaining({ lista: "renglones", alternativa: 0 }));
      expect(d.porAlternativa[0].controles[0].motivo).toContain("alternativas no es una lista");
      expect(d.truncada).toBe(false);
    });
  });

  it("dos listas con el mismo id: cada alternativa de ellas sale mal formada con «lista repetida»", () => {
    const alt = (elementos: Campo[]) => ({ elementos, veredicto: "grounded" as const, origen: { camino: "t" } });
    const l: Lectura = { campos: [pesos("neto", 1000)], listas: [
      { id: "renglones", elementos: [fila("r1", 600)], alternativas: [alt([]), alt([fila("a1", 1000)])] },
      { id: "renglones", elementos: [fila("r2", 400)], alternativas: [alt([fila("a2", 1)])] },
      { id: "otra", elementos: [fila("o1", 1)], alternativas: [alt([fila("a3", 1)])] },
    ] };
    const d = coordinar(l, decl(juez(() => [])));
    const malas = d.porAlternativa.filter((a) => a.lista === "renglones");
    expect(malas).toHaveLength(3);
    for (const m of malas) {
      expect(m.controles).toHaveLength(1);
      expect(m.controles[0].motivo).toBe("la alternativa no se pudo juzgar: lista repetida: renglones");
    }
    expect(d.porAlternativa.find((a) => a.lista === "otra")!.controles).toEqual([]);
  });
});
