import { createHash } from "crypto";

/**
 * Idempotencia para las escrituras que entran por API.
 *
 * No confundir con common/services/saveRetry.ts: ese es para el reintento de un
 * guardado de formulario, sin tabla, reconocido por la versión (o el id) que
 * deriva de la clave; este guarda el resultado de cada escritura en una tabla.
 *
 * Una API que emite comprobantes fiscales no puede duplicar por reintento: un
 * CAE no se borra. Y el reintento no es un caso raro — es lo que hace cualquier
 * cliente cuando se le corta la respuesta, sin saber si la operación llegó a
 * ejecutarse. Sin esto, "no sé si llegó" se resuelve mandando de nuevo, y el
 * segundo comprobante ya no se puede deshacer.
 *
 * El contrato tiene tres casos, y el tercero es el que suele faltar:
 *
 * | Llamada | Qué pasa |
 * |---|---|
 * | Primera | Ejecuta y guarda `(cliente, clave) → resultado` |
 * | Repetición con el MISMO cuerpo | Devuelve el resultado guardado, no ejecuta |
 * | Repetición con OTRO cuerpo | **Error explícito.** Nunca gana la última |
 *
 * El tercero importa porque el error de programación más común de un cliente es
 * reusar una clave para un hecho distinto. Dejar que la última gane convierte
 * ese error en una corrección silenciosa de algo ya facturado.
 *
 * ── CONTRATO CON EL PROYECTO ──
 *
 * Requiere la entidad `IdempotencyRecord` declarada en `system/`. Si no está,
 * esta función tira un error que lo dice — y no una excepción de Prisma sobre
 * un delegate `undefined`, que manda a buscar el problema al lugar equivocado.
 *
 * Y requiere que quien llama diga DOS cosas que antes no decía: en qué empresa
 * vive el registro, y con qué cliente de base escribir. Las dos eran implícitas
 * y las dos estaban mal:
 *
 * - La clave `(cliente, clave)` se buscaba sin empresa, sobre una tabla cuyo
 *   único es `(empresa, cliente, clave)`. Dos empresas que usaran la misma clave
 *   se cruzaban: la segunda recibía el resultado guardado de la primera, sin
 *   ejecutar nada. Una API de comprobantes fiscales devolviendo el CAE de otra.
 * - El cliente de base tenía default al crudo, que no inyecta empresa ni
 *   auditoría. `version_`, `createdAt_`, `createdBy_` y `tenant_` son obligatorios,
 *   así que el `create` no podía ejecutarse: el módulo estaba muerto y no se veía.
 *
 * Pasar la instancia de `SecurePrismaOps` del modelo es la forma correcta —
 * inyecta empresa y auditoría, y la empresa que se pasa acá queda además en el
 * `where` de la lectura, que es lo único que el chokepoint no puede hacer solo.
 */

/** El resultado, más si vino de una ejecución o de la memoria. */
export interface ResultadoIdempotente<T> {
  resultado: T;
  repetido: boolean;
}

export class ClaveIdempotenteReusadaError extends Error {
  constructor(cliente: string, clave: string) {
    super(
      `La clave idempotente "${clave}" del cliente "${cliente}" ya se usó para una operación con otro contenido. ` +
        `Una clave identifica un hecho: para uno distinto, usá otra clave.`,
    );
    this.name = "ClaveIdempotenteReusadaError";
  }
}

export class OperacionEnCursoError extends Error {
  constructor(cliente: string, clave: string) {
    super(
      `La operación "${clave}" del cliente "${cliente}" está en curso. ` +
        `Reintentá en unos segundos: no se ejecuta dos veces en paralelo.`,
    );
    this.name = "OperacionEnCursoError";
  }
}

/** Huella del cuerpo, para distinguir "el mismo hecho" de "otro con la misma clave". */
export const huellaDe = (cuerpo: unknown): string =>
  createHash("sha256").update(JSON.stringify(cuerpo ?? null)).digest("hex");

const delegate = (db: any) => {
  const d = db?.idempotencyRecord;
  if (!d) {
    throw new Error(
      "[idempotency] Falta la entidad IdempotencyRecord. Declarala en system/ " +
        "antes de usar operaciones idempotentes: sin ella no hay dónde recordar " +
        "qué se ejecutó, y un reintento duplicaría la operación.",
    );
  }
  return d;
};

