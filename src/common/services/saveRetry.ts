/**
 * El reintento de un guardado de formulario (`idempotencyKey_`, la clave de
 * idempotencia): un reintento del mismo guardado no es un conflicto, y un alta
 * reintentada no se duplica.
 *
 * No confundir con common/services/idempotency.ts: ese es para las escrituras
 * por API, que guardan su resultado en una tabla (IdempotencyRecord) y rechazan
 * la misma clave con otro cuerpo. Este no guarda nada: reconoce el reintento por
 * la versión (o el id) que derivó del intento original.
 *
 * El cliente manda, junto con la versión que leyó (`version_`), una clave al azar
 * por cada intento lógico de guardar: la misma mientras reintenta sin cambiar
 * nada, otra en cuanto edita o después de guardar bien. El server no guarda la
 * clave en ningún lado: la usa, con el hash del contenido del pedido, para
 * DERIVAR lo que genera. Un intento es la clave más el contenido: la misma
 * clave con otro contenido es otro intento.
 *
 * - Edición: la versión nueva es `deriveVersion(versión leída, intento)`. Si la
 *   respuesta se pierde y el cliente reintenta el mismo pedido (misma versión
 *   leída, misma clave, mismo contenido), el server encuentra en la fila justo
 *   esa versión derivada: es el mismo intento, ya aplicado, y responde con los
 *   datos actuales en vez de un conflicto. Cualquier otra escritura en el medio
 *   deja otra versión, y el reintento sí es un conflicto (cierto para ese
 *   intento); la misma clave con otro contenido, también.
 * - Alta: el id del registro es `deriveCreateId(entidad, usuario, intento)`. El
 *   reintento del mismo usuario con el mismo pedido encuentra ese registro (de su
 *   empresa, creado por él) y lo devuelve en vez de crear otro. El usuario va en
 *   la derivación: la clave de otro no lleva nunca al mismo id. La misma clave
 *   con otro contenido da otro id, y por lo tanto otro registro.
 *
 * La derivación es un HMAC con una clave del server: quien tiene la clave del
 * cliente y conoce el contenido no puede recomputar la versión ni el id, así que
 * no le sirven para verificar contenido (por ejemplo, un campo `.secret`). Sin
 * secreto del server no hay idempotencia: versión o id al azar, como sin clave.
 *
 * Una clave inválida (no es un uuid v4: tampoco nil, max u otra versión) se
 * ignora: el guardado sigue como siempre, con una versión o un id al azar.
 */
import { createHash, createHmac } from "crypto";
import { cloneDeep } from "lodash";
import { validate as uuidValidate, version as uuidVersion } from "uuid";

/** El dominio de la clave de derivación: la separa de los otros usos del mismo secreto. */
export const SAVE_RETRY_NAMESPACE = "save-retry";

/**
 * La clave de derivación: un HMAC del secreto que el server ya exige al arrancar
 * (service-context: JWT_SECRET, o APP_SECRET), separado por dominio. Sin secreto
 * no hay clave, y sin clave no hay idempotencia: nunca un valor por defecto, que
 * haría la derivación verificable afuera del server.
 */
function derivationKey(): Buffer | null {
  const secret = process.env.JWT_SECRET || process.env.APP_SECRET;
  return secret ? createHmac("sha256", secret).update(SAVE_RETRY_NAMESPACE).digest() : null;
}

/** La clave, si es un uuid v4 (lo que genera el formulario); si no, null (se ignora). */
export function validIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && uuidValidate(value) && uuidVersion(value) === 4 ? value.toLowerCase() : null;
}

/** Un intento de guardar con clave: la clave y el hash de lo que pide. */
export type SaveAttempt = { idempotencyKey: string; contentHash: string };

/**
 * El intento de un pedido: su clave, si es válida, y el hash de su contenido. Se
 * calcula con los argumentos tal como llegan, antes de que el servicio los toque.
 * Sin clave válida, o sin secreto del server, null: el pedido sigue como siempre.
 */
export function saveAttemptOf(args: object): SaveAttempt | null {
  const idempotencyKey = validIdempotencyKey((args as { idempotencyKey_?: unknown }).idempotencyKey_);
  if (!idempotencyKey || !derivationKey()) return null;
  return { idempotencyKey, contentHash: contentHash(args) };
}

