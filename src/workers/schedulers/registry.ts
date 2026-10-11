/**
 * Registro opt-in de schedulers del PROYECTO (punto de extensión del worker).
 *
 * El worker generado ejecuta los schedulers built-in (token reset, expiraciones)
 * y luego itera este registro en cada tick. El proyecto registra los suyos en un
 * módulo propio (cargado al boot vía un import side-effect, igual patrón que
 * `deadLetterHandlers`/`simulationLaunchers`) — sin tocar `worker.ts` (evita
 * drift/conflictos en regeneraciones).
 *
 * Cada scheduler debe ser idempotente y barato cuando no hay trabajo (no-op).
 */
export interface ProjectScheduler {
  name: string;
  run: (prisma: any, logger: any, redis: any) => Promise<void>;
  /**
   * Cada cuánto correrlo, en milisegundos. Sin esto va en el tick general, que
   * es HORARIO.
   *
   * Existe porque una hora no sirve para todo. Hay trabajo que puede esperar
   * —barridos de retención, reconciliaciones— y trabajo que una persona está
   * mirando: sube una foto y espera que salga. Con el tick horario, subir dos
   * minutos después del tick significaba cincuenta y ocho minutos de nada, sin
   * ninguna señal de que estaba pasando algo.
   *
   * El worker igual lo corre en su tick si le toca, así que un scheduler con
   * `everyMs` sigue siendo idempotente y barato cuando no hay trabajo: eso no
   * lo afloja este campo.
   */
  everyMs?: number;
}

export const projectSchedulers: ProjectScheduler[] = [];
