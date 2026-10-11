/**
 * Batería de seguridad de los motivos de borrado, generada para todo proyecto.
 *
 * Recorre la tabla generada (DELETION_BLOCKERS): para cada entidad que alguna
 * relación impide borrar, siembra en la base de test un registro y, por cada
 * relación, una raíz que lo usa en la empresa A (y en la B, si el registro es
 * global), y comprueba contra la base real lo que la consulta y el borrado
 * dejan ver:
 *
 * 1. Nunca un nombre ni un id de otra empresa; las otras empresas aparecen solo
 *    como cantidad, y solo cuando el registro es global.
 * 2. Sin oráculo: el id de un registro ajeno responde exactamente igual que uno
 *    que no existe, en la consulta (también por su resolver GraphQL) y en el
 *    servicio de borrado, con los validadores del proyecto puestos (el mismo
 *    error y las mismas consultas a la base). Un id que no es texto, o sin
 *    sesión: lo mismo, sin consultar.
 * 3. Sin permiso de borrado, o sin ver el registro: "no encontrado" (el servicio
 *    de borrado, el UnauthorizedError de siempre, sin consultar nada); el mismo
 *    para toda entidad, sin el modelo ni un meta. Donde el borrado exige además
 *    el permiso de lectura (lee el registro antes de borrarlo), la consulta
 *    también. La consulta responde solo por las entidades que se borran por su
 *    mutación (DELETION_QUERYABLE): por las demás, "no encontrado" sin consultar,
 *    y sus motivos se prueban por el borrado interno (assertNotInUse, el de los
 *    remove anidados y los pipelines). Sin permiso de lectura sobre la raíz:
 *    solo cantidades. Sin permiso de lectura sobre lo que el nombre de la raíz
 *    nombra: sin ese texto. Con alcance por dueño o por rol: solo los nombres
 *    que el usuario ya ve, y cuentas exactas. Con un rol que cruza empresas:
 *    cuentas que suman la verdad, sin contar dos veces.
 * 4. El nombre de la entidad se valida contra la tabla, antes de cualquier
 *    consulta; los caminos y los nombres siguen solo relaciones hacia adelante
 *    de la metadata (SecurePrismaOps no filtra por empresa las inversas).
 * 5. El borrado vuelve a verificar aunque la consulta haya dicho "libre", y los
 *    validadores propios del proyecto corren antes. Contar los motivos sin volver
 *    a buscar el registro exige la prueba que devolvió findDeletable para la
 *    misma entidad, el mismo id, el mismo contexto y la misma transacción; una
 *    prueba pedida sin transacción no saltea nada. En modo sistema, los motivos
 *    van sin nombres ni cantidades.
 * 6. La red de seguridad (la base frena por una relación que la verificación no
 *    vio) no dice de quién es la fila que frena, y el error de la base que
 *    re-lanza el update llega al cliente sin tablas, columnas, SQL, nombres de
 *    restricción ni ids. El resumen que el borrado deja en el log no trae
 *    nombres ni ids.
 *
 * Al empezar, borra lo que pudo dejar una corrida anterior cortada (filas con el
 * prefijo y la columna de sondeo): si no, la corrida siguiente fallaría entera.
 *
 * Lo que no se puede sembrar con Prisma (un campo obligatorio Unsupported, como
 * un vector) se informa y no cuenta; cualquier otra falla de sembrado sí.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { GraphQLError, parse, print } from "graphql";
import { assertSafeTestDatabase } from "../../support/testDatabase";
import { basePrisma } from "../../../src/prisma/client";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { generatedSchemaMetadata } from "../../../src/common/services/schemaMetadata.generated";
import {
  DELETION_BLOCKERS,
  DELETION_BLOCKER_ROOTS,
  DELETION_QUERYABLE,
  DELETION_REQUIRES_RETRIEVE,
  FK_CONSTRAINT_TO_RELATION,
  type DeletionBlockerRelation,
} from "../../../src/common/services/deletionBlockers.generated";
import {
  assertNotInUse,
  findDeletable,
  findDeletionBlockers,
} from "../../../src/common/services/deletionBlockers";
import { deletionBlockersResolvers } from "../../../src/common/resolvers/deletionBlockers";
import { SecurePrismaOps } from "../../../src/common/services/securePrismaOps";
import { ValidationError } from "../../../src/common/errors";
import { RowFactory } from "../support/rowFactory";
import { sign } from "jsonwebtoken";
import { APP_SECRET, createContext } from "../../../src/service-context";

const PREFIX = "DBX_";
/** La columna (y su restricción, `<columna>_fkey`) que agregan los sondeos de la red de seguridad. */
const PROBE = "dbx_probe";
const f = new RowFactory(basePrisma, PREFIX);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const TARGETS = Object.keys(DELETION_BLOCKERS).filter(
  (t) => DELETION_BLOCKERS[t].length > 0
);
const SRC = path.resolve(__dirname, "../../../src/entities");
const serviceFile = (entity: string, kind: "Delete" | "Update") =>
  path.join(
    SRC,
    lower(entity),
    "services",
    lower(entity) + kind + "Service.ts"
  );
const metaOf = (model: string): any =>
  generatedSchemaMetadata.get(model as any);
/** Cada relación de la tabla con su entidad. */
const PAIRS = Object.entries(DELETION_BLOCKERS).flatMap(([target, relations]) =>
  relations.map((relation) => ({ target, relation }))
);
/** Las raíces cuyo nombre usa la consulta: las de las referencias, con nombre visible. */
const NAMED_ROOTS = [
  ...new Set(
    PAIRS.filter(
      ({ relation }) =>
        relation.kind === "reference" &&
        !!DELETION_BLOCKER_ROOTS[relation.rootEntity]?.display
    ).map(({ relation }) => relation.rootEntity)
  ),
];
/**
 * El select del nombre de una raíz (<raíz>DisplayIdFragments), leído al cargar
 * el archivo del mismo módulo que carga la consulta: it.each lo necesita antes de
 * correr, y la consulta lo carga con un import dinámico. Un it comprueba que es el
 * mismo objeto.
 */
function displayFragments(root: string): Record<string, any> | undefined {
  const file = path.join(SRC, lower(root), "resolvers", "displayId.ts");
  return fs.existsSync(file)
    ? require(file)[lower(root) + "DisplayIdFragments"]
    : undefined;
}
/**
 * Los nombres de raíz que siguen una referencia a otro modelo, uno por relación
 * anidada con algún campo de texto: la raíz, el campo, el modelo que nombra, sus
 * campos de texto y las relaciones de la tabla que llegan a esa raíz.
 */
const NESTED_NAMES = NAMED_ROOTS.flatMap((root) =>
  Object.entries(displayFragments(root) ?? {}).flatMap(([field, v]) => {
    const rel = metaOf(root)?.relations?.get(field);
    const link = f.model(root).fields.find((x) => x.name === field)?.relation;
    if (
      !v?.select ||
      !rel ||
      rel.relatedModelName === root ||
      link?.fields.length !== 1
    )
      return [];
    const texts = Object.keys(v.select).filter(
      (name) =>
        v.select[name] === true &&
        f
          .model(rel.relatedModelName)
          .fields.some(
            (x) => x.name === name && x.type === "String" && !x.relation
          )
    );
    if (texts.length === 0) return [];
    return [
      {
        root,
        field,
        model: rel.relatedModelName as string,
        texts,
        relations: PAIRS.filter(
          ({ relation }) =>
            relation.kind === "reference" && relation.rootEntity === root
        ),
      },
    ];
  })
);
/** Un rol que cruza empresas sin pedirlo ("always") sobre algún modelo: el primero que declara la metadata. */
const CROSS_ROLE: string | undefined = [...generatedSchemaMetadata.values()]
  .map((m: any) => m.crossTenantForRoles)
  .find((c: any) => c?.mode === "always")?.roles?.[0];
/** El segundo rol del usuario con dos roles: el primero, distinto de User, con alcance por rol; si no hay, el que cruza empresas. */
const OTHER_ROLE: string | undefined =
  [...generatedSchemaMetadata.values()]
    .flatMap((m: any) => m.userScopedForRoles ?? [])
    .find((r: string) => r !== "User") ?? CROSS_ROLE;

/**
 * Controles de la limpieza previa: filas cuyo id se parece al prefijo sin
 * tenerlo (una letra donde el prefijo tiene "_"), entre ellas una empresa y un
 * usuario de los que cuelgan filas (una con un id neutro). Si la limpieza tomara
 * el prefijo como patrón y no literal, se las llevaría.
 */
const control = new RowFactory(basePrisma, PREFIX.slice(0, -1) + "z_");
const controls: Array<{ model: string; id: string }> = [];
async function seedControls(): Promise<void> {
  // Los que dejó una corrida anterior cortada: solo los ids que siembran ellos.
  await control.purgeSeeded((m) => [
    "ctl-" + control.prefix.toLowerCase() + m.delegate,
  ]);
  const tenant = await control.create("Tenant", { tenant: null });
  const user = await control.create("User", { tenant });
  controls.push({ model: "Tenant", id: tenant }, { model: "User", id: user });
  // Filas de esa empresa, creadas por ese usuario: la primera entidad de empresa con creador que se siembre.
  for (const m of f.models.values()) {
    if (
      m.name === "Tenant" ||
      m.name === "User" ||
      !m.hasTenant ||
      !m.fields.some((x) => x.name === "createdBy_id_")
    )
      continue;
    try {
      const own = { tenant, user };
      controls.push({ model: m.name, id: await control.create(m.name, own) });
      controls.push({
        model: m.name,
        id: await control.create(m.name, own, {
          id: "ctl-" + control.prefix.toLowerCase() + m.delegate,
        }),
      });
      break;
    } catch {
      // No se siembra: la siguiente.
    }
  }
}

const ids: Record<string, string> = {};
let store: SchemaMetadataStore;
let ALL: string[] = [];
const notSeedable: string[] = [];
/** Los casos que eligieron las pruebas que toman el primero de una forma: se informan al final. */
const chosen: string[] = [];

type Ctx = {
  tenant: string | null;
  user: string | null;
  permissions: string[];
  roles?: string[];
  /** Modo sistema: sin filtros de empresa, de dueño ni de permisos. */
  system?: boolean;
  /** El cliente de Prisma del contexto (por defecto, el de la app). */
  prisma?: any;
};
const context = (c: Ctx): any => {
  const set = new Set(c.permissions);
  const roles = c.roles ?? ["User"];
  return {
    prisma: c.prisma ?? basePrisma,
    // Como el contexto real: el usuario trae su empresa (los borrados con archivos la usan).
    currentUser: c.user
      ? {
          id: c.user,
          tenant_id_: c.tenant,
          tenant_: { id: c.tenant },
          roles: roles.map((id) => ({ id, permissions: [] })),
        }
      : null,
    permissions: () => set,
    hasRole: (...r: string[]) => r.some((x) => roles.includes(x)),
    isSystemMode: !!c.system,
    req: {},
  };
};
const ctxA = (permissions = ALL) =>
  context({ tenant: ids.A, user: ids.uA, permissions });
const ctxB = (permissions = ALL) =>
  context({ tenant: ids.B, user: ids.uB, permissions });
const systemContexts = (): Array<[string, any]> => [
  [
    "modo sistema con empresa",
    context({ tenant: ids.A, user: ids.uA, permissions: [], system: true }),
  ],
  [
    "modo sistema sin empresa",
    context({ tenant: null, user: null, permissions: [], system: true }),
  ],
];
const without = (all: string[], removed: string[]) =>
  all.filter((p) => !removed.includes(p));

