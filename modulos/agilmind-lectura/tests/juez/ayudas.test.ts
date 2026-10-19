// agilmind-lectura/tests/juez/ayudas.test.ts
import { controlDeSuma, controlesDeCompletitud } from "../../src/juez/ayudas";
import { coordinar } from "../../src/juez/coordinar";
import { TOPE_POR_DEFECTO, type Campo, type Juez } from "../../src/juez/contrato";

const m = (...cs: Campo[]) => new Map(cs.map((c) => [c.id, c]));
const pesos = (id: string, valor: number): Campo => ({ id, valor: { tipo: "centavos", valor, moneda: "ARS" }, veredicto: "grounded" });
const def = { id: "final = inicial + movimientos", total: "final", partes: ["inicial", "m1", "m2"], tolerancia: 0, veredictoSiCierra: "verified" as const };

describe("controlDeSuma", () => {
  it("cierra al centavo con su veredicto", () => {
    const c = controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c).toEqual(expect.objectContaining({ estado: "cierra", residuo: 0, veredicto: "verified", partes: ["final", "inicial", "m1", "m2"] }));
  });
  it("no cierra con el residuo: positivo si faltan", () => {
    const c = controlDeSuma(def, m(pesos("final", 1600), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c).toEqual(expect.objectContaining({ estado: "no-cierra", residuo: 100, veredicto: "weak" }));
  });
  it("con tolerancia, un residuo dentro de ella cierra", () => {
    const c = controlDeSuma({ ...def, tolerancia: 100 }, m(pesos("final", 1600), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c.estado).toBe("cierra");
    expect(c.residuo).toBe(100);
  });
  it("una parte que no es un importe no se suma: no se puede juzgar", () => {
    const texto: Campo = { id: "m1", valor: { tipo: "texto", valor: "700" }, veredicto: "grounded" };
    const c = controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), texto, pesos("m2", -200)));
    expect(c.estado).toBe("no-se-puede-juzgar");
  });
  it("una parte que falta se deja al coordinador: el control la lista en partes", () => {
    const c = controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700)));
    expect(c.partes).toContain("m2");
    expect(c.estado).toBe("no-se-puede-juzgar");
  });

  it("sobran: el residuo es negativo y el motivo lo dice con el importe", () => {
    const c = controlDeSuma(def, m(pesos("final", 1450), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c).toEqual(expect.objectContaining({ estado: "no-cierra", residuo: -50, motivo: "sobran 50 centavos" }));
  });
  it("faltan: el motivo dice cuántos centavos", () => {
    const c = controlDeSuma(def, m(pesos("final", 1600), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c.motivo).toBe("faltan 100 centavos");
  });
  it("un residuo igual a la tolerancia cierra y uno apenas mayor no, en los dos signos", () => {
    const con = (final: number) => controlDeSuma({ ...def, tolerancia: 100 }, m(pesos("final", final), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(con(1600).estado).toBe("cierra");
    expect(con(1400).estado).toBe("cierra");
    expect(con(1601).estado).toBe("no-cierra");
    expect(con(1399).estado).toBe("no-cierra");
  });
  it("la tolerancia no cambia el veredicto de lo que cierra, y el motivo es cierra", () => {
    const c = controlDeSuma({ ...def, veredictoSiCierra: "grounded" }, m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)));
    expect(c).toEqual(expect.objectContaining({ veredicto: "grounded", motivo: "cierra" }));
  });
  it("sin juzgar: abstained, sin residuo, sin faltantes propios, con el motivo", () => {
    const sinParte = controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700)));
    expect(sinParte).toEqual({
      id: def.id, partes: ["final", "inicial", "m1", "m2"], faltan: [], sospechosos: { informa: false }, posicion: { informa: false },
      estado: "no-se-puede-juzgar", residuo: null, veredicto: "abstained", motivo: "falta una parte",
    });
    const sinValor: Campo = { id: "m2", valor: null, veredicto: "abstained" };
    expect(controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), sinValor)).motivo).toBe("falta una parte");
    const texto: Campo = { id: "m1", valor: { tipo: "texto", valor: "7" }, veredicto: "grounded" };
    const noImporte = controlDeSuma(def, m(pesos("final", 1500), pesos("inicial", 1000), texto, pesos("m2", -200)));
    expect(noImporte).toEqual(expect.objectContaining({ residuo: null, veredicto: "abstained", motivo: "una parte no es un importe", faltan: [] }));
  });
  it("el total que no es un importe también deja sin juzgar", () => {
    const fecha: Campo = { id: "final", valor: { tipo: "fecha", valor: "2026-01-01" }, veredicto: "grounded" };
    expect(controlDeSuma(def, m(fecha, pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200))).estado).toBe("no-se-puede-juzgar");
  });
  it("una suma sin partes cierra solo si el total es cero", () => {
    const sola = { ...def, partes: [] as string[] };
    expect(controlDeSuma(sola, m(pesos("final", 0))).estado).toBe("cierra");
    expect(controlDeSuma(sola, m(pesos("final", 5))).residuo).toBe(5);
  });
  it("partes en monedas distintas: la ayuda las lista todas y por el coordinador el control queda sin juzgar, sin residuo", () => {
    const usd: Campo = { id: "m2", valor: { tipo: "centavos", valor: -200, moneda: "USD" }, veredicto: "grounded" };
    const campos = [pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), usd];
    expect(controlDeSuma(def, m(...campos)).partes).toEqual(["final", "inicial", "m1", "m2"]);
    const j: Juez = { id: "j", version: "1", juzgar: () => [controlDeSuma(def, m(...campos))] };
    const d = coordinar({ campos, listas: [] }, { jueces: [j], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", residuo: null, motivo: expect.stringContaining("monedas distintas") }));
  });
  it("una tolerancia negativa o que no es un número finito es un error del juez: tira", () => {
    const campos = m(pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200));
    for (const tolerancia of [-1, NaN, Infinity, -Infinity, "5" as unknown as number]) {
      expect(() => controlDeSuma({ ...def, tolerancia }, campos)).toThrow("tolerancia inválida");
    }
    expect(controlDeSuma({ ...def, tolerancia: 0 }, campos).estado).toBe("cierra");
  });
  it("la tolerancia inválida por el coordinador es falla de ese juez, no del dictamen", () => {
    const campos = [pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), pesos("m2", -200)];
    const j: Juez = { id: "j", version: "1", juzgar: (l) => [controlDeSuma({ ...def, tolerancia: NaN }, m(...l.campos))] };
    const d = coordinar({ campos, listas: [] }, { jueces: [j], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(d.controles).toEqual([expect.objectContaining({ id: "j: no se pudo juzgar", veredicto: "unavailable", motivo: "el juez falló: tolerancia inválida" })]);
  });
  it("pasa por el coordinador: una parte ausente sale en faltan, la parte más débil la informa parteMasDebil", () => {
    const j = (campos: Campo[]): Juez => ({ id: "j", version: "1", juzgar: () => [controlDeSuma(def, m(...campos))] });
    const ausente = coordinar({ campos: [pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700)], listas: [] },
      { jueces: [j([pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700)])], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(ausente.controles[0]).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", faltan: [{ campo: "m2" }], veredicto: "abstained" }));
    const debil = { ...pesos("m2", -200), veredicto: "weak" as const };
    const campos = [pesos("final", 1500), pesos("inicial", 1000), pesos("m1", 700), debil];
    const d = coordinar({ campos, listas: [] }, { jueces: [j(campos)], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(d.controles[0]).toEqual(expect.objectContaining({ estado: "cierra", parteMasDebil: "weak" }));
  });
});

describe("controlesDeCompletitud", () => {
  it("presente cierra con la certeza del campo; ausente no cierra y anota la falta", () => {
    const cs = controlesDeCompletitud(["cuitEmisor", "fecha"], m({ id: "cuitEmisor", valor: { tipo: "texto", valor: "20123456786" }, veredicto: "grounded" }));
    expect(cs).toEqual([
      expect.objectContaining({ id: "cuitEmisor presente", estado: "cierra", veredicto: "grounded" }),
      expect.objectContaining({ id: "fecha presente", estado: "no-cierra", veredicto: "abstained", faltan: [{ campo: "fecha" }] }),
    ]);
  });
  it("la forma exacta de cada uno, con partes vacías para que el coordinador no los deje sin juzgar", () => {
    const cs = controlesDeCompletitud(["a", "b"], m({ id: "a", valor: { tipo: "texto", valor: "x" }, veredicto: "verified" }));
    expect(cs).toEqual([
      { id: "a presente", estado: "cierra", residuo: null, partes: [], faltan: [], sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "verified", motivo: "presente" },
      { id: "b presente", estado: "no-cierra", residuo: null, partes: [], faltan: [{ campo: "b" }], sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "abstained", motivo: "no se leyó" },
    ]);
  });
  it("un campo presente en la lectura pero sin valor cuenta como ausente", () => {
    const [c] = controlesDeCompletitud(["a"], m({ id: "a", valor: null, veredicto: "weak" }));
    expect(c).toEqual(expect.objectContaining({ estado: "no-cierra", veredicto: "abstained", faltan: [{ campo: "a" }] }));
  });
  it("un campo que no se pudo mirar no es un campo que no se leyó: sin juzgar, unavailable, con la falta anotada", () => {
    for (const veredicto of ["unavailable", "raro"] as const) {
      const [c] = controlesDeCompletitud(["a"], m({ id: "a", valor: null, veredicto: veredicto as Campo["veredicto"] }));
      expect(c).toEqual({
        id: "a presente", estado: "no-se-puede-juzgar", residuo: null, partes: [], faltan: [{ campo: "a" }],
        sospechosos: { informa: false }, posicion: { informa: false }, veredicto: "unavailable", motivo: "no se pudo mirar",
      });
    }
  });
  it("un campo unavailable con valor tampoco cierra: no se pudo mirar", () => {
    const [c] = controlesDeCompletitud(["a"], m({ id: "a", valor: { tipo: "texto", valor: "x" }, veredicto: "unavailable" }));
    expect(c).toEqual(expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", motivo: "no se pudo mirar" }));
  });
  it("un campo abstained sin valor sigue siendo no se leyó, y uno con valor y weak cierra con weak", () => {
    expect(controlesDeCompletitud(["a"], m({ id: "a", valor: null, veredicto: "abstained" }))[0]).toEqual(expect.objectContaining({ estado: "no-cierra", motivo: "no se leyó" }));
    expect(controlesDeCompletitud(["a"], m({ id: "a", valor: { tipo: "texto", valor: "x" }, veredicto: "weak" }))[0]).toEqual(expect.objectContaining({ estado: "cierra", veredicto: "weak" }));
  });
  it("por el coordinador, el campo que no se pudo mirar sale sin juzgar y unavailable, no como falta", () => {
    const a: Campo = { id: "a", valor: null, veredicto: "unavailable" };
    const j: Juez = { id: "completitud", version: "1", juzgar: () => controlesDeCompletitud(["a"], m(a)) };
    const d = coordinar({ campos: [a], listas: [] }, { jueces: [j], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(d.controles).toEqual([expect.objectContaining({ estado: "no-se-puede-juzgar", veredicto: "unavailable", faltan: [{ campo: "a" }], motivo: "no se pudo mirar" })]);
  });
  it("sin requeridos no hay controles", () => {
    expect(controlesDeCompletitud([], m())).toEqual([]);
  });
  it("por el coordinador sale tal cual: no cierra con la falta, sin pasar a no-se-puede-juzgar", () => {
    const j: Juez = { id: "completitud", version: "1", juzgar: () => controlesDeCompletitud(["a", "b"], m({ id: "a", valor: { tipo: "texto", valor: "x" }, veredicto: "grounded" })) };
    const d = coordinar({ campos: [{ id: "a", valor: { tipo: "texto", valor: "x" }, veredicto: "grounded" }], listas: [] },
      { jueces: [j], despeja: new Set(), tope: TOPE_POR_DEFECTO });
    expect(d.controles).toEqual([
      expect.objectContaining({ id: "a presente", estado: "cierra", veredicto: "grounded" }),
      expect.objectContaining({ id: "b presente", estado: "no-cierra", faltan: [{ campo: "b" }], veredicto: "abstained" }),
    ]);
  });
});
