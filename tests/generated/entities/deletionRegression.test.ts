/**
 * Lo que se podía borrar se sigue borrando: batería generada para todo proyecto,
 * contra la base de test.
 *
 * La verificación de los motivos de borrado corre dentro de cada borrado. Esta
 * batería fija que no frene lo que la base deja hacer, para todas las entidades
 * del schema:
 *
 * - una raíz con sus subentidades se borra, y las subentidades con ella;
 * - un registro en una lista de muchos a muchos se borra, y la lista lo suelta;
 * - un registro referenciado por una relación opcional se borra, y la
 *   referencia queda en vacío;
 * - quitar una fila de una subentidad desde el formulario del padre la borra;
 * - un registro repetido sigue diciendo qué campo chocó (P2002).
 *
 * Los validadores propios del proyecto y los hooks de después del update se
 * apartan mientras corre cada caso: lo que se prueba es lo genérico.
 *
 * Al empezar, borra lo que pudo dejar una corrida anterior cortada (filas con el
 * prefijo y sus mensajes en la cola de archivos): si no, la corrida siguiente
 * fallaría entera.
 */

import * as fs from "fs";
import * as path from "path";
import { assertSafeTestDatabase } from "../../support/testDatabase";
import { basePrisma } from "../../../src/prisma/client";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { PrismaError } from "../../../src/common/errors";
import { UNIQUE_CONSTRAINTS } from "../../../src/common/errors/uniqueConstraints.generated";
import {
  resolveUniqueViolation,
  uniqueViolationMessage,
} from "../../../src/common/errors/uniqueViolation";
import {
  RowFactory,
  type SchemaField,
  type SchemaModel,
} from "../support/rowFactory";

const PREFIX = "DRX_";
const f = new RowFactory(basePrisma, PREFIX);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const SRC = path.resolve(__dirname, "../../../src/entities");
const serviceFile = (entity: string, kind: "Delete" | "Update") =>
  path.join(
    SRC,
    lower(entity),
    "services",
    lower(entity) + kind + "Service.ts"
  );
const db = (model: string) => (basePrisma as any)[f.model(model).delegate];

/**
 * Controles de la limpieza previa: filas cuyo id se parece al prefijo sin
 * tenerlo (una letra donde el prefijo tiene "_"), entre ellas una empresa y un
 * usuario de los que cuelgan filas (una con un id neutro). Si la limpieza tomara
 * el prefijo como patrón y no literal, se las llevaría.
 */
const control = new RowFactory(basePrisma, PREFIX.slice(0, -1) + "a_");
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
const ALL: string[] = [];
const notSeedable: string[] = [];

const ctxA = (): any => {
  const set = new Set(ALL);
  return {
    prisma: basePrisma,
    // Como el contexto real: el usuario trae su empresa (los borrados con archivos la usan).
    currentUser: {
      id: ids.uA,
      tenant_id_: ids.A,
      tenant_: { id: ids.A },
      role: { id: "User", permissions: [] },
    },
    permissions: () => set,
    hasRole: (...r: string[]) => r.includes("User"),
    isSystemMode: false,
    req: {},
  };
};