/**
 * Un usuario de A con dos roles de la base, cada uno con una parte de los
 * permisos (uno, todo menos las lecturas; el otro, solo las lecturas), y su
 * contexto armado por createContext como en un pedido: lee el usuario con sus
 * roles y suma sus permisos. Los permisos que no estén en la base se crean (y se
 * borran al final, con lo sembrado); los que estén se usan sin tocarlos.
 */
let twoRoles: Promise<{ ctx: any; user: string; roles: string[] }> | null =
  null;
const twoRoleContext = () =>
  (twoRoles ??= (async () => {
    const reads = ALL.filter((p) => p.endsWith("_retrieve"));
    const existing = new Set(
      (
        await basePrisma.permission.findMany({
          where: { id: { in: ALL } },
          select: { id: true },
        })
      ).map((p: { id: string }) => p.id)
    );
    for (const id of ALL)
      if (!existing.has(id))
        await f.create("Permission", { tenant: null, user: ids.uA }, { id });
    const own = { tenant: ids.A, user: ids.uA };
    const roles = [await f.create("Role", own), await f.create("Role", own)];
    const granted = [without(ALL, reads), reads];
    for (let i = 0; i < roles.length; i++)
      await basePrisma.role.update({
        where: { id: roles[i] },
        data: { permissions: { connect: granted[i].map((id) => ({ id })) } },
      });
    const user = await f.create("User", own);
    await basePrisma.user.update({
      where: { id: user },
      data: { roles: { connect: roles.map((id) => ({ id })) } },
    });
    const token = sign({ userId: user }, APP_SECRET);
    const ctx = await createContext({
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? "Bearer " + token : undefined,
      headers: {},
    } as any);
    return { ctx, user, roles };
  })());

/** El error, reducido a lo que ve el cliente. */
const failure = async (p: Promise<unknown>) => {
  const e: any = await p.then(
    () => null,
    (err) => err
  );
  return {
    type: e?.constructor?.name,
    message: e?.message,
    extensions: e?.extensions,
  };
};

/** El error que lanza `p` (null si no lanza). */
const thrown = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => null,
    (err) => err
  );

const db = (model: string) => (basePrisma as any)[f.model(model).delegate];

/** El id y los textos sintéticos propios de una fila (no sus claves foráneas): si aparecen, se filtró. */
async function fingerprint(model: string, id: string): Promise<string[]> {
  const m = f.model(model);
  const fks = new Set(m.fields.flatMap((x) => x.relation?.fields ?? []));
  const row = await db(model).findUnique({ where: { id } });
  return Object.entries(row ?? {})
    .filter(
      ([k, v]) => !fks.has(k) && typeof v === "string" && v.startsWith(PREFIX)
    )
    .map(([, v]) => v as string);
}

/** Los ids y textos sembrados (todos empiezan con el prefijo) que aparecen en `text`, salvo `allowed`. */
const seededIn = (text: string, allowed: string[] = []) =>
  (text.match(new RegExp(PREFIX + "\\w*", "g")) ?? []).filter(
    (s) => !allowed.includes(s)
  );

/** El nombre de la tabla de un modelo en la base (su @@map en el schema). */
function tableOf(model: string): string {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const block = schema.match(
    new RegExp("^model " + model + " \\{\\n([\\s\\S]*?)\\n\\}", "m")
  );
  if (!block) throw new Error("no está el modelo " + model + " en el schema");
  return block[1].match(/@@map\((?:name:\s*)?"([^"]+)"\)/)?.[1] ?? model;
}

/**
 * Saca la columna de sondeo y su restricción de toda tabla que las tenga: las
 * deja una corrida cortada entre el ALTER y su finally, y el ALTER siguiente
 * fallaría ("already exists").
 */
async function dropProbes(): Promise<void> {
  const tables: Array<{ table_name: string }> =
    await basePrisma.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.table_constraints WHERE table_schema = current_schema() AND constraint_name = $1" +
        " UNION SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = $2",
      PROBE + "_fkey",
      PROBE
    );
  for (const { table_name } of tables) {
    await basePrisma.$executeRawUnsafe(
      'ALTER TABLE "' +
        table_name +
        '" DROP CONSTRAINT IF EXISTS "' +
        PROBE +
        '_fkey"'
    );
    await basePrisma.$executeRawUnsafe(
      'ALTER TABLE "' + table_name + '" DROP COLUMN IF EXISTS "' + PROBE + '"'
    );
  }
}

/** La consulta `deletionBlockers` por su resolver, como la llama Apollo: el error reducido, o la respuesta. */
const query = (args: Record<string, unknown>, ctx: any) =>
  (deletionBlockersResolvers.Query.deletionBlockers as any)(
    undefined,
    args,
    ctx
  );

/**
 * Los motivos por el camino que tiene la entidad: la consulta, si la atiende
 * (DELETION_QUERYABLE: las que se borran por su mutación); si no, el borrado
 * interno (assertNotInUse: los remove anidados de un formulario, los pipelines),
 * que da los mismos motivos en el meta de ENTITY_IN_USE.
 */
async function blockersOf(
  entity: string,
  id: string,
  ctx: any,
  tx?: any
): Promise<any> {
  if (DELETION_QUERYABLE.includes(entity))
    return findDeletionBlockers(entity, id, ctx, tx, store);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    await assertNotInUse(entity, id, ctx, tx, store);
    return { entity, id, blocked: false, reasons: [] };
  } catch (error: any) {
    if (error?.extensions?.code === "ENTITY_IN_USE")
      return error.extensions.meta.blockers;
    throw error;
  } finally {
    warn.mockRestore();
  }
}

/** Ids que no son un texto no vacío: un objeto de filtro, un número, una lista, vacío. */
const NOT_TEXT_IDS: unknown[] = [
  5,
  0,
  { not: "" },
  {},
  { in: ["x"] },
  ["x"],
  [],
  "",
  null,
  undefined,
  true,
];

/** Borra por el servicio de borrado generado de la entidad. */
const deleteWith = (
  entity: string,
  id: string,
  ctx: any,
  prisma: any = basePrisma
) => {
  const mod = require(serviceFile(entity, "Delete"));
  return new mod[entity + "DeleteService"](ctx, prisma, store)[
    "delete" + entity
  ]({ id }, { id: true });
};

/**
 * Corre `run` con los validadores propios del proyecto (y sus hooks de después
 * del update) de esas entidades apartados: lo que se prueba es lo genérico.
 */
async function generic<T>(
  entities: string[],
  run: () => Promise<T>
): Promise<T> {
  const saved: Array<[any, string, unknown]> = [];
  for (const entity of entities)
    for (const file of ["customValidations", "afterUpdate"]) {
      const full = path.join(SRC, lower(entity), "services", file + ".ts");
      if (!fs.existsSync(full)) continue;
      const mod = require(full);
      for (const k of Object.keys(mod)) {
        if (
          typeof mod[k] === "function" &&
          Object.getOwnPropertyDescriptor(mod, k)?.configurable
        ) {
          saved.push([mod, k, mod[k]]);
          delete mod[k];
        }
      }
    }
  try {
    return await run();
  } finally {
    for (const [mod, k, v] of saved) mod[k] = v;
  }
}

/**
 * El cliente de Prisma, anotando en `log` cada consulta: las de los modelos
 * (`modelo.método`) y las operaciones `$`, también las de adentro de una
 * transacción (con `tx.` adelante).
 */
function recording(log: string[], client: any = basePrisma, prefix = ""): any {
  const delegates = new Set([...f.models.values()].map((m) => m.delegate));
  return new Proxy(client, {
    get(target: any, key: string | symbol) {
      const value = target[key];
      if (typeof key !== "string") return value;
      if (key === "$transaction" && typeof value === "function")
        return (arg: any, options?: unknown) => {
          log.push(prefix + key);
          return typeof arg === "function"
            ? value.call(
                target,
                (tx: any) => arg(recording(log, tx, "tx.")),
                options
              )
            : value.call(target, arg, options);
        };
      if (key.startsWith("$") && typeof value === "function")
        return (...args: unknown[]) => {
          log.push(prefix + key);
          return value.apply(target, args);
        };
      if (delegates.has(key) && value)
        return new Proxy(value, {
          get(delegate: any, method: string | symbol) {
            const fn = delegate[method];
            return typeof fn === "function"
              ? (...args: unknown[]) => {
                  log.push(prefix + key + "." + String(method));
                  return fn.apply(delegate, args);
                }
              : fn;
          },
        });
      return value;
    },
  });
}

let productionFormat: ((formatted: unknown, error: unknown) => any) | null =
  null;
/**
 * Lo que recibe el cliente: el error pasado por el formatError de Apollo de
 * src/server.ts, como en producción. Importar server.ts levanta el server
 * entero, así que la función se toma del archivo (el mismo código, sin lo
 * demás) y corre con NODE_ENV=production.
 */
function asClient(error: any): any {
  if (!productionFormat) {
    const file = path.resolve(__dirname, "../../../src/server.ts");
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );
    // La propiedad formatError del objeto que recibe `new ApolloServer(...)`, como
    // función o como método: no otra que se llame igual en el archivo.
    let text = "";
    const visit = (node: ts.Node): void => {
      if (
        !text &&
        ts.isNewExpression(node) &&
        /(^|\.)ApolloServer$/.test(node.expression.getText(source)) &&
        node.arguments?.[0] &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        const property = node.arguments[0].properties.find(
          (p) => p.name?.getText(source) === "formatError"
        );
        if (
          property &&
          (ts.isMethodDeclaration(property) ||
            (ts.isPropertyAssignment(property) &&
              (ts.isArrowFunction(property.initializer) ||
                ts.isFunctionExpression(property.initializer))))
        )
          text = property.getText(source);
      }
      if (!text) ts.forEachChild(node, visit);
    };
    visit(source);
    if (!text)
      throw new Error(
        "no está el formatError de new ApolloServer(...) en src/server.ts"
      );
    const js = ts.transpileModule(
      "module.exports = ({ " + text + " }).formatError;",
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.CommonJS,
        },
      }
    ).outputText;
    const mod: { exports: any } = { exports: null };
    // Lo único que usa de afuera: process.env (el de producción) y console.
    new Function("module", "process", "console", js)(
      mod,
      { env: { NODE_ENV: "production" } },
      console
    );
    productionFormat = mod.exports;
  }
  // Como lo arma graphql-js con lo que lanzó un resolver.
  const located = new GraphQLError(String(error?.message), {
    originalError: error,
    path: ["borrado"],
  });
  return JSON.parse(
    JSON.stringify(productionFormat!(located.toJSON(), located))
  );
}

/** El registro a borrar, en A (o global, o una empresa nueva si es Tenant). */
async function seedTarget(
  target: string
): Promise<{ id: string; tenant: string | null; user: string }> {
  if (target === "Tenant") {
    // Sin usuarios propios: un usuario de la empresa ya la usaría.
    const tenant = await f.create("Tenant", { tenant: null });
    return { id: tenant, tenant, user: ids.uA };
  }
  const global = !f.model(target).hasTenant;
  const id = await f.create(target, {
    tenant: global ? null : ids.A,
    user: ids.uA,
  });
  return { id, tenant: global ? null : ids.A, user: ids.uA };
}

