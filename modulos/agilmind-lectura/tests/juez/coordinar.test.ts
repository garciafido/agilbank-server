// agilmind-lectura/tests/juez/coordinar.test.ts
import { coordinar, VERSION_DEL_MODULO } from "../../src/juez/coordinar";
import { TOPE_POR_DEFECTO, type Campo, type ControlDelJuez, type Declaracion, type Juez, type Lectura } from "../../src/juez/contrato";

const pesos = (id: string, valor: number, veredicto: Campo["veredicto"] = "grounded", moneda = "ARS"): Campo =>
  ({ id, valor: { tipo: "centavos", valor, moneda }, veredicto });
const vacio = (id: string): Campo => ({ id, valor: null, veredicto: "abstained" });

const control = (over: Partial<ControlDelJuez> & { id: string; partes: string[] }): ControlDelJuez => ({
  estado: "cierra", residuo: 0, faltan: [], sospechosos: { informa: false }, posicion: { informa: false },
  veredicto: "verified", motivo: "m", ...over,
});
const juez = (id: string, controles: (l: Lectura) => ControlDelJuez[], version = "1"): Juez => ({ id, version, juzgar: controles });
const decl = (jueces: Juez[], over: Partial<Declaracion> = {}): Declaracion => ({ jueces, despeja: new Set(), tope: TOPE_POR_DEFECTO, ...over });

const lectura: Lectura = { campos: [pesos("total", 1210), pesos("neto", 1000), pesos("iva", 210)], listas: [] };
const cierre = juez("cierre", () => [control({ id: "total = neto + iva", partes: ["total", "neto", "iva"] })]);

