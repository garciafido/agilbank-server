/**
 * Espera una promesa con plazo: lo que devuelve termina como ella, o rechaza con
 * un DeadlineExceededError si no termina en `ms`. Sirve para lo que no puede
 * demorar una respuesta (un evento en vivo por Redis después de un commit, por
 * ejemplo): quien llama atrapa el rechazo y lo loguea como cualquier otro fallo.
 *
 * La promesa original no se cancela: sigue su curso y, si después termina, su
 * resultado se descarta. Un rechazo suyo que llega después del plazo también
 * queda atrapado (Promise.race la escucha hasta el final): no deja un rechazo
 * sin atrapar.
 *
 * `what` nombra lo que se esperaba ("SSE publish"), para el mensaje del error:
 * nunca un dato.
 *
 * Generado por haiku (static file): no editar en el proyecto.
 */
export class DeadlineExceededError extends Error {
  constructor(readonly what: string, readonly ms: number) {
    super(`${what}: no terminó en ${ms} ms`);
    this.name = 'DeadlineExceededError';
  }
}

export function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceededError(what, ms)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
