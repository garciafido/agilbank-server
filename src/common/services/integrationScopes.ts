import { createHash } from "crypto";
import { basePrisma } from "../../prisma/client";

/**
 * Ámbitos de un sistema cliente: qué puede hacer una máquina que opera por API
 * en nombre de un tenant.
 *
 * Es la contraparte de los permisos de personas, y no la misma cosa. Un permiso
 * dice qué puede hacer un usuario; un ámbito dice hasta dónde llega un programa,
 * que no tiene criterio ni puede evaluar una excepción. Por eso el ámbito se
 * concede angosto y explícito: un sistema que factura no necesita —ni debe—
 * poder cerrar un período o tocar el plan de cuentas.
 *
 * Sigue el diseño de dos capas de los satélites (mTLS + token), del que reusa
 * la parte de token: hash en base, nunca el valor; estado que puede revocarse
 * sin borrar el registro; y vencimiento.
 *
 * ── CONTRATO CON EL PROYECTO ──
 *
 * Requiere la entidad `IntegrationClient` en `system/`, con al menos:
 *
 *   name          string          quién es
 *   tokenHash     string          sha256 del token; el token NO se guarda
 *   scopes        string          ámbitos separados por espacio
 *   status        enum            active | revoked
 *   expiresAt     datetime?       vencimiento, con alerta anticipada
 *   serviceUser   ref(User)       la identidad con la que opera
 *
 * Los nombres de los ámbitos son del proyecto, no de acá: `sales:issue`,
 * `expenses:register`. Este módulo no los conoce ni los valida contra una
 * lista — comparar contra un catálogo cerrado obligaría a tocar el generador
 * para agregar una capacidad al proyecto.
 */

export interface SistemaCliente {
  id: string;
  name: string;
  tenantId: string | null;
  scopes: string[];
  /** Con qué identidad escribe: ver contextoDeSistemaCliente. */
  serviceUserId: string | null;
}

export class SistemaClienteNoAutorizadoError extends Error {
  constructor(motivo: string) {
    super(`Sistema cliente no autorizado: ${motivo}`);
    this.name = "SistemaClienteNoAutorizadoError";
  }
}

export class AmbitoInsuficienteError extends Error {
  constructor(sistema: string, requerido: string, tiene: string[]) {
    super(
      `El sistema "${sistema}" no tiene el ámbito "${requerido}". ` +
        `Tiene: ${tiene.length ? tiene.join(", ") : "ninguno"}. ` +
        `Ampliarlo es una decisión de quien administra la integración, no del sistema cliente.`,
    );
    this.name = "AmbitoInsuficienteError";
  }
}

export const huellaDeToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const delegate = (db: any) => {
  const d = db?.integrationClient;
  if (!d) {
    throw new Error(
      "[integrationScopes] Falta la entidad IntegrationClient. Declarala en system/ " +
        "antes de exponer operaciones por API: sin ella no hay a quién autenticar " +
        "ni contra qué medir los ámbitos.",
    );
  }
  return d;
};

/**
 * Identifica al sistema cliente que presenta `token`.
 *
 * No dice por qué falla hacia afuera: todos los rechazos dan el mismo error.
 * Distinguirlos le regala a quien prueba tokens la información de cuáles existen.
 */
export async function identificarSistemaCliente(
  token: string | undefined,
  db: any = basePrisma,
  ahora: Date = new Date(),
): Promise<SistemaCliente> {
  const d = delegate(db);
  if (!token) throw new SistemaClienteNoAutorizadoError("no se presentó token");

  const fila = await d.findFirst({
    where: { tokenHash: huellaDeToken(token) },
    // `tenant_` es campo de infraestructura y lleva el sufijo; `serviceUser` lo
    // declara el proyecto en su DSL, así que genera `serviceUser_id` SIN él.
    // Pedirlo con sufijo hacía que Prisma rechazara la consulta entera: la
    // autenticación de sistemas cliente fallaba siempre, en todos los proyectos.
    select: {
      id: true,
      name: true,
      tenant_id_: true,
      scopes: true,
      status: true,
      expiresAt: true,
      serviceUser_id: true,
      serviceUser: { select: { active: true } },
    },
  });

  // Un solo mensaje para los tres casos: ver cuál de ellos es le diría a quien
  // prueba tokens si acertó el valor y falló otra cosa.
  if (!fila || fila.status !== "active" || (fila.expiresAt && fila.expiresAt <= ahora)) {
    throw new SistemaClienteNoAutorizadoError("token inválido, revocado o vencido");
  }

  // Dar de baja al usuario de servicio corta como revocar el token, y con el mismo
  // mensaje: el sistema escribe como ese usuario, y una identidad dada de baja no
  // puede seguir escribiendo por la API.
  if (!fila.serviceUser?.active) {
    throw new SistemaClienteNoAutorizadoError("token inválido, revocado o vencido");
  }

  return {
    id: fila.id,
    name: fila.name,
    tenantId: fila.tenant_id_ ?? null,
    scopes: parsearAmbitos(fila.scopes),
    serviceUserId: fila.serviceUser_id ?? null,
  };
}

