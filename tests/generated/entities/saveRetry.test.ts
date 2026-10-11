// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Un reintento del mismo guardado no es un conflicto, y un alta reintentada no
 * se duplica: la clave de idempotencia (`idempotencyKey_`, common/services/saveRetry),
 * contra la base de test y con los servicios generados.
 *
 * 1. Edición: el mismo pedido (misma versión leída, misma clave) reintentado
 *    después de aplicado responde los datos actuales, sin aplicar nada de nuevo
 *    (la subentidad agregada no se duplica). Otra clave sobre la versión vieja es
 *    un conflicto (RECORD_MODIFIED). Una clave inválida, o ninguna, sigue como
 *    siempre. Un usuario de otra empresa no ve el registro, con o sin clave.
 *    La versión se vuelve a mirar dentro de la transacción: un original que
 *    confirma mientras el reintento está en camino no se aplica dos veces, y
 *    otro usuario que guardó sobre la misma versión no pisa al primero. Un
 *    conflicto de serialización (P2034) se reintenta una vez.
 * 2. Alta: el mismo alta reintentado devuelve el mismo registro, sin duplicado.
 *    La misma clave en manos de otro usuario crea otro registro y nunca le
 *    devuelve el ajeno. Un registro ajeno que tuviera el id que derivaría la clave
 *    (de otro usuario o de otra empresa) no se devuelve, y el error no dice nada
 *    de él.
 * 3. El contenido: solo es el mismo guardado si coinciden la clave Y lo que se
 *    pide (el hash del contenido entra en la derivación). La misma clave con otro
 *    contenido es un conflicto en la edición, y otro registro en el alta.
 * 4. El alta en otra empresa (.tenantSelectableBy): el reintento encuentra el
 *    registro en la empresa elegida.
 *
 * Lo que los servicios escriben en la consola se junta y se afirma: un caso que
 * espera un conflicto o un error dice cuál.
 *
 * Las entidades y los argumentos salen del modelo (saveRetryCases en el
 * generador): el test usa el primer candidato que puede sembrar y guardar, y
 * dice cuál eligió.
 */

import { createHash, randomUUID } from "crypto";
import { v1 as uuidv1, v5 as uuidv5 } from "uuid";
import { assertSafeTestDatabase } from "../../support/testDatabase";
import { basePrisma } from "../../../src/prisma/client";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import {
  contentHash,
  deriveCreateId,
  deriveVersion,
  saveAttemptOf,
} from "../../../src/common/services/saveRetry";
import { Prisma } from "../../../src/prisma/generated-client/client";
import { runWithTransactionScope } from "../../../src/common/services/transactionScope";
import { RowFactory } from "../support/rowFactory";

// Los archivos, sin almacenamiento ni cola de verdad: el test ve qué se copió y
// qué se encoló para borrar (cada uno por su clave: base, uuid y nombre).
const mockFiles = { copied: [] as string[], deleted: [] as string[] };
jest.mock("../../../src/common/utils/moveUploadedFiles", () => ({
  ...jest.requireActual("../../../src/common/utils/moveUploadedFiles"),
  moveUploadedFiles: async (_id: string, files: any[]) => {
    for (const f of files)
      mockFiles.copied.push(`${f.name}${f.uuid}/${f.uploadedFile.filename}`);
  },
}));
jest.mock("../../../src/workers/queues/fileDeletionQueue", () => ({
  enqueueFilesDeletion: async (_entity: string, _id: string, files: any[]) => {
    for (const f of files)
      mockFiles.deleted.push(
        `${f.serverData.baseName}${f.serverData.uuid}/${f.serverData.filename}`
      );
  },
}));

type Args = Record<string, unknown>;
type UpdateCase = {
  entity: string;
  field: string | null;
  sub: { arg: string; field: string; entity: string; create: Args } | null;
  file: string | null;
};
type CreateCase = { entity: string; args: Args };
type TenantCreateCase = CreateCase & { selector: string; roles: string[] };
const CASOS = {
  update: [
    { entity: "AbConceptCorrection", field: "bankCode", sub: null, file: null },
    { entity: "Role", field: null, sub: null, file: null },
    { entity: "IntegrationClient", field: "name", sub: null, file: null },
    {
      entity: "UserNotificationPreference",
      field: null,
      sub: null,
      file: null,
    },
    { entity: "EmailVerification", field: null, sub: null, file: null },
  ],
  create: [
    {
      entity: "AbConceptCorrection",
      args: { bankText: "SRX", canonicalType: "SRX", review: "pending" },
    },
    { entity: "Role", args: { name: "SRX", isForAllTenants: false } },
    {
      entity: "UserNotificationPreference",
      args: {
        notificationType: "mention",
        inAppEnabled: false,
        emailEnabled: false,
        emailFrequency: "immediate",
      },
    },
  ],
  createForTenant: [],
} as {
  update: UpdateCase[];
  create: CreateCase[];
  createForTenant: TenantCreateCase[];
};

// La derivación usa el secreto del server (JWT_SECRET, o APP_SECRET): si el
// entorno no trae, el test pone uno propio, y al final deja todo como estaba.
const SECRETS_BEFORE = {
  JWT_SECRET: process.env.JWT_SECRET,
  APP_SECRET: process.env.APP_SECRET,
};
if (!process.env.JWT_SECRET && !process.env.APP_SECRET)
  process.env.JWT_SECRET = "saveRetry-" + randomUUID();
/**
 * Corre fn con otro secreto del server (o sin ninguno), y lo deja como estaba
 * cuando fn termina (si devuelve una promesa, cuando se resuelve).
 */
function withSecret<T>(secret: string | undefined, fn: () => T): T {
  const before = {
    JWT_SECRET: process.env.JWT_SECRET,
    APP_SECRET: process.env.APP_SECRET,
  };
  const restore = () => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  delete process.env.APP_SECRET;
  if (secret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = secret;
  let result: T;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result instanceof Promise) return result.finally(restore) as unknown as T;
  restore();
  return result;
}