/**
 * SHA-256 del JSON canónico (claves ordenadas, en todos los niveles) de los
 * argumentos de un guardado, sin la clave ni la versión leída: el mismo pedido
 * reintentado da el mismo hash, venga en el orden que venga; cualquier cambio en
 * lo que pide, en cualquier nivel, da otro. Primero pasa por JSON, para que las
 * fechas y los decimales se escriban como texto y lo indefinido no cuente.
 */
export function contentHash(args: object): string {
  const { idempotencyKey_: _key, version_: _version, ...content } = args as Record<string, unknown>;
  const plain: unknown = JSON.parse(JSON.stringify(content));
  return createHash("sha256").update(JSON.stringify(canonical(plain))).digest("hex");
}

/** El mismo valor, con las claves de cada objeto en orden. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key])])
    );
  }
  return value;
}

/**
 * La única derivación: todo lo que el server genera para un guardado con clave
 * (la versión nueva de una edición, el id de un alta) sale de acá, del alcance
 * (qué se deriva, y de qué) y del intento (la clave y el hash del contenido),
 * con un HMAC-SHA256 de la clave del server. Un cambio en la manera de derivar
 * va acá y en ningún otro lado.
 */
function deriveFromAttempt(scope: string, attempt: SaveAttempt): string {
  const key = derivationKey();
  if (!key) {
    // saveAttemptOf ya devuelve null sin secreto: llegar acá es un error de quien llama.
    throw new Error("saveRetry: sin secreto del server (JWT_SECRET o APP_SECRET) no se deriva nada");
  }
  const mac = createHmac("sha256", key).update(`${scope}:${attempt.idempotencyKey}:${attempt.contentHash}`).digest();
  return asUuid(mac);
}

/**
 * Los primeros 16 bytes, con la forma de un uuid (versión 8, de construcción
 * propia, y la variante del RFC 9562): la forma de version_ y de los ids.
 */
function asUuid(bytes: Buffer): string {
  const b = Buffer.from(bytes.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** La versión que deja este intento de guardado sobre esta versión leída. */
export function deriveVersion(expectedVersion: string, attempt: SaveAttempt): string {
  return deriveFromAttempt(expectedVersion, attempt);
}

/** El id del registro que crea este usuario con este intento. */
export function deriveCreateId(entity: string, userId: string, attempt: SaveAttempt): string {
  return deriveFromAttempt(`create:${entity}:${userId}`, attempt);
}

/** Lo que significa, para un guardado, la versión que tiene la fila. */
export type SaveVersion = "current" | "alreadyApplied" | "conflict";

/**
 * La versión que tiene la fila, contra la que leyó el cliente y el intento de su
 * guardado:
 * - "current": es la que leyó; el guardado sigue;
 * - "alreadyApplied": es la que deja este mismo intento (versión leída, clave y
 *   contenido): ya se aplicó, y no se vuelve a aplicar;
 * - "conflict": otra escritura cambió el registro en el medio.
 */
export function checkSaveVersion(found: string, expectedVersion: unknown, attempt: SaveAttempt | null): SaveVersion {
  if (found === expectedVersion) return "current";
  if (attempt && typeof expectedVersion === "string" && found === deriveVersion(expectedVersion, attempt)) {
    return "alreadyApplied";
  }
  return "conflict";
}

/**
 * Un choque entre transacciones (serialización o deadlock), que se resuelve
 * reintentando: Prisma lo informa como P2034, crudo o ya envuelto en un
 * PrismaError por un servicio anidado.
 */
export function isTransactionConflict(error: unknown): boolean {
  const e = error as { code?: unknown; extensions?: { code?: unknown } } | null | undefined;
  return e?.code === "P2034" || e?.extensions?.code === "P2034";
}

/**
 * Para reintentar una transacción con los mismos argumentos: la transacción
 * consume partes de ellos (los remove anidados se borran de args al
 * procesarlos). Devuelve la función que los deja como estaban.
 */
export function restorableArgs<T extends object>(args: T): () => void {
  const snapshot = cloneDeep(args);
  return () => {
    Object.assign(args, cloneDeep(snapshot));
  };
}
