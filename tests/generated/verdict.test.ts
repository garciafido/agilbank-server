// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  weakest,
  verdictFromConfidence,
  isPresentable,
  isStillValid,
  GATEKEEPER,
  type Verdict,
  type Judgement,
} from "../../src/common/verdict";

/**
 * Todos los veredictos que existen. El dominio completo, no una muestra.
 *
 * De más fuerte a más débil, igual que el ORDEN del primitivo: eso hace que
 * `MAS_FUERTE` y `MAS_DEBIL` salgan de las puntas y no de una constante que
 * pueda quedar desactualizada.
 */
const VERDICTOS: Verdict[] = [
  "verified",
  "grounded",
  "weak",
  "unavailable",
  "abstained",
];
const MAS_FUERTE = VERDICTOS[0];
const MAS_DEBIL = VERDICTOS[VERDICTOS.length - 1];

/** Todos los pares y todas las ternas del dominio. */
const PARES: Array<[Verdict, Verdict]> = VERDICTOS.flatMap((a) =>
  VERDICTOS.map((b): [Verdict, Verdict] => [a, b])
);
const TERNAS: Array<[Verdict, Verdict, Verdict]> = VERDICTOS.flatMap((a) =>
  VERDICTOS.flatMap((b) =>
    VERDICTOS.map((c): [Verdict, Verdict, Verdict] => [a, b, c])
  )
);

describe("el retículo de veredictos", () => {
  it("gana siempre el más débil", () => {
    expect(weakest(["verified", "grounded"])).toBe("grounded");
    expect(weakest(["verified", "weak"])).toBe("weak");
    expect(weakest(["grounded", "abstained"])).toBe("abstained");
  });

  /**
   * La regla que sostiene todo lo demás: si un derivado pudiera superar a su
   * origen, la confianza se fabricaría aguas abajo y ningún veredicto
   * significaría nada.
   */
  it("un derivado no puede ser más fuerte que su insumo más débil", () => {
    const origen: Verdict = "weak";
    const derivado: Verdict = "verified";
    expect(weakest([derivado, origen])).toBe("weak");
  });

  it("sin dependencias no hay certeza: se abstiene", () => {
    expect(weakest([])).toBe("abstained");
  });

  it("una lectura nunca llega a verificada, por nítida que sea", () => {
    // "verified" lo gana un tercero, no la resolución de una imagen.
    expect(verdictFromConfidence(1)).toBe("grounded");
    expect(verdictFromConfidence(GATEKEEPER)).toBe("grounded");
    expect(verdictFromConfidence(GATEKEEPER - 0.01)).toBe("weak");
    expect(verdictFromConfidence(null)).toBe("abstained");
  });

  it("lo débil se ofrece como candidato, no se escribe como valor", () => {
    expect(isPresentable("verified")).toBe(true);
    expect(isPresentable("grounded")).toBe(true);
    expect(isPresentable("weak")).toBe(false);
    expect(isPresentable("abstained")).toBe(false);
    expect(isPresentable("unavailable")).toBe(false);
  });

  it("no haber podido mirar no es lo mismo que no haber encontrado", () => {
    // El primero afirma algo sobre nosotros; el segundo, sobre el dato. Y solo
    // el primero se resuelve reintentando.
    expect(weakest(["unavailable", "abstained"])).toBe("abstained");
  });

  it("un juicio con vigencia caduca solo", () => {
    const ahora = new Date("2026-08-03T12:00:00.000Z");
    const j: Judgement = {
      verdict: "verified",
      earnedAt: new Date("2026-01-01T00:00:00.000Z"),
      by: "oraculo",
      validForMs: 24 * 60 * 60 * 1000,
    };
    expect(isStillValid(j, ahora)).toBe(false);
    expect(isStillValid({ ...j, validForMs: null }, ahora)).toBe(true);
  });
});

/**
 * Las leyes que licencian propagar sobre un grafo cualquiera.
 *
 * Exhaustivas sobre el dominio: no hay muestreo, se recorren todos los casos.
 * Cada ley responde a una forma concreta que el grafo de dependencias puede
 * tomar, y sin ella la propagación dependería de cómo se recorra el grafo —
 * que es justamente lo que no puede pasar.
 */