/**
 * Una raíz que usa el registro: su empresa (null si es global), quién la creó, y
 * cada camino hasta la fila que referencia, con el modelo y la empresa de cada
 * fila debajo de la raíz (null: sin empresa). SecurePrismaOps filtra por empresa
 * en cada nivel del camino, no solo en la raíz, salvo en un modelo que cruza
 * empresas para el rol de quien mira.
 */
type Level = { model: string; tenant: string | null };
type Chain = {
  relation: DeletionBlockerRelation;
  rootId: string;
  tenant: string | null;
  creator: string;
  paths: Level[][];
};

/** Siembra una raíz que usa el registro por la relación; null si no se puede. */
async function seedChain(
  relation: DeletionBlockerRelation,
  targetId: string,
  tenant: string,
  user: string
): Promise<{ rootId: string; rowId: string } | null> {
  try {
    return await f.chain(relation, targetId, { tenant, user });
  } catch (error: any) {
    const reason =
      relation.model +
      "." +
      relation.field +
      " (" +
      relation.rootEntity +
      "): " +
      String(error?.message ?? error)
        .split("\n")
        .pop();
    if (!notSeedable.includes(reason)) notSeedable.push(reason);
    return null;
  }
}

/**
 * La verdad, calculada al revés que la consulta: las filas que referencian el
 * registro, y de ahí hacia arriba por los vínculos de subentidad hasta las
 * raíces, con su empresa y su creador. Incluye lo que el sembrado creó de paso
 * (una provincia del país, por ejemplo).
 */
async function rootsOf(
  relation: DeletionBlockerRelation,
  targetId: string
): Promise<Chain[]> {
  const models = [relation.rootEntity];
  for (const step of relation.path)
    models.push(f.parentLink(models[models.length - 1], step).child);
  const tenantOf = async (model: string, rowIds: string[]) => {
    if (!f.model(model).hasTenant)
      return new Map<string, string | null>(rowIds.map((id) => [id, null]));
    const rows = await db(model).findMany({
      where: { id: { in: rowIds } },
      select: { id: true, tenant_id_: true },
    });
    return new Map<string, string | null>(
      rows.map((r: any) => [r.id, r.tenant_id_])
    );
  };
  const leaves: string[] = (
    await db(relation.model).findMany({
      where: { [relation.fk]: targetId },
      select: { id: true },
    })
  ).map((r: any) => r.id);
  // Fila → los caminos que bajan de ella hasta una fila que referencia.
  let current = new Map<string, Level[][]>();
  if (relation.path.length === 0) {
    for (const id of leaves) current.set(id, [[]]);
  } else {
    for (const [id, tenant] of await tenantOf(relation.model, leaves))
      current.set(id, [[{ model: relation.model, tenant }]]);
  }
  for (let i = relation.path.length - 1; i >= 0; i--) {
    const link = f.parentLink(models[i], relation.path[i]);
    const children = await db(models[i + 1]).findMany({
      where: { id: { in: [...current.keys()] } },
      select: { id: true, [link.fk]: true },
    });
    const parents = children
      .map((c: any) => c[link.fk])
      .filter((x: unknown): x is string => typeof x === "string");
    // La raíz no cuenta acá: su empresa se mira aparte.
    const own =
      i > 0
        ? await tenantOf(models[i], parents)
        : new Map<string, string | null>();
    const next = new Map<string, Level[][]>();
    for (const c of children) {
      const parent = c[link.fk];
      if (typeof parent !== "string") continue;
      const paths = next.get(parent) ?? [];
      for (const levels of current.get(c.id) ?? [])
        paths.push(
          i > 0
            ? [...levels, { model: models[i], tenant: own.get(parent) ?? null }]
            : levels
        );
      next.set(parent, paths);
    }
    current = next;
  }
  const root = f.model(relation.rootEntity);
  const select: Record<string, boolean> = { id: true };
  if (root.hasTenant) select.tenant_id_ = true;
  if (root.fields.some((x) => x.name === "createdBy_id_"))
    select.createdBy_id_ = true;
  const rows = await db(relation.rootEntity).findMany({
    where: { id: { in: [...current.keys()] } },
    select,
  });
  return rows.map((r: any) => ({
    relation,
    rootId: r.id,
    tenant: r.tenant_id_ ?? null,
    creator: r.createdBy_id_ ?? "",
    paths: current.get(r.id) ?? [],
  }));
}

async function truth(
  relations: DeletionBlockerRelation[],
  targetId: string
): Promise<Chain[]> {
  const out: Chain[] = [];
  for (const r of relations) out.push(...(await rootsOf(r, targetId)));
  return out;
}

// Un motivo por tipo y raíz: la consulta agrupa las relaciones con la misma raíz.
const key = (r: { kind: string; rootEntity: string }) =>
  r.kind + " ← " + r.rootEntity;
const keyOf = (r: DeletionBlockerRelation) => r.kind + " ← " + r.rootEntity;

/**
 * Si un usuario con esos roles ve la raíz en la app, según la metadata de su
 * modelo: empresa (o global, o un rol que cruza empresas), y alcance por dueño
 * o por rol (compara el creador de la raíz con el usuario).
 */
function canSee(
  c: Chain,
  tenant: string,
  user: string,
  roles: string[] = ["User"]
): boolean {
  const meta: any =
    generatedSchemaMetadata.get(c.relation.rootEntity as any) ?? {};
  const crosses =
    meta.crossTenantForRoles?.mode === "always" &&
    roles.some((r) => meta.crossTenantForRoles.roles.includes(r));
  // Como SecurePrismaOps: el alcance por rol corre si todos los roles del usuario lo tienen.
  const scoped =
    !!meta.ownerScoped ||
    (roles.length > 0 &&
      roles.every((r) => (meta.userScopedForRoles ?? []).includes(r)));
  // Debajo de la raíz: cada nivel de algún camino es sin empresa, de la empresa
  // del usuario, o de un modelo que cruza empresas para su rol.
  const crossesAt = (model: string) => {
    const cross: any = metaOf(model)?.crossTenantForRoles;
    return (
      cross?.mode === "always" && roles.some((r) => cross.roles.includes(r))
    );
  };
  const nested = c.paths.some((levels) =>
    levels.every(
      (l) => l.tenant === null || l.tenant === tenant || crossesAt(l.model)
    )
  );
  return (
    (c.tenant === null || c.tenant === tenant || crosses) &&
    (!scoped || c.creator === user) &&
    nested
  );
}

/**
 * Lo que un usuario tiene que ver de cada motivo (tipo y raíz): raíces distintas,
 * aunque usen el registro por varias relaciones; una raíz se ve si alguno de sus
 * caminos se ve. `names` false: sin permiso de lectura.
 */
function expected(
  chains: Chain[],
  tenant: string,
  user: string,
  names = true,
  roles: string[] = ["User"]
) {
  const roots = new Map<
    string,
    Map<string, { visible: boolean; tenant: string | null }>
  >();
  for (const c of chains) {
    const k = keyOf(c.relation);
    const byRoot = roots.get(k) ?? new Map();
    const seen = names && canSee(c, tenant, user, roles);
    byRoot.set(c.rootId, {
      visible: (byRoot.get(c.rootId)?.visible ?? false) || seen,
      tenant: c.tenant,
    });
    roots.set(k, byRoot);
  }
  const out = new Map<
    string,
    { visible: string[]; hiddenInTenant: number; otherTenants: number }
  >();
  for (const [k, byRoot] of roots) {
    const e = { visible: [] as string[], hiddenInTenant: 0, otherTenants: 0 };
    for (const [rootId, r] of byRoot) {
      if (r.visible) e.visible.push(rootId);
      else if (r.tenant === null || r.tenant === tenant) e.hiddenInTenant++;
      else e.otherTenants++;
    }
    out.set(k, e);
  }
  return out;
}

function check(
  result: any,
  wanted: ReturnType<typeof expected>,
  withNames: boolean
) {
  const got = new Map(result.reasons.map((r: any) => [key(r), r]));
  for (const [k, e] of wanted) {
    const r: any = got.get(k);
    expect([k, !!r]).toEqual([k, true]);
    expect([
      k,
      r.visible?.count ?? null,
      r.hiddenInTenant,
      r.otherTenants,
    ]).toEqual([
      k,
      withNames ? e.visible.length : null,
      e.hiddenInTenant,
      e.otherTenants,
    ]);
    if (!withNames) continue;
    const ids = r.visible.items.map((i: any) => i.id);
    // Los nombres salen solo de lo visible, hasta 5, y solo en las referencias con nombre visible.
    expect(ids.every((id: string) => e.visible.includes(id))).toBe(true);
    const named =
      r.kind === "reference" && !!DELETION_BLOCKER_ROOTS[r.rootEntity]?.display;
    expect([k, ids.length]).toEqual([
      k,
      named ? Math.min(5, e.visible.length) : 0,
    ]);
    for (const item of r.visible.items)
      expect(
        item.name === "" || item.name === null || item.name === undefined
      ).toBe(false);
  }
}

beforeAll(async () => {
  assertSafeTestDatabase();
  await seedControls();
  // Lo que dejó una corrida cortada: primero la columna de sondeo (su restricción
  // frenaría el borrado de las filas), después las filas con el prefijo.
  await dropProbes();
  await f.purge();
  store = new SchemaMetadataStore();
  store.build();
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
  if (notSeedable.length)
    console.log(
      "\nrelaciones que Prisma no puede sembrar:\n  " + notSeedable.join("\n  ")
    );
  await f.cleanup();
  await control.cleanup();
  await basePrisma.$disconnect();
}, 300000);

describe("la limpieza previa", () => {
  it("la de los controles borra solo los ids que ellos siembran (<prefijo><Modelo>_<n>): una fila ajena que empieza igual sigue", async () => {
    // Una fábrica con un prefijo propio, y una fila con su prefijo pero no con
    // la forma de sus ids. Como la corrida siguiente: otra fábrica, el mismo
    // prefijo, y su limpieza.
    const probe = new RowFactory(basePrisma, PREFIX.slice(0, -1) + "q_");
    const own = { tenant: ids.A, user: ids.uA };
    let done = "";
    // Una entidad que se siembra sin filas auxiliares (sus relaciones
    // obligatorias son la empresa y el usuario): la fila ajena no depende de
    // nada que la limpieza borre.
    const plain = [...f.models.values()].filter(
      (m) =>
        m.hasTenant &&
        m.name !== "User" &&
        m.fields.every(
          (x) =>
            !x.relation ||
            x.relation.fields.length === 0 ||
            x.optional ||
            x.type === "Tenant" ||
            x.type === "User"
        )
    );
    for (const m of plain) {
      const ajeno = probe.prefix + "ajeno-" + m.delegate;
      try {
        // Lo de una corrida anterior cortada.
        await db(m.name).deleteMany({ where: { id: ajeno } });
        await probe.purgeSeeded();
        const seeded = await probe.create(m.name, own);
        await probe.create(m.name, own, { id: ajeno });
        await new RowFactory(basePrisma, probe.prefix).purgeSeeded();
        const count = (id: string) => db(m.name).count({ where: { id } });
        expect([m.name, await count(seeded), await count(ajeno)]).toEqual([
          m.name,
          0,
          1,
        ]);
        done = m.name;
        break;
      } catch (error: any) {
        if (error?.matcherResult) throw error; // la aserción, no el sembrado
      } finally {
        await db(m.name)
          .deleteMany({ where: { id: ajeno } })
          .catch(() => undefined);
      }
    }
    expect(done).not.toBe("");
  });

  it("borra solo el prefijo literal: los controles que se le parecen (una empresa, un usuario y lo que cuelga de ellos) siguen", async () => {
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const c of controls)
      expect([
        c.model,
        c.id,
        await db(c.model).count({ where: { id: c.id } }),
      ]).toEqual([c.model, c.id, 1]);
  });
});