const PREFIX = "SRX_";
const f = new RowFactory(basePrisma, PREFIX);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const db = (entity: string): any =>
  (basePrisma as any)[f.model(entity).delegate];
const ids: Record<string, string> = {};
let store: SchemaMetadataStore;
const ALL: string[] = [];
const chosen: string[] = [];

/** Un contexto de servicio: todos los permisos (menos `without`) y los roles dados. */
const context = (
  tenant: string,
  user: string,
  options: { roles?: string[]; without?: string[] } = {}
): any => {
  const permissions = new Set(
    ALL.filter((p) => !(options.without ?? []).includes(p))
  );
  const roles = options.roles ?? ["User"];
  return {
    prisma: basePrisma,
    currentUser: {
      id: user,
      tenant_id_: tenant,
      tenant_: { id: tenant },
      roles: roles.map((id) => ({ id, permissions: [] })),
    },
    permissions: () => permissions,
    hasRole: (...wanted: string[]) => wanted.some((r) => roles.includes(r)),
    isSystemMode: false,
    req: {},
  };
};
/** La primera línea del motivo por el que un caso no se pudo guardar. */
const reason = (entity: string, error: any) =>
  `${entity}: ${
    String(error?.message ?? error)
      .trim()
      .split("\n")[0]
  }`;
const ctxA = () => context(ids.A, ids.uA);
const ctxA2 = () => context(ids.A, ids.uA2);
const ctxB = () => context(ids.B, ids.uB);

/** El servicio generado de la entidad, con un contexto. */
function service(entity: string, kind: "Update" | "Create", ctx: any): any {
  const mod = require(`../../../src/entities/${lower(entity)}/services/${lower(
    entity
  )}${kind}Service`);
  return new mod[`${entity}${kind}Service`](ctx, basePrisma, store);
}

/** Los textos de los argumentos, únicos por llamado (hay campos únicos). */
let n = 0;
const fresh = (args: Args): Args => {
  n++;
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [
      k,
      typeof v === "string" && v === "SRX" ? PREFIX + "v" + n : v,
    ])
  );
};

const failure = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => {
      throw new Error("no falló");
    },
    (error) => error
  );
const code = (error: any) =>
  error?.extensions?.code ?? error?.constructor?.name;
/** El choque entre transacciones que informa Prisma (P2034). */
const writeConflict = () =>
  new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    { code: "P2034", clientVersion: Prisma.prismaVersion.client }
  );
/** El intento de guardado de un pedido con clave válida (clave y hash del contenido). */
const attempt = (args: Args) => {
  const found = saveAttemptOf(args);
  if (!found) throw new Error("el pedido no tiene una clave válida");
  return found;
};

/**
 * Lo que los servicios escriben en la consola mientras corre un caso: se junta
 * en vez de imprimirse, para afirmar lo que se espera (un conflicto, un error,
 * un éxito idempotente) sin ensuciar la salida. Una advertencia o un error que
 * el caso no afirmó lo hace fallar.
 */
let consoleLines: { level: string; text: string; checked?: boolean }[] = [];
const consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
  consoleLines = [];
  for (const level of ["log", "info", "warn", "error"] as const)
    consoleSpies.push(
      jest.spyOn(console, level).mockImplementation((...parts: unknown[]) => {
        consoleLines.push({ level, text: parts.map(String).join(" ") });
      })
    );
});
afterEach(() => {
  for (const spy of consoleSpies.splice(0)) spy.mockRestore();
  const unchecked = consoleLines.filter(
    (l) => (l.level === "warn" || l.level === "error") && !l.checked
  );
  expect(unchecked.map((l) => `${l.level}: ${l.text}`)).toEqual([]);
});
/** Las líneas de un nivel, que el caso afirma (y quedan vistas). */
const logged = (level: string) =>
  consoleLines
    .filter((l) => l.level === level)
    .map((l) => {
      l.checked = true;
      return l.text;
    });
/**
 * Corre fn (un paso del setup) juntando lo que escribe en la consola, sin
 * imprimirlo, para afirmarlo; si tira, devuelve el error en vez de tirarlo.
 */