describe("las leyes que hacen válida la propagación sobre un grafo", () => {
  it("el dominio está completo: si aparece un veredicto nuevo, esto hay que repensarlo", () => {
    // La exhaustividad es el argumento de este bloque entero. Un sexto
    // veredicto no rompe las leyes, pero sí rompe la afirmación de que están
    // verificadas para todo el dominio — y en silencio.
    expect(VERDICTOS).toHaveLength(5);
    expect(new Set(VERDICTOS).size).toBe(5);
    expect(PARES).toHaveLength(25);
    expect(TERNAS).toHaveLength(125);
  });

  /**
   * Asociatividad — 125 casos.
   *
   * Es la ley que hace que el pliegue no dependa del orden de recorrido. Sin
   * ella, evaluar un grafo en anchura y en profundidad podría dar veredictos
   * distintos para el mismo nodo.
   */
  it.each(TERNAS)("asociativa con %s, %s, %s", (a, b, c) => {
    const izquierda = weakest([weakest([a, b]), c]);
    const derecha = weakest([a, weakest([b, c])]);
    expect(izquierda).toBe(derecha);
    // Y las dos formas coinciden con plegar la lista de una vez, que es como
    // lo va a llamar quien tenga los tres insumos juntos.
    expect(weakest([a, b, c])).toBe(izquierda);
  });

  /**
   * Conmutatividad — 25 casos.
   *
   * El orden en que se declaran los insumos de un campo no puede alterar su
   * veredicto. Si alterara, el veredicto dependería del orden del `.hk`.
   */
  it.each(PARES)("conmutativa con %s y %s", (a, b) => {
    expect(weakest([a, b])).toBe(weakest([b, a]));
  });

  /**
   * Idempotencia — 5 casos.
   *
   * Es la que cubre los diamantes: un nodo alcanzable por dos caminos aporta su
   * veredicto dos veces al pliegue, y no puede penalizar por eso. Sin
   * idempotencia habría que deduplicar los ancestros antes de plegar, y
   * olvidarse de deduplicar sería un bug silencioso.
   */
  it.each(VERDICTOS)("idempotente con %s", (v) => {
    expect(weakest([v, v])).toBe(v);
    expect(weakest([v, v, v])).toBe(v);
  });

  /**
   * El más fuerte es neutro — 5 casos.
   *
   * Un insumo `verified` no aporta ni quita: agregar una dependencia
   * confirmada por un tercero no puede debilitar a nadie.
   */
  it.each(VERDICTOS)("neutro: el más fuerte no altera a %s", (v) => {
    expect(weakest([v, MAS_FUERTE])).toBe(v);
  });

  /**
   * El más débil absorbe — 5 casos.
   *
   * Una sola dependencia sin evidencia arrastra todo lo que dependa de ella, por
   * larga que sea la cadena. Es la propiedad que hace imposible ocultar un fallo
   * en cascada.
   */
  it.each(VERDICTOS)("absorbente: el más débil arrastra a %s", (v) => {
    expect(weakest([v, MAS_DEBIL])).toBe(MAS_DEBIL);
  });

  /**
   * Monotonía — 25 casos.
   *
   * Agregar un insumo nunca fortalece. Dicho al revés: no hay forma de subir el
   * veredicto de un campo sumándole dependencias, que es la única manera en que
   * alguien podría intentar fabricar confianza sin tocar el primitivo.
   */
  it.each(PARES)("agregar %s a %s no puede fortalecerlo", (nuevo, base) => {
    const conElNuevo = weakest([base, nuevo]);
    // "No más fuerte que" se afirma sin importar el ORDEN interno: el resultado
    // es el propio base, o es el nuevo porque era más débil.
    expect(conElNuevo === base || conElNuevo === nuevo).toBe(true);
    expect(weakest([conElNuevo, base])).toBe(conElNuevo);
  });

  it("el vacío es una decisión de dominio, no la identidad del álgebra", () => {
    // Un monoide pediría que el vacío diera el neutro. Acá da el ABSORBENTE, a
    // propósito: "de la nada no se sigue certeza". Así que las leyes de arriba
    // valen sobre listas NO vacías, y el vacío es su propio caso.
    //
    // No rompe la propagación sobre el grafo: un nodo sin insumos es una fuente,
    // y su veredicto lo da su resolutor, no un pliegue.
    expect(weakest([])).toBe(MAS_DEBIL);
    expect(weakest([])).not.toBe(MAS_FUERTE);
  });
});