describe("la entidad se valida contra la tabla", () => {
  it("modelos que no son entidades, claves heredadas y nombres mal escritos: UNKNOWN_ENTITY, sin consultar", async () => {
    const noQueries: any = new Proxy(
      {},
      {
        get: (_t, k) => {
          throw new Error("consultó " + String(k));
        },
      }
    );
    const names = [
      ...[...f.models.keys()].filter((m) => !(m in DELETION_BLOCKERS)),
      "constructor",
      "__proto__",
      "toString",
      lower(TARGETS[0]),
    ];
    for (const entity of names) {
      expect([
        entity,
        await failure(
          findDeletionBlockers(entity, "x", ctxA(), noQueries, store)
        ),
      ]).toEqual([
        entity,
        {
          type: "ValidationError",
          message: "UNKNOWN_ENTITY",
          extensions: {
            code: "UNKNOWN_ENTITY",
            handled: true,
            meta: { code: "UNKNOWN_ENTITY", field: "entity" },
          },
        },
      ]);
    }
  });
});

describe("la tabla y los nombres siguen solo relaciones hacia adelante", () => {
  it("cada paso de los caminos y cada relación anidada de los nombres que usa la consulta está en meta.relations (ninguna inversa)", async () => {
    // SecurePrismaOps acota por empresa y poda por permiso solo lo que está en
    // meta.relations: una relación inversa en un camino o en el select del
    // nombre pasaría sin esos filtros.
    const forward = (model: string, field: string) =>
      metaOf(model)?.relations?.get(field);
    const problems: string[] = [];
    for (const [target, relations] of Object.entries(DELETION_BLOCKERS)) {
      for (const r of relations) {
        const label = target + " ← " + r.model + "." + r.field;
        let model = r.rootEntity;
        for (let i = 0; i < r.path.length && model; i++) {
          const rel = forward(model, r.path[i]);
          if (!rel) {
            problems.push(
              label +
                ": " +
                model +
                "." +
                r.path[i] +
                " no está en meta.relations"
            );
            model = "";
          } else {
            if (rel.isList !== r.pathMany[i])
              problems.push(
                label +
                  ": " +
                  model +
                  "." +
                  r.path[i] +
                  " isList " +
                  rel.isList +
                  ", pathMany " +
                  r.pathMany[i]
              );
            model = rel.relatedModelName;
          }
        }
        if (model && model !== r.model)
          problems.push(label + ": el camino llega a " + model);
      }
    }
    // El select del nombre de cada raíz que la consulta nombra (las referencias).
    const walk = (
      model: string,
      select: Record<string, any>,
      trail: string
    ) => {
      for (const [k, v] of Object.entries(select)) {
        const field = f.model(model).fields.find((x) => x.name === k);
        const relation = !!field && f.models.has(field.type);
        if (!relation && !(v && typeof v === "object")) continue;
        const rel = forward(model, k);
        if (!rel)
          problems.push(trail + "." + k + ": no está en meta.relations");
        else walk(rel.relatedModelName, v?.select ?? {}, trail + "." + k);
      }
    };
    const named = new Set(
      Object.values(DELETION_BLOCKERS)
        .flat()
        .filter((r) => r.kind === "reference")
        .map((r) => r.rootEntity)
    );
    for (const root of named) {
      const display = DELETION_BLOCKER_ROOTS[root]?.display;
      if (display)
        walk(root, (await display()).select as Record<string, any>, root);
    }
    expect(problems).toEqual([]);
  });
});