/** Corre `run` con los validadores y hooks del proyecto de la entidad apartados. */
async function generic<T>(entity: string, run: () => Promise<T>): Promise<T> {
  const saved: Array<[any, string, unknown]> = [];
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

/** Los mensajes de la cola de borrado de archivos que dejaron los borrados de la batería. */
const dropQueued = () =>
  basePrisma.$executeRawUnsafe(
    "DELETE FROM pgmq.q_file_deletions WHERE starts_with(message->>'entityId', $1) OR starts_with(message->>'tenantId', $1)",
    PREFIX
  );

const remove = (entity: string, id: string) =>
  generic(entity, () => {
    const mod = require(serviceFile(entity, "Delete"));
    return new mod[entity + "DeleteService"](ctxA(), basePrisma, store)[
      "delete" + entity
    ]({ id }, { id: true });
  });

async function seed(
  model: string,
  data: Record<string, unknown> = {}
): Promise<string | null> {
  try {
    return await f.create(
      model,
      { tenant: f.model(model).hasTenant ? ids.A : null, user: ids.uA },
      data
    );
  } catch (error: any) {
    const reason =
      model +
      ": " +
      String(error?.message ?? error)
        .split("\n")
        .pop();
    if (!notSeedable.includes(reason)) notSeedable.push(reason);
    return null;
  }
}

const exists = async (model: string, id: string) =>
  (await db(model).count({ where: { id } })) === 1;

/** Los vínculos de subentidad de un modelo: el campo del padre y el modelo hijo. */
function subEntities(
  model: SchemaModel
): Array<{ field: string; child: string; many: boolean }> {
  const out: Array<{ field: string; child: string; many: boolean }> = [];
  for (const field of model.fields) {
    if (
      !field.relation ||
      field.relation.fields.length > 0 ||
      !f.models.has(field.type)
    )
      continue;
    const child = f.model(field.type);
    const link = child.fields.find(
      (x) =>
        x.relation?.name === field.relation!.name &&
        x.relation.fields.length > 0
    );
    if (link && /onDelete:\s*Cascade/.test(link.attributes))
      out.push({ field: field.name, child: child.name, many: field.list });
  }
  return out;
}

/** Las listas de muchos a muchos: los dos lados son listas sin columnas. */
function manyToMany(): Array<{ model: string; field: string; other: string }> {
  const out: Array<{ model: string; field: string; other: string }> = [];
  for (const model of f.models.values()) {
    for (const field of model.fields) {
      if (
        !field.list ||
        !field.relation ||
        field.relation.fields.length > 0 ||
        !f.models.has(field.type)
      )
        continue;
      const back = f
        .model(field.type)
        .fields.find(
          (x) =>
            x.list && x.relation?.name === field.relation!.name && x !== field
        );
      if (back && back.relation!.fields.length === 0)
        out.push({ model: model.name, field: field.name, other: field.type });
    }
  }
  return out;
}

/** Las referencias opcionales del DSL que quedan en vacío al borrar (SetNull). */
function optionalReferences(): Array<{ model: string; field: SchemaField }> {
  const out: Array<{ model: string; field: SchemaField }> = [];
  for (const model of f.models.values()) {
    for (const field of model.fields) {
      const rel = field.relation;
      if (
        !rel ||
        rel.fields.length !== 1 ||
        field.list ||
        !field.optional ||
        field.name.endsWith("_")
      )
        continue;
      const onDelete =
        field.attributes.match(/onDelete:\s*(\w+)/)?.[1] ?? "SetNull";
      if (onDelete === "SetNull" && f.models.has(field.type))
        out.push({ model: model.name, field });
    }
  }
  return out;
}

const ROOTS = [...f.models.values()]
  .filter(
    (m) =>
      subEntities(m).length > 0 && fs.existsSync(serviceFile(m.name, "Delete"))
  )
  .map((m) => m.name);
const LISTS = manyToMany().filter((l) =>
  fs.existsSync(serviceFile(l.other, "Delete"))
);
const OPTIONAL = optionalReferences().filter((o) =>
  fs.existsSync(serviceFile(o.field.type, "Delete"))
);
/** La primera lista de subentidades que el update del padre deja quitar (`remove`). */
const removable = (root: string) => {
  const file = serviceFile(root, "Update");
  if (!fs.existsSync(file)) return undefined;
  const source = fs.readFileSync(file, "utf8");
  return subEntities(f.model(root)).find(
    (s) => s.many && source.includes("args." + s.field + ".remove")
  );
};
const NESTED = [...f.models.values()]
  .filter((m) => removable(m.name))
  .map((m) => m.name);

/**
 * `it.each` con una tabla vacía es un error de jest. Un schema sin la forma no
 * tiene qué probar: el caso queda salteado, y la cobertura dice si el DSL la declaraba.
 */
const cada = (filas: readonly unknown[], forma: string): any =>
  filas.length > 0
    ? it.each(filas as any[])
    : (titulo: string) =>
        it.skip(`${titulo} — el schema no tiene ${forma}`, () => undefined);

/** Las formas que el DSL declara (las pone el generador). */
const DECLARADAS = {
  subentidades: false,
  listas: true,
  opcionales: true,
  quitables: false,
};

beforeAll(async () => {
  assertSafeTestDatabase();
  // La cola de borrado de archivos (workers/queues/fileDeletionQueue.ts): en la
  // app la crea el worker al arrancar; los borrados con archivos encolan ahí.
  await basePrisma.$executeRawUnsafe("SELECT pgmq.create('file_deletions')");
  await seedControls();
  // Lo que dejó una corrida cortada: sus mensajes en la cola y sus filas.
  await dropQueued();
  await f.purge();
  store = new SchemaMetadataStore();
  store.build();
  for (const m of f.models.values())
    for (const a of ["retrieve", "create", "update", "delete"])
      ALL.push(m.delegate + "_" + a);
  ids.A = await f.create("Tenant", { tenant: null });
  ids.uA = await f.create("User", { tenant: ids.A });
}, 300000);

afterAll(async () => {
  if (notSeedable.length)
    console.log(
      "\nmodelos que Prisma no puede sembrar:\n  " + notSeedable.join("\n  ")
    );
  await f.cleanup();
  await control.cleanup();
  await dropQueued();
  await basePrisma.$disconnect();
}, 300000);

describe("la limpieza previa", () => {
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

describe("una raíz se borra con sus subentidades", () => {
  cada(ROOTS, "raíces con subentidades")("%s", async (root: string) => {
    const id = await seed(root);
    if (!id) return;
    const children: Array<{ child: string; id: string }> = [];
    for (const s of subEntities(f.model(root))) {
      const link = f.parentLink(root, s.field);
      const childId = await seed(s.child, { [link.fk]: id });
      if (childId) children.push({ child: s.child, id: childId });
    }
    await expect(remove(root, id)).resolves.toEqual({ id });
    expect(await exists(root, id)).toBe(false);
    for (const c of children)
      expect([c.child, await exists(c.child, c.id)]).toEqual([c.child, false]);
  });
});

describe("un registro de una lista de muchos a muchos se borra y la lista lo suelta", () => {
  cada(
    LISTS.map((l) => [l.model + "." + l.field, l] as const),
    "listas de muchos a muchos"
  )("%s", async (_name: string, l: typeof LISTS[number]) => {
    const owner = await seed(l.model);
    const item = await seed(l.other);
    if (!owner || !item) return;
    await db(l.model).update({
      where: { id: owner },
      data: { [l.field]: { connect: { id: item } } },
    });
    await expect(remove(l.other, item)).resolves.toEqual({ id: item });
    const after = await db(l.model).findUnique({
      where: { id: owner },
      select: { [l.field]: { select: { id: true } } },
    });
    expect(after[l.field]).toEqual([]);
  });
});

describe("una referencia opcional queda en vacío", () => {
  cada(
    OPTIONAL.map((o) => [o.model + "." + o.field.name, o] as const),
    "referencias opcionales"
  )("%s", async (_name: string, o: typeof OPTIONAL[number]) => {
    const target = await seed(o.field.type);
    if (!target) return;
    const fk = o.field.relation!.fields[0];
    const row = await seed(o.model, { [fk]: target });
    if (!row) return;
    await expect(remove(o.field.type, target)).resolves.toEqual({
      id: target,
    });
    expect(
      (
        await db(o.model).findUnique({
          where: { id: row },
          select: { [fk]: true },
        })
      )[fk]
    ).toBeNull();
  });
});

describe("quitar una fila de una subentidad desde el formulario del padre la borra", () => {
  cada(NESTED, "subentidades que el formulario del padre deje quitar")(
    "%s",
    async (root: string) => {
      const id = await seed(root);
      if (!id) return;
      const s = removable(root)!;
      const link = f.parentLink(root, s.field);
      const child = await seed(s.child, { [link.fk]: id });
      if (!child) return;
      const { version_ } = await db(root).findUnique({
        where: { id },
        select: { version_: true },
      });
      await generic(root, async () => {
        const mod = require(serviceFile(root, "Update"));
        const service = new mod[root + "UpdateService"](
          ctxA(),
          basePrisma,
          store
        );
        await expect(
          service["update" + root](
            { id, version_, [s.field]: { remove: [child] } },
            { id: true }
          )
        ).resolves.toEqual({ id });
      });
      expect(await exists(s.child, child)).toBe(false);
      expect(await exists(root, id)).toBe(true);
    }
  );
});

describe("un registro repetido sigue diciendo qué campo chocó", () => {
  // Restricciones de un solo campo de texto (con o sin la empresa): se repite el valor.
  const CASES = Object.values(UNIQUE_CONSTRAINTS.tables).flatMap((table: any) =>
    Object.values(table.constraints as Record<string, string[]>)
      .filter((fields) => fields.length === 1)
      .map(
        (fields) =>
          [table.model + "." + fields[0], table.model, fields[0]] as const
      )
      .filter(
        ([, model, field]) =>
          f.models.has(model) &&
          f
            .model(model)
            .fields.some(
              (x) => x.name === field && x.type === "String" && !x.relation
            )
      )
  );

  it.each(CASES)("%s", async (_name, model, field) => {
    const value = PREFIX + "REPETIDO_" + model + "_" + field;
    // Una subentidad, con su padre: sin él, la columna del padre es NULL y en
    // Postgres dos NULL no chocan.
    const parent = f
      .model(model)
      .fields.find(
        (x) =>
          x.relation &&
          x.relation.fields.length > 0 &&
          /onDelete:\s*Cascade/.test(x.attributes)
      );
    const parentId = parent ? await seed(parent.type) : null;
    if (parent && !parentId) return;
    const first = await seed(
      model,
      parent
        ? { [field]: value, [parent.relation!.fields[0]]: parentId }
        : { [field]: value }
    );
    if (!first) return;
    // La segunda fila, con las mismas claves foráneas (la empresa, el padre): la
    // restricción puede incluirlas.
    const fks = f.model(model).fields.flatMap((x) => x.relation?.fields ?? []);
    const same = await db(model).findUnique({
      where: { id: first },
      select: Object.fromEntries(fks.map((k) => [k, true])),
    });
    let raw: any = null;
    try {
      await f.create(
        model,
        { tenant: f.model(model).hasTenant ? ids.A : null, user: ids.uA },
        { ...same, [field]: value }
      );
    } catch (error) {
      raw = error;
    }
    expect(raw?.code).toBe("P2002");
    const error = new PrismaError(raw, undefined, undefined, null);
    const violation = resolveUniqueViolation(raw.meta, UNIQUE_CONSTRAINTS);
    expect(violation?.fields).toContain(field);
    expect([error.message, (error.extensions as any).code]).toEqual([
      uniqueViolationMessage(violation!, UNIQUE_CONSTRAINTS, undefined),
      "P2002",
    ]);
  });
});

describe("cobertura", () => {
  it("se ejercitó cada forma que el DSL declara, y lo único que no se sembró es lo que Prisma no puede crear", () => {
    // Una forma declarada que el schema no muestra es una detección rota; una que
    // el DSL no declara puede faltar (o aparecer igual, por el historial o el sistema).
    const encontradas: Record<string, boolean> = {
      subentidades: ROOTS.length > 0,
      listas: LISTS.length > 0,
      opcionales: OPTIONAL.length > 0,
      quitables: NESTED.length > 0,
    };
    for (const [forma, declarada] of Object.entries(DECLARADAS))
      if (declarada) expect([forma, encontradas[forma]]).toEqual([forma, true]);
    expect(notSeedable.filter((r) => !/Unsupported/.test(r))).toEqual([]);
  });
});