/**
 * La propagación sobre un grafo concreto.
 *
 * Las leyes de arriba son lo que licencia generalizar de este grafo a cualquier
 * otro. Este bloque comprueba que el álgebra se traslada: plegar los insumos
 * directos de cada nodo da lo mismo que tomar el ínfimo de TODOS sus ancestros.
 */
describe("la propagación sobre un grafo de dependencias", () => {
  /** Un nodo: su veredicto propio si es fuente, o sus insumos si es derivado. */
  interface Nodo {
    propio?: Verdict;
    insumos?: string[];
  }

  /** Pliega los insumos directos. Es como propagaría el motor. */
  const evaluar = (grafo: Record<string, Nodo>, nombre: string): Verdict => {
    const nodo = grafo[nombre];
    if (nodo.propio !== undefined) return nodo.propio;
    return weakest((nodo.insumos ?? []).map((i) => evaluar(grafo, i)));
  };

  /** Todos los ancestros, sin deduplicar: el diamante aporta dos veces. */
  const ancestros = (
    grafo: Record<string, Nodo>,
    nombre: string
  ): Verdict[] => {
    const nodo = grafo[nombre];
    if (nodo.propio !== undefined) return [nodo.propio];
    return (nodo.insumos ?? []).flatMap((i) => ancestros(grafo, i));
  };

  it("plegar los insumos directos da el ínfimo de todos los ancestros", () => {
    const grafo: Record<string, Nodo> = {
      cuit: { propio: "verified" },
      razonSocial: { propio: "weak" },
      neto: { propio: "grounded" },
      proveedor: { insumos: ["cuit", "razonSocial"] },
      desglose: { insumos: ["neto"] },
      imputacion: { insumos: ["proveedor", "desglose"] },
    };
    expect(evaluar(grafo, "imputacion")).toBe(
      weakest(ancestros(grafo, "imputacion"))
    );
    // Y el valor concreto: la razón social en weak arrastra todo.
    expect(evaluar(grafo, "imputacion")).toBe("weak");
  });

  it("un nodo alcanzable por dos caminos no se penaliza dos veces", () => {
    // El diamante. Sin idempotencia habría que deduplicar antes de plegar.
    const grafo: Record<string, Nodo> = {
      neto: { propio: "weak" },
      ivaCalculado: { insumos: ["neto"] },
      percepcionCalculada: { insumos: ["neto"] },
      total: { insumos: ["ivaCalculado", "percepcionCalculada"] },
    };
    expect(ancestros(grafo, "total")).toEqual(["weak", "weak"]);
    expect(evaluar(grafo, "total")).toBe("weak");
    expect(evaluar(grafo, "total")).toBe(weakest(ancestros(grafo, "total")));
  });

  it("una sola fuente sin evidencia arrastra una cadena larga", () => {
    const grafo: Record<string, Nodo> = {
      fuente: { propio: "abstained" },
      a: { insumos: ["fuente"] },
      b: { insumos: ["a"] },
      c: { insumos: ["b"] },
      d: { insumos: ["c"] },
    };
    expect(evaluar(grafo, "d")).toBe("abstained");
  });

  it("una fuente confirmada no fortalece a quien depende de algo débil", () => {
    const grafo: Record<string, Nodo> = {
      oraculo: { propio: "verified" },
      lecturaFloja: { propio: "weak" },
      derivado: { insumos: ["oraculo", "lecturaFloja"] },
    };
    expect(evaluar(grafo, "derivado")).toBe("weak");
  });
});