describe("coordinar: controles", () => {
  it("un control que cierra conserva el verified de su juez aunque las partes sean lecturas grounded", () => {
    const d = coordinar(lectura, decl([cierre]));
    expect(d.controles).toEqual([expect.objectContaining({ id: "total = neto + iva", juez: "cierre", estado: "cierra", veredicto: "verified", parteMasDebil: "grounded" })]);
  });

  it("lleva la versión del módulo y la de cada juez", () => {
    const d = coordinar(lectura, decl([juez("cierre", () => [], "7")]));
    expect(d.version).toEqual({ modulo: VERSION_DEL_MODULO, jueces: { cierre: "7" } });
  });

  it("una parte unavailable deja el control sin juzgar y unavailable: no pudimos mirar", () => {
    const l: Lectura = { campos: [pesos("total", 1210), { ...pesos("neto", 1000), veredicto: "unavailable" }, pesos("iva", 210)], listas: [] };
    const d = coordinar(l, decl([cierre]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable" }));
  });

  it("una parte sin valor y unavailable (no pudimos mirar) da unavailable, no abstained, y la falta queda anotada", () => {
    const l: Lectura = { campos: [pesos("total", 1210), { id: "neto", valor: null, veredicto: "unavailable" }, pesos("iva", 210)], listas: [] };
    const d = coordinar(l, decl([cierre]));
    expect(d.controles[0]).toEqual(expect.objectContaining({
      estado: "no-se-puede-juzgar", veredicto: "unavailable", parteMasDebil: "unavailable", faltan: [{ campo: "neto" }],
    }));
  });

  it("una parte sin valor deja el control sin juzgar, abstained y con la falta anotada", () => {
    const l: Lectura = { campos: [pesos("total", 1210), vacio("neto"), pesos("iva", 210)], listas: [] };
    const d = coordinar(l, decl([cierre]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "abstained", faltan: [{ campo: "neto" }] }));
  });

  it("una parte cuyo id no está en la lectura cuenta como faltante, nunca como verified", () => {
    const d = coordinar(lectura, decl([juez("j", () => [control({ id: "c", partes: ["total", "inexistente"] })])]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "abstained", faltan: [{ campo: "inexistente" }] }));
  });

  it("partes numéricas en monedas distintas no se juzgan", () => {
    const l: Lectura = { campos: [pesos("total", 1210, "grounded", "USD"), pesos("neto", 1000), pesos("iva", 210)], listas: [] };
    const d = coordinar(l, decl([cierre]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "abstained" }));
    expect(d.controles[0].motivo).toContain("monedas distintas");
  });

  it("un juez que tira una excepción no tumba el dictamen: su control sale unavailable", () => {
    const roto = juez("roto", () => { throw new Error("se rompió"); });
    const d = coordinar(lectura, decl([roto, cierre]));
    expect(d.controles.map((c) => [c.juez, c.estado, c.veredicto])).toEqual([
      ["cierre", "cierra", "verified"],
      ["roto", "no-se-puede-juzgar", "unavailable"],
    ]);
    expect(d.controles[1].motivo).toContain("se rompió");
  });

  it("en modo estricto la excepción se propaga", () => {
    const roto = juez("roto", () => { throw new Error("se rompió"); });
    expect(() => coordinar(lectura, decl([roto], { estricto: true }))).toThrow("se rompió");
  });

  it("el dictamen no depende del orden de los campos ni del de los jueces", () => {
    const otro = juez("suma", () => [control({ id: "a", partes: ["neto"] }), control({ id: "b", partes: ["iva"] })]);
    const a = coordinar(lectura, decl([cierre, otro]));
    const b = coordinar({ campos: [...lectura.campos].reverse(), listas: [] }, decl([otro, cierre]));
    expect(b).toEqual(a);
  });

  it("sin despejar declarado, salen vacías las propuestas", () => {
    const d = coordinar(lectura, decl([cierre]));
    expect(d).toEqual(expect.objectContaining({ propuestas: [], ambiguas: [], porAlternativa: [], truncada: false }));
  });

  it("un control que cierra por construcción baja a abstained: una tautología no aporta evidencia", () => {
    const l: Lectura = { campos: [{ ...pesos("total", 1210), derivadaDe: ["total = neto + iva"] }, pesos("neto", 1000), pesos("iva", 210)], listas: [] };
    const d = coordinar(l, decl([cierre]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "cierra-por-construccion", veredicto: "abstained" }));
  });

  it("la independencia solo se activa si la parte salió de ese control y el control cierra", () => {
    const deOtro: Lectura = { campos: [{ ...pesos("total", 1210), derivadaDe: ["otro control"] }, pesos("neto", 1000), pesos("iva", 210)], listas: [] };
    expect(coordinar(deOtro, decl([cierre])).controles[0]).toEqual(expect.objectContaining({ estado: "cierra", veredicto: "verified" }));

    const derivada: Lectura = { campos: [{ ...pesos("total", 1210), derivadaDe: ["c"] }, pesos("neto", 1000)], listas: [] };
    const noCierra = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "no-cierra", residuo: 5, veredicto: "weak" })]);
    expect(coordinar(derivada, decl([noCierra])).controles[0]).toEqual(expect.objectContaining({ estado: "no-cierra", veredicto: "weak" }));
  });

  it("una parte con valor y un veredicto desconocido deja el control unavailable, nunca verified", () => {
    const raro = { ...pesos("neto", 1000), veredicto: "inventado" as unknown as Campo["veredicto"] };
    const l: Lectura = { campos: [pesos("total", 1210), raro, pesos("iva", 210)], listas: [] };
    expect(coordinar(l, decl([cierre])).controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", parteMasDebil: "unavailable" }));
  });

  it("el control que no se pudo juzgar no lleva residuo, y el motivo de cada rama dice por qué", () => {
    const inex = coordinar(lectura, decl([juez("j", () => [control({ id: "c", partes: ["total", "neto", "x", "y"] })])])).controles[0];
    expect(inex.residuo).toBeNull();
    expect(inex.motivo).toContain("x");
    expect(inex.motivo).toContain("y");

    const indisp: Lectura = { campos: [pesos("total", 1210), { ...pesos("neto", 1000), veredicto: "unavailable" }, pesos("iva", 210)], listas: [] };
    const u = coordinar(indisp, decl([cierre])).controles[0];
    expect(u.residuo).toBeNull();
    expect(u.motivo).toContain("no se pudo mirar");

    const monedas: Lectura = { campos: [pesos("total", 1210, "grounded", "USD"), pesos("neto", 1000), pesos("iva", 210)], listas: [] };
    expect(coordinar(monedas, decl([cierre])).controles[0].residuo).toBeNull();
  });

  it("las partes de texto o de fecha no cuentan como moneda", () => {
    const l: Lectura = {
      campos: [pesos("a", 1), { id: "t", valor: { tipo: "texto", valor: "x" }, veredicto: "grounded" }, { id: "f", valor: { tipo: "fecha", valor: "2026-01-01" }, veredicto: "grounded" }, pesos("b", 2)],
      listas: [],
    };
    const d = coordinar(l, decl([juez("j", () => [control({ id: "c", partes: ["a", "t", "f", "b"] })])]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "cierra", veredicto: "verified" }));
  });

  it("la falta que el juez ya anotó no se duplica, y las suyas se conservan", () => {
    const l: Lectura = { campos: [pesos("total", 1210), vacio("neto")], listas: [] };
    const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], faltan: [{ campo: "neto" }, { elementoDe: "lista" }] })]);
    expect(coordinar(l, decl([j])).controles[0].faltan).toEqual([{ campo: "neto" }, { elementoDe: "lista" }]);
  });

  it("una parte repetida en un control se anota una sola vez", () => {
    const l: Lectura = { campos: [pesos("total", 1210), vacio("neto")], listas: [] };
    const j = juez("j", () => [control({ id: "c", partes: ["neto", "neto", "total"] })]);
    expect(coordinar(l, decl([j])).controles[0].faltan).toEqual([{ campo: "neto" }]);
  });

  it("el juez ve la lectura en orden canónico: campos y listas por id, elementos de cada lista en su orden", () => {
    const vista = juez("vista", (l) => [control({
      id: "vista",
      partes: [],
      motivo: `${l.campos.map((c) => c.id).join(",")}|${l.listas.map((x) => x.id).join(",")}|${l.listas.map((x) => x.elementos.map((e) => e.id).join("+")).join(",")}`,
    })]);
    const entrada: Lectura = {
      campos: [pesos("z", 1), pesos("a", 2)],
      listas: [
        { id: "lb", elementos: [pesos("lb-2", 1), pesos("lb-1", 1)] },
        { id: "la", elementos: [pesos("la-9", 1), pesos("la-3", 1)] },
      ],
    };
    expect(coordinar(entrada, decl([vista])).controles[0].motivo).toBe("a,z|la,lb|la-9+la-3,lb-2+lb-1");
  });

  it("los controles de un juez salen ordenados por id aunque él los emita desordenados", () => {
    const j = juez("j", () => [control({ id: "b", partes: [] }), control({ id: "a", partes: [] })]);
    expect(coordinar(lectura, decl([j])).controles.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("dos jueces con el mismo id tiran, también fuera de modo estricto", () => {
    expect(() => coordinar(lectura, decl([juez("j", () => []), juez("j", () => [])]))).toThrow("juez repetido: j");
  });

  it("un id repetido en la lectura tira, también fuera de modo estricto", () => {
    const l: Lectura = { campos: [pesos("a", 1), pesos("a", 2)], listas: [] };
    expect(() => coordinar(l, decl([cierre]))).toThrow("id repetido: a");
  });

  it("un juez que muta la lectura no afecta a los demás ni a quien llamó", () => {
    const entrada: Lectura = { campos: [pesos("total", 1210), pesos("neto", 1000), pesos("iva", 210)], listas: [{ id: "l", elementos: [pesos("l1", 1), pesos("l2", 2)] }] };
    const copia = structuredClone(entrada);
    const vandalo = juez("a-vandalo", (l) => {
      l.campos.length = 0;
      l.listas[0].elementos.reverse();
      return [];
    });
    const d = coordinar(entrada, decl([vandalo, cierre]));
    expect(d.controles).toEqual([expect.objectContaining({ id: "total = neto + iva", estado: "cierra", veredicto: "verified" })]);
    expect(entrada).toEqual(copia);
  });

  it("el control de falla lleva el mensaje, no tiene residuo y su parte más débil es unavailable", () => {
    const roto = juez("roto", () => { throw new Error("se rompió"); });
    expect(coordinar(lectura, decl([roto])).controles[0]).toEqual(expect.objectContaining({
      residuo: null, parteMasDebil: "unavailable", motivo: "el juez falló: se rompió",
    }));
  });

  it("un control mal formado se trata como falla del juez, salvo en modo estricto", () => {
    const malo = juez("malo", () => [{ id: "x" } as unknown as ControlDelJuez]);
    const d = coordinar(lectura, decl([malo]));
    expect(d.controles).toEqual([expect.objectContaining({ juez: "malo", estado: "no-se-puede-juzgar", veredicto: "unavailable" })]);
    expect(() => coordinar(lectura, decl([malo], { estricto: true }))).toThrow("control mal formado: x");
  });

  it("un id o un motivo que no es texto es un control mal formado: falla del juez, no un dictamen que tira", () => {
    const raros: unknown[] = [Symbol("x"), 7, null, undefined, { a: 1 }, BigInt(3)];
    for (const raro of raros) {
      for (const campo of ["id", "motivo"] as const) {
        const malo = juez("malo", () => [control({ id: "c", partes: ["total"], [campo]: raro } as never)]);
        const d = coordinar(lectura, decl([malo]));
        expect(d.controles).toEqual([expect.objectContaining({ juez: "malo", estado: "no-se-puede-juzgar", veredicto: "unavailable", id: "malo: no se pudo juzgar" })]);
        expect(() => coordinar(lectura, decl([malo], { estricto: true }))).toThrow("control mal formado");
      }
    }
  });

  it("un id o un motivo que no es texto tampoco tira cuando el control usa una lista con alternativa abstained", () => {
    const conLista: Lectura = {
      campos: [pesos("total", 100)],
      listas: [{ id: "l", elementos: [pesos("r1", 100)], alternativas: [{ elementos: [], veredicto: "abstained", origen: { camino: "x" } }] }],
    };
    for (const campo of ["id", "motivo"] as const) {
      const malo = juez("malo", () => [
        control({ id: "c", partes: ["total"], faltan: [{ elementoDe: "l" }], [campo]: Symbol("s") } as never),
        control({ id: "d", partes: ["total"], faltan: [{ elementoDe: "l" }] }),
      ]);
      const d = coordinar(conLista, decl([malo]));
      expect(d.controles).toEqual([expect.objectContaining({ id: "malo: no se pudo juzgar", veredicto: "unavailable" })]);
    }
  });

  it("un control que el juez devuelve sin poder juzgar nunca sale con un veredicto de lectura: baja a abstained", () => {
    for (const veredicto of ["verified", "grounded", "weak"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "no-se-puede-juzgar", residuo: null, veredicto })]);
      expect(coordinar(lectura, decl([j])).controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "abstained" }));
    }
  });

  it("un control sin poder juzgar conserva unavailable y abstained cuando el juez los trae", () => {
    for (const veredicto of ["unavailable", "abstained"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "no-se-puede-juzgar", residuo: null, veredicto })]);
      expect(coordinar(lectura, decl([j])).controles[0].veredicto).toBe(veredicto);
    }
  });

  it("una parte con veredicto desconocido y sin valor cuenta como unavailable, igual que con valor", () => {
    const raro = { id: "neto", valor: null, veredicto: "inventado" as unknown as Campo["veredicto"] };
    const l: Lectura = { campos: [pesos("total", 1210), raro, pesos("iva", 210)], listas: [] };
    expect(coordinar(l, decl([cierre])).controles[0]).toEqual(expect.objectContaining({
      estado: "no-se-puede-juzgar", veredicto: "unavailable", parteMasDebil: "unavailable", faltan: [{ campo: "neto" }],
    }));
  });

  it("una parte sin valor con un veredicto de lectura sigue siendo abstained", () => {
    for (const veredicto of ["verified", "grounded", "weak", "abstained"] as const) {
      const l: Lectura = { campos: [pesos("total", 1210), { id: "neto", valor: null, veredicto }, pesos("iva", 210)], listas: [] };
      expect(coordinar(l, decl([cierre])).controles[0]).toEqual(expect.objectContaining({ veredicto: "abstained", parteMasDebil: "abstained" }));
    }
  });

  it("un control del juez con un veredicto fuera de los cinco sale sin juzgar y unavailable, sobre cualquier otra rama", () => {
    const raro = "inventado" as unknown as ControlDelJuez["veredicto"];
    const casos: Array<[string, Lectura, Partial<ControlDelJuez>]> = [
      ["cierra", lectura, {}],
      ["parte que falta", { campos: [vacio("total"), pesos("neto", 1000)], listas: [] }, {}],
      ["monedas distintas", { campos: [pesos("total", 1, "grounded", "USD"), pesos("neto", 1000)], listas: [] }, {}],
      ["por construcción", { campos: [{ ...pesos("total", 1210), derivadaDe: ["c"] }, pesos("neto", 1000)], listas: [] }, {}],
      ["sin juzgar", lectura, { estado: "no-se-puede-juzgar", residuo: null }],
    ];
    for (const [, l, extra] of casos) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], veredicto: raro, ...extra })]);
      const c = coordinar(l, decl([j])).controles[0];
      expect(c).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", residuo: null }));
      expect(c.motivo).toContain("veredicto fuera de la escala");
    }
  });

  it("las ramas de falta, monedas y cierre por construcción no dejan el control más firme que lo que declaró el juez", () => {
    const casos: Array<[Lectura, Partial<ControlDelJuez>]> = [
      [{ campos: [vacio("total"), pesos("neto", 1000)], listas: [] }, { estado: "no-se-puede-juzgar", residuo: null }],
      [{ campos: [pesos("total", 1, "grounded", "USD"), pesos("neto", 1000)], listas: [] }, { estado: "no-se-puede-juzgar", residuo: null }],
      [{ campos: [{ ...pesos("total", 1210), derivadaDe: ["c"] }, pesos("neto", 1000)], listas: [] }, { estado: "cierra" }],
    ];
    for (const [l, extra] of casos) {
      const j = (veredicto: ControlDelJuez["veredicto"]) => juez("j", () => [control({ id: "c", partes: ["total", "neto"], veredicto, ...extra })]);
      expect(coordinar(l, decl([j("unavailable")])).controles[0].veredicto).toBe("unavailable");
      expect(coordinar(l, decl([j("abstained")])).controles[0].veredicto).toBe("abstained");
      expect(coordinar(l, decl([j("weak")])).controles[0].veredicto).toBe("abstained");
      expect(coordinar(l, decl([j("verified")])).controles[0].veredicto).toBe("abstained");
    }
  });
});