/** Los ámbitos vienen como texto separado por espacios, al estilo OAuth. */
export const parsearAmbitos = (scopes: string | null | undefined): string[] =>
  (scopes ?? "").split(/\s+/).filter(Boolean);

/**
 * Corta si el sistema no tiene el ámbito pedido.
 *
 * Sin comodines a propósito. Un `sales:*` se concede una vez y después nadie
 * revisa qué abarcó cuando aparecieron operaciones nuevas: el ámbito se amplía
 * solo, en silencio, y justo del lado donde no hay una persona mirando.
 */
export function exigirAmbito(sistema: SistemaCliente, requerido: string): void {
  if (!sistema.scopes.includes(requerido)) {
    throw new AmbitoInsuficienteError(sistema.name, requerido, sistema.scopes);
  }
}

/**
 * El contexto con el que un sistema cliente opera: el de su usuario de servicio,
 * más los ámbitos concedidos.
 *
 * El sistema NO es un actor nuevo para el resto del código: escribe como ese
 * usuario, así que el filtro de empresa, los permisos y la auditoría siguen
 * valiendo sin que el chokepoint de seguridad tenga que aprender un segundo
 * tipo de actor. Meter ahí una segunda forma de "quién sos" es exactamente el
 * cambio que menos conviene hacer en ese archivo.
 *
 * Los ámbitos son un cerrojo ADEMÁS del permiso, no en su lugar: manda el más
 * angosto de los dos. Un usuario de servicio con un rol amplio sigue limitado a
 * lo que su integración tenga concedido, y ampliar el rol no amplía la API.
 */
export interface ContextoDeSistemaCliente {
  sistema: SistemaCliente;
  currentUser: any;
  isSystemMode: false;
  permissions: () => Set<string>;
}

/**
 * Arma el contexto de un sistema cliente a partir de su usuario de servicio.
 *
 * `cargarUsuario` lo provee el proyecto: cómo se resuelven los permisos de un
 * usuario es asunto suyo, y este módulo no tiene por qué saberlo.
 */
export async function contextoDeSistemaCliente(
  sistema: SistemaCliente,
  cargarUsuario: (id: string) => Promise<{ usuario: any; permisos: Set<string> } | null>,
  serviceUserId: string,
): Promise<ContextoDeSistemaCliente> {
  const cargado = await cargarUsuario(serviceUserId);
  if (!cargado?.usuario) {
    throw new SistemaClienteNoAutorizadoError(
      "el sistema no tiene usuario de servicio válido",
    );
  }
  if (cargado.usuario.active === false) {
    // Desactivar el usuario tiene que cortar la integración: si no, quedaría
    // una identidad dada de baja escribiendo igual.
    throw new SistemaClienteNoAutorizadoError("el usuario de servicio está inactivo");
  }
  return {
    sistema,
    currentUser: cargado.usuario,
    isSystemMode: false,
    permissions: () => cargado.permisos,
  };
}

/** Identifica y exige en un paso, que es como se usa en el borde de la API. */
export async function autorizarSistemaCliente(
  token: string | undefined,
  ambitoRequerido: string,
  db: any = basePrisma,
  ahora: Date = new Date(),
): Promise<SistemaCliente> {
  const sistema = await identificarSistemaCliente(token, db, ahora);
  exigirAmbito(sistema, ambitoRequerido);
  return sistema;
}