async function capturing(fn: () => Promise<unknown>) {
  const lines: { level: string; text: string }[] = [];
  const spies = (["log", "info", "warn", "error"] as const).map((level) =>
    jest.spyOn(console, level).mockImplementation((...parts: unknown[]) => {
      lines.push({ level, text: parts.map(String).join(" ") });
    })
  );
  try {
    await fn();
    return { lines, error: undefined as unknown };
  } catch (error) {
    return { lines, error };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}
/** Un caso que se guarda bien no deja advertencias ni errores en la consola. */
const expectQuietSetup = (lines: { level: string; text: string }[]) =>
  expect(
    lines.filter((l) => l.level === "warn" || l.level === "error")
  ).toEqual([]);

/** El error de siempre de un alta que choca por el id (P2002): lo que deja en la consola. */
const expectUniqueViolationLogged = (entity: string) => {
  expect(logged("log")).toEqual([expect.stringContaining("prisma:error")]);
  expect(logged("error")).toEqual([
    expect.stringContaining(`[${entity}CreateService] Prisma Error: P2002`),
    expect.stringContaining("[PrismaError] P2002"),
  ]);
};

/** Si la guarda de la base de test pasó: si no, el afterAll no limpia (no toca una base que no es de test). */
let safe = false;

beforeAll(async () => {
  assertSafeTestDatabase();
  safe = true;
  await f.purge();
  // Los metadatos del schema avisan que cargan: se afirma.
  const built = await capturing(async () => {
    store = new SchemaMetadataStore();
    store.build();
  });
  if (built.error) throw built.error;
  expect(built.lines).toEqual([
    { level: "log", text: "Loading pre-generated schema metadata..." },
    {
      level: "log",
      text: expect.stringMatching(/^Schema metadata loaded for \d+ models\.$/),
    },
  ]);
  for (const m of f.models.values())
    for (const a of ["retrieve", "create", "update", "delete"])
      ALL.push(m.delegate + "_" + a);
  ids.A = await f.create("Tenant", { tenant: null });
  ids.B = await f.create("Tenant", { tenant: null });
  ids.uA = await f.create("User", { tenant: ids.A });
  ids.uA2 = await f.create("User", { tenant: ids.A });
  ids.uB = await f.create("User", { tenant: ids.B });
}, 300000);

afterAll(async () => {
  if (chosen.length) console.log("\ncasos elegidos:\n  " + chosen.join("\n  "));
  if (safe) await f.purge();
  await basePrisma.$disconnect();
  for (const [name, value] of Object.entries(SECRETS_BEFORE)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}, 300000);

describe("la edición: el mismo guardado reintentado no es un conflicto", () => {
  let c: UpdateCase;
  let id: string;

  beforeAll(async () => {
    // Si la guarda de la base de test falló, jest corre igual este beforeAll: no se
    // toca ninguna base (los casos ya fallan por la guarda).
    if (!safe) return;
    // Si alguno de los casos agrega una fila a una subentidad, el elegido también:
    // si no, el test dejaría de probar que lo anidado no se aplica dos veces.
    const withSub = CASOS.update.some((x) => x.sub);
    const reasons: string[] = [];
    for (const candidate of CASOS.update.filter((x) => !withSub || x.sub)) {
      let seeded = "";
      // Que la edición de este caso se pueda guardar en este proyecto.
      const probe = await capturing(async () => {
        seeded = await f.create(candidate.entity, {
          tenant: ids.A,
          user: ids.uA,
        });
        const version_ = (
          await db(candidate.entity).findUnique({
            where: { id: seeded },
            select: { version_: true },
          })
        ).version_;
        await service(candidate.entity, "Update", ctxA())[
          `update${candidate.entity}`
        ](request(candidate, seeded, version_, undefined), { id: true });
      });
      if (probe.error) {
        reasons.push(reason(candidate.entity, probe.error));
        continue;
      }
      expectQuietSetup(probe.lines);
      c = candidate;
      id = seeded;
      break;
    }
    if (!c)
      throw new Error(
        `ningún caso de edición${
          withSub ? " con subentidad" : ""
        } se pudo guardar:\n  ${reasons.join("\n  ")}`
      );
    chosen.push(
      "edición: " +
        c.entity +
        (c.field ? " (cambia " + c.field + ")" : "") +
        (c.sub
          ? " (agrega una fila a " + c.sub.arg + ")"
          : " (sin subentidad que agregar)")
    );
  }, 120000);

  function request(
    cs: UpdateCase,
    recordId: string,
    version_: string,
    idempotencyKey_: unknown
  ): Args {
    const args: Args = { id: recordId, version_ };
    if (idempotencyKey_ !== undefined) args.idempotencyKey_ = idempotencyKey_;
    if (cs.field) args[cs.field] = PREFIX + "cambio" + ++n;
    if (cs.sub) args[cs.sub.arg] = { create: [fresh(cs.sub.create)] };
    return args;
  }
  const update = (ctx: any, args: Args) =>
    service(c.entity, "Update", ctx)[`update${c.entity}`](args, {
      id: true,
      version_: true,
    });
  const current = async () =>
    db(c.entity).findUnique({
      where: { id },
      select: { version_: true, lastUpdatedAt_: true },
    });
  const subRows = async () => {
    if (!c.sub) return 0;
    const link = f.parentLink(c.entity, c.sub.field);
    return db(link.child).count({ where: { [link.fk]: id } });
  };

  it("aplicado y reintentado con la misma versión leída y la misma clave: éxito con los datos actuales, sin aplicar dos veces", async () => {
    const { version_: read } = await current();
    const key = randomUUID();
    const args = request(c, id, read, key);
    const rows = await subRows();

    const first = await update(ctxA(), args);
    expect(first).toEqual({ id, version_: deriveVersion(read, attempt(args)) });
    expect(await subRows()).toBe(rows + (c.sub ? 1 : 0));
    const applied = await current();

    // Se perdió la respuesta: el mismo pedido otra vez.
    const again = await update(ctxA(), args);
    expect(again).toEqual(first);
    expect(await subRows()).toBe(rows + (c.sub ? 1 : 0));
    expect(await current()).toEqual(applied);
    expect(logged("info")).toEqual([
      expect.stringContaining("already applied; returning the current record"),
    ]);
  });

  it("otra clave sobre la versión vieja: RECORD_MODIFIED, sin aplicar nada", async () => {
    const { version_: read } = await current();
    await update(ctxA(), request(c, id, read, randomUUID()));
    const applied = await current();
    const rows = await subRows();
    const error = await failure(
      update(ctxA(), request(c, id, read, randomUUID()))
    );
    expect(code(error)).toBe("RECORD_MODIFIED");
    // Al cliente viaja el código; el mensaje queda para los logs: neutro (quién
    // escribió no se sabe), con las dos versiones.
    const message = `Version conflict on ${c.entity} ${id}: expected ${read}, found ${applied.version_}`;
    expect(error.customMessage).toBe(message);
    expect(logged("warn")).toEqual([`[${c.entity}UpdateService] ${message}`]);
    expect(await current()).toEqual(applied);
    expect(await subRows()).toBe(rows);
  });

  it.each([
    ["una clave inválida", "no-es-un-uuid"],
    ["ninguna clave", undefined],
  ])(
    "%s: como siempre (versión al azar; el reintento con la versión vieja es un conflicto)",
    async (_label, key) => {
      const { version_: read } = await current();
      const args = request(c, id, read, key);
      const first = await update(ctxA(), args);
      expect(first.version_).not.toBe(read);
      // La clave inválida no se usa para derivar.
      if (typeof key === "string") {
        expect(saveAttemptOf(args)).toBeNull();
        expect(first.version_).not.toBe(
          deriveVersion(read, {
            idempotencyKey: key,
            contentHash: contentHash(args),
          })
        );
      }
      const error = await failure(update(ctxA(), args));
      expect(code(error)).toBe("RECORD_MODIFIED");
      expect(logged("warn")).toEqual([
        `[${c.entity}UpdateService] Version conflict on ${c.entity} ${id}: expected ${read}, found ${first.version_}`,
      ]);
    }
  );

  /**
   * El servicio de edición con su primera lectura interceptada: después de leer,
   * corre `meanwhile` (otra escritura que confirma en ese momento) y sigue.
   */
  function interleaved(ctx: any, meanwhile: () => Promise<void>): any {
    const svc = service(c.entity, "Update", ctx);
    const read = svc.db.findUniqueOrThrow.bind(svc.db);
    let first = true;
    svc.db.findUniqueOrThrow = async (q: any) => {
      const found = await read(q);
      if (first) {
        first = false;
        await meanwhile();
      }
      return found;
    };
    return svc;
  }

  it("el original confirma entre la lectura del reintento y su transacción: se aplica una sola vez, y el reintento es el éxito idempotente", async () => {
    const { version_: read } = await current();
    const key = randomUUID();
    const args = request(c, id, read, key);
    const rows = await subRows();
    let applied: any;
    const retry = interleaved(ctxA(), async () => {
      await update(ctxA(), args);
      applied = await current();
    });
    const res = await retry[`update${c.entity}`](args, {
      id: true,
      version_: true,
    });
    expect(res).toEqual({ id, version_: deriveVersion(read, attempt(args)) });
    expect(await current()).toEqual(applied);
    expect(await subRows()).toBe(rows + (c.sub ? 1 : 0));
    expect(logged("info")).toEqual([
      expect.stringContaining("already applied; returning the current record"),
    ]);
  });

  it("otro usuario guarda sobre la misma versión leída mientras el primero confirma: RECORD_MODIFIED, sin pisarlo", async () => {
    const { version_: read } = await current();
    const rows = await subRows();
    let applied: any;
    const other = interleaved(ctxA2(), async () => {
      await update(ctxA(), request(c, id, read, randomUUID()));
      applied = await current();
    });
    const error = await failure(
      other[`update${c.entity}`](request(c, id, read, randomUUID()), {
        id: true,
        version_: true,
      })
    );
    expect(code(error)).toBe("RECORD_MODIFIED");
    expect(await current()).toEqual(applied);
    expect(await subRows()).toBe(rows + (c.sub ? 1 : 0));
    expect(logged("warn")).toEqual([
      expect.stringContaining(
        `Version conflict on ${c.entity} ${id}: expected ${read}, found ${applied.version_}`
      ),
    ]);
  });

  it("un conflicto de serialización (P2034) se reintenta una vez, y el reintento reconoce el mismo guardado", async () => {
    const { version_: read } = await current();
    const key = randomUUID();
    const args = request(c, id, read, key);
    const rows = await subRows();
    const retry = service(c.entity, "Update", ctxA());
    const prisma = retry.prisma;
    let transactions = 0;
    let applied: any;
    // La primera transacción fija su foto con una lectura, y recién entonces
    // confirma el original (otra conexión): su escritura choca (P2034).
    retry.prisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return (fn: any, options: any) => {
          transactions++;
          if (transactions > 1) return target.$transaction(fn, options);
          return target.$transaction(async (tx: any) => {
            await tx[f.model(c.entity).delegate].findUnique({
              where: { id },
              select: { version_: true },
            });
            await update(ctxA(), args);
            applied = await current();
            return fn(tx);
          }, options);
        };
      },
    });
    const res = await retry[`update${c.entity}`](args, {
      id: true,
      version_: true,
    });
    expect(transactions).toBe(2);
    expect(res).toEqual({ id, version_: deriveVersion(read, attempt(args)) });
    expect(await current()).toEqual(applied);
    expect(await subRows()).toBe(rows + (c.sub ? 1 : 0));
    expect(logged("info")).toEqual([
      expect.stringContaining("(P2034); retrying once"),
      expect.stringContaining("already applied; returning the current record"),
    ]);
    expect(logged("log")).toEqual([expect.stringContaining("prisma:error")]);
  });

  it("un choque (P2034) con una escritura que no cambió la versión: el reintento aplica el guardado entero, también lo que la transacción ya había consumido (los remove)", async () => {
    if (!c.sub) {
      // Sin subentidad en el modelo no hay remove anidado que consumir.
      expect(CASOS.update.some((x) => x.sub)).toBe(false);
      return;
    }
    const sub = c.sub;
    // Una fila para quitar.
    const { version_: before } = await current();
    await update(ctxA(), request(c, id, before, randomUUID()));
    const link = f.parentLink(c.entity, sub.field);
    const [row] = await db(link.child).findMany({
      where: { [link.fk]: id },
      select: { id: true },
      take: 1,
    });
    const { version_: read } = await current();
    const key = randomUUID();
    const args: Args = {
      id,
      version_: read,
      idempotencyKey_: key,
      [sub.arg]: { remove: [row.id] },
    };
    // Antes de guardar: el servicio consume los remove de args.
    const expected = deriveVersion(read, attempt(args));
    const svc = service(c.entity, "Update", ctxA());
    const prisma = svc.prisma;
    let transactions = 0;
    // Otra escritura toca la fila sin cambiar su versión (un proceso que no la
    // versiona) después de que la primera transacción fijó su foto.
    svc.prisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return (fn: any, options: any) => {
          transactions++;
          if (transactions > 1) return target.$transaction(fn, options);
          return target.$transaction(async (tx: any) => {
            await tx[f.model(c.entity).delegate].findUnique({
              where: { id },
              select: { version_: true },
            });
            await db(c.entity).update({
              where: { id },
              data: { lastUpdatedAt_: new Date() },
            });
            return fn(tx);
          }, options);
        };
      },
    });
    const res = await svc[`update${c.entity}`](args, {
      id: true,
      version_: true,
    });
    expect(transactions).toBe(2);
    expect(res).toEqual({ id, version_: expected });
    expect(await db(link.child).count({ where: { id: row.id } })).toBe(0);
    expect(logged("info")).toEqual([
      expect.stringContaining("(P2034); retrying once"),
    ]);
    expect(logged("log")).toEqual([expect.stringContaining("prisma:error")]);
  });

  it("la misma versión leída y la misma clave con otro contenido no es el mismo guardado: RECORD_MODIFIED, y queda el primero", async () => {
    // Cada pedido del caso cambia el texto o agrega otra fila: el contenido difiere.
    expect(c.field || c.sub).toBeTruthy();
    const { version_: read } = await current();
    const key = randomUUID();
    await update(ctxA(), request(c, id, read, key));
    const applied = await current();
    const rows = await subRows();
    const other = request(c, id, read, key);
    const error = await failure(update(ctxA(), other));
    expect(code(error)).toBe("RECORD_MODIFIED");
    expect(await current()).toEqual(applied);
    expect(await subRows()).toBe(rows);
    expect(logged("warn")).toEqual([
      expect.stringContaining(
        `Version conflict on ${c.entity} ${id}: expected ${read}, found ${applied.version_}`
      ),
    ]);
  });

  it("una fila creada en un guardado se edita y se quita en los siguientes por su id (el que da la relectura del formulario)", async () => {
    if (!c.sub) {
      expect(CASOS.update.some((x) => x.sub)).toBe(false);
      return;
    }
    const sub = c.sub;
    const link = f.parentLink(c.entity, sub.field);
    const rowsOf = () =>
      db(link.child).findMany({
        where: { [link.fk]: id },
        select: { id: true, version_: true },
      });
    const before = (await rowsOf()).map((r: any) => r.id);
    const { version_: read } = await current();
    const created = await update(ctxA(), request(c, id, read, randomUUID()));
    const [row] = (await rowsOf()).filter((r: any) => !before.includes(r.id));
    const changes = fresh(sub.create);
    const edited = await update(ctxA(), {
      id,
      version_: created.version_,
      idempotencyKey_: randomUUID(),
      [sub.arg]: {
        update: [{ id: row.id, version_: row.version_, ...changes }],
      },
    });
    // Los textos nuevos quedaron en esa fila.
    const texts = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => typeof value === "string")
    );
    if (Object.keys(texts).length > 0)
      expect(
        await db(link.child).findUnique({
          where: { id: row.id },
          select: Object.fromEntries(Object.keys(texts).map((k) => [k, true])),
        })
      ).toEqual(texts);
    await update(ctxA(), {
      id,
      version_: edited.version_,
      idempotencyKey_: randomUUID(),
      [sub.arg]: { remove: [row.id] },
    });
    expect(await db(link.child).count({ where: { id: row.id } })).toBe(0);
  });

  it("un P2034 al confirmar, después de copiar el archivo: el reintento reconoce el mismo guardado y no borra el archivo que nombra la fila", async () => {
    if (!c.file) {
      // Sin archivos en el modelo no hay copias que cuidar.
      expect(CASOS.update.some((x) => x.file)).toBe(false);
      return;
    }
    const fileArg = c.file;
    const { version_: read } = await current();
    const ticket = randomUUID();
    const args: Args = {
      ...request(c, id, read, randomUUID()),
      [fileArg]: {
        ticket,
        filename: "contrato.pdf",
        mimetype: "application/pdf",
        size: 3,
        encoding: "7bit",
      },
    };
    const expected = deriveVersion(read, attempt(args));
    const original: Args = JSON.parse(JSON.stringify(args));
    mockFiles.copied.length = 0;
    mockFiles.deleted.length = 0;
    const svc = service(c.entity, "Update", ctxA());
    const prisma = svc.prisma;
    let transactions = 0;
    // El primer intento escribe y copia el archivo, y falla al confirmar (P2034).
    // El original, que esperaba el bloqueo de la fila, confirma después, con el
    // mismo archivo (el mismo ticket, la misma clave).
    svc.prisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return async (fn: any, options: any) => {
          transactions++;
          if (transactions > 1) return target.$transaction(fn, options);
          try {
            return await target.$transaction(async (tx: any) => {
              await fn(tx);
              throw writeConflict();
            }, options);
          } finally {
            await update(ctxA(), original);
          }
        };
      },
    });
    const res = await svc[`update${c.entity}`](args, {
      id: true,
      version_: true,
    });
    expect(transactions).toBe(2);
    expect(res).toEqual({ id, version_: expected });
    const row = await db(c.entity).findUnique({
      where: { id },
      select: { [`${fileArg}_server_data`]: true },
    });
    const named = row[`${fileArg}_server_data`];
    const key = `${named.baseName}${named.uuid}/${named.filename}`;
    expect(named.uuid).toBe(ticket);
    expect(mockFiles.copied).toContain(key);
    expect(mockFiles.deleted).not.toContain(key);
    expect(logged("info")).toEqual([
      expect.stringContaining("(P2034); retrying once"),
      expect.stringContaining("already applied; returning the current record"),
    ]);
  });

  it("lo mismo, pero otro usuario guardó encima antes del reintento: RECORD_MODIFIED, y el archivo que la fila sigue nombrando no se borra", async () => {
    if (!c.file) {
      expect(CASOS.update.some((x) => x.file)).toBe(false);
      return;
    }
    const fileArg = c.file;
    const { version_: read } = await current();
    const ticket = randomUUID();
    const args: Args = {
      ...request(c, id, read, randomUUID()),
      [fileArg]: {
        ticket,
        filename: "contrato.pdf",
        mimetype: "application/pdf",
        size: 3,
        encoding: "7bit",
      },
    };
    const original: Args = JSON.parse(JSON.stringify(args));
    mockFiles.copied.length = 0;
    mockFiles.deleted.length = 0;
    const svc = service(c.entity, "Update", ctxA());
    const prisma = svc.prisma;
    let transactions = 0;
    svc.prisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return async (fn: any, options: any) => {
          transactions++;
          if (transactions > 1) return target.$transaction(fn, options);
          try {
            return await target.$transaction(async (tx: any) => {
              await fn(tx);
              throw writeConflict();
            }, options);
          } finally {
            // El original confirma con el archivo, y otro usuario guarda otra cosa
            // encima (sin tocar el archivo).
            const applied = await update(ctxA(), original);
            await update(
              ctxA2(),
              request(c, id, applied.version_, randomUUID())
            );
          }
        };
      },
    });
    const error = await failure(
      svc[`update${c.entity}`](args, { id: true, version_: true })
    );
    expect(code(error)).toBe("RECORD_MODIFIED");
    const row = await db(c.entity).findUnique({
      where: { id },
      select: { [`${fileArg}_server_data`]: true },
    });
    const named = row[`${fileArg}_server_data`];
    const key = `${named.baseName}${named.uuid}/${named.filename}`;
    expect(named.uuid).toBe(ticket);
    expect(mockFiles.deleted).not.toContain(key);
    expect(logged("info")).toEqual([
      expect.stringContaining("(P2034); retrying once"),
    ]);
    expect(logged("warn")).toEqual([
      expect.stringContaining(`Version conflict on ${c.entity} ${id}`),
    ]);
  });

  it("dentro de un alcance de transacción de afuera, un P2034 no se reintenta: sube a quien abrió la transacción", async () => {
    const before = await current();
    const args = request(c, id, before.version_, randomUUID());
    const svc = service(c.entity, "Update", ctxA());
    const prisma = svc.prisma;
    let transactions = 0;
    svc.prisma = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop !== "$transaction") return Reflect.get(target, prop, receiver);
        return (fn: any, options: any) => {
          transactions++;
          return target.$transaction(async (tx: any) => {
            await fn(tx);
            throw writeConflict();
          }, options);
        };
      },
    });
    const error = await failure(
      runWithTransactionScope(() =>
        svc[`update${c.entity}`](args, { id: true, version_: true })
      )
    );
    expect(code(error)).toBe("P2034");
    expect(transactions).toBe(1);
    expect(await current()).toEqual(before);
    expect(logged("error")).toEqual([
      expect.stringContaining(`[${c.entity}UpdateService] Prisma Error: P2034`),
      expect.stringContaining("[PrismaError] P2034"),
    ]);
  });

  it("un usuario de la empresa sin permiso de edición, con el pedido ya aplicado: no autorizado, nunca el éxito", async () => {
    const { version_: read } = await current();
    const args = request(c, id, read, randomUUID());
    await update(ctxA(), args);
    const applied = await current();
    const reader = context(ids.A, ids.uA2, {
      without: [f.model(c.entity).delegate + "_update"],
    });
    expect(code(await failure(update(reader, args)))).toBe("AUTH_UNAUTHORIZED");
    expect(await current()).toEqual(applied);
    expect(logged("warn")).toEqual([
      expect.stringContaining(
        `lacks permission: ${f.model(c.entity).delegate}_update`
      ),
    ]);
  });

  it("sin secreto del server, una clave válida es como ninguna: versión al azar, y el reintento es un conflicto", async () => {
    const { version_: read } = await current();
    const args = request(c, id, read, randomUUID());
    const first = await withSecret(undefined, () => update(ctxA(), args));
    expect(first.version_).not.toBe(read);
    expect(first.version_).not.toBe(deriveVersion(read, attempt(args)));
    const error = await failure(
      withSecret(undefined, () => update(ctxA(), args))
    );
    expect(code(error)).toBe("RECORD_MODIFIED");
    expect(logged("warn")).toEqual([
      `[${c.entity}UpdateService] Version conflict on ${c.entity} ${id}: expected ${read}, found ${first.version_}`,
    ]);
  });

  it("un usuario de otra empresa con el mismo pedido no ve el registro: no encontrado, nunca el éxito", async () => {
    const { version_: read } = await current();
    const key = randomUUID();
    const args = request(c, id, read, key);
    await update(ctxA(), args);
    const applied = await current();
    expect(code(await failure(update(ctxB(), args)))).toBe("NOT_FOUND");
    expect(await current()).toEqual(applied);
  });
});

