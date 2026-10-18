import "reflect-metadata";
import { randomBytes, randomUUID } from "crypto";
import { hash } from "bcrypt";
import { basePrisma } from "../prisma/client";
import { huellaDeToken, parsearAmbitos } from "../common/services/integrationScopes";

/**
 * Credenciales de integración desde la consola: emitir, renovar, revocar y
 * listar los tokens de IntegrationClient.
 *
 * La pantalla guarda la huella del token pero no puede emitirlo, y la imagen de
 * producción solo trae dist/. Sin esto, dar de alta una integración en una
 * instalación nueva obligaba a calcular un SHA-256 a mano.
 *
 *   node dist/admin/integrationCli.js issue --tenant "<empresa>" --user <email>
 *        --name "<sistema>" --scopes "<ámbitos>" (--expires AAAA-MM-DD | --no-expiry)
 *        [--create-tenant] [--create-user "<nombre>"]
 *   node dist/admin/integrationCli.js rotate --tenant "<empresa>" --name "<sistema>"
 *        [--expires AAAA-MM-DD | --no-expiry]
 *   node dist/admin/integrationCli.js revoke --tenant "<empresa>" --name "<sistema>"
 *   node dist/admin/integrationCli.js list [--tenant "<empresa>"]
 *
 * El token sale solo por stdout y todo lo demás por stderr, para que un script
 * lo pueda capturar sin mezclarlo con el resumen.
 *
 * Límites:
 * - El token se muestra UNA vez: se guarda solo su huella.
 * - La empresa se busca por id o por nombre exacto, nunca por parecido: una
 *   credencial emitida para otra empresa le da a un tercero acceso a sus datos.
 * - El usuario de servicio tiene que ser de esa empresa y estar activo.
 * - Vencer o no vencer se decide explícitamente: sin --expires ni --no-expiry
 *   no emite. Una fecha sola vence al terminar ese día, en UTC.
 * - Renovar no reactiva una credencial revocada: para eso se emite otra.
 * - Opera sobre la base como sistema. Es una herramienta de quien administra la
 *   instalación, no una superficie de la API.
 * - Supone un proyecto multiempresa con IntegrationClient; sin la entidad, el
 *   error lo dice.
 */

const TOKEN_PREFIX = "apk_";
const SYSTEM_USER = "SYSTEM";

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export interface IssueOptions {
  tenant?: string;
  user?: string;
  name?: string;
  scopes?: string;
  /** null = no vence; undefined = no se decidió, y no emite. */
  expiresAt?: Date | null;
  createTenant?: boolean;
  /** Nombre visible del usuario de servicio, si hay que crearlo. */
  createUser?: string;
}

