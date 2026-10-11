/**
 * El veredicto: cuán seguro está el sistema de un dato.
 *
 * Una sola escala para lo que hoy se dice de dos formas —la confianza 0..1 de
 * la extracción y los estados de la constatación— y, sobre todo, una regla de
 * propagación que hoy no existe.
 *
 * El agujero que cierra: un dato leído con dudas se usa para derivar otro, y el
 * derivado se muestra como certeza. La confianza se fabrica aguas abajo y nada
 * lo impide — hasta que la propagación lo vuelve imposible por construcción.
 *
 * Primitivo del framework: todo proyecto generado habla esta escala. Que cada
 * uno invente la suya es cómo se termina con cuatro vocabularios para la misma
 * idea que no componen entre sí.
 *
 * Doctrina Kigo:
 * agent-framework/documentation/2026-07-29-arquitectura-framework-agentes.md
 */

export type Verdict = "verified" | "grounded" | "weak" | "abstained" | "unavailable";

/**
 * Un veredicto con su tiempo y su origen.
 *
 * Kigo trata `verified` como permanente, y no lo es: el certificado vence, la
 * norma cambia, el padrón se actualiza. Un `verified` cacheado se vuelve
 * mentira en silencio — la misma deriva que la doctrina advierte para la
 * calibración conforme, sin aplicarla a los veredictos.
 *
 * `by` importa tanto como el veredicto: distingue lo que confirmó ARCA de lo
 * que decidió una persona, y sin eso el polinomio de procedencia pierde
 * justamente el nodo que hace falta poder discutir después.
 */
export interface Judgement {
  verdict: Verdict;
  /** Cuándo se ganó. No cuándo se consultó: cuándo el tercero lo afirmó. */
  earnedAt: Date;
  /** Quién lo ganó: `arca:padron`, `ocr`, `user:<id>`, `rule:cuadre`. */
  by: string;
  /** Cuánto vale. `null` = no envejece: hay verdades que no caducan. */
  validForMs: number | null;
}

/**
 * De más fuerte a más débil.
 *
 * La distancia entre `verified` y `grounded` es la que más importa y la más
 * fácil de borronear: `verified` lo confirma un tercero —ARCA, una regla
 * aritmética—; `grounded` es una lectura nuestra bien anclada. Una lectura
 * nítida sigue siendo una lectura.
 */
const ORDEN: Record<Verdict, number> = {
  verified: 4,
  grounded: 3,
  weak: 2,
  // "No pude mirar" es MENOS malo que "no hay evidencia": no afirma nada sobre
  // el dato, solo sobre nosotros, y un reintento puede resolverlo. Una
  // abstención por falta de evidencia no se arregla insistiendo.
  unavailable: 1,
  abstained: 0,
};

/** Umbral de la cascada de extracción. Por debajo, el valor no se escribe. */
export const GATEKEEPER = 0.8;

/**
 * El más débil de todos: la regla de propagación.
 *
 * Sin dependencias devuelve `abstained`, no `verified`: de la nada no se sigue
 * certeza, y el vacío tratado como confirmación es el error que vuelve inútil
 * a todo el esquema.
 */
export function weakest(verdicts: Verdict[]): Verdict {
  if (verdicts.length === 0) return "abstained";
  return verdicts.reduce((a, b) => (ORDEN[b] < ORDEN[a] ? b : a));
}

/**
 * La confianza de una lectura, traducida a veredicto.
 *
 * Nunca devuelve `verified`: ese se gana con un oráculo externo, no con buena
 * resolución de imagen. Confundirlos sería exactamente fabricar confianza.
 */
export function verdictFromConfidence(confidence: number | null | undefined): Verdict {
  if (!confidence || confidence <= 0) return "abstained";
  return confidence >= GATEKEEPER ? "grounded" : "weak";
}

/**
 * ¿Se puede mostrar como valor, o solo como candidato?
 *
 * Es la diferencia entre "el sistema cree que es esto" y "el sistema dice que
 * es esto". La segunda, sin respaldo, es la que hace perder la confianza en
 * todo lo demás.
 */
export function isPresentable(verdict: Verdict): boolean {
  return ORDEN[verdict] >= ORDEN.grounded;
}

/**
 * ¿El veredicto todavía vale?
 *
 * Un juicio vencido no se degrada solo: hay que preguntarlo. Reusarlo sin
 * chequear es cómo un "verificado en ARCA" de hace dos años sigue mostrándose
 * como si fuera de hoy.
 */
export function isStillValid(j: Judgement, now: Date = new Date()): boolean {
  if (j.validForMs === null) return true;
  return now.getTime() - j.earnedAt.getTime() <= j.validForMs;
}