describe.each(TARGETS)("%s", (target) => {
  const relations = DELETION_BLOCKERS[target];
  let t: { id: string; tenant: string | null; user: string };
  let seeded = 0;
  const global = () => t.tenant === null || target === "Tenant";
  const notFound = async (entity: string, id: string, ctx: any) =>
    failure(blockersOf(entity, id, ctx));

  beforeAll(async () => {
    t = await seedTarget(target);
    for (const r of relations) {
      if (await seedChain(r, t.id, t.tenant ?? ids.A, t.user)) seeded++;
      // Un registro global lo usa también otra empresa.
      if (
        global() &&
        target !== "Tenant" &&
        !r.rootGlobal &&
        (await seedChain(r, t.id, ids.B, ids.uB))
      )
        seeded++;
    }
  }, 300000);

  it("cuentas exactas; nombres solo de lo propio y visible; de otra empresa, ni ids ni textos", async () => {
    const all = await truth(relations, t.id);
    expect(all.length).toBeGreaterThanOrEqual(seeded);
    const result = await blockersOf(target, t.id, ctxA());
    expect(result.blocked).toBe(all.length > 0);
    check(result, expected(all, ids.A, ids.uA), true);
    const text = JSON.stringify(result);
    for (const c of all.filter(
      (x) => x.tenant !== null && x.tenant !== ids.A
    )) {
      expect(text).not.toContain(c.rootId);
      for (const s of await fingerprint(c.relation.rootEntity, c.rootId))
        expect(text).not.toContain(s);
    }
  });

  it("otra empresa: si el registro es suyo, 'no encontrado' igual que un id inexistente; si es global, lo mismo al revés", async () => {
    if (global()) {
      const all = await truth(relations, t.id);
      const result = await blockersOf(target, t.id, ctxB());
      check(result, expected(all, ids.B, ids.uB), true);
      const text = JSON.stringify(result);
      for (const c of all.filter(
        (x) => x.tenant !== null && x.tenant !== ids.B
      ))
        expect(text).not.toContain(c.rootId);
    } else {
      expect(await notFound(target, t.id, ctxB())).toEqual(
        await notFound(target, PREFIX + "no-existe", ctxB())
      );
      expect((await notFound(target, t.id, ctxB())).type).toBe("NotFoundError");
    }
  });

  it("sin permiso de borrado: 'no encontrado', igual que un id inexistente", async () => {
    const ctx = ctxA(without(ALL, [lower(target) + "_delete"]));
    expect(await notFound(target, t.id, ctx)).toEqual(
      await notFound(target, PREFIX + "no-existe", ctxA())
    );
  });

  it("sin permiso de lectura sobre las raíces: solo cantidades", async () => {
    // Si el borrado de la entidad exige leerla, la consulta también: ese permiso
    // queda, y la entidad, si es raíz de sus propios motivos, sigue con nombres.
    const kept = DELETION_REQUIRES_RETRIEVE.includes(target)
      ? lower(target) + "_retrieve"
      : null;
    const roots = Array.from(
      new Set(relations.map((r) => lower(r.rootEntity) + "_retrieve"))
    ).filter((p) => p !== kept);
    if (roots.length === 0) {
      // Su única raíz es la entidad misma, y la consulta exige leerla: no hay
      // raíz sin lectura que probar acá (se verifica con nombres). Se anuncia.
      expect(relations.every((r) => r.rootEntity === target)).toBe(true);
      chosen.push(
        "raíces sin lectura: " +
          target +
          ": su única raíz es la entidad misma, cuyo borrado exige leerla; se verifica con nombres"
      );
    }
    const result = await blockersOf(target, t.id, ctxA(without(ALL, roots)));
    const all = await truth(relations, t.id);
    const readable = (c: Chain) =>
      lower(c.relation.rootEntity) + "_retrieve" === kept;
    check(
      result,
      expected(
        all.filter((c) => !readable(c)),
        ids.A,
        ids.uA,
        false
      ),
      false
    );
    check(result, expected(all.filter(readable), ids.A, ids.uA), true);
  });

  it("alcance por dueño: lo que sembró otro usuario de la empresa es una cantidad, sin nombre", async () => {
    const roots = Array.from(new Set(relations.map((r) => r.rootEntity)));
    let extra = 0;
    for (const r of relations) {
      if (target !== "Tenant" && (await seedChain(r, t.id, ids.A, ids.uA2)))
        extra++;
    }
    const saved = roots.map(
      (root) =>
        [
          root,
          (generatedSchemaMetadata.get(root as any) as any)?.ownerScoped,
        ] as const
    );
    try {
      for (const root of roots) {
        const meta: any = generatedSchemaMetadata.get(root as any);
        if (meta) meta.ownerScoped = true;
      }
      const all = await truth(relations, t.id);
      expect(all.length).toBeGreaterThanOrEqual(seeded + extra);
      const result = await blockersOf(target, t.id, ctxA());
      // Con el alcance por dueño encendido en todas las raíces, canSee lo aplica.
      check(result, expected(all, ids.A, ids.uA), true);
    } finally {
      for (const [root, value] of saved) {
        const meta: any = generatedSchemaMetadata.get(root as any);
        if (meta && value === undefined) delete meta.ownerScoped;
        else if (meta) meta.ownerScoped = value;
      }
    }
  });

  const deleteServiceFile = path.resolve(
    __dirname,
    "../../../src/entities",
    lower(target),
    "services",
    lower(target) + "DeleteService.ts"
  );
  const withDeleteService = fs.existsSync(deleteServiceFile) ? it : it.skip;

  withDeleteService(
    "el borrado vuelve a verificar: libre en la consulta, en uso al confirmar → ENTITY_IN_USE; los validadores del proyecto, antes",
    async () => {
      const t2 = await seedTarget(target);
      const service = () => {
        const mod = require(deleteServiceFile);
        return new mod[target + "DeleteService"](ctxA(), basePrisma, store);
      };
      const validations = require(path.resolve(
        __dirname,
        "../../../src/entities",
        lower(target),
        "services",
        "customValidations"
      ));
      const own = Object.keys(validations).filter(
        (k) =>
          typeof validations[k] === "function" &&
          Object.getOwnPropertyDescriptor(validations, k)?.configurable
      );
      const saved = own.map((k) => [k, validations[k]] as const);
      try {
        // Los del proyecto se apartan: esta parte prueba la verificación genérica.
        for (const k of own) delete validations[k];
        expect((await blockersOf(target, t2.id, ctxA())).blocked).toBe(false);
        let used: DeletionBlockerRelation | null = null;
        for (const r of relations) {
          if (await seedChain(r, t2.id, t2.tenant ?? ids.A, t2.user)) {
            used = r;
            break;
          }
        }
        if (!used) return; // nada sembrable: quedó en el informe
        const error = await failure(
          service()["delete" + target]({ id: t2.id }, { id: true })
        );
        expect([error.type, error.extensions?.code]).toEqual([
          "ValidationError",
          "ENTITY_IN_USE",
        ]);
        expect(error.extensions.meta.blockers.reasons.map(key)).toContain(
          keyOf(used)
        );
        // Un validador del proyecto, agregado al módulo, frena antes que la verificación.
        validations.__deletionBatteryFirst = async () => {
          throw new ValidationError("validador del proyecto primero");
        };
        expect(
          (
            await failure(
              service()["delete" + target]({ id: t2.id }, { id: true })
            )
          ).message
        ).toBe("validador del proyecto primero");
      } finally {
        delete validations.__deletionBatteryFirst;
        for (const [k, v] of saved) validations[k] = v;
      }
      expect(
        await (basePrisma as any)[lower(target)].count({ where: { id: t2.id } })
      ).toBe(1);
    }
  );

  // Un registro global no es de ninguna empresa: no hay "id ajeno" que probar.
  if (target !== "Tenant" && f.model(target).hasTenant)
    withDeleteService(
      "por el servicio de borrado, con los validadores del proyecto puestos: el id de otra empresa da el mismo error que uno inexistente (el de la consulta), con las mismas consultas a la base",
      async () => {
        // Los validadores del proyecto quedan puestos, y se suma uno que responde
        // distinto si el registro existe (lo busca sin el filtro de empresa, como
        // podría hacerlo uno del proyecto): con un registro que el usuario no ve,
        // el borrado no tiene que llegar a correrlos.
        const validations = require(path.join(
          SRC,
          lower(target),
          "services",
          "customValidations"
        ));
        validations.__deletionBatteryOracle = async (args: { id: string }) => {
          if ((await db(target).count({ where: { id: args.id } })) > 0)
            throw new ValidationError("el registro existe en otra empresa");
        };
        try {
          const attempt = async (id: string) => {
            const log: string[] = [];
            const prisma = recording(log);
            const error = await failure(
              deleteWith(
                target,
                id,
                context({
                  tenant: ids.B,
                  user: ids.uB,
                  permissions: ALL,
                  prisma,
                }),
                prisma
              )
            );
            return { error, log };
          };
          const foreign = await attempt(t.id);
          const missing = await attempt(PREFIX + "no-existe");
          // El mismo "no encontrado" que da la consulta.
          expect(missing.error.type).toBe("NotFoundError");
          expect(missing.error).toEqual(
            await failure(
              findDeletionBlockers(
                target,
                PREFIX + "no-existe",
                ctxB(),
                undefined,
                store
              )
            )
          );
          expect(foreign.error).toEqual(missing.error);
          expect(foreign.log).toEqual(missing.log);
        } finally {
          delete validations.__deletionBatteryOracle;
        }
        expect(await db(target).count({ where: { id: t.id } })).toBe(1);
      }
    );

  withDeleteService(
    "por el servicio de borrado, sin permiso de borrado: el UnauthorizedError de siempre, sin ninguna consulta a la base",
    async () => {
      const ctx = (prisma: any) =>
        context({
          tenant: ids.A,
          user: ids.uA,
          permissions: without(ALL, [lower(target) + "_delete"]),
          prisma,
        });
      // El de siempre: el que lanza SecurePrismaOps cuando falta el permiso.
      const usual = await failure(
        Promise.resolve().then(() =>
          new SecurePrismaOps(
            ctx(basePrisma),
            basePrisma,
            store,
            target as any,
            {}
          ).assertCan("delete")
        )
      );
      expect(usual.type).toBe("UnauthorizedError");
      for (const id of [t.id, PREFIX + "no-existe"]) {
        const log: string[] = [];
        const prisma = recording(log);
        expect([
          id,
          await failure(deleteWith(target, id, ctx(prisma), prisma)),
        ]).toEqual([id, usual]);
        expect([id, log]).toEqual([id, []]);
      }
    }
  );

  withDeleteService(
    "por el servicio de borrado, en modo sistema: ENTITY_IN_USE sin nombres ni cantidades, y ningún id ni texto sembrado",
    async () => {
      const all = await truth(relations, t.id);
      if (all.length === 0) return; // nada sembrable: quedó en el informe
      const roots = [...new Set(all.map((c) => keyOf(c.relation)))].sort();
      for (const [mode, ctx] of systemContexts()) {
        const client = asClient(
          await generic([target], () => thrown(deleteWith(target, t.id, ctx)))
        );
        expect([mode, client.extensions?.code]).toEqual([
          mode,
          "ENTITY_IN_USE",
        ]);
        const reasons = client.extensions.meta.blockers.reasons;
        expect([mode, reasons.map(key).sort()]).toEqual([mode, roots]);
        for (const r of reasons)
          expect([
            mode,
            key(r),
            r.visible,
            r.hiddenInTenant,
            r.otherTenants,
          ]).toEqual([mode, key(r), null, null, null]);
        // Solo el id pedido: ningún id ni texto de lo que lo usa.
        expect([mode, seededIn(JSON.stringify(client), [t.id])]).toEqual([
          mode,
          [],
        ]);
      }
      expect(await db(target).count({ where: { id: t.id } })).toBe(1);
    }
  );

  it("por la consulta GraphQL (su resolver): de otra empresa, sin permiso de borrado o sin sesión, lo mismo que un id inexistente; los argumentos de más no llegan a la consulta", async () => {
    const missing = await failure(
      query({ entity: target, id: PREFIX + "no-existe" }, ctxB())
    );
    expect(missing.type).toBe("NotFoundError");
    // El mismo "no encontrado" que la consulta directa.
    expect(missing).toEqual(
      await failure(
        findDeletionBlockers(
          target,
          PREFIX + "no-existe",
          ctxB(),
          undefined,
          store
        )
      )
    );
    const cases: Array<[string, any]> = [
      [
        "sin permiso de borrado",
        ctxA(without(ALL, [lower(target) + "_delete"])),
      ],
    ];
    if (!global()) cases.push(["un usuario de otra empresa", ctxB()]);
    for (const [label, ctx] of cases)
      expect([
        label,
        await failure(query({ entity: target, id: t.id }, ctx)),
      ]).toEqual([label, missing]);
    // Un pedido sin sesión (modo usuario, sin usuario): sin consultar nada.
    const log: string[] = [];
    const prisma = recording(log);
    expect(
      await failure(
        query(
          { entity: target, id: t.id },
          context({ tenant: null, user: null, permissions: [], prisma })
        )
      )
    ).toEqual(missing);
    expect(log).toEqual([]);
    // Un store o una transacción entre los argumentos no llegan a la consulta (la
    // respuesta, o el "no encontrado" de una entidad que la consulta no atiende).
    const poison = new Proxy(
      {},
      {
        get: (_t, k) => {
          throw new Error("usó " + String(k));
        },
      }
    );
    const settle = (p: Promise<unknown>) =>
      p.then(
        (ok) => ({ ok }),
        (error) => failure(Promise.reject(error))
      );
    expect(
      await settle(
        query({ entity: target, id: t.id, store: poison, tx: poison }, ctxA())
      )
    ).toEqual(await settle(query({ entity: target, id: t.id }, ctxA())));
  });

  it("un id que no es un texto: por la consulta y por su resolver, lo mismo que un id inexistente, sin consultar", async () => {
    const missing = await failure(
      findDeletionBlockers(
        target,
        PREFIX + "no-existe",
        ctxA(),
        undefined,
        store
      )
    );
    expect(missing.type).toBe("NotFoundError");
    for (const id of NOT_TEXT_IDS) {
      const label = String(JSON.stringify(id));
      for (const via of ["consulta", "resolver"]) {
        const log: string[] = [];
        const prisma = recording(log);
        const ctx = context({
          tenant: ids.A,
          user: ids.uA,
          permissions: ALL,
          prisma,
        });
        const error = await failure(
          via === "consulta"
            ? findDeletionBlockers(target, id as any, ctx, prisma, store)
            : query({ entity: target, id }, ctx)
        );
        expect([via, label, error, log]).toEqual([via, label, missing, []]);
      }
    }
  });

  withDeleteService(
    "el resumen que el borrado deja en el log: entidades y cantidades, sin nombres ni ids sembrados (salvo el pedido)",
    async () => {
      const all = await truth(relations, t.id);
      if (all.length === 0) return; // nada sembrable: quedó en el informe
      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      try {
        for (const [mode, ctx] of [
          ["modo usuario", ctxA()],
          ...systemContexts(),
        ] as Array<[string, any]>) {
          warn.mockClear();
          await generic([target], () => thrown(deleteWith(target, t.id, ctx)));
          const lines = warn.mock.calls
            .map((args) => args.map(String).join(" "))
            .filter((line) => line.startsWith("[deletionBlockers]"));
          expect([mode, lines.length]).toEqual([mode, 1]);
          expect([mode, seededIn(lines.join("\n"), [t.id])]).toEqual([
            mode,
            [],
          ]);
        }
      } finally {
        warn.mockRestore();
      }
    }
  );

  /**
   * Las cuentas y los nombres de un contexto con esos roles, contra la verdad:
   * cada raíz una sola vez (a la vista, oculta en la empresa o de otra), y cada
   * nombre de una raíz que ese contexto lee por SecurePrismaOps.
   */
  const expectTruthFor = async (
    ctx: any,
    roles: string[],
    user: string = ids.uA
  ) => {
    const all = await truth(relations, t.id);
    const result: any = await blockersOf(target, t.id, ctx);
    check(result, expected(all, ids.A, user, true, roles), true);
    for (const r of result.reasons) {
      const roots = new Set(
        all.filter((c) => keyOf(c.relation) === key(r)).map((c) => c.rootId)
      );
      expect([
        key(r),
        r.visible.count + r.hiddenInTenant + r.otherTenants,
      ]).toEqual([key(r), roots.size]);
      for (const item of r.visible.items) {
        const seen = await new SecurePrismaOps(
          ctx,
          basePrisma,
          store,
          r.rootEntity as any,
          {}
        ).findFirst({ where: { id: item.id }, select: { id: true } });
        expect([key(r), item.id, seen?.id]).toEqual([key(r), item.id, item.id]);
      }
    }
  };

  if (CROSS_ROLE)
    it(
      "con un rol que cruza empresas (" +
        CROSS_ROLE +
        "): las cuentas suman la verdad sin contar dos veces, y los nombres son de lo que ese rol ve",
      async () => {
        const roles = [CROSS_ROLE];
        await expectTruthFor(
          context({ tenant: ids.A, user: ids.uA, permissions: ALL, roles }),
          roles
        );
      }
    );

  if (OTHER_ROLE)
    it(
      "un usuario con dos roles con alcance distinto (User y " +
        OTHER_ROLE +
        "), con todos los permisos: cuentas y nombres como la verdad",
      async () => {
        // El alcance por rol corre solo si todos los roles del usuario lo tienen.
        const roles = ["User", OTHER_ROLE];
        await expectTruthFor(
          context({ tenant: ids.A, user: ids.uA, permissions: ALL, roles }),
          roles
        );
      }
    );

  it("un usuario con dos roles de la base, cada uno con una parte de los permisos: createContext los suma, como en un pedido; cuentas y nombres como la verdad", async () => {
    const { ctx, user, roles } = await twoRoleContext();
    // Sumados, todos: con uno solo de los dos no habría borrado o no habría lectura.
    expect([...ctx.permissions()].sort()).toEqual([...ALL].sort());
    await expectTruthFor(ctx, roles, user);
  });

  it("un usuario sin empresa (en la app todo usuario tiene una): si la consulta responde, es la verdad; si no, falla cerrada, sin datos", async () => {
    const ctx = context({ tenant: null, user: ids.uA, permissions: ALL });
    const outcome = await blockersOf(target, t.id, ctx).then(
      (result: any) => ({ result, error: null as any }),
      (error: any) => ({ result: null as any, error })
    );
    if (outcome.error) {
      // SecurePrismaOps no acota por empresa sin una: lanza, y el cliente
      // recibe un error interno, sin ningún id ni texto sembrado.
      const client = asClient(outcome.error);
      expect([
        client.extensions?.code,
        seededIn(JSON.stringify(client)),
        seededIn(String(outcome.error?.message)),
      ]).toEqual(["INTERNAL_SERVER_ERROR", [], []]);
    } else {
      check(
        outcome.result,
        expected(await truth(relations, t.id), null as any, ids.uA),
        true
      );
    }
  });
});