export const newToken = (): string => `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

const audit = (now: Date) => ({
  version_: randomUUID(),
  createdAt_: now,
  lastUpdatedAt_: now,
  createdBy_: { connect: { id: SYSTEM_USER } },
  lastUpdatedBy_: { connect: { id: SYSTEM_USER } },
});

const touch = (now: Date) => ({
  version_: randomUUID(),
  lastUpdatedAt_: now,
  lastUpdatedBy_: { connect: { id: SYSTEM_USER } },
});

const required = (value: string | undefined, flag: string, what: string): string => {
  const v = value?.trim();
  if (!v) throw new CredentialError(`Falta ${what} (--${flag}).`);
  return v;
};

export function checkScopes(scopes: string | undefined): string {
  const list = parsearAmbitos(scopes);
  if (!list.length) {
    throw new CredentialError("Faltan los ámbitos (--scopes): una credencial sin ámbitos no puede hacer nada.");
  }
  // exigirAmbito compara exacto: un comodín nunca coincidiría, y dejarlo pasar
  // haría creer que concede algo.
  const wildcard = list.find((s) => s.includes("*"));
  if (wildcard) {
    throw new CredentialError(`"${wildcard}": no hay comodines. Cada ámbito se nombra entero.`);
  }
  return list.join(" ");
}

/** --expires y --no-expiry: la decisión, o undefined si no se tomó. */
export function parseExpiry(expires: string | true | undefined, noExpiry: boolean): Date | null | undefined {
  if (expires !== undefined && noExpiry) {
    throw new CredentialError("--expires o --no-expiry, no los dos.");
  }
  if (noExpiry) return null;
  if (expires === undefined) return undefined;
  if (expires === true) throw new CredentialError("--expires necesita una fecha: AAAA-MM-DD.");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(expires) ? `${expires}T23:59:59.999Z` : expires);
  if (Number.isNaN(date.getTime())) {
    throw new CredentialError(`"${expires}" no es una fecha. Formato: AAAA-MM-DD.`);
  }
  return date;
}

const checkNotExpired = (expiresAt: Date | null | undefined, now: Date) => {
  if (expiresAt && expiresAt <= now) {
    throw new CredentialError(`El vencimiento ${expiresAt.toISOString()} ya pasó.`);
  }
};

const delegates = (db: any) => {
  if (!db?.integrationClient || !db?.tenant || !db?.user) {
    throw new CredentialError(
      "Este proyecto no tiene IntegrationClient (o no es multiempresa): no hay credenciales de integración que administrar.",
    );
  }
  return db;
};

async function findTenant(db: any, ref: string) {
  const select = { id: true, name: true };
  return (
    (await db.tenant.findFirst({ where: { id: ref }, select })) ??
    (await db.tenant.findFirst({ where: { name: ref }, select }))
  );
}

async function requireTenant(db: any, ref: string) {
  const tenant = await findTenant(db, ref);
  if (!tenant) throw new CredentialError(`No hay ninguna empresa con id o nombre exacto "${ref}".`);
  return tenant;
}

async function requireClient(db: any, tenant: { id: string; name: string }, name: string) {
  const client = await db.integrationClient.findFirst({
    where: { tenant_id_: tenant.id, name },
    select: { id: true, name: true, status: true },
  });
  if (!client) throw new CredentialError(`${tenant.name} no tiene ninguna credencial "${name}".`);
  return client;
}

export async function issueCredential(db: any, opts: IssueOptions, now: Date = new Date()) {
  delegates(db);
  const tenantRef = required(opts.tenant, "tenant", "la empresa");
  const email = required(opts.user, "user", "el usuario de servicio");
  const name = required(opts.name, "name", "el nombre del sistema");
  const scopes = checkScopes(opts.scopes);
  if (opts.expiresAt === undefined) {
    throw new CredentialError(
      "Falta decidir el vencimiento: --expires AAAA-MM-DD, o --no-expiry si de verdad no vence.",
    );
  }
  checkNotExpired(opts.expiresAt, now);

  let tenant = await findTenant(db, tenantRef);
  if (!tenant) {
    if (!opts.createTenant) {
      throw new CredentialError(
        `No hay ninguna empresa con id o nombre exacto "${tenantRef}". Para crearla: --create-tenant.`,
      );
    }
    tenant = await db.tenant.create({ data: { name: tenantRef, ...audit(now) }, select: { id: true, name: true } });
  }

  const userSelect = { id: true, email: true, active: true, tenant_id_: true };
  let user = await db.user.findFirst({ where: { email }, select: userSelect });
  if (!user) {
    const displayName = opts.createUser?.trim();
    if (!displayName) {
      throw new CredentialError(
        `No hay ningún usuario ${email}. Para crearlo como usuario de servicio: --create-user "<nombre>".`,
      );
    }
    // Nadie conoce esta contraseña: el usuario de servicio no entra por la
    // pantalla, escribe a través de la credencial. Queda sin rol: lo que puede
    // hacer lo dicen los ámbitos de la credencial. La regla «un usuario activo
    // tiene que tener rol» (ACTIVE_USER_NEEDS_ROLE) no aplica acá: la imponen los
    // services de User, y esto escribe con el cliente crudo.
    user = await db.user.create({
      data: {
        name: displayName,
        email,
        active: true,
        password: await hash(randomBytes(32).toString("hex"), 10),
        tenant_: { connect: { id: tenant.id } },
        ...audit(now),
      },
      select: userSelect,
    });
  }
  if (user.tenant_id_ !== tenant.id) {
    throw new CredentialError(
      `${email} es de otra empresa: la integración de ${tenant.name} escribiría como alguien de afuera.`,
    );
  }
  if (!user.active) {
    throw new CredentialError(`${email} está inactivo: la credencial nacería cortada.`);
  }

  const existing = await db.integrationClient.findFirst({
    where: { tenant_id_: tenant.id, name },
    select: { id: true },
  });
  if (existing) {
    throw new CredentialError(`${tenant.name} ya tiene una credencial "${name}". Para cambiarle el token: rotate.`);
  }

  const token = newToken();
  const client = await db.integrationClient.create({
    data: {
      name,
      tokenHash: huellaDeToken(token),
      scopes,
      status: "active",
      expiresAt: opts.expiresAt,
      serviceUser: { connect: { id: user.id } },
      tenant_: { connect: { id: tenant.id } },
      ...audit(now),
    },
    select: { id: true, name: true },
  });
  return { token, tenant, user: { id: user.id, email: user.email }, client, scopes, expiresAt: opts.expiresAt };
}

export async function rotateCredential(
  db: any,
  opts: { tenant?: string; name?: string; expiresAt?: Date | null },
  now: Date = new Date(),
) {
  delegates(db);
  const tenant = await requireTenant(db, required(opts.tenant, "tenant", "la empresa"));
  const client = await requireClient(db, tenant, required(opts.name, "name", "el nombre del sistema"));
  if (client.status !== "active") {
    throw new CredentialError(
      `La credencial "${client.name}" de ${tenant.name} está revocada: renovarla no la reactiva. Emití una nueva.`,
    );
  }
  checkNotExpired(opts.expiresAt, now);

  const token = newToken();
  await db.integrationClient.update({
    where: { id: client.id },
    data: {
      tokenHash: huellaDeToken(token),
      ...(opts.expiresAt !== undefined ? { expiresAt: opts.expiresAt } : {}),
      ...touch(now),
    },
  });
  return { token, tenant, client };
}

export async function revokeCredential(db: any, opts: { tenant?: string; name?: string }, now: Date = new Date()) {
  delegates(db);
  const tenant = await requireTenant(db, required(opts.tenant, "tenant", "la empresa"));
  const client = await requireClient(db, tenant, required(opts.name, "name", "el nombre del sistema"));
  if (client.status === "revoked") return { tenant, client, alreadyRevoked: true };
  // Revocar no borra: el rastro de lo que hizo la integración sobrevive.
  await db.integrationClient.update({ where: { id: client.id }, data: { status: "revoked", ...touch(now) } });
  return { tenant, client, alreadyRevoked: false };
}

export async function listCredentials(db: any, opts: { tenant?: string }) {
  delegates(db);
  const tenant = opts.tenant ? await requireTenant(db, opts.tenant) : null;
  return db.integrationClient.findMany({
    where: tenant ? { tenant_id_: tenant.id } : {},
    select: {
      name: true,
      scopes: true,
      status: true,
      expiresAt: true,
      tenant_: { select: { name: true } },
      serviceUser: { select: { email: true, active: true } },
    },
    orderBy: [{ tenant_id_: "asc" }, { name: "asc" }],
  });
}

const FLAGS: Record<string, string[]> = {
  issue: ["tenant", "user", "name", "scopes", "expires", "no-expiry", "create-tenant", "create-user"],
  rotate: ["tenant", "name", "expires", "no-expiry"],
  revoke: ["tenant", "name"],
  list: ["tenant"],
};
const SWITCHES = ["no-expiry", "create-tenant"];

export function parseArgs(argv: string[]): { command: string; flags: Record<string, string | true> } {
  const [command, ...rest] = argv;
  if (!command || !FLAGS[command]) {
    throw new CredentialError(`Comando: ${Object.keys(FLAGS).join(" | ")}. Ver el encabezado de integrationCli.ts.`);
  }
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      throw new CredentialError(`"${arg}" suelto: cada valor va después de su --opción.`);
    }
    const key = arg.slice(2);
    // Una opción mal escrita no se ignora: con --expire en vez de --expires la
    // credencial se emitiría sin la fecha que se quiso poner.
    if (!FLAGS[command].includes(key)) {
      throw new CredentialError(`--${key} no es una opción de ${command}. Opciones: --${FLAGS[command].join(", --")}.`);
    }
    const next = rest[i + 1];
    if (SWITCHES.includes(key)) {
      if (next !== undefined && !next.startsWith("--")) {
        throw new CredentialError(`--${key} no lleva valor, y recibió "${next}".`);
      }
      flags[key] = true;
    } else if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return { command, flags };
}

const text = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);
const expiryLabel = (d: Date | null | undefined) => (d ? d.toISOString() : "no vence");

export async function main(argv: string[] = process.argv.slice(2), db: any = basePrisma): Promise<void> {
  const { command, flags } = parseArgs(argv);
  const expiresAt = parseExpiry(flags["expires"], flags["no-expiry"] === true);

  if (command === "issue") {
    const r = await issueCredential(db, {
      tenant: text(flags["tenant"]),
      user: text(flags["user"]),
      name: text(flags["name"]),
      scopes: text(flags["scopes"]),
      expiresAt,
      createTenant: flags["create-tenant"] === true,
      createUser: text(flags["create-user"]),
    });
    console.error(`Empresa:             ${r.tenant.name}`);
    console.error(`Usuario de servicio: ${r.user.email}`);
    console.error(`Sistema:             ${r.client.name}`);
    console.error(`Ámbitos:             ${r.scopes}`);
    console.error(`Vence:               ${expiryLabel(r.expiresAt)}`);
    console.error("\nEl token, que no se puede volver a ver:\n");
    console.log(r.token);
  } else if (command === "rotate") {
    const r = await rotateCredential(db, { tenant: text(flags["tenant"]), name: text(flags["name"]), expiresAt });
    console.error(`${r.tenant.name} · ${r.client.name}: token nuevo. El anterior ya no entra.\n`);
    console.log(r.token);
  } else if (command === "revoke") {
    const r = await revokeCredential(db, { tenant: text(flags["tenant"]), name: text(flags["name"]) });
    console.error(`${r.tenant.name} · ${r.client.name}: ${r.alreadyRevoked ? "ya estaba revocada" : "revocada"}.`);
  } else {
    const rows = await listCredentials(db, { tenant: text(flags["tenant"]) });
    for (const c of rows) {
      const user = `${c.serviceUser?.email ?? "?"}${c.serviceUser?.active === false ? " (inactivo)" : ""}`;
      console.error(`${c.tenant_?.name ?? "?"} · ${c.name} · ${c.status} · vence ${expiryLabel(c.expiresAt)} · ${user} · ${c.scopes}`);
    }
    if (!rows.length) console.error("No hay credenciales.");
  }
}

if (require.main === module) {
  main()
    .then(() => basePrisma.$disconnect())
    .catch(async (e) => {
      console.error(e instanceof CredentialError ? e.message : e);
      await basePrisma.$disconnect().catch(() => undefined);
      process.exit(1);
    });
}