describe("el alta: el mismo alta reintentado no se duplica", () => {
  let c: CreateCase;

  beforeAll(async () => {
    if (!safe) return; // la guarda de la base de test falló
    const reasons: string[] = [];
    for (const candidate of CASOS.create) {
      // Que el alta de este caso se pueda guardar en este proyecto.
      const probe = await capturing(() =>
        service(candidate.entity, "Create", ctxA())[
          `create${candidate.entity}`
        ](fresh(candidate.args), { id: true })
      );
      if (probe.error) {
        reasons.push(reason(candidate.entity, probe.error));
        continue;
      }
      expectQuietSetup(probe.lines);
      c = candidate;
      break;
    }
    if (!c)
      throw new Error(
        `ningún caso de alta se pudo guardar:\n  ${reasons.join("\n  ")}`
      );
    chosen.push("alta: " + c.entity);
  }, 120000);

  const create = (ctx: any, args: Args) =>
    service(c.entity, "Create", ctx)[`create${c.entity}`](args, { id: true });
  const createdBy = (user: string) =>
    db(c.entity).count({ where: { createdBy_id_: user } });

  it("reintentado con la misma clave: el mismo registro, sin duplicado", async () => {
    const key = randomUUID();
    const args = { ...fresh(c.args), idempotencyKey_: key };
    const before = await createdBy(ids.uA);
    const first = await create(ctxA(), args);
    expect(first.id).toBe(deriveCreateId(c.entity, ids.uA, attempt(args)));
    const again = await create(ctxA(), args);
    expect(again).toEqual(first);
    expect(await createdBy(ids.uA)).toBe(before + 1);
  });

  it("la misma clave, otro usuario de la empresa: otro registro, nunca el ajeno", async () => {
    const key = randomUUID();
    const mine = await create(ctxA(), {
      ...fresh(c.args),
      idempotencyKey_: key,
    });
    const before = await createdBy(ids.uA2);
    const otherArgs = { ...fresh(c.args), idempotencyKey_: key };
    const other = await create(ctxA2(), otherArgs);
    expect(other.id).toBe(
      deriveCreateId(c.entity, ids.uA2, attempt(otherArgs))
    );
    expect(other.id).not.toBe(mine.id);
    expect(await createdBy(ids.uA2)).toBe(before + 1);
    // Y con el mismo pedido exacto: el usuario va en la derivación.
    expect(deriveCreateId(c.entity, ids.uA, attempt(otherArgs))).not.toBe(
      other.id
    );
  });

  it.each([
    [
      "de otro usuario de la empresa",
      () => ({
        ctx: ctxA2(),
        user: ids.uA2,
        owner: { tenant: ids.A, user: ids.uA },
      }),
    ],
    [
      "de otra empresa",
      () => ({
        ctx: ctxB(),
        user: ids.uB,
        owner: { tenant: ids.A, user: ids.uB },
      }),
    ],
  ])(
    "un registro %s con el id que derivaría la clave: no se devuelve, y el error no dice nada de él",
    async (_label, who) => {
      const { ctx, user, owner } = who();
      const args = { ...fresh(c.args), idempotencyKey_: randomUUID() };
      const target = deriveCreateId(c.entity, user, attempt(args));
      await f.create(c.entity, owner, { id: target });
      const seeded = await db(c.entity).findUnique({ where: { id: target } });
      const error = await failure(create(ctx, args));
      // El error de siempre de un alta que choca por el id: ni el registro ajeno ni
      // un "no encontrado" que delataría que la clave encontró algo.
      expect(code(error)).toBe("P2002");
      const said = JSON.stringify({
        message: error?.message,
        extensions: error?.extensions,
      });
      for (const [field, value] of Object.entries(seeded))
        if (
          typeof value === "string" &&
          field !== "id" &&
          value.startsWith(PREFIX)
        )
          expect([field, said.includes(value)]).toEqual([field, false]);
      expect(await db(c.entity).findUnique({ where: { id: target } })).toEqual(
        seeded
      );
      expectUniqueViolationLogged(c.entity);
    }
  );

  it("un alta que la verificación previa no vio (dos intentos a la vez) choca por el id, y el catch la reconoce: el mismo registro", async () => {
    const args = { ...fresh(c.args), idempotencyKey_: randomUUID() };
    const first = await create(ctxA(), args);
    const svc = service(c.entity, "Create", ctxA());
    const find = svc.db.findFirst.bind(svc.db);
    let lookups = 0;
    // La verificación previa no lo ve (el otro intento todavía no confirmaba).
    svc.db.findFirst = async (q: any) => (++lookups === 1 ? null : find(q));
    const again = await svc[`create${c.entity}`](args, { id: true });
    expect(again).toEqual(first);
    expect(lookups).toBe(2);
    expect(await db(c.entity).count({ where: { id: first.id } })).toBe(1);
    expect(logged("info")).toEqual([
      expect.stringContaining(
        "already done, its id collided; returning that record"
      ),
    ]);
    expect(logged("log")).toEqual([expect.stringContaining("prisma:error")]);
  });

  it("en modo sistema nunca devuelve un registro existente: la misma identidad en otra empresa, con el mismo pedido, choca con el error de siempre", async () => {
    // Un proceso del sistema que opera para varias empresas con la misma identidad.
    const system = (tenant: string) => ({
      ...context(tenant, ids.uA),
      isSystemMode: true,
    });
    const args = { ...fresh(c.args), idempotencyKey_: randomUUID() };
    const mine = await create(system(ids.A), args);
    const row = await db(c.entity).findUnique({ where: { id: mine.id } });
    const error = await failure(create(system(ids.B), args));
    expect(code(error)).toBe("P2002");
    expect(
      JSON.stringify({ message: error?.message, extensions: error?.extensions })
    ).not.toContain(ids.A);
    expect(await db(c.entity).findUnique({ where: { id: mine.id } })).toEqual(
      row
    );
    expectUniqueViolationLogged(c.entity);
  });

  it("la misma clave con otro contenido: otro registro (otro id), y el primero queda como estaba", async () => {
    const key = randomUUID();
    const first = await create(ctxA(), {
      ...fresh(c.args),
      idempotencyKey_: key,
    });
    const firstRow = await db(c.entity).findUnique({ where: { id: first.id } });
    const second = await create(ctxA(), {
      ...fresh(c.args),
      idempotencyKey_: key,
    });
    expect(second.id).not.toBe(first.id);
    expect(await db(c.entity).findUnique({ where: { id: first.id } })).toEqual(
      firstRow
    );
  });

  it.each([
    ["una clave inválida", "no-es-un-uuid"],
    ["ninguna clave", undefined],
  ])("%s: un alta nueva cada vez", async (_label, key) => {
    // Dos altas distintas con la misma clave: sin una clave válida, ninguna
    // devuelve a la otra.
    const withKey = (args: Args) => ({
      ...args,
      ...(key !== undefined ? { idempotencyKey_: key } : {}),
    });
    const first = await create(ctxA(), withKey(fresh(c.args)));
    const second = await create(ctxA(), withKey(fresh(c.args)));
    expect(second.id).not.toBe(first.id);
  });
});