describe("el nombre que sigue una referencia", () => {
  it("los selects de nombre que recorre la batería son los que usa la consulta", async () => {
    for (const root of NAMED_ROOTS) {
      const select = (await DELETION_BLOCKER_ROOTS[root].display!()).select;
      expect([root, select === displayFragments(root)]).toEqual([root, true]);
    }
  });

  if (NESTED_NAMES.length === 0)
    it("ningún nombre de raíz sigue una referencia a otro modelo en este proyecto: no hay poda que probar", () => {
      expect(NESTED_NAMES).toEqual([]);
    });
  else
    it.each(
      NESTED_NAMES.map(
        (n) => [n.root + "." + n.field + " (" + n.model + ")", n] as const
      )
    )(
      "%s: sin permiso de lectura sobre el modelo que nombra, su texto no sale; el motivo cuenta igual",
      async (label, n) => {
        // Si el modelo que nombra es la entidad consultada y su borrado exige
        // leerla, sin ese permiso la consulta no responde: esas relaciones van
        // al final, y solo se usan si no hay otra.
        const unanswered = (target: string) =>
          target === n.model && DELETION_REQUIRES_RETRIEVE.includes(target);
        const candidates = [...n.relations].sort(
          (a, b) => Number(unanswered(a.target)) - Number(unanswered(b.target))
        );
        // La primera relación de la tabla que llega a esta raíz y se siembra.
        for (const { target, relation } of candidates) {
          const t = await seedTarget(target);
          // En A, creada por quien mira: la raíz se ve con su nombre.
          const chain = await seedChain(relation, t.id, ids.A, ids.uA);
          if (!chain) continue;
          // La fila que el nombre nombra: una nueva (o el registro mismo, si es
          // la relación que lo usa), con textos propios en los campos del nombre.
          const link = f.model(n.root).fields.find((x) => x.name === n.field)!;
          const own = relation.path.length === 0 && relation.field === n.field;
          const namedId = own
            ? t.id
            : await f.create(n.model, {
                tenant: f.model(n.model).hasTenant ? ids.A : null,
                user: ids.uA,
              });
          if (!own)
            await db(n.root).update({
              where: { id: chain.rootId },
              data: { [link.relation!.fields[0]]: namedId },
            });
          const planted = n.texts.map(
            (x) => PREFIX + "NOMBRE_" + x + "_" + namedId
          );
          await db(n.model).update({
            where: { id: namedId },
            data: Object.fromEntries(n.texts.map((x, i) => [x, planted[i]])),
          });
          const reasonOf = (result: any) =>
            result.reasons.find((r: any) => key(r) === keyOf(relation));
          const full = await blockersOf(target, t.id, ctxA());
          // Con todos los permisos, el nombre muestra el texto: si no, el caso no prueba nada.
          const shown = JSON.stringify(reasonOf(full)?.visible?.items ?? []);
          expect([label, planted.some((p) => shown.includes(p))]).toEqual([
            label,
            true,
          ]);
          if (unanswered(target)) {
            // Ni el texto ni el motivo: "no encontrado", como un id inexistente.
            expect([
              label,
              await failure(
                blockersOf(
                  target,
                  t.id,
                  ctxA(without(ALL, [lower(n.model) + "_retrieve"]))
                )
              ),
            ]).toEqual([
              label,
              await failure(blockersOf(target, PREFIX + "no-existe", ctxA())),
            ]);
            chosen.push(
              "nombre podado: " +
                label +
                ", por " +
                target +
                " ← " +
                relation.model +
                "." +
                relation.field +
                ": sin leer " +
                target +
                ", la consulta responde 'no encontrado'"
            );
            return;
          }
          const pruned = await blockersOf(
            target,
            t.id,
            ctxA(without(ALL, [lower(n.model) + "_retrieve"]))
          );
          const text = JSON.stringify(pruned);
          for (const p of planted)
            expect([label, p, text.includes(p)]).toEqual([label, p, false]);
          // El mismo motivo, con las mismas raíces y las mismas cuentas, y exacto
          // contra la verdad calculada al revés.
          const summary = (r: any) => [
            r?.visible?.count,
            r?.visible?.items.map((i: any) => i.id),
            r?.hiddenInTenant,
            r?.otherTenants,
          ];
          expect([label, summary(reasonOf(pruned))]).toEqual([
            label,
            summary(reasonOf(full)),
          ]);
          const group = DELETION_BLOCKERS[target].filter(
            (r) => keyOf(r) === keyOf(relation)
          );
          check(
            pruned,
            expected(await truth(group, t.id), ids.A, ids.uA),
            true
          );
          chosen.push(
            "nombre podado: " +
              label +
              ", sembrado por " +
              target +
              " ← " +
              relation.model +
              "." +
              relation.field +
              (DELETION_QUERYABLE.includes(target)
                ? ""
                : " (por el borrado interno: la consulta no atiende " +
                  target +
                  ")")
          );
          return;
        }
        // Ninguna se sembró: quedó en el informe (la cobertura lo juzga).
      }
    );
});

describe("la consulta GraphQL", () => {
  it("el SDL emitido la declara una sola vez, exactamente: deletionBlockers(entity: String!, id: ID!): DeletionBlockers!", () => {
    // Todos los .graphql del server: Query se extiende en varios.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }))
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith(".graphql"))
          files.push(path.join(dir, e.name));
    };
    walk(path.resolve(__dirname, "../../../src"));
    const declared = files.flatMap((file) =>
      parse(fs.readFileSync(file, "utf8")).definitions.flatMap((d: any) =>
        (d.kind === "ObjectTypeDefinition" ||
          d.kind === "ObjectTypeExtension") &&
        d.name.value === "Query"
          ? (d.fields ?? [])
              .filter((x: any) => x.name.value === "deletionBlockers")
              .map((x: any) => print(x))
          : []
      )
    );
    expect(declared).toEqual([
      "deletionBlockers(entity: String!, id: ID!): DeletionBlockers!",
    ]);
  });

  it("'no encontrado' es el mismo para toda entidad, y el cliente lo recibe sin el modelo, sin el id y sin meta (muestra su texto genérico)", async () => {
    const entities = Object.keys(DELETION_BLOCKERS);
    const raw = await thrown(
      findDeletionBlockers(
        entities[0],
        PREFIX + "no-existe",
        ctxA(),
        undefined,
        store
      )
    );
    const missing = await failure(Promise.reject(raw));
    expect(missing.type).toBe("NotFoundError");
    expect(missing.extensions).toEqual({ code: "NOT_FOUND", handled: true });
    expect(missing.extensions.meta).toBeUndefined();
    expect(asClient(raw)).toEqual({
      message: missing.message,
      extensions: { code: "NOT_FOUND" },
    });
    for (const entity of entities) {
      const error = await failure(
        findDeletionBlockers(
          entity,
          PREFIX + "no-existe",
          ctxA(),
          undefined,
          store
        )
      );
      expect([entity, error, error.message.includes(entity)]).toEqual([
        entity,
        missing,
        false,
      ]);
    }
  });
});

describe("una relación de auditoría sobre una raíz con alcance por rol", () => {
  it("cuentas exactas: lo que creó (o tiene en su empresa) el usuario que mira no se confunde con lo que usa el registro", async () => {
    // SecurePrismaOps agrega el creador por el rol del usuario como una clave
    // más del where: es la misma columna que la relación de auditoría.
    const shapes = TARGETS.flatMap((target) =>
      DELETION_BLOCKERS[target]
        .filter(
          (r) =>
            r.kind === "audit" &&
            !metaOf(r.rootEntity)?.ownerScoped &&
            (metaOf(r.rootEntity)?.userScopedForRoles ?? []).length > 0
        )
        .map((relation) => ({ target, relation }))
    );
    if (shapes.length === 0) {
      console.log(
        "\nninguna relación de auditoría llega a una raíz con alcance por rol en este proyecto"
      );
      return;
    }
    let exercised = 0;
    for (const { target, relation } of shapes) {
      const roles = [metaOf(relation.rootEntity).userScopedForRoles[0]];
      const t = await seedTarget(target);
      if (!(await seedChain(relation, t.id, t.tenant ?? ids.A, ids.uA)))
        continue;
      // Lo mismo, pero apuntando al usuario (o la empresa) de quien mira: es lo
      // que contaría una condición pisada por la del usuario.
      if (
        !(await seedChain(
          relation,
          target === "Tenant" ? ids.A : ids.uA,
          ids.A,
          ids.uA
        ))
      )
        continue;
      const group = DELETION_BLOCKERS[target].filter(
        (r) => keyOf(r) === keyOf(relation)
      );
      const result = await blockersOf(
        target,
        t.id,
        context({ tenant: ids.A, user: ids.uA, permissions: ALL, roles })
      );
      check(
        result,
        expected(await truth(group, t.id), ids.A, ids.uA, true, roles),
        true
      );
      exercised++;
      chosen.push(
        "auditoría con alcance por rol " +
          roles[0] +
          ": " +
          target +
          " ← " +
          relation.model +
          "." +
          relation.field
      );
    }
    expect(exercised).toBeGreaterThan(0);
  });
});

describe("la red de seguridad", () => {
  it("no dice de quién es la fila que frena: el mismo error si es de la empresa del usuario o de otra, en modo usuario y en modo sistema", async () => {
    // Una entidad de empresa con servicio de borrado que se pueda sembrar. La
    // relación que frena es una columna agregada a su tabla, que la verificación
    // no conoce (no está en DELETION_BLOCKERS) y la tabla de claves foráneas sí.
    let target = "";
    const rows: Record<string, string> = {};
    for (const candidate of Object.keys(DELETION_BLOCKERS)) {
      if (
        candidate === "User" ||
        candidate === "Tenant" ||
        // Una híbrida puede ser de todas las empresas: el caso dejaría de ser entre empresas.
        !!metaOf(candidate)?.hybridTenantFlagField ||
        !f.model(candidate).hasTenant ||
        !fs.existsSync(serviceFile(candidate, "Delete"))
      )
        continue;
      try {
        const inA = { tenant: ids.A, user: ids.uA };
        rows.own = await f.create(candidate, inA);
        rows.ownBlocker = await f.create(candidate, inA);
        rows.cross = await f.create(candidate, inA);
        rows.crossBlocker = await f.create(candidate, {
          tenant: ids.B,
          user: ids.uB,
        });
        target = candidate;
        break;
      } catch {
        // No se siembra: la siguiente.
      }
    }
    expect(target).not.toBe("");
    chosen.push("red de seguridad: " + target);
    const table = tableOf(target);
    const constraint = PROBE + "_fkey";
    const modes: Array<[string, any]> = [
      ["modo usuario", ctxA()],
      ...systemContexts(),
    ];
    for (const action of ["RESTRICT", "NO ACTION"]) {
      await basePrisma.$executeRawUnsafe(
        'ALTER TABLE "' +
          table +
          '" ADD COLUMN "' +
          PROBE +
          '" text CONSTRAINT "' +
          constraint +
          '" REFERENCES "' +
          table +
          '"("id") ON DELETE ' +
          action
      );
      FK_CONSTRAINT_TO_RELATION[constraint] = {
        target,
        relations: [
          {
            kind: "reference",
            model: target,
            field: "dbxProbe",
            fk: PROBE,
            constraint,
            path: [],
            pathMany: [],
            rootEntity: target,
            rootGlobal: false,
          },
        ],
      };
      try {
        const point = (from: string, to: string) =>
          basePrisma.$executeRawUnsafe(
            'UPDATE "' + table + '" SET "' + PROBE + '" = $1 WHERE "id" = $2',
            to,
            from
          );
        await point(rows.ownBlocker, rows.own);
        await point(rows.crossBlocker, rows.cross);
        const seen: Array<[string, any]> = [];
        for (const [who, id] of [
          ["la fila que frena es de la empresa", rows.own],
          ["la fila que frena es de otra empresa", rows.cross],
        ])
          for (const [mode, ctx] of modes)
            seen.push([
              action + ", " + who + ", " + mode,
              asClient(
                await generic([target], () =>
                  thrown(deleteWith(target, id, ctx))
                )
              ),
            ]);
        expect(seen[0][1]).toEqual({
          message: "ENTITY_IN_USE",
          extensions: {
            code: "ENTITY_IN_USE",
            meta: {
              code: "ENTITY_IN_USE",
              detailType: "deletion-blockers",
              blockers: {
                entity: target,
                id: "",
                blocked: true,
                reasons: [
                  {
                    kind: "reference",
                    rootEntity: target,
                    relations: [target + ".dbxProbe"],
                    visible: null,
                    hiddenInTenant: null,
                    otherTenants: null,
                  },
                ],
              },
            },
          },
        });
        for (const [label, client] of seen)
          expect([label, client]).toEqual([label, seen[0][1]]);
      } finally {
        delete FK_CONSTRAINT_TO_RELATION[constraint];
        await basePrisma.$executeRawUnsafe(
          'ALTER TABLE "' + table + '" DROP COLUMN IF EXISTS "' + PROBE + '"'
        );
      }
    }
    expect(
      await db(target).count({ where: { id: { in: [rows.own, rows.cross] } } })
    ).toBe(2);
  });
});