/**
 * Ejecuta `fn` una sola vez para cada `(cliente, clave)`.
 *
 * La reserva se hace con el índice único de la base, no leyendo antes de
 * escribir: dos llamadas simultáneas con la misma clave se resuelven en el
 * motor, que es el único árbitro que no tiene ventana de carrera.
 *
 * `fn` NO recibe el cliente de la transacción de reserva a propósito. Si
 * compartieran transacción, un fallo de `fn` revertiría también la reserva y el
 * reintento volvería a ejecutar — que es justo lo que hay que impedir. La
 * reserva sobrevive al fallo y queda marcada, para que el reintento encuentre el
 * error en vez de repetir el efecto.
 */
export async function runIdempotent<T>(
  {
    empresa,
    cliente,
    clave,
    cuerpo,
  }: { empresa: string; cliente: string; clave: string; cuerpo?: unknown },
  fn: () => Promise<T>,
  db: any,
): Promise<ResultadoIdempotente<T>> {
  if (!empresa) {
    // Corta, no degrada. `tenant_id_: undefined` en un where de Prisma NO filtra:
    // OMITE la condición, y la lectura pasa a ser global sin que nada avise.
    throw new Error(
      "[idempotency] Falta la empresa. La clave idempotente es (empresa, cliente, clave): " +
        "sin la empresa, dos clientes distintos con la misma clave se leen el resultado " +
        "el uno del otro.",
    );
  }
  const d = delegate(db);
  const huella = huellaDe(cuerpo);

  // findFirst y no findUnique: el nombre del índice único compuesto lo arma el
  // generador, así que acoplarse a él ataría este módulo a un detalle que puede
  // cambiar. La unicidad no la da esta lectura igual: la da el motor cuando falla
  // el create. Esto es solo el camino rápido.
  //
  // Pero la empresa va EXPLÍCITA en el where. El índice es (empresa, cliente,
  // clave) y acá se buscaba por los dos últimos: con SecurePrismaOps el filtro lo
  // agrega el chokepoint, y con un cliente crudo no lo agregaba nadie.
  const previo = await d.findFirst({
    where: { tenant_id_: empresa, client: cliente, key: clave },
  });

  if (previo) {
    if (previo.bodyHash !== huella) {
      throw new ClaveIdempotenteReusadaError(cliente, clave);
    }
    if (previo.status === "in_progress") {
      throw new OperacionEnCursoError(cliente, clave);
    }
    if (previo.status === "failed") {
      // Un fallo NO retiene la clave: la operación no dejó efecto, y negarle el
      // reintento al cliente lo dejaría sin salida. Se vuelve a intentar.
      // Por id, y el id salió de la lectura ya acotada por empresa. No hace falta
      // repetir la condición acá: repetirla sugeriría que la lectura no alcanzaba.
      await d.update({
        where: { id: previo.id },
        data: { status: "in_progress", failureReason: null },
      });
      return ejecutarYGuardar(d, previo.id, fn);
    }
    return { resultado: previo.result as T, repetido: true };
  }

  let reserva: any;
  try {
    reserva = await d.create({
      data: {
        // Con SecurePrismaOps esto se descarta y se reinyecta desde el contexto
        // (el create es fail-closed a propósito), así que acá vale para el caso
        // en que `db` sea un cliente que no inyecta nada. Los campos de auditoría
        // —version_, createdAt_, createdBy_— son obligatorios y este módulo no
        // los conoce: los pone el chokepoint. Con un cliente crudo, el create
        // falla, y que falle es correcto.
        tenant_: { connect: { id: empresa } },
        client: cliente,
        key: clave,
        bodyHash: huella,
        status: "in_progress",
      },
    });
  } catch (e: any) {
    // Otra llamada ganó la carrera entre el findFirst y el create. No se
    // reintenta acá: quien perdió no sabe si la otra terminó, y adivinar es
    // exactamente lo que este módulo existe para no hacer.
    if (e?.code === "P2002") throw new OperacionEnCursoError(cliente, clave);
    throw e;
  }

  return ejecutarYGuardar(d, reserva.id, fn);
}

async function ejecutarYGuardar<T>(
  d: any,
  id: string,
  fn: () => Promise<T>,
): Promise<ResultadoIdempotente<T>> {
  try {
    const resultado = await fn();
    await d.update({
      where: { id },
      data: { status: "done", result: resultado as any, completedAt: new Date() },
    });
    return { resultado, repetido: false };
  } catch (error: any) {
    await d
      .update({
        where: { id },
        data: { status: "failed", failureReason: String(error?.message ?? error).slice(0, 500) },
      })
      .catch(() => undefined);
    throw error;
  }
}