describe("el alta en otra empresa (.tenantSelectableBy): el reintento encuentra el registro donde nació", () => {
  let c: TenantCreateCase | undefined;
  const admin = (cs: TenantCreateCase) =>
    context(ids.A, ids.uA, { roles: cs.roles });
  const create = (cs: TenantCreateCase, args: Args) =>
    service(cs.entity, "Create", admin(cs))[`create${cs.entity}`](args, {
      id: true,
    });

  beforeAll(async () => {
    if (!safe) return; // la guarda de la base de test falló
    const reasons: string[] = [];
    for (const candidate of CASOS.createForTenant) {
      const probe = await capturing(() =>
        create(candidate, {
          ...fresh(candidate.args),
          [candidate.selector]: ids.B,
        })
      );
      if (probe.error) {
        reasons.push(reason(candidate.entity, probe.error));
        continue;
      }
      // Un administrador que lee en otra empresa queda registrado.
      expect(probe.lines).toEqual(
        probe.lines.map(() => ({
          level: "info",
          text: expect.stringMatching(
            /^\[SecurePrismaOps\] cross-tenant read: /
          ),
        }))
      );
      c = candidate;
      break;
    }
    if (CASOS.createForTenant.length > 0 && !c)
      throw new Error(
        `ningún caso de alta en otra empresa se pudo guardar:\n  ${reasons.join(
          "\n  "
        )}`
      );
    if (c) chosen.push("alta en otra empresa: " + c.entity);
  }, 120000);

  it("reintentada con la misma clave: el mismo registro, en la empresa elegida, sin duplicado", async () => {
    if (!c) {
      // El modelo no tiene altas en otra empresa.
      expect(CASOS.createForTenant).toEqual([]);
      return;
    }
    const args = {
      ...fresh(c.args),
      [c.selector]: ids.B,
      idempotencyKey_: randomUUID(),
    };
    const first = await create(c, args);
    expect(first.id).toBe(deriveCreateId(c.entity, ids.uA, attempt(args)));
    expect(
      (
        await db(c.entity).findUnique({
          where: { id: first.id },
          select: { tenant_id_: true },
        })
      ).tenant_id_
    ).toBe(ids.B);
    const again = await create(c, args);
    expect(again).toEqual(first);
    expect(await db(c.entity).count({ where: { id: first.id } })).toBe(1);
    // (Las lecturas de otra empresa de un administrador también se registran.)
    expect(
      logged("info").filter((line) =>
        line.includes(`[${c!.entity}CreateService]`)
      )
    ).toEqual([expect.stringContaining("already done; returning that record")]);
  });
});

