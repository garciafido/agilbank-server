// agilmind-lectura/tests/juez/propuestas.test.ts
import { coordinar } from "../../src/juez/coordinar";
import { TOPE_POR_DEFECTO, type Campo, type ControlDelJuez, type Declaracion, type Juez, type Lectura, type Propuesta } from "../../src/juez/contrato";

const pesos = (id: string, valor: number, veredicto: Campo["veredicto"] = "grounded"): Campo => ({ id, valor: { tipo: "centavos", valor, moneda: "ARS" }, veredicto });
const control = (id: string, partes: string[]): ControlDelJuez => ({
  id, estado: "cierra", residuo: 0, partes, faltan: [], sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "verified", motivo: "m",
});
const propuesta = (valor: number, over: Partial<Propuesta> = {}): Propuesta => ({
  campo: "total", valor: { tipo: "centavos", valor, moneda: "ARS" }, controles: ["identidad"], derivadaDe: ["identidad"],
  origen: { camino: "pp-ocr", pagina: 1 }, veredicto: "verified", motivo: "impreso", ...over,
});
const proponente = (id: string, propuestas: Propuesta[], extra: { ambiguas?: Propuesta[]; truncada?: boolean; partes?: string[] } = {}): Juez => ({
  id, version: "1", juzgar: () => [control("identidad", extra.partes ?? ["neto", "iva"])],
  proponer: () => ({ propuestas, ambiguas: extra.ambiguas ?? [], truncada: extra.truncada ?? false }),
});
const decl = (jueces: Juez[], despeja: string[]): Declaracion => ({ jueces, despeja: new Set(despeja), tope: TOPE_POR_DEFECTO });
const lectura: Lectura = { campos: [{ id: "total", valor: null, veredicto: "abstained" }, pesos("neto", 1000, "grounded"), pesos("iva", 210, "weak")], listas: [] };

