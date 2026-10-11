/**
 * Lo que va al log de un error cuyo mensaje puede traer datos personales (un
 * mail, un nombre, lo que mandó un contacto): su tipo, su código y dónde falló.
 * Nunca el mensaje ni el error entero: el de Prisma copia la consulta con sus
 * valores, el de un servidor de correo nombra al destinatario, y el de un
 * asiento del proyecto trae lo que el proyecto ponga.
 *
 * Dónde falló son las líneas "at" de la pila, hasta MAX_FRAMES, sin su
 * encabezado: la pila empieza con "<tipo>: <mensaje>" (el mensaje puede tener
 * varias líneas), y lo que se toma empieza después del mensaje.
 *
 * Generado por haiku (static file): no editar en el proyecto.
 */
export type ErrorKind = { errorType: string; errorCode?: string | number; errorAt?: string[] };

export const MAX_FRAMES = 10;

export function errorKind(err: unknown): ErrorKind {
  if (err === null || typeof err !== 'object') return { errorType: typeof err };
  try {
    const e = err as {
      constructor?: { name?: unknown };
      code?: unknown;
      extensions?: { code?: unknown };
      message?: unknown;
      stack?: unknown;
    };
    const name = e.constructor?.name;
    // El código: un texto (P2034, EENVELOPE) o un número (el status HTTP que trae
    // el ResponseError de SendGrid).
    const code = isCode(e.code) ? e.code : e.extensions?.code;
    const frames = stackFrames(e.stack, e.message);
    return {
      errorType: typeof name === 'string' && name !== '' ? name : 'object',
      ...(isCode(code) ? { errorCode: code } : {}),
      ...(frames.length > 0 ? { errorAt: frames } : {}),
    };
  } catch {
    // Un getter que tira, un Proxy: el log no puede hacer tirar al que loguea.
    return { errorType: 'Unserializable' };
  }
}

function isCode(value: unknown): value is string | number {
  return (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value));
}

/** Las líneas "at" de la pila, después del encabezado (el tipo y el mensaje). */
function stackFrames(stack: unknown, message: unknown): string[] {
  if (typeof stack !== 'string') return [];
  const text = typeof message === 'string' && message !== '' && stack.includes(message) ? message : null;
  const start = text ? stack.indexOf(text) + text.length : stack.indexOf('\n');
  if (start < 0) return [];
  return stack
    .slice(start)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, MAX_FRAMES);
}