describe("el update que re-lanza el error de la base", () => {
  it("formateado como en producción, un P2039 y un P2003 reales al quitar una fila de una subentidad no traen tablas, columnas, SQL, restricciones ni ids", async () => {
    // Las listas de subentidades que el update de la raíz deja quitar (`remove`):
    // la fila quitada se borra por el servicio de borrado de la subentidad.
    type List = { root: string; field: string; child: string; fk: string };
    const lists: List[] = [];
    for (const m of f.models.values()) {
      const file = serviceFile(m.name, "Update");
      if (!fs.existsSync(file)) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const field of m.fields) {
        if (
          !field.list ||
          !field.relation ||
          field.relation.fields.length > 0 ||
          !f.models.has(field.type) ||
          !source.includes("args." + field.name + ".remove")
        )
          continue;
        const link = f
          .model(field.type)
          .fields.find(
            (x) =>
              x.relation?.name === field.relation!.name &&
              x.relation.fields.length > 0 &&
              /onDelete:\s*Cascade/.test(x.attributes)
          );
        if (link)
          lists.push({
            root: m.name,
            field: field.name,
            child: field.type,
            fk: link.relation!.fields[0],
          });
      }
    }
    if (lists.length === 0) {
      console.log(
        "\nningún update quita filas de una subentidad en este proyecto: no hay re-lanzamiento que probar"
      );
      return;
    }
    let list: List | null = null;
    let rootId = "";
    let childId = "";
    for (const l of lists) {
      try {
        const inA = { tenant: ids.A, user: ids.uA };
        rootId = await f.create(
          l.root,
          f.model(l.root).hasTenant ? inA : { tenant: null, user: ids.uA }
        );
        childId = await f.create(
          l.child,
          f.model(l.child).hasTenant ? inA : { tenant: null, user: ids.uA },
          { [l.fk]: rootId }
        );
        list = l;
        break;
      } catch {
        // No se siembra: la siguiente.
      }
    }
    expect(list).not.toBeNull();
    const { root, field, child } = list!;
    // El formateo es el de producción: un error no manejado sale como interno, sin su texto.
    const unhandled = asClient(new Error("SELECT " + PROBE));
    expect([unhandled.extensions?.code, JSON.stringify(unhandled)]).toEqual([
      "INTERNAL_SERVER_ERROR",
      expect.not.stringContaining(PROBE),
    ]);
    chosen.push(
      "update que re-lanza: " + root + "." + field + " (" + child + ")"
    );
    const tables = [tableOf(root), tableOf(child)];
    const constraint = PROBE + "_fkey";
    const internals = [
      ...tables,
      PROBE,
      "_fkey",
      "violates",
      "Key (",
      "foreign key",
      "RESTRICT",
      "NO ACTION",
      "23001",
      "23503",
      "DELETE",
      "UPDATE",
      "driverAdapter",
      "originalMessage",
    ];
    for (const [action, code] of [
      ["RESTRICT", "P2039"],
      ["NO ACTION", "P2003"],
    ])
      for (const known of [false, true]) {
        const label =
          action +
          (known ? ", restricción en la tabla" : ", restricción desconocida");
        // La raíz apunta a la fila de su subentidad: quitarla la deja colgando.
        await basePrisma.$executeRawUnsafe(
          'ALTER TABLE "' +
            tables[0] +
            '" ADD COLUMN "' +
            PROBE +
            '" text CONSTRAINT "' +
            constraint +
            '" REFERENCES "' +
            tables[1] +
            '"("id") ON DELETE ' +
            action
        );
        if (known)
          FK_CONSTRAINT_TO_RELATION[constraint] = {
            target: child,
            relations: [
              {
                kind: "reference",
                model: root,
                field: "dbxProbe",
                fk: PROBE,
                constraint,
                path: [],
                pathMany: [],
                rootEntity: root,
                rootGlobal: !f.model(root).hasTenant,
              },
            ],
          };
        try {
          await basePrisma.$executeRawUnsafe(
            'UPDATE "' +
              tables[0] +
              '" SET "' +
              PROBE +
              '" = $1 WHERE "id" = $2',
            childId,
            rootId
          );
          const { version_ } = await db(root).findUnique({
            where: { id: rootId },
            select: { version_: true },
          });
          const error = await generic([root, child], () => {
            const mod = require(serviceFile(root, "Update"));
            return thrown(
              new mod[root + "UpdateService"](ctxA(), basePrisma, store)[
                "update" + root
              ](
                { id: rootId, version_, [field]: { remove: [childId] } },
                { id: true }
              )
            );
          });
          expect([label, error?.constructor?.name]).toEqual([
            label,
            "PrismaError",
          ]);
          const client = asClient(error);
          expect([label, client]).toEqual([
            label,
            known
              ? {
                  message: "ENTITY_IN_USE",
                  extensions: {
                    code: "ENTITY_IN_USE",
                    meta: {
                      code: "ENTITY_IN_USE",
                      detailType: "deletion-blockers",
                      blockers: {
                        entity: child,
                        id: "",
                        blocked: true,
                        reasons: [
                          {
                            kind: "reference",
                            rootEntity: root,
                            relations: [root + ".dbxProbe"],
                            visible: null,
                            hiddenInTenant: null,
                            otherTenants: null,
                          },
                        ],
                      },
                    },
                  },
                }
              : { message: code, extensions: { code } },
          ]);
          const text = JSON.stringify(client);
          expect([
            label,
            internals.filter((x) => text.includes(x)),
            seededIn(text),
          ]).toEqual([label, [], []]);
        } finally {
          delete FK_CONSTRAINT_TO_RELATION[constraint];
          await basePrisma.$executeRawUnsafe(
            'ALTER TABLE "' +
              tables[0] +
              '" DROP COLUMN IF EXISTS "' +
              PROBE +
              '"'
          );
        }
      }
    expect(await db(child).count({ where: { id: childId } })).toBe(1);
  });
});

describe("los borrados con archivos", () => {
  // Leen los archivos del registro antes de borrarlo, y eso siempre exigió el
  // permiso de lectura (SecurePrismaOps.findUniqueOrThrow): unificar esa lectura
  // con la verificación de que el registro se ve (findDeletable) no tiene que
  // ampliarlo. La tabla generada las lista (DELETION_REQUIRES_RETRIEVE), y la
  // consulta de los motivos les exige lo mismo.
  const FILE_ENTITIES = [...f.models.values()]
    .filter(
      (m) =>
        m.fields.some((x) => x.name.endsWith("_server_data")) &&
        fs.existsSync(serviceFile(m.name, "Delete"))
    )
    .map((m) => m.name);

  it("leer el registro antes de borrarlo es exactamente exigir el permiso de lectura, y son las entidades con archivos y las de la tabla generada", () => {
    // De las llamadas de cada servicio emitido (la API de TypeScript: no depende
    // del formato, del nombre de la variable, de un tipo ni de cómo se use lo que
    // devuelve). Lee el registro: findDeletable con un sexto argumento (los
    // campos a leer), o una lectura por SecurePrismaOps (this.db.find…). Exige el
    // permiso de lectura: this.db.assertCan("retrieve"), o esa misma lectura (que
    // empieza pidiéndolo).
    const reads: string[] = [];
    const problems: string[] = [];
    for (const m of f.models.values()) {
      const file = serviceFile(m.name, "Delete");
      if (!fs.existsSync(file)) continue;
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      const calls: ts.CallExpression[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) calls.push(node);
        ts.forEachChild(node, visit);
      };
      visit(source);
      const callee = (c: ts.CallExpression) => c.expression.getText(source);
      const secured = calls.some((c) => /^this\.db\.find\w*$/.test(callee(c)));
      const read =
        secured ||
        calls.some(
          (c) => callee(c) === "findDeletable" && c.arguments.length > 5
        );
      const requires =
        secured ||
        calls.some(
          (c) =>
            callee(c) === "this.db.assertCan" &&
            !!c.arguments[0] &&
            ts.isStringLiteral(c.arguments[0]) &&
            c.arguments[0].text === "retrieve"
        );
      if (read !== requires)
        problems.push(
          m.name +
            (read
              ? ": lee el registro sin exigir el permiso de lectura"
              : ": exige el permiso de lectura sin leer el registro")
        );
      if (read) reads.push(m.name);
    }
    expect(problems).toEqual([]);
    expect(reads.sort()).toEqual([...FILE_ENTITIES].sort());
    expect(reads.sort()).toEqual([...DELETION_REQUIRES_RETRIEVE].sort());
  });

  if (DELETION_REQUIRES_RETRIEVE.length > 0)
    it.each(DELETION_REQUIRES_RETRIEVE)(
      "%s: con permiso de borrado y sin permiso de lectura, la consulta (también por su resolver, desde las dos empresas) y el borrado interno responden lo mismo que un id inexistente (un id propio, uno de otra empresa y uno que no existe), sin consultar",
      async (entity) => {
        const missing = await failure(
          findDeletionBlockers(
            entity,
            PREFIX + "no-existe",
            ctxA(),
            undefined,
            store
          )
        );
        expect(missing.type).toBe("NotFoundError");
        let own: string | null = null;
        try {
          own = await f.create(entity, {
            tenant: f.model(entity).hasTenant ? ids.A : null,
            user: ids.uA,
          });
        } catch (error: any) {
          const reason =
            entity +
            ": " +
            String(error?.message ?? error)
              .split("\n")
              .pop();
          if (!notSeedable.includes(reason)) notSeedable.push(reason);
        }
        // Uno de la otra empresa (si la entidad es de empresa).
        let foreign: string | null = null;
        if (own && f.model(entity).hasTenant)
          foreign = await f.create(entity, { tenant: ids.B, user: ids.uB });
        const vias: Array<[string, "A" | "B"]> = [
          ["consulta", "A"],
          ["resolver", "A"],
          ["resolver", "B"],
          ["borrado interno", "A"],
        ];
        for (const id of [own, foreign, PREFIX + "no-existe"]) {
          if (!id) continue;
          for (const [via, who] of vias) {
            const log: string[] = [];
            const prisma = recording(log);
            const ctx = context({
              tenant: who === "A" ? ids.A : ids.B,
              user: who === "A" ? ids.uA : ids.uB,
              permissions: without(ALL, [lower(entity) + "_retrieve"]),
              prisma,
            });
            const error = await failure(
              via === "consulta"
                ? findDeletionBlockers(entity, id, ctx, prisma, store)
                : via === "resolver"
                ? query({ entity, id }, ctx)
                : assertNotInUse(entity, id, ctx, prisma, store)
            );
            expect([via, who, id, error, log]).toEqual([
              via,
              who,
              id,
              missing,
              [],
            ]);
          }
        }
        for (const id of [own, foreign])
          if (id) expect(await db(entity).count({ where: { id } })).toBe(1);
      }
    );

  if (FILE_ENTITIES.length === 0)
    it("ninguna entidad tiene archivos en este proyecto", () => {
      expect(FILE_ENTITIES).toEqual([]);
    });
  else
    it.each(FILE_ENTITIES)(
      "%s: con permiso de borrado y sin permiso de lectura, el error de siempre (el de leer sus archivos), sin consultar ni borrar",
      async (entity) => {
        const ctx = (prisma: any) =>
          context({
            tenant: ids.A,
            user: ids.uA,
            permissions: without(ALL, [lower(entity) + "_retrieve"]),
            prisma,
          });
        // El de siempre: el que lanzaba la lectura de los archivos.
        const usual = await failure(
          Promise.resolve().then(() =>
            new SecurePrismaOps(
              ctx(basePrisma),
              basePrisma,
              store,
              entity as any,
              {}
            ).findUniqueOrThrow({
              where: { id: PREFIX + "no-existe" },
              select: { id: true },
            })
          )
        );
        expect(usual.type).toBe("UnauthorizedError");
        let own: string | null = null;
        try {
          own = await f.create(entity, {
            tenant: f.model(entity).hasTenant ? ids.A : null,
            user: ids.uA,
          });
        } catch (error: any) {
          const reason =
            entity +
            ": " +
            String(error?.message ?? error)
              .split("\n")
              .pop();
          if (!notSeedable.includes(reason)) notSeedable.push(reason);
        }
        for (const id of [own, PREFIX + "no-existe"]) {
          if (!id) continue;
          const log: string[] = [];
          const prisma = recording(log);
          expect([
            id,
            await failure(deleteWith(entity, id, ctx(prisma), prisma)),
            log,
          ]).toEqual([id, usual, []]);
        }
        if (own) expect(await db(entity).count({ where: { id: own } })).toBe(1);
      }
    );
});