describe("coordinar: propuestas", () => {
  it("despejar viene apagado: un juez que sabe proponer no propone si la declaración no lo nombra", () => {
    const d = coordinar(lectura, decl([proponente("p", [propuesta(1210)])], []));
    expect(d.propuestas).toEqual([]);
  });

  it("solo propone el juez nombrado en despeja", () => {
    const d = coordinar(lectura, decl([proponente("a", [propuesta(1210)]), proponente("b", [propuesta(1211)])], ["a"]));
    expect(d.propuestas.map((p) => (p.valor as { valor: number }).valor)).toEqual([1210]);
  });

  it("una propuesta nunca es más firme que la parte más débil con que se despejó", () => {
    const d = coordinar(lectura, decl([proponente("p", [propuesta(1210)])], ["p"]));
    expect(d.propuestas).toEqual([expect.objectContaining({ campo: "total", veredicto: "weak" })]);
  });

  it("el tope sale de las partes del control, no de las del campo propuesto", () => {
    const fuertes: Lectura = { ...lectura, campos: [pesos("total", 1, "weak"), pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [propuesta(1210)], { partes: ["total", "neto", "iva"] })], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("verified");
  });

  it("un valor que no está impreso en el papel es weak como máximo", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [propuesta(1210, { origen: undefined })])], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("weak");
  });

  it("un valor impreso con partes verified conserva su veredicto", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [propuesta(1210)])], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("verified");
  });

  it("una parte ausente de la lectura baja la propuesta a abstained", () => {
    const sinIva: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified")] };
    const d = coordinar(sinIva, decl([proponente("p", [propuesta(1210)])], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("abstained");
  });

  it("dos valores distintos para el mismo campo, aunque vengan de jueces distintos, no se eligen: van a ambiguas", () => {
    const d = coordinar(lectura, decl([proponente("a", [propuesta(1210)]), proponente("b", [propuesta(1211)])], ["a", "b"]));
    expect(d.propuestas).toEqual([]);
    expect(d.ambiguas.map((p) => (p.valor as { valor: number }).valor).sort()).toEqual([1210, 1211]);
  });

  it("campos distintos no se mezclan: cada uno con su valor único es una propuesta", () => {
    const d = coordinar(lectura, decl([proponente("a", [propuesta(1210), propuesta(5, { campo: "otro" })])], ["a"]));
    expect(d.propuestas.map((p) => p.campo)).toEqual(["otro", "total"]);
    expect(d.ambiguas).toEqual([]);
  });

  it("el mismo valor propuesto por dos jueces es una sola propuesta", () => {
    const d = coordinar(lectura, decl([proponente("a", [propuesta(1210)]), proponente("b", [propuesta(1210)])], ["a", "b"]));
    expect(d.propuestas).toHaveLength(1);
  });

  it("las ambiguas de un juez llegan al dictamen, acotadas, y el tope tocado se avisa", () => {
    const d = coordinar(lectura, decl([proponente("p", [], { ambiguas: [propuesta(1), propuesta(2)], truncada: true })], ["p"]));
    expect(d.ambiguas).toHaveLength(2);
    expect(d.ambiguas.every((p) => p.veredicto === "weak")).toBe(true);
    expect(d.truncada).toBe(true);
  });

  it("truncada es falsa si ningún juez tocó el tope", () => {
    expect(coordinar(lectura, decl([proponente("p", [propuesta(1210)])], ["p"])).truncada).toBe(false);
  });

  it("el juez recibe el tope declarado", () => {
    let visto: unknown;
    const j: Juez = { id: "p", version: "1", juzgar: () => [], proponer: (_l, tope) => { visto = tope; return { propuestas: [], ambiguas: [], truncada: false }; } };
    coordinar(lectura, { ...decl([j], ["p"]), tope: { ...TOPE_POR_DEFECTO, combinaciones: 7 } });
    expect(visto).toEqual({ ...TOPE_POR_DEFECTO, combinaciones: 7 });
  });

  it("un juez que falla al proponer no tumba el dictamen; en modo estricto sí", () => {
    const roto: Juez = { id: "r", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    expect(coordinar(lectura, decl([roto], ["r"])).propuestas).toEqual([]);
    expect(() => coordinar(lectura, { ...decl([roto], ["r"]), estricto: true })).toThrow("no");
  });

  it("la falla al proponer queda a la vista como un control unavailable, no como silencio", () => {
    const roto: Juez = { id: "r", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    expect(coordinar(lectura, decl([roto], ["r"])).controles).toEqual([expect.objectContaining({
      juez: "r", estado: "no-se-puede-juzgar", veredicto: "unavailable", residuo: null, motivo: "el juez falló al proponer: no",
    })]);
  });

  it("un juez que no está en despeja no deja control de falla aunque su proponer tire", () => {
    const roto: Juez = { id: "r", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    expect(coordinar(lectura, decl([roto], [])).controles).toEqual([]);
  });

  it("una respuesta mal formada es una falla del juez y no deja propuestas a medias", () => {
    const malo: Juez = {
      id: "m", version: "1", juzgar: () => [],
      proponer: () => ({ propuestas: [propuesta(1210)], ambiguas: undefined as unknown as Propuesta[], truncada: false }),
    };
    const d = coordinar(lectura, decl([malo, proponente("p", [propuesta(1500)])], ["m", "p"]));
    expect(d.propuestas.map((p) => (p.valor as { valor: number }).valor)).toEqual([1500]);
    expect(d.controles.map((c) => c.juez)).toEqual(["m", "p"]);
    expect(() => coordinar(lectura, { ...decl([malo], ["m"]), estricto: true })).toThrow();
  });

  it("un control citado en derivadaDe que no existe en el dictamen cuenta como una parte abstained", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [propuesta(1210, { derivadaDe: ["identidad", "fantasma"] })])], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("abstained");
    const solo = coordinar(fuertes, decl([proponente("p", [propuesta(1210, { derivadaDe: ["fantasma"] })])], ["p"]));
    expect(solo.propuestas[0].veredicto).toBe("abstained");
  });

  it("un control citado que existe pero no aporta partes deja la propuesta en weak: sin partes no hay procedencia", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const sinPartes = proponente("p", [propuesta(1210, { derivadaDe: ["vacio"] })]);
    const j: Juez = { ...sinPartes, juzgar: () => [control("vacio", [])] };
    expect(coordinar(fuertes, decl([j], ["p"])).propuestas[0].veredicto).toBe("weak");
  });

  it("un control cuya única parte es el campo propuesto tampoco aporta partes", () => {
    const fuertes: Lectura = { ...lectura, campos: [pesos("total", 1, "verified"), pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const j: Juez = { ...proponente("p", [propuesta(1210)]), juzgar: () => [control("identidad", ["total"])] };
    expect(coordinar(fuertes, decl([j], ["p"])).propuestas[0].veredicto).toBe("weak");
  });

  const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
  const conControles = (id: string, extra: ControlDelJuez[], p: Propuesta, ambiguas: Propuesta[] = []): Juez => ({
    id, version: "1", juzgar: () => [control("identidad", ["neto", "iva"]), ...extra],
    proponer: () => ({ propuestas: [p], ambiguas, truncada: false }),
  });

  it("citar el control de falla de un juez roto da unavailable: no se pudo calcular", () => {
    const roto: Juez = { id: "r", version: "1", juzgar: () => { throw new Error("no"); } };
    const p = proponente("p", [propuesta(1210, { derivadaDe: ["r: no se pudo juzgar"] })]);
    expect(coordinar(fuertes, decl([roto, p], ["p"])).propuestas[0].veredicto).toBe("unavailable");
  });

  it("citar el control de falla al proponer de otro juez también da unavailable", () => {
    const q: Juez = { id: "q", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    const p = proponente("p", [propuesta(1210, { derivadaDe: ["q: no se pudo proponer"] })]);
    expect(coordinar(fuertes, decl([q, p], ["p", "q"])).propuestas[0].veredicto).toBe("unavailable");
  });

  it("junto a un control con partes, uno de falla pesa unavailable y uno sin partes pesa weak", () => {
    const roto: Juez = { id: "r", version: "1", juzgar: () => { throw new Error("no"); } };
    const conFalla = proponente("p", [propuesta(1210, { derivadaDe: ["identidad", "r: no se pudo juzgar"] })]);
    expect(coordinar(fuertes, decl([roto, conFalla], ["p"])).propuestas[0].veredicto).toBe("unavailable");

    const conVacio = conControles("p", [control("vacio", [])], propuesta(1210, { derivadaDe: ["identidad", "vacio"] }));
    expect(coordinar(fuertes, decl([conVacio], ["p"])).propuestas[0].veredicto).toBe("weak");

    const soloCampo = conControles("p", [control("propio", ["total"])], propuesta(1210, { derivadaDe: ["identidad", "propio"] }));
    expect(coordinar(fuertes, decl([soloCampo], ["p"])).propuestas[0].veredicto).toBe("weak");
  });

  it("una parte sin valor acota como en el control: abstained, y unavailable si lo es o es desconocido", () => {
    const con = (neto: Campo): Lectura => ({ ...lectura, campos: [lectura.campos[0], neto, pesos("iva", 210, "verified")] });
    const veredicto = (neto: Campo) => coordinar(con(neto), decl([proponente("p", [propuesta(1210)])], ["p"])).propuestas[0].veredicto;
    expect(veredicto({ id: "neto", valor: null, veredicto: "verified" })).toBe("abstained");
    expect(veredicto({ id: "neto", valor: null, veredicto: "weak" })).toBe("abstained");
    expect(veredicto({ id: "neto", valor: null, veredicto: "unavailable" })).toBe("unavailable");
    expect(veredicto({ id: "neto", valor: null, veredicto: "inventado" as unknown as Campo["veredicto"] })).toBe("unavailable");
  });

  it("una propuesta weak con partes verified sale weak: nunca más firme que lo que ella misma dice", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    expect(coordinar(fuertes, decl([proponente("p", [propuesta(1210, { veredicto: "weak" })])], ["p"])).propuestas[0].veredicto).toBe("weak");
  });

  it("si un juez trae ambiguas sobre un campo, ese campo no tiene propuesta aunque otro juez proponga uno de los valores", () => {
    const a = proponente("a", [propuesta(1210)]);
    const b = proponente("b", [], { ambiguas: [propuesta(1210), propuesta(1211)] });
    const d = coordinar(lectura, decl([a, b], ["a", "b"]));
    expect(d.propuestas).toEqual([]);
    expect(d.ambiguas.map((p) => (p.valor as { valor: number }).valor)).toEqual([1210, 1211]);
  });

  it("una ambigua de un campo no impide la propuesta de otro campo", () => {
    const a = proponente("a", [propuesta(5, { campo: "otro" })], { ambiguas: [propuesta(1), propuesta(2)] });
    const d = coordinar(lectura, decl([a], ["a"]));
    expect(d.propuestas.map((p) => p.campo)).toEqual(["otro"]);
    expect(d.ambiguas).toHaveLength(2);
  });

  it("el mismo valor de varios jueces se funde: el veredicto más débil, controles y derivadaDe unidos y ordenados, el origen del primer juez", () => {
    const a = proponente("a", [propuesta(1210, { controles: ["z", "identidad"], derivadaDe: ["identidad"], origen: { camino: "a" } })]);
    const b = proponente("b", [propuesta(1210, { controles: ["identidad", "m"], derivadaDe: ["identidad"], origen: { camino: "b" }, veredicto: "weak" })]);
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([b, a], ["a", "b"]));
    expect(d.propuestas).toEqual([expect.objectContaining({ veredicto: "weak", controles: ["identidad", "m", "z"], derivadaDe: ["identidad"], origen: { camino: "a" } })]);
  });

  it("si alguna de las propuestas iguales no tiene origen, la fundida no lo tiene y es weak: renombrar un juez no cambia nada", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const con = (id: string) => proponente(id, [propuesta(1210)]);
    const sin = (id: string) => proponente(id, [propuesta(1210, { origen: undefined })]);
    for (const [x, y] of [["a", "b"], ["b", "a"]]) {
      const d = coordinar(fuertes, decl([con(x), sin(y)], ["a", "b"]));
      expect(d.propuestas).toEqual([expect.objectContaining({ veredicto: "weak", origen: undefined })]);
    }
  });

  it("con despeja activo, el dictamen entero es el mismo en cualquier orden de jueces", () => {
    const js = [
      proponente("a", [propuesta(1210, { controles: ["x"] })], { ambiguas: [propuesta(7, { campo: "otro" })] }),
      proponente("b", [propuesta(1210, { origen: undefined }), propuesta(9, { campo: "y" })]),
      proponente("c", [propuesta(1211)], { truncada: true }),
    ];
    const orden = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const [base, ...resto] = orden.map((o) => coordinar(lectura, decl(o.map((k) => js[k]), ["a", "b", "c"])));
    for (const r of resto) expect(r).toEqual(base);
  });

  it("el origen de la fundida es el del primer juez por id, sea propuesta o ambigua", () => {
    const a = proponente("a", [], { ambiguas: [propuesta(1210, { origen: { camino: "a" } })] });
    const b = proponente("b", [propuesta(1210, { origen: { camino: "b" } })]);
    const d = coordinar(lectura, decl([b, a], ["a", "b"]));
    expect(d.ambiguas).toEqual([expect.objectContaining({ origen: { camino: "a" } })]);
  });

  it("el valor se compara por su contenido, no por el orden de sus propiedades", () => {
    const a = proponente("a", [propuesta(1210)]);
    const b = proponente("b", [{ ...propuesta(0), valor: { moneda: "ARS", valor: 1210, tipo: "centavos" } as Propuesta["valor"] }]);
    expect(coordinar(lectura, decl([a, b], ["a", "b"])).propuestas).toHaveLength(1);
  });

  it("el mismo número en monedas distintas son dos valores: van a ambiguas", () => {
    const a = proponente("a", [propuesta(1210)]);
    const b = proponente("b", [{ ...propuesta(1210), valor: { tipo: "centavos", valor: 1210, moneda: "USD" } }]);
    const d = coordinar(lectura, decl([a, b], ["a", "b"]));
    expect(d.propuestas).toEqual([]);
    expect(d.ambiguas.map((p) => (p.valor as { moneda: string }).moneda)).toEqual(["ARS", "USD"]);
  });

  it("las ambiguas repetidas entre jueces se deduplican y se funden", () => {
    const a = proponente("a", [], { ambiguas: [propuesta(1), propuesta(2)] });
    const b = proponente("b", [], { ambiguas: [propuesta(1, { veredicto: "weak" }), propuesta(2)] });
    const d = coordinar(lectura, decl([a, b], ["a", "b"]));
    expect(d.ambiguas).toHaveLength(2);
  });

  it("truncada de un juez no se pierde si el siguiente no la toca", () => {
    const a = proponente("a", [], { truncada: true });
    const b = proponente("b", [], { truncada: false });
    expect(coordinar(lectura, decl([a, b], ["a", "b"])).truncada).toBe(true);
  });

  it("truncada que no es booleano, origen sin camino o controles que no es array: respuesta mal formada, falla del juez", () => {
    const respuestas = [
      { propuestas: [], ambiguas: [], truncada: "si" },
      { propuestas: [propuesta(1210, { origen: {} as Propuesta["origen"] })], ambiguas: [], truncada: false },
      { propuestas: [propuesta(1210, { origen: null as unknown as Propuesta["origen"] })], ambiguas: [], truncada: false },
      { propuestas: [propuesta(1210, { controles: undefined as unknown as string[] })], ambiguas: [], truncada: false },
    ];
    for (const r of respuestas) {
      const j: Juez = { id: "m", version: "1", juzgar: () => [], proponer: () => r as never };
      const d = coordinar(lectura, decl([j], ["m"]));
      expect(d.propuestas).toEqual([]);
      expect(d.controles.map((c) => c.id)).toEqual(["m: no se pudo proponer"]);
      expect(() => coordinar(lectura, { ...decl([j], ["m"]), estricto: true })).toThrow();
    }
  });

  it("el motivo de la fundida dice cuántos jueces la proponen y con qué veredicto quedó, no copia el de uno", () => {
    const a = proponente("a", [propuesta(1210, { motivo: "impreso, verificado" })]);
    const b = proponente("b", [propuesta(1210, { origen: undefined, motivo: "otro" })]);
    const d = coordinar(fuertes, decl([a, b], ["a", "b"]));
    expect(d.propuestas[0].motivo).toBe("la proponen 2 jueces: a, b · veredicto weak");
    const sola = coordinar(fuertes, decl([a], ["a"]));
    expect(sola.propuestas[0].motivo).toBe("impreso, verificado");
  });

  it("un valor propuesto que no es un importe entero con moneda, o un texto, es respuesta mal formada", () => {
    const malos: Propuesta["valor"][] = [
      { tipo: "centavos", valor: Number.NaN, moneda: "ARS" },
      { tipo: "centavos", valor: Number.POSITIVE_INFINITY, moneda: "ARS" },
      { tipo: "centavos", valor: 1210.5, moneda: "ARS" },
      { tipo: "centavos", valor: 2 ** 60, moneda: "ARS" },
      { tipo: "centavos", valor: 1210, moneda: "" },
      { tipo: "centavos", valor: 1210, moneda: undefined as unknown as string },
      { tipo: "texto", valor: 5 as unknown as string },
      { tipo: "fecha", valor: null as unknown as string },
      { tipo: "otro" } as unknown as Propuesta["valor"],
    ];
    for (const valor of malos) {
      for (const donde of ["propuestas", "ambiguas"] as const) {
        const j = proponente("m", donde === "propuestas" ? [propuesta(1, { valor })] : [], donde === "ambiguas" ? { ambiguas: [propuesta(1, { valor })] } : {});
        const d = coordinar(lectura, decl([j], ["m"]));
        expect(d.propuestas).toEqual([]);
        expect(d.ambiguas).toEqual([]);
        expect(d.controles.map((c) => c.id)).toContain("m: no se pudo proponer");
      }
    }
  });

  it("los valores de texto y de fecha válidos pasan", () => {
    const j = proponente("p", [
      propuesta(0, { campo: "t", valor: { tipo: "texto", valor: "abc" } }),
      propuesta(0, { campo: "f", valor: { tipo: "fecha", valor: "2026-01-02" } }),
    ]);
    expect(coordinar(fuertes, decl([j], ["p"])).propuestas.map((p) => p.campo)).toEqual(["f", "t"]);
  });

  it("un importe en una moneda distinta de la de sus partes queda abstained", () => {
    const usd = propuesta(1210, { valor: { tipo: "centavos", valor: 1210, moneda: "USD" } });
    const d = coordinar(fuertes, decl([proponente("p", [usd])], ["p"]));
    expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "abstained", motivo: expect.stringContaining("moneda distinta de sus partes") }));
  });

  it("la moneda se compara solo con las partes usadas: el campo propuesto no cuenta", () => {
    const l: Lectura = { campos: [pesos("total", 1, "verified"), { id: "neto", valor: { tipo: "centavos", valor: 1000, moneda: "USD" }, veredicto: "verified" }], listas: [] };
    const usd = propuesta(1210, { valor: { tipo: "centavos", valor: 1210, moneda: "USD" } });
    const d = coordinar(l, decl([proponente("p", [usd], { partes: ["total", "neto"] })], ["p"]));
    expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "verified", motivo: "impreso" }));
  });

  it("si un juez de despeja falló al proponer, la unicidad no se comprobó: todo sale weak como máximo y el motivo lo dice", () => {
    const roto: Juez = { id: "b", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    const d = coordinar(fuertes, decl([proponente("a", [propuesta(1210)]), roto], ["a", "b"]));
    expect(d.propuestas).toEqual([expect.objectContaining({ veredicto: "weak", motivo: expect.stringContaining("no se pudo comprobar la unicidad: falló b") })]);
  });

  it("un juez roto que no está en despeja no baja nada", () => {
    const roto: Juez = { id: "b", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    const d = coordinar(fuertes, decl([proponente("a", [propuesta(1210)]), roto], ["a"]));
    expect(d.propuestas[0].veredicto).toBe("verified");
  });

  describe("el estado del control citado", () => {
    const citando = (c: ControlDelJuez, derivadaDe = ["c"]): Juez => ({
      id: "p", version: "1", juzgar: () => [c],
      proponer: () => ({ propuestas: [propuesta(1210, { derivadaDe })], ambiguas: [], truncada: false }),
    });
    const veredictoCon = (c: ControlDelJuez) => coordinar(fuertes, decl([citando(c)], ["p"])).propuestas[0].veredicto;
    const ctl = (over: Partial<ControlDelJuez>): ControlDelJuez => ({ ...control("c", ["neto", "iva"]), ...over });

    it("un control unavailable o abstained pone su veredicto en el tope", () => {
      expect(veredictoCon(ctl({ estado: "no-se-puede-juzgar", residuo: null, veredicto: "unavailable" }))).toBe("unavailable");
      expect(veredictoCon(ctl({ estado: "no-se-puede-juzgar", residuo: null, veredicto: "abstained" }))).toBe("abstained");
    });

    it("un control que no cierra (weak) no aporta: es el que motiva despejar", () => {
      expect(veredictoCon(ctl({ estado: "no-cierra", residuo: 5, veredicto: "weak" }))).toBe("verified");
    });

    it("el control sin juzgar que incluye al campo propuesto no aporta su veredicto: está sin juzgar justamente porque ese campo falta", () => {
      const sinTotal = ctl({ estado: "no-se-puede-juzgar", residuo: null, partes: ["total", "neto", "iva"], veredicto: "abstained" });
      expect(veredictoCon(sinTotal)).toBe("verified");
    });

    it("un control del juez sin partes y unavailable, que no es de falla, también es unavailable", () => {
      expect(veredictoCon(ctl({ partes: [], estado: "no-se-puede-juzgar", residuo: null, veredicto: "unavailable" }))).toBe("unavailable");
    });

    it("un control con un veredicto fuera de la escala, que el coordinador dejó unavailable, es unavailable", () => {
      expect(veredictoCon(ctl({ veredicto: "inventado" as unknown as ControlDelJuez["veredicto"] }))).toBe("unavailable");
    });

    it("un juez cuyo control tiene un id con aspecto de falla no se confunde con una falla", () => {
      const j = citando(control("r: no se pudo juzgar", []), ["r: no se pudo juzgar"]);
      expect(coordinar(fuertes, decl([j], ["p"])).propuestas[0].veredicto).toBe("weak");
    });
  });

  it("un juez de despeja que avisa truncada baja a weak todas las propuestas y ambiguas, también las de otro juez", () => {
    const a = proponente("a", [propuesta(1210)], { ambiguas: [propuesta(1, { campo: "x" }), propuesta(2, { campo: "x" })], truncada: true });
    const b = proponente("b", [propuesta(5, { campo: "y" })], { ambiguas: [propuesta(3, { campo: "z" })] });
    const d = coordinar(fuertes, decl([a, b], ["a", "b"]));
    expect(d.propuestas.map((p) => [p.campo, p.veredicto])).toEqual([["total", "weak"], ["y", "weak"]]);
    expect(d.ambiguas.map((p) => p.veredicto)).toEqual(["weak", "weak", "weak"]);
    for (const p of [...d.propuestas, ...d.ambiguas]) expect(p.motivo).toContain("tope de búsqueda tocado por a: no se probó todo");
  });

  it("el motivo nombra a todos los jueces truncados", () => {
    const d = coordinar(fuertes, decl([proponente("b", [], { truncada: true }), proponente("a", [propuesta(1210)], { truncada: true })], ["a", "b"]));
    expect(d.propuestas[0].motivo).toContain("tope de búsqueda tocado por a, b: no se probó todo");
  });

  it("un juez truncado que no propone nada también baja lo que propone otro", () => {
    const a = proponente("a", [], { truncada: true });
    const b = proponente("b", [propuesta(1210)]);
    expect(coordinar(fuertes, decl([a, b], ["a", "b"])).propuestas[0].veredicto).toBe("weak");
  });

  it("sin juez truncado ni roto, las propuestas de despeja conservan su firmeza", () => {
    const a = proponente("a", [], { truncada: false });
    const b = proponente("b", [propuesta(1210)]);
    const d = coordinar(fuertes, decl([a, b], ["a", "b"]));
    expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "verified", motivo: "impreso" }));
  });

  it("una propuesta que no es en centavos, derivada de partes todas en centavos, queda abstained", () => {
    const texto = propuesta(0, { valor: { tipo: "texto", valor: "1210" } });
    const d = coordinar(fuertes, decl([proponente("p", [texto])], ["p"]));
    expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "abstained", motivo: expect.stringContaining("tipo distinto de sus partes") }));
  });

  describe("el tipo de la propuesta y el de sus partes", () => {
    const mixta: Lectura = { campos: [lectura.campos[0], pesos("neto", 1000, "verified"), { id: "iva", valor: { tipo: "texto", valor: "x" }, veredicto: "verified" }], listas: [] };
    const enTexto: Lectura = { campos: [lectura.campos[0], { id: "neto", valor: { tipo: "texto", valor: "x" }, veredicto: "verified" }, { id: "iva", valor: { tipo: "fecha", valor: "2026-01-01" }, veredicto: "verified" }], listas: [] };
    const texto = propuesta(0, { valor: { tipo: "texto", valor: "a" } });
    const tipoDistinto = expect.objectContaining({ veredicto: "abstained", motivo: expect.stringContaining("tipo distinto de sus partes") });

    it("una propuesta que no es en centavos no puede tener ninguna parte en centavos", () => {
      const p = coordinar(mixta, decl([proponente("p", [texto])], ["p"])).propuestas[0];
      expect(p).toEqual(tipoDistinto);
      expect(p.motivo).not.toContain("moneda");
    });

    it("una propuesta en centavos exige que todas sus partes estén en centavos", () => {
      expect(coordinar(mixta, decl([proponente("p", [propuesta(1210)])], ["p"])).propuestas[0]).toEqual(tipoDistinto);
      expect(coordinar(enTexto, decl([proponente("p", [propuesta(1210)])], ["p"])).propuestas[0]).toEqual(tipoDistinto);
    });

    it("una propuesta que no es en centavos, con partes que tampoco lo son, conserva su firmeza", () => {
      expect(coordinar(enTexto, decl([proponente("p", [texto])], ["p"])).propuestas[0]).toEqual(expect.objectContaining({ veredicto: "verified", motivo: "impreso" }));
    });
  });

  describe("si falló el juzgar de algún juez", () => {
    const roto: Juez = { id: "j", version: "1", juzgar: () => { throw new Error("no"); } };
    const sinControles = (id: string, p: Propuesta): Juez => ({
      id, version: "1", juzgar: () => [], proponer: () => ({ propuestas: [p], ambiguas: [], truncada: false }),
    });

    it("un id citado que no aparece en el dictamen aporta unavailable, y el motivo dice por qué", () => {
      const d = coordinar(fuertes, decl([roto, sinControles("p", propuesta(1210))], ["p"]));
      expect(d.propuestas[0]).toEqual(expect.objectContaining({
        veredicto: "unavailable",
        motivo: expect.stringContaining("falló el juzgar de j: los controles citados no se pudieron comprobar"),
      }));
    });

    it("el motivo nombra a todos los jueces que fallaron al juzgar", () => {
      const k: Juez = { ...roto, id: "k" };
      const d = coordinar(fuertes, decl([k, roto, sinControles("p", propuesta(1210))], ["p"]));
      expect(d.propuestas[0].motivo).toContain("falló el juzgar de j, k");
    });

    it("también cuando el que falló al juzgar es el mismo juez que propone", () => {
      const p: Juez = { id: "p", version: "1", juzgar: () => { throw new Error("no"); }, proponer: () => ({ propuestas: [propuesta(1210)], ambiguas: [], truncada: false }) };
      expect(coordinar(fuertes, decl([p], ["p"])).propuestas[0].veredicto).toBe("unavailable");
    });

    it("vale igual para las ambiguas", () => {
      const p: Juez = { ...sinControles("p", propuesta(1210)), proponer: () => ({ propuestas: [], ambiguas: [propuesta(1), propuesta(2)], truncada: false }) };
      expect(coordinar(fuertes, decl([roto, p], ["p"])).ambiguas.map((x) => x.veredicto)).toEqual(["unavailable", "unavailable"]);
    });

    it("un id que sí aparece también aporta unavailable: el juez roto pudo emitirlo", () => {
      const d = coordinar(fuertes, decl([roto, proponente("p", [propuesta(1210)])], ["p"]));
      expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "unavailable", motivo: expect.stringContaining("falló el juzgar de j") }));
    });

    describe("un id repetido entre jueces, con uno roto, nunca sale más firme que con ese juez sano", () => {
      const conOtros: Lectura = { ...fuertes, campos: [...fuertes.campos, pesos("otros", 5, "weak")] };
      const j = (juzgar: Juez["juzgar"]): Juez => ({ id: "j", version: "1", juzgar });
      const veredicto = (otro: Juez) => coordinar(conOtros, decl([otro, proponente("p", [propuesta(1210)])], ["p"])).propuestas[0].veredicto;
      const romper = () => { throw new Error("no"); };

      it("el juez sano aportaba una parte weak: roto, la propuesta es unavailable", () => {
        expect(veredicto(j(() => [control("identidad", ["neto", "iva", "otros"])]))).toBe("weak");
        expect(veredicto(j(romper))).toBe("unavailable");
      });

      it("el juez sano dejaba el control unavailable por un veredicto fuera de la escala: roto, sigue unavailable", () => {
        const inventado = { ...control("identidad", ["neto", "iva"]), veredicto: "inventado" as unknown as ControlDelJuez["veredicto"] };
        expect(veredicto(j(() => [inventado]))).toBe("unavailable");
        expect(veredicto(j(romper))).toBe("unavailable");
      });
    });

    it("una propuesta que no cita ningún control sigue siendo weak: no hay id que aporte unavailable", () => {
      const d = coordinar(fuertes, decl([roto, sinControles("p", propuesta(1210, { derivadaDe: [] }))], ["p"]));
      expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "weak", motivo: "impreso" }));
    });

    it("sin ningún juzgar fallado, un id que no aparece sigue aportando abstained", () => {
      const q: Juez = { id: "q", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
      const d = coordinar(fuertes, decl([q, sinControles("p", propuesta(1210))], ["p", "q"]));
      expect(d.propuestas[0].veredicto).toBe("abstained");
      expect(d.propuestas[0].motivo).not.toContain("juzgar");
    });
  });

  it("el motivo de la fundida dice el veredicto final, después del tope por juez que falló", () => {
    const roto: Juez = { id: "b", version: "1", juzgar: () => [], proponer: () => { throw new Error("no"); } };
    const d = coordinar(fuertes, decl([proponente("a", [propuesta(1210)]), roto, proponente("c", [propuesta(1210)])], ["a", "b", "c"]));
    expect(d.propuestas[0].veredicto).toBe("weak");
    expect(d.propuestas[0].motivo).toMatch(/^la proponen 2 jueces: a, c · veredicto weak/);
    expect(d.propuestas[0].motivo).not.toContain("verified");
  });

  it("dos propuestas del mismo valor de un mismo juez se funden como dos, y el motivo lo dice", () => {
    const j = proponente("a", [propuesta(1210), propuesta(1210, { origen: undefined })]);
    const d = coordinar(fuertes, decl([j], ["a"]));
    expect(d.propuestas).toHaveLength(1);
    expect(d.propuestas[0]).toEqual(expect.objectContaining({ veredicto: "weak", origen: undefined }));
    expect(d.propuestas[0].motivo).toMatch(/^la proponen 2 entradas de a · veredicto weak/);
  });

  it("cada juez recibe una copia del tope", () => {
    const a: Juez = { id: "a", version: "1", juzgar: () => [], proponer: (_l, t) => { t.combinaciones = 1; return { propuestas: [], ambiguas: [], truncada: false }; } };
    let visto = 0;
    const b: Juez = { id: "b", version: "1", juzgar: () => [], proponer: (_l, t) => { visto = t.combinaciones; return { propuestas: [], ambiguas: [], truncada: false }; } };
    const declaracion = { ...decl([a, b], ["a", "b"]), tope: { ...TOPE_POR_DEFECTO, combinaciones: 125 } };
    coordinar(lectura, declaracion);
    expect(visto).toBe(125);
    expect(declaracion.tope.combinaciones).toBe(125);
  });

  it("una propuesta con derivadaDe vacío es weak como máximo, aunque esté impresa", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [propuesta(1210, { derivadaDe: [] })])], ["p"]));
    expect(d.propuestas[0].veredicto).toBe("weak");
  });

  it("las ambiguas con derivadaDe vacío o inexistente también se acotan", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "verified")] };
    const d = coordinar(fuertes, decl([proponente("p", [], { ambiguas: [propuesta(1, { derivadaDe: [] }), propuesta(2, { derivadaDe: ["fantasma"] })] })], ["p"]));
    expect(d.ambiguas.map((p) => p.veredicto)).toEqual(["weak", "abstained"]);
  });

  it("una propuesta mal formada es una falla del juez, salvo en modo estricto", () => {
    const sinDerivada = { ...propuesta(1210), derivadaDe: undefined } as unknown as Propuesta;
    const malo = proponente("m", [sinDerivada]);
    const d = coordinar(lectura, decl([malo], ["m"]));
    expect(d.propuestas).toEqual([]);
    expect(d.controles.map((c) => [c.id, c.veredicto])).toEqual([["identidad", "verified"], ["m: no se pudo proponer", "unavailable"]]);
    expect(() => coordinar(lectura, { ...decl([malo], ["m"]), estricto: true })).toThrow("propuesta mal formada: total");
  });

  it("cada juez propone sobre su propia copia de la lectura", () => {
    const sucio: Juez = {
      id: "a", version: "1", juzgar: () => [],
      proponer: (l) => { l.campos.find((c) => c.id === "neto")!.veredicto = "verified"; l.campos.length = 0; return { propuestas: [], ambiguas: [], truncada: false }; },
    };
    let visto = 0;
    const b: Juez = { id: "b", version: "1", juzgar: () => [], proponer: (l) => { visto = l.campos.length; return { propuestas: [], ambiguas: [], truncada: false }; } };
    const entrada = structuredClone(lectura);
    coordinar(entrada, decl([sucio, b], ["a", "b"]));
    expect(visto).toBe(3);
    expect(entrada).toEqual(lectura);
  });

  it("dos controles con el mismo id de jueces distintos: el tope junta las partes de los dos, falla cerrado", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "weak")] };
    const a = proponente("a", [propuesta(1210)], { partes: ["neto"] });
    const b = proponente("b", [], { partes: ["iva"] });
    expect(coordinar(fuertes, decl([a, b], ["a"])).propuestas[0].veredicto).toBe("weak");
    expect(coordinar(fuertes, decl([b, a], ["a"])).propuestas[0].veredicto).toBe("weak");
  });

  it("la unión de partes no depende de cuál juez propone", () => {
    const fuertes: Lectura = { ...lectura, campos: [lectura.campos[0], pesos("neto", 1000, "verified"), pesos("iva", 210, "weak")] };
    const a = proponente("a", [], { partes: ["neto"] });
    const b = proponente("b", [propuesta(1210)], { partes: ["iva"] });
    expect(coordinar(fuertes, decl([a, b], ["b"])).propuestas[0].veredicto).toBe("weak");
  });
});
