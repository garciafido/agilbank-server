import type * as http from 'http';
import type { Logger } from 'pino';

/** El puerto de salud del worker cuando WORKER_HEALTH_PORT no está o está vacía. */
export const DEFAULT_WORKER_HEALTH_PORT = 4001;

/**
 * El puerto de salud del worker desde WORKER_HEALTH_PORT: sin la variable, o
 * vacía, 4001; si no, un entero decimal entre 1 y 65535, con el texto entero.
 *
 * El healthcheck lee la misma variable en un sh (${WORKER_HEALTH_PORT:-4001}),
 * que no la convierte: con `parseInt`, "4002x" era 4002 para el worker y
 * "4002x" para el healthcheck, "0" un puerto al azar, y "abc" o "70000" un
 * error de Node que no nombraba la variable. Por eso acá vale solo ese formato:
 * otro valor es un error que nombra la variable y lo que vino, y el worker no
 * arranca.
 */
export function healthPortFromEnv(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_WORKER_HEALTH_PORT;
  const port = /^[0-9]+$/.test(value) ? Number(value) : NaN;
  if (!(port >= 1 && port <= 65535)) {
    throw new Error(`WORKER_HEALTH_PORT must be an integer between 1 and 65535 (got ${JSON.stringify(value)})`);
  }
  return port;
}

/**
 * Abre el puerto de salud del worker y espera a que escuche.
 *
 * Sin un listener de 'error', un `listen` que falla (otro proceso tiene el
 * puerto) tira el worker sin decir por qué, y el server sigue encolando
 * trabajos que nadie toma. Acá un error de antes de escuchar rechaza la promesa
 * con un mensaje que dice qué pasó y qué hacer; el worker lo espera antes de
 * tomar ningún trabajo, lo loguea y sale.
 *
 * Ya escuchando, queda un listener que solo loguea: un error tardío del health
 * server (un accept que falla por EMFILE, por ejemplo) no tira el worker ni
 * corta los trabajos en curso.
 */
export function listenHealthServer(server: http.Server, port: number, log: Logger): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(healthPortError(error, port));
    };
    const onListening = () => {
      server.off('error', onError);
      server.on('error', (error: Error) => {
        log.error({ err: error, port }, 'Worker health server error');
      });
      log.info({ port }, 'Worker health server started');
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

/**
 * El error de no poder abrir el puerto: dice qué hacer cuando se sabe (puerto
 * ocupado o sin permiso) y si no, da el mensaje original. Conserva el `code`,
 * y el original va en `cause`.
 */
function healthPortError(error: NodeJS.ErrnoException, port: number): NodeJS.ErrnoException {
  let message: string;
  switch (error.code) {
    case 'EADDRINUSE':
      message = `Worker health port ${port} is already in use: set WORKER_HEALTH_PORT to a free port`;
      break;
    case 'EACCES':
      message = `No permission to listen on worker health port ${port}: set WORKER_HEALTH_PORT to a port this process may open`;
      break;
    default:
      message = error.message;
  }
  return Object.assign(new Error(message, { cause: error }), { code: error.code });
}