describe("coordinar: el estado del control", () => {
  it("un estado fuera de los cuatro es un control mal formado: falla del juez, y en modo estricto tira", () => {
    for (const raro of ["talvez", "", null, undefined, 3]) {
      const malo = juez("malo", () => [control({ id: "c", partes: ["total"], estado: raro as never }), control({ id: "d", partes: ["total"] })]);
      expect(coordinar(lectura, decl([malo])).controles).toEqual([
        expect.objectContaining({ id: "malo: no se pudo juzgar", juez: "malo", estado: "no-se-puede-juzgar", veredicto: "unavailable" }),
      ]);
      expect(() => coordinar(lectura, decl([malo], { estricto: true }))).toThrow("control mal formado: c");
    }
  });

  it("los cuatro estados son válidos", () => {
    for (const estado of ["cierra", "cierra-por-construccion", "no-cierra", "no-se-puede-juzgar"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total"], estado, veredicto: "abstained" })]);
      expect(coordinar(lectura, decl([j], { estricto: true })).controles[0]).toEqual(expect.objectContaining({ juez: "j", id: "c", estado }));
    }
  });

  it("un cierra-por-construccion que emite el juez sale abstained: no verifica nada", () => {
    for (const veredicto of ["verified", "grounded", "weak", "abstained"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "cierra-por-construccion", veredicto })]);
      expect(coordinar(lectura, decl([j])).controles[0]).toEqual(expect.objectContaining({ estado: "cierra-por-construccion", veredicto: "abstained", residuo: 0 }));
    }
    const indisp = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "cierra-por-construccion", veredicto: "unavailable" })]);
    expect(coordinar(lectura, decl([indisp])).controles[0].veredicto).toBe("unavailable");
  });

  it("el cierra-por-construccion que baja de firmeza lo dice en el motivo", () => {
    const j = juez("j", () => [control({ id: "c", partes: ["total"], estado: "cierra-por-construccion", veredicto: "verified", motivo: "m" })]);
    expect(coordinar(lectura, decl([j])).controles[0].motivo).toBe("m · cierra por construcción: no aporta evidencia");
    const ya = juez("j", () => [control({ id: "c", partes: ["total"], estado: "cierra-por-construccion", veredicto: "abstained", motivo: "m" })]);
    expect(coordinar(lectura, decl([ya])).controles[0].motivo).toBe("m");
  });

  it("un no-cierra nunca sale verified ni grounded: se acota a weak", () => {
    for (const veredicto of ["verified", "grounded"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "no-cierra", residuo: 5, veredicto, motivo: "m" })]);
      expect(coordinar(lectura, decl([j])).controles[0]).toEqual(expect.objectContaining({
        estado: "no-cierra", veredicto: "weak", residuo: 5, motivo: "m · un control que no cierra no afirma más que weak",
      }));
    }
    for (const veredicto of ["weak", "abstained", "unavailable"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total", "neto"], estado: "no-cierra", residuo: 5, veredicto, motivo: "m" })]);
      expect(coordinar(lectura, decl([j])).controles[0]).toEqual(expect.objectContaining({ estado: "no-cierra", veredicto, motivo: "m" }));
    }
  });

  it("un no-se-puede-juzgar que trae verified o grounded sale abstained, nunca con firmeza", () => {
    for (const veredicto of ["verified", "grounded"] as const) {
      const j = juez("j", () => [control({ id: "c", partes: ["total"], estado: "no-se-puede-juzgar", residuo: null, veredicto })]);
      const c = coordinar(lectura, decl([j])).controles[0];
      expect(c.veredicto).toBe("abstained");
      expect(c.estado).toBe("no-se-puede-juzgar");
      expect(c.motivo).toBe("m · sin juzgar no hay lectura que afirmar");
    }
  });
});