describe("contar los motivos sin volver a buscar el registro", () => {
  it("la prueba que devuelve findDeletable saltea la búsqueda del registro solo para su entidad, su id, su contexto y su transacción; nada más la saltea", async () => {
    // Dos entidades de empresa que se siembran: dos registros de la primera, y
    // uno de la segunda con el mismo id que el primero (así solo la entidad
    // distingue su prueba).
    const seeded: Array<{ entity: string; ids: string[] }> = [];
    for (const entity of Object.keys(DELETION_BLOCKERS)) {
      if (seeded.length === 2) break;
      if (!f.model(entity).hasTenant || entity === "User") continue;
      try {
        const own = { tenant: ids.A, user: ids.uA };
        const rows =
          seeded.length === 0
            ? [await f.create(entity, own), await f.create(entity, own)]
            : [await f.create(entity, own, { id: seeded[0].ids[0] })];
        seeded.push({ entity, ids: rows });
      } catch {
        // No se siembra: la siguiente.
      }
    }
    expect(seeded.length).toBe(2);
    const [{ entity, ids: rows }, other] = seeded;
    const log: string[] = [];
    const tx = recording(log);
    const ctx = ctxA();
    const { record, proof } = await findDeletable(
      entity,
      rows[0],
      ctx,
      tx,
      store
    );
    expect(record).toEqual({ id: rows[0] });
    const { proof: otherProof } = await findDeletable(
      other.entity,
      other.ids[0],
      ctx,
      tx,
      store
    );
    const lookups = () =>
      log.filter((l) => l === f.model(entity).delegate + ".findFirst").length;
    log.length = 0;
    await assertNotInUse(entity, rows[0], ctx, tx, store, { proof });
    expect(["la prueba de findDeletable", lookups()]).toEqual([
      "la prueba de findDeletable",
      0,
    ]);
    const cases: Array<[string, string, any, any, unknown]> = [
      ["la de otra entidad, con el mismo id", rows[0], ctx, tx, otherProof],
      ["la de otro id", rows[1], ctx, tx, proof],
      ["otro contexto, con los mismos datos", rows[0], ctxA(), tx, proof],
      ["otra transacción", rows[0], ctx, recording(log), proof],
      ["un objeto que no salió de findDeletable", rows[0], ctx, tx, {}],
      ["una copia de la prueba", rows[0], ctx, tx, { ...proof }],
      ["ninguna", rows[0], ctx, tx, undefined],
    ];
    for (const [label, id, context, client, candidate] of cases) {
      log.length = 0;
      await assertNotInUse(entity, id, context, client, store, {
        proof: candidate as any,
      });
      expect([label, lookups()]).toEqual([label, 1]);
    }
    // Pedida sin transacción, la prueba no saltea nada: no vencería mientras viva
    // el contexto, aunque el registro deje de verse. Tampoco con el cliente del
    // contexto pasado como si fuera la transacción.
    const plain = recording(log);
    const ctxPlain = context({
      tenant: ids.A,
      user: ids.uA,
      permissions: ALL,
      prisma: plain,
    });
    const loose: Array<[string, any]> = [
      ["pedida sin transacción", undefined],
      ["pedida con el cliente del contexto como transacción", plain],
    ];
    for (const [label, client] of loose) {
      const { proof: unbound } = await findDeletable(
        entity,
        rows[0],
        ctxPlain,
        client,
        store
      );
      log.length = 0;
      await assertNotInUse(entity, rows[0], ctxPlain, client, store, {
        proof: unbound,
      });
      expect([label, lookups()]).toEqual([label, 1]);
    }
    // Con la prueba de A, un usuario de la otra empresa no ve el registro.
    expect(
      await failure(
        assertNotInUse(entity, rows[0], ctxB(), tx, store, { proof })
      )
    ).toEqual(
      await failure(
        findDeletionBlockers(
          entity,
          PREFIX + "no-existe",
          ctxA(),
          undefined,
          store
        )
      )
    );
    chosen.push(
      "la prueba de findDeletable: " + entity + " (y " + other.entity + ")"
    );
  });
});

describe("las entidades que la consulta no atiende (sin su mutación de borrado)", () => {
  const NOT_QUERYABLE = Object.keys(DELETION_BLOCKERS).filter(
    (e) => !DELETION_QUERYABLE.includes(e)
  );

  it("DELETION_QUERYABLE son exactamente las entidades de la tabla con su mutación <entidad>Delete en el SDL emitido y un resolver que la atiende", () => {
    // Todos los .graphql del server: las mutaciones declaradas.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true }))
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith(".graphql"))
          files.push(path.join(dir, e.name));
    };
    walk(path.resolve(__dirname, "../../../src"));
    const declared = new Set<string>(
      files.flatMap((file) =>
        parse(fs.readFileSync(file, "utf8")).definitions.flatMap((d: any) =>
          (d.kind === "ObjectTypeDefinition" ||
            d.kind === "ObjectTypeExtension") &&
          d.name.value === "Mutation"
            ? (d.fields ?? []).map((x: any) => x.name.value as string)
            : []
        )
      )
    );
    // El resolver de la entidad define la mutación (la API de TypeScript).
    const served = (entity: string) => {
      const file = path.join(
        SRC,
        lower(entity),
        "resolvers",
        lower(entity) + "Resolvers.ts"
      );
      if (!fs.existsSync(file)) return false;
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
      );
      let found = false;
      const visit = (node: ts.Node): void => {
        if (
          (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
          node.name.getText(source) === lower(entity) + "Delete"
        )
          found = true;
        if (!found) ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    const entities = Object.keys(DELETION_BLOCKERS);
    const withMutation = entities.filter((e) =>
      declared.has(lower(e) + "Delete")
    );
    expect([...DELETION_QUERYABLE].sort()).toEqual(
      withMutation.filter(served).sort()
    );
    // Un resolver sin su mutación declarada no existe; una declarada sin resolver
    // (no hay cómo borrar por ella) no se consulta, y se informa.
    expect(
      entities.filter((e) => served(e) && !declared.has(lower(e) + "Delete"))
    ).toEqual([]);
    const unserved = withMutation.filter((e) => !served(e));
    if (unserved.length > 0)
      chosen.push(
        "mutación de borrado declarada sin resolver (la consulta no la atiende): " +
          unserved.join(", ")
      );
  });

  if (NOT_QUERYABLE.length === 0)
    it("la consulta atiende todas las entidades de la tabla en este proyecto", () => {
      expect(NOT_QUERYABLE).toEqual([]);
    });
  else
    it.each(NOT_QUERYABLE)(
      "%s: con todos los permisos (también el de borrado), la consulta y su resolver responden lo mismo que un id inexistente (un id propio que existe y uno que no), sin consultar",
      async (entity) => {
        const missing = await failure(
          findDeletionBlockers(
            DELETION_QUERYABLE[0] ?? entity,
            PREFIX + "no-existe",
            ctxA(),
            undefined,
            store
          )
        );
        expect(missing.type).toBe("NotFoundError");
        let own: string | null = null;
        try {
          own = await f.create(entity, {
            tenant: f.model(entity).hasTenant ? ids.A : null,
            user: ids.uA,
          });
        } catch (error: any) {
          const reason =
            entity +
            ": " +
            String(error?.message ?? error)
              .split("\n")
              .pop();
          if (!notSeedable.includes(reason)) notSeedable.push(reason);
        }
        for (const id of [own, PREFIX + "no-existe"]) {
          if (!id) continue;
          for (const via of ["consulta", "resolver"]) {
            const log: string[] = [];
            const prisma = recording(log);
            const ctx = context({
              tenant: ids.A,
              user: ids.uA,
              permissions: ALL,
              prisma,
            });
            const error = await failure(
              via === "consulta"
                ? findDeletionBlockers(entity, id, ctx, prisma, store)
                : query({ entity, id }, ctx)
            );
            expect([via, id, error, log]).toEqual([via, id, missing, []]);
          }
        }
        if (own) expect(await db(entity).count({ where: { id: own } })).toBe(1);
      }
    );
});

describe("cobertura", () => {
  it("lo único que no se sembró es lo que Prisma no puede crear (campos Unsupported obligatorios)", () => {
    expect(notSeedable.filter((r) => !/Unsupported/.test(r))).toEqual([]);
    expect(TARGETS.length).toBeGreaterThan(0);
  });
});