describe("el hash del contenido de un pedido", () => {
  const key = randomUUID();
  const pedido = (d: number[]) => ({
    id: PREFIX + "x",
    version_: "v1",
    idempotencyKey_: key,
    name: "n",
    lines: { create: [{ a: 1, b: { c: 2, d } }] },
  });

  it("no depende del orden de las claves, de cómo viene escrita la clave ni de la versión leída", () => {
    const reordered = {
      lines: { create: [{ b: { d: [1, 2], c: 2 }, a: 1 }] },
      name: "n",
      idempotencyKey_: key.toUpperCase(),
      version_: "v2",
      id: PREFIX + "x",
    };
    expect(attempt(reordered)).toEqual(attempt(pedido([1, 2])));
  });

  it("cambia con un cambio en un campo anidado", () => {
    expect(attempt(pedido([1, 3])).contentHash).not.toBe(
      attempt(pedido([1, 2])).contentHash
    );
  });

  it("sin una clave válida no hay intento: el pedido sigue como siempre (también con nil, max o un uuid que no es v4)", () => {
    for (const invalid of [
      "no-es-un-uuid",
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      uuidv1(),
    ])
      expect([
        invalid,
        saveAttemptOf({ ...pedido([1, 2]), idempotencyKey_: invalid }),
      ]).toEqual([invalid, null]);
    expect(saveAttemptOf({ name: "n" })).toBeNull();
  });
});