describe("coordinar: una lista como parte", () => {
  const conLista = (elementos: Campo[]): Lectura => ({ campos: [pesos("total", 300)], listas: [{ id: "renglones", elementos }] });
  const usaLista = juez("j", () => [control({ id: "Σ renglones = total", partes: ["total", "renglones"] })]);

  it("una lista con elementos cuenta como presente, con el veredicto más débil de ellos", () => {
    const d = coordinar(conLista([pesos("r1", 100, "verified"), pesos("r2", 200, "weak")]), decl([usaLista]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "cierra", veredicto: "verified", parteMasDebil: "weak", faltan: [] }));
  });

  it("un elemento sin valor pesa abstained en la parte más débil, como cualquier parte", () => {
    const d = coordinar(conLista([pesos("r1", 100), vacio("r2")]), decl([usaLista]));
    expect(d.controles[0].parteMasDebil).toBe("abstained");
  });

  it("un elemento unavailable deja el control sin juzgar y unavailable", () => {
    const d = coordinar(conLista([pesos("r1", 100), { id: "r2", valor: null, veredicto: "unavailable" }]), decl([usaLista]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", parteMasDebil: "unavailable" }));
  });

  it("una lista vacía cuenta como faltante: falta un elemento de ella", () => {
    const d = coordinar(conLista([]), decl([usaLista]));
    expect(d.controles[0]).toEqual(expect.objectContaining({
      estado: "no-se-puede-juzgar", veredicto: "abstained", parteMasDebil: "abstained", residuo: null, faltan: [{ elementoDe: "renglones" }],
    }));
    expect(d.controles[0].motivo).toBe("m · falta: renglones");
  });

  it("la falta de la lista vacía que el juez ya anotó no se duplica", () => {
    const j = juez("j", () => [control({ id: "c", partes: ["total", "renglones"], faltan: [{ elementoDe: "renglones" }] })]);
    expect(coordinar(conLista([]), decl([j])).controles[0].faltan).toEqual([{ elementoDe: "renglones" }]);
  });

  it("una falta distinta que el juez anotó no tapa la del coordinador, sea de campo o de lista", () => {
    const l: Lectura = { campos: [vacio("total")], listas: [{ id: "renglones", elementos: [] }] };
    const j = juez("j", () => [control({ id: "c", partes: ["total", "renglones"], faltan: [{ campo: "otro" }, { elementoDe: "otra" }] })]);
    expect(coordinar(l, decl([j])).controles[0].faltan).toEqual([{ campo: "otro" }, { elementoDe: "otra" }, { campo: "total" }, { elementoDe: "renglones" }]);
    const soloCampo = juez("j", () => [control({ id: "c", partes: ["total"], faltan: [{ campo: "otro" }] })]);
    expect(coordinar(l, decl([soloCampo])).controles[0].faltan).toEqual([{ campo: "otro" }, { campo: "total" }]);
  });

  it("la falta de la lista vacía se suma a las de los campos", () => {
    const l: Lectura = { campos: [vacio("total")], listas: [{ id: "renglones", elementos: [] }] };
    const d = coordinar(l, decl([usaLista]));
    expect(d.controles[0].faltan).toEqual([{ campo: "total" }, { elementoDe: "renglones" }]);
    expect(d.controles[0].motivo).toBe("m · falta: total, renglones");
  });

  it("los elementos de la lista en otra moneda dejan el control sin juzgar", () => {
    const d = coordinar(conLista([pesos("r1", 300, "grounded", "USD")]), decl([usaLista]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "abstained" }));
    expect(d.controles[0].motivo).toContain("monedas distintas (ARS, USD)");
  });

  it("dos listas con el mismo id cuentan juntas: la más débil de todos sus elementos", () => {
    const l: Lectura = {
      campos: [pesos("total", 300)],
      listas: [{ id: "renglones", elementos: [pesos("r1", 100, "verified")] }, { id: "renglones", elementos: [pesos("r2", 200, "weak")] }],
    };
    expect(coordinar(l, decl([usaLista])).controles[0].parteMasDebil).toBe("weak");
  });

  it("un campo suelto con el id de la lista manda sobre la lista", () => {
    const l: Lectura = { campos: [pesos("total", 300), pesos("renglones", 300, "verified")], listas: [{ id: "renglones", elementos: [] }] };
    expect(coordinar(l, decl([usaLista])).controles[0]).toEqual(expect.objectContaining({ estado: "cierra", faltan: [] }));
  });

  it("con alternativas, la lista citada es la de la alternativa: vacía, falta; con elementos, cuenta con ellos acotados", () => {
    const l: Lectura = {
      campos: [pesos("total", 300)],
      listas: [{
        id: "renglones", elementos: [pesos("r1", 300, "verified")],
        alternativas: [
          { elementos: [], veredicto: "grounded", origen: { camino: "x" } },
          { elementos: [pesos("a1", 300, "verified")], veredicto: "weak", origen: { camino: "y" } },
        ],
      }],
    };
    const d = coordinar(l, decl([usaLista]));
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "cierra", parteMasDebil: "grounded" }));
    expect(d.porAlternativa.map((a) => a.controles.map((c) => [c.estado, c.parteMasDebil, c.faltan]))).toEqual([
      [["no-se-puede-juzgar", "abstained", [{ elementoDe: "renglones" }]]],
      [["cierra", "weak", []]],
    ]);
  });
});