describe("la derivación, con el secreto del server", () => {
  const key = randomUUID();
  const pedido = {
    id: PREFIX + "x",
    version_: "v1",
    idempotencyKey_: key,
    apiKey: "4821",
  };

  it("con la clave y el contenido no se puede recomputar la versión sin el secreto", () => {
    const a = attempt(pedido);
    const version = deriveVersion("v1", a);
    // Lo que alguien puede calcular sin el secreto, con la versión leída, la clave
    // y el contenido en la mano (el hash es público: SHA-256 del contenido).
    const sinSecreto = [
      uuidv5(
        `v1:${a.idempotencyKey}:${a.contentHash}`,
        "2b74ffcb-eb0a-49fb-af0d-c851068390df"
      ),
      createHash("sha256")
        .update(`v1:${a.idempotencyKey}:${a.contentHash}`)
        .digest("hex"),
    ];
    expect(sinSecreto).not.toContain(version);
    // Y otra vez con el mismo secreto: la misma (el server sí la reconoce).
    expect(deriveVersion("v1", attempt(pedido))).toBe(version);
  });

  it("con otro secreto da otra versión y otro id", () => {
    const a = attempt(pedido);
    const [version, created] = [
      deriveVersion("v1", a),
      deriveCreateId("X", "u1", a),
    ];
    withSecret("otro-secreto-" + randomUUID(), () => {
      expect(deriveVersion("v1", a)).not.toBe(version);
      expect(deriveCreateId("X", "u1", a)).not.toBe(created);
    });
  });

  it("sin secreto no hay intento: el pedido sigue como siempre, nunca con un valor por defecto", () => {
    withSecret(undefined, () => {
      expect(saveAttemptOf(pedido)).toBeNull();
      expect(() =>
        deriveVersion("v1", { idempotencyKey: key, contentHash: "x" })
      ).toThrow();
    });
  });
});
