// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * La edición de una referencia, contra la base de test y con el UpdateService
 * generado de cada entidad.
 *
 * 1. Una opcional: null o "" la vacían (null lo manda el formulario público; ""
 *    la app, al vaciarla); sin el argumento (undefined) no se toca; con un id, se
 *    conecta. Vaciar una que ya está vacía no falla: la app manda "" en cada
 *    guardado de una vacía. Solo la vacía quien ve el modelo al que apunta (el
 *    permiso <modelo>_retrieve, el criterio de la poda del select): a quien no lo
 *    ve, la referencia le llega vacía porque se podó, y su null o "" se ignora.
 * 2. Una opcional con clave compuesta (compositeWith, como la provincia, cuya
 *    clave foránea comparte la columna del país): vaciarla pone en NULL solo su
 *    columna, y la otra referencia queda. Cambiar la otra y vaciar esta en el
 *    mismo guardado deja la nueva y esta en NULL, sin chocar con la clave
 *    compuesta (P2003); cambiar la otra y elegir una de la nueva guarda las dos.
 *    Sin permiso de ver su modelo, vaciarla se ignora, como en una opcional. Pero
 *    si la otra cambia de verdad (pasa a otra, o se vacía) y esta no llega con un
 *    id, esta se vacía igual, también para quien no la ve: una de otro padre, o
 *    sin padre, no puede quedar. Una que ya está vacía no suma una escritura.
 * 3. Una obligatoria: null es un faltante (VALIDATION_REQUIRED) y no se guarda
 *    nada; "" no la toca.
 * 4. Una opcional de una subentidad, en un update anidado del padre: igual que
 *    una opcional.
 * 5. El guardado de la app (sin transacción de afuera: el servicio abre la suya,
 *    Serializable, y reintenta ante un choque) vacía una opcional y una compuesta
 *    como el resto de los casos, que corren en una transacción del test.
 *
 * Lo que los servicios escriben en la consola se junta: un caso que deja una
 * advertencia o un error falla.
 *
 * Las entidades y las referencias salen del modelo (updateRefsCases en el
 * generador). Cada caso corre con cada candidato que se puede sembrar y guardar
 * (una edición sin cambios); los que no, quedan afuera con su motivo, y si de una
 * lista no queda ninguno, falla. Al final dice cuáles probó y cuáles no.
 */

import { assertSafeTestDatabase } from "../../support/testDatabase";
import { basePrisma } from "../../../src/prisma/client";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { Prisma } from "../../../src/prisma/generated-client/client";
import { RowFactory } from "../support/rowFactory";

/**
 * Una referencia. En nested, la de una subentidad: path es el camino de listas
 * desde el padre, cada una con las otras listas obligatorias que exige su dueño.
 */
type NestedStep = { sub: string; requiredLists: string[] };
type RefCase = {
  entity: string;
  field: string;
  parent?: string;
  parentNullable?: boolean;
  path?: NestedStep[];
};
const CASOS = {
  optional: [],
  composite: [],
  required: [{ entity: "IntegrationClient", field: "serviceUser" }],
  nested: [],
} as {
  optional: RefCase[];
  composite: RefCase[];
  required: RefCase[];
  nested: RefCase[];
};

const PREFIX = "URX_";
const f = new RowFactory(basePrisma, PREFIX);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const db = (entity: string): any =>
  (basePrisma as any)[f.model(entity).delegate];
const ids: Record<string, string> = {};
let store: SchemaMetadataStore;
const ALL: string[] = [];
const tried: string[] = [];
const skipped: string[] = [];
/** Si la guarda de la base de test pasó: si no, no se siembra ni se limpia nada. */
let safe = false;

/** Un contexto de servicio con todos los permisos (menos los de without), en la empresa A. */
const ctxA = (without: string[] = []): any => {
  const permissions = new Set(ALL.filter((p) => !without.includes(p)));
  return {
    prisma: basePrisma,
    currentUser: {
      id: ids.uA,
      tenant_id_: ids.A,
      tenant_: { id: ids.A },
      roles: [{ id: "User", permissions: [] }],
    },
    permissions: () => permissions,
    hasRole: (...wanted: string[]) => wanted.includes("User"),
    isSystemMode: false,
    req: {},
  };
};

/**
 * Guarda con el UpdateService generado de la entidad, sobre la versión de hoy.
 * Corre dentro de una transacción de este test en READ COMMITTED, que el servicio
 * usa como la de una ruta o un pipeline (txPrisma): así sus escrituras no entran
 * en la detección de conflictos de las transacciones Serializable de otros tests
 * que corren a la vez contra la misma base (la confirmación pública escribe en la
 * misma tabla), que si no chocan con ellas (P2034).
 */
async function update(
  entity: string,
  id: string,
  args: Record<string, unknown>,
  ctx: any = ctxA()
) {
  const { version_ } = await db(entity).findUnique({
    where: { id },
    select: { version_: true },
  });
  const mod = require("../../../src/entities/" +
    lower(entity) +
    "/services/" +
    lower(entity) +
    "UpdateService");
  return basePrisma.$transaction(
    async (tx) => {
      const service = new mod[entity + "UpdateService"](
        { ...ctx, txPrisma: tx },
        basePrisma,
        store
      );
      return service["update" + entity](
        { id, version_, ...args },
        { id: true }
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
    }
  );
}

/**
 * Las filas que escribe un guardado. pg_stat_xact_user_tables cuenta también lo que
 * esa conexión hizo antes y todavía no informó, así que se mide la diferencia,
 * antes y después del guardado, dentro de su transacción.
 */
async function rowsWritten(
  entity: string,
  id: string,
  args: Record<string, unknown>
): Promise<number> {
  const { version_ } = await db(entity).findUnique({
    where: { id },
    select: { version_: true },
  });
  const mod = require("../../../src/entities/" +
    lower(entity) +
    "/services/" +
    lower(entity) +
    "UpdateService");
  const updatedRows = async (tx: any): Promise<number> =>
    (
      await tx.$queryRawUnsafe(
        "SELECT coalesce(sum(n_tup_upd), 0)::int AS n FROM pg_stat_xact_user_tables"
      )
    )[0].n;
  return basePrisma.$transaction(
    async (tx) => {
      const before = await updatedRows(tx);
      const service = new mod[entity + "UpdateService"](
        { ...ctxA(), txPrisma: tx },
        basePrisma,
        store
      );
      await service["update" + entity]({ id, version_, ...args }, { id: true });
      return (await updatedRows(tx)) - before;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 30000,
    }
  );
}

/**
 * Guarda como la app: sin transacción de afuera, el servicio abre la suya
 * (Serializable) y reintenta una vez ante un choque (P2034).
 */
async function saveLikeApp(
  entity: string,
  id: string,
  args: Record<string, unknown>
) {
  const { version_ } = await db(entity).findUnique({
    where: { id },
    select: { version_: true },
  });
  const mod = require("../../../src/entities/" +
    lower(entity) +
    "/services/" +
    lower(entity) +
    "UpdateService");
  return new mod[entity + "UpdateService"](ctxA(), basePrisma, store)[
    "update" + entity
  ]({ id, version_, ...args }, { id: true });
}

/**
 * La clave foránea de una referencia, del schema: el modelo apuntado, su columna
 * propia y, en una compuesta, la que comparte con otra referencia (con la columna
 * del modelo apuntado que le corresponde).
 */
function keyOf(entity: string, field: string) {
  const relationField = f.model(entity).fields.find((x) => x.name === field);
  const rel = relationField?.relation;
  if (!relationField || !rel || rel.fields.length === 0) {
    throw new Error(
      entity + "." + field + " no es una referencia con clave en el schema"
    );
  }
  const own = rel.fields[rel.references.indexOf("id")];
  const shared = rel.fields
    .filter((column) => column !== own)
    .map((column) => ({
      column,
      references: rel.references[rel.fields.indexOf(column)],
    }));
  return { target: relationField.type, own, shared };
}

/** Una fila del modelo: en la empresa A si el modelo tiene empresa; global si no. */
const row = (model: string, data: Record<string, unknown> = {}) =>
  f.create(
    model,
    { tenant: f.model(model).hasTenant ? ids.A : null, user: ids.uA },
    data
  );
const columns = (entity: string, id: string, names: string[]) =>
  db(entity).findUnique({
    where: { id },
    select: Object.fromEntries(names.map((name) => [name, true])),
  });
const failure = (p: Promise<unknown>): Promise<any> =>
  p.then(
    () => {
      throw new Error("no falló");
    },
    (error) => error
  );
const code = (error: any) =>
  error?.extensions?.code ?? error?.constructor?.name;
const nameOf = (c: RefCase) =>
  [c.entity, ...(c.path ?? []).map((step) => step.sub), c.field].join(".");
/** Listas obligatorias sin cambios ({}): la edición las exige. */
const empty = (names: string[]) =>
  Object.fromEntries(names.map((name) => [name, {}]));
/** Las que exige la edición del padre (en nested, las del primer paso). */
const requiredEmpty = (c: RefCase) => empty(c.path?.[0]?.requiredLists ?? []);
/** El permiso de ver las filas de un modelo, el que mira la poda del select. */
const retrieveOf = (model: string) => f.model(model).delegate + "_retrieve";

/** Borra lo de este test, con la consola callada (el cliente de Prisma avisa cada borrado que todavía no puede hacer). */
async function purge(): Promise<void> {
  const quiet = jest.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await f.purge();
  } finally {
    quiet.mockRestore();
  }
}

/**
 * Los candidatos que se pueden sembrar y guardar: seed siembra lo que el caso
 * necesita, y una edición sin cambios del registro sembrado tiene que guardarse.
 * Lo que escriben en la consola se calla. Los que no, quedan afuera con su
 * motivo; si no queda ninguno, falla con el motivo de cada uno.
 */
async function ready<T extends { record: string }>(
  kind: string,
  candidates: RefCase[],
  seed: (c: RefCase) => Promise<T>
) {
  const found: { c: RefCase; seeded: T }[] = [];
  const reasons: string[] = [];
  for (const candidate of candidates) {
    const spies = (["log", "info", "warn", "error"] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
    try {
      const seeded = await seed(candidate);
      await update(candidate.entity, seeded.record, requiredEmpty(candidate));
      found.push({ c: candidate, seeded });
      tried.push(
        kind +
          ": " +
          nameOf(candidate) +
          (candidate.parent ? " (con " + candidate.parent + ")" : "")
      );
    } catch (error: any) {
      const reason =
        nameOf(candidate) +
        ": " +
        String(error?.message ?? error)
          .trim()
          .split("\n")[0];
      reasons.push(reason);
      skipped.push(kind + ": " + reason);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  }
  if (found.length === 0)
    throw new Error(
      "ningún caso de " +
        kind +
        " se pudo sembrar y guardar:\n  " +
        reasons.join("\n  ")
    );
  return found;
}

/** Lo que los servicios escriben en la consola mientras corre un caso: una advertencia o un error lo hace fallar. */
let consoleLines: { level: string; text: string }[] = [];
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
  expect(
    consoleLines
      .filter((l) => l.level === "warn" || l.level === "error")
      .map((l) => l.level + ": " + l.text)
  ).toEqual([]);
});

beforeAll(async () => {
  assertSafeTestDatabase();
  safe = true;
  await purge();
  const quiet = jest.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    store = new SchemaMetadataStore();
    store.build();
  } finally {
    quiet.mockRestore();
  }
  for (const m of f.models.values())
    for (const a of ["retrieve", "create", "update", "delete"])
      ALL.push(m.delegate + "_" + a);
  ids.A = await f.create("Tenant", { tenant: null });
  ids.uA = await f.create("User", { tenant: ids.A });
}, 300000);

afterAll(async () => {
  if (tried.length)
    console.log("\nupdateRefs, probados:\n  " + tried.join("\n  "));
  if (skipped.length)
    console.log(
      "\nupdateRefs, afuera (no se pudieron sembrar y guardar):\n  " +
        skipped.join("\n  ")
    );
  // El latido de SSEManager (lo cargan los servicios de las entidades cacheables) no
  // deja terminar a jest: se apaga, con su aviso callado.
  const quiet = jest.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    require("../../../src/services/sse/SSEManager").sseManager.dispose();
  } finally {
    quiet.mockRestore();
  }
  if (safe) await purge();
  await basePrisma.$disconnect();
}, 300000);

(CASOS.optional.length > 0 ? describe : describe.skip)(
  "una referencia opcional",
  () => {
    type Seeded = {
      record: string;
      column: string;
      target: string;
      first: string;
      second: string;
    };
    let cases: { c: RefCase; seeded: Seeded }[] = [];
    beforeAll(async () => {
      if (!safe) return;
      cases = await ready("opcional", CASOS.optional, async (c) => {
        const key = keyOf(c.entity, c.field);
        const first = await row(key.target);
        const second = await row(key.target);
        return {
          record: await row(c.entity, { [key.own]: first }),
          column: key.own,
          target: key.target,
          first,
          second,
        };
      });
    }, 300000);

    /** Un registro nuevo con la referencia en value (o sin ella), y cómo queda después de guardar args. */
    async function after(
      c: RefCase,
      s: Seeded,
      value: string | null,
      args: Record<string, unknown>
    ) {
      const record = await row(
        c.entity,
        value === null ? {} : { [s.column]: value }
      );
      await update(c.entity, record, args);
      return {
        caso: nameOf(c),
        [s.column]: (await columns(c.entity, record, [s.column]))[s.column],
      };
    }

    it.each([
      ["null (el formulario público)", null],
      ['"" (la app)', ""],
    ])("%s la vacía: queda en NULL", async (_label, value) => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, s.first, { [c.field + "Id"]: value })).toEqual(
          { caso: nameOf(c), [s.column]: null }
        );
      }
    });

    it("sin el argumento (undefined) no se toca", async () => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, s.first, {})).toEqual({
          caso: nameOf(c),
          [s.column]: s.first,
        });
      }
    });

    it.each([
      ["null", null],
      ['""', ""],
    ])(
      "sin permiso de ver el modelo al que apunta, %s no la vacía (se la mostró vacía la poda); con el permiso, sí",
      async (_label, value) => {
        for (const { c, seeded: s } of cases) {
          // (sin ver su propio modelo no se puede editar: una que apunta a su entidad no entra)
          if (s.target === c.entity) continue;
          const record = await row(c.entity, { [s.column]: s.first });
          await update(
            c.entity,
            record,
            { [c.field + "Id"]: value },
            ctxA([retrieveOf(s.target)])
          );
          expect({
            caso: nameOf(c),
            ...(await columns(c.entity, record, [s.column])),
          }).toEqual({ caso: nameOf(c), [s.column]: s.first });
          await update(c.entity, record, { [c.field + "Id"]: value });
          expect({
            caso: nameOf(c),
            ...(await columns(c.entity, record, [s.column])),
          }).toEqual({ caso: nameOf(c), [s.column]: null });
        }
      }
    );

    it("con un id, se conecta", async () => {
      for (const { c, seeded: s } of cases) {
        expect(
          await after(c, s, s.first, { [c.field + "Id"]: s.second })
        ).toEqual({ caso: nameOf(c), [s.column]: s.second });
      }
    });

    it('por el guardado de la app (su transacción Serializable, con su reintento), "" la vacía', async () => {
      const { c, seeded: s } = cases[0];
      const record = await row(c.entity, { [s.column]: s.first });
      await saveLikeApp(c.entity, record, { [c.field + "Id"]: "" });
      expect({
        caso: nameOf(c),
        ...(await columns(c.entity, record, [s.column])),
      }).toEqual({ caso: nameOf(c), [s.column]: null });
    });

    it.each([
      ["null", null],
      ['""', ""],
    ])("vaciar una que ya está vacía (%s) no falla", async (_label, value) => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, null, { [c.field + "Id"]: value })).toEqual({
          caso: nameOf(c),
          [s.column]: null,
        });
      }
    });
  }
);

(CASOS.composite.length > 0 ? describe : describe.skip)(
  "una referencia opcional con clave compuesta (compositeWith)",
  () => {
    /**
     * own: la columna propia de esta referencia (la provincia); parentColumn: la de
     * la otra (el país), que comparten. Dos filas de la otra (dos países) y una de
     * esta en cada una (una provincia de cada país).
     */
    type Seeded = {
      record: string;
      own: string;
      target: string;
      parentColumn: string;
      p1: string;
      p2: string;
      c1: string;
      c2: string;
    };
    let cases: { c: RefCase; seeded: Seeded }[] = [];
    beforeAll(async () => {
      if (!safe) return;
      cases = await ready("compuesta", CASOS.composite, async (c) => {
        const key = keyOf(c.entity, c.field);
        const parentKey = keyOf(c.entity, c.parent!);
        if (key.shared.length !== 1 || key.shared[0].column !== parentKey.own) {
          throw new Error(
            "la clave de " + c.field + " no comparte la columna de " + c.parent
          );
        }
        const p1 = await row(parentKey.target);
        const p2 = await row(parentKey.target);
        const c1 = await row(key.target, { [key.shared[0].references]: p1 });
        const c2 = await row(key.target, { [key.shared[0].references]: p2 });
        const record = await row(c.entity, {
          [parentKey.own]: p1,
          [key.own]: c1,
        });
        return {
          record,
          own: key.own,
          target: key.target,
          parentColumn: parentKey.own,
          p1,
          p2,
          c1,
          c2,
        };
      });
    }, 300000);

    /** Las dos columnas de la clave, como quedaron. */
    const keys = async (c: RefCase, s: Seeded, record: string) => ({
      caso: nameOf(c),
      ...(await columns(c.entity, record, [s.parentColumn, s.own])),
    });
    const expected = (
      c: RefCase,
      s: Seeded,
      parent: string | null,
      own: string | null
    ) => ({
      caso: nameOf(c),
      [s.parentColumn]: parent,
      [s.own]: own,
    });
    /** Un registro nuevo con la otra en p1 y esta en c1, guardado con args. */
    async function after(c: RefCase, s: Seeded, args: Record<string, unknown>) {
      const record = await row(c.entity, {
        [s.parentColumn]: s.p1,
        [s.own]: s.c1,
      });
      await update(c.entity, record, args);
      return keys(c, s, record);
    }

    it.each([
      ["null", null],
      ['""', ""],
    ])(
      "%s la vacía y la otra queda: solo su columna en NULL",
      async (_label, value) => {
        for (const { c, seeded: s } of cases) {
          expect(await after(c, s, { [c.field + "Id"]: value })).toEqual(
            expected(c, s, s.p1, null)
          );
        }
      }
    );

    it.each([
      ["null (el formulario público)", null],
      ['"" (la app)', ""],
    ])(
      "cambiar la otra y vaciar esta con %s en el mismo guardado: la nueva y esta en NULL, sin chocar con la clave compuesta",
      async (_label, value) => {
        for (const { c, seeded: s } of cases) {
          expect(
            await after(c, s, {
              [c.parent + "Id"]: s.p2,
              [c.field + "Id"]: value,
            })
          ).toEqual(expected(c, s, s.p2, null));
        }
      }
    );

    it("cambiar la otra y elegir una de la nueva: se guardan las dos", async () => {
      for (const { c, seeded: s } of cases) {
        expect(
          await after(c, s, { [c.parent + "Id"]: s.p2, [c.field + "Id"]: s.c2 })
        ).toEqual(expected(c, s, s.p2, s.c2));
      }
    });

    it("sin el argumento (undefined) no se toca", async () => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, {})).toEqual(expected(c, s, s.p1, s.c1));
      }
    });

    it.each([
      ["null", null],
      ['""', ""],
    ])(
      "sin permiso de ver el modelo de esta, %s no la vacía y la otra queda; con el permiso, sí",
      async (_label, value) => {
        for (const { c, seeded: s } of cases) {
          if (s.target === c.entity) continue;
          const record = await row(c.entity, {
            [s.parentColumn]: s.p1,
            [s.own]: s.c1,
          });
          await update(
            c.entity,
            record,
            { [c.field + "Id"]: value },
            ctxA([retrieveOf(s.target)])
          );
          expect(await keys(c, s, record)).toEqual(expected(c, s, s.p1, s.c1));
          await update(c.entity, record, { [c.field + "Id"]: value });
          expect(await keys(c, s, record)).toEqual(expected(c, s, s.p1, null));
        }
      }
    );

    it("vaciar una que ya está vacía no falla", async () => {
      for (const { c, seeded: s } of cases) {
        const record = await row(c.entity, { [s.parentColumn]: s.p1 });
        await update(c.entity, record, { [c.field + "Id"]: "" });
        expect(await keys(c, s, record)).toEqual(expected(c, s, s.p1, null));
      }
    });

    it.each([
      ["null", null],
      ['""', ""],
    ])(
      "quien no ve el modelo de esta cambia la otra y la deja en %s: guarda, y esta queda en NULL (una de otro padre no puede quedar)",
      async (_label, value) => {
        for (const { c, seeded: s } of cases) {
          if (s.target === c.entity) continue;
          const record = await row(c.entity, {
            [s.parentColumn]: s.p1,
            [s.own]: s.c1,
          });
          await update(
            c.entity,
            record,
            { [c.parent + "Id"]: s.p2, [c.field + "Id"]: value },
            ctxA([retrieveOf(s.target)])
          );
          expect(await keys(c, s, record)).toEqual(expected(c, s, s.p2, null));
        }
      }
    );

    it("cambiar la otra sin mandar esta (undefined, como una llamada a la API): esta queda en NULL", async () => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, { [c.parent + "Id"]: s.p2 })).toEqual(
          expected(c, s, s.p2, null)
        );
      }
    });

    it("quien no ve el modelo de esta vacía la otra: quedan las dos en NULL (con la otra obligatoria no se puede vaciar)", async () => {
      for (const { c, seeded: s } of cases) {
        if (s.target === c.entity || !c.parentNullable) continue;
        const record = await row(c.entity, {
          [s.parentColumn]: s.p1,
          [s.own]: s.c1,
        });
        await update(
          c.entity,
          record,
          { [c.parent + "Id"]: "", [c.field + "Id"]: "" },
          ctxA([retrieveOf(s.target)])
        );
        expect(await keys(c, s, record)).toEqual(expected(c, s, null, null));
      }
    });

    it("la otra llega con el mismo id (no cambia): quien no ve esta y la deja en blanco no la vacía", async () => {
      for (const { c, seeded: s } of cases) {
        if (s.target === c.entity) continue;
        const record = await row(c.entity, {
          [s.parentColumn]: s.p1,
          [s.own]: s.c1,
        });
        await update(
          c.entity,
          record,
          { [c.parent + "Id"]: s.p1, [c.field + "Id"]: "" },
          ctxA([retrieveOf(s.target)])
        );
        expect(await keys(c, s, record)).toEqual(expected(c, s, s.p1, s.c1));
      }
    });

    it('una que ya está vacía no suma una escritura: con "" se escriben las mismas filas que sin el argumento', async () => {
      for (const { c, seeded: s } of cases) {
        const withoutArg = await rowsWritten(
          c.entity,
          await row(c.entity, { [s.parentColumn]: s.p1 }),
          {}
        );
        const withBlank = await rowsWritten(
          c.entity,
          await row(c.entity, { [s.parentColumn]: s.p1 }),
          { [c.field + "Id"]: "" }
        );
        expect({ caso: nameOf(c), filas: withBlank }).toEqual({
          caso: nameOf(c),
          filas: withoutArg,
        });
      }
    });

    it('por el guardado de la app (su transacción Serializable, con su reintento): cambiar la otra y dejar esta en "" guarda la nueva y esta en NULL', async () => {
      const { c, seeded: s } = cases[0];
      const record = await row(c.entity, {
        [s.parentColumn]: s.p1,
        [s.own]: s.c1,
      });
      await saveLikeApp(c.entity, record, {
        [c.parent + "Id"]: s.p2,
        [c.field + "Id"]: "",
      });
      expect(await keys(c, s, record)).toEqual(expected(c, s, s.p2, null));
    });

    it("vaciar las dos: si la otra es opcional, quedan las dos en NULL; si es obligatoria, es un faltante y no se guarda nada", async () => {
      for (const { c, seeded: s } of cases) {
        const args = { [c.parent + "Id"]: null, [c.field + "Id"]: null };
        if (c.parentNullable) {
          expect(await after(c, s, args)).toEqual(expected(c, s, null, null));
        } else {
          const record = await row(c.entity, {
            [s.parentColumn]: s.p1,
            [s.own]: s.c1,
          });
          expect({
            caso: nameOf(c),
            code: code(await failure(update(c.entity, record, args))),
          }).toEqual({
            caso: nameOf(c),
            code: "VALIDATION_REQUIRED",
          });
          expect(await keys(c, s, record)).toEqual(expected(c, s, s.p1, s.c1));
        }
      }
    });
  }
);

(CASOS.nested.length > 0 ? describe : describe.skip)(
  "una referencia opcional de una subentidad, en updates anidados del padre",
  () => {
    /** Los modelos del camino (cada uno, la subentidad del anterior y la columna con que apunta a él) y la referencia. */
    type Seeded = {
      record: string;
      chain: { model: string; link: string }[];
      column: string;
      target: string;
      first: string;
    };
    let cases: { c: RefCase; seeded: Seeded }[] = [];
    beforeAll(async () => {
      if (!safe) return;
      cases = await ready("anidada", CASOS.nested, async (c) => {
        const chain: { model: string; link: string }[] = [];
        let owner = c.entity;
        for (const step of c.path!) {
          const link = f.parentLink(owner, step.sub);
          chain.push({ model: link.child, link: link.fk });
          owner = link.child;
        }
        const key = keyOf(owner, c.field);
        return {
          record: await row(c.entity),
          chain,
          column: key.own,
          target: key.target,
          first: await row(key.target),
        };
      });
    }, 300000);

    /**
     * Un padre nuevo con una fila en cada nivel del camino (la última apunta a first),
     * y cómo queda la última después de guardar el padre con el item del último nivel.
     */
    async function after(
      c: RefCase,
      s: Seeded,
      value: string | null | undefined,
      ctx: any = ctxA()
    ) {
      const record = await row(c.entity);
      const rows: string[] = [];
      let owner = record;
      for (let i = 0; i < s.chain.length; i++) {
        const last = i === s.chain.length - 1;
        owner = await row(
          s.chain[i].model,
          last
            ? { [s.chain[i].link]: owner, [s.column]: s.first }
            : { [s.chain[i].link]: owner }
        );
        rows.push(owner);
      }
      // El item de cada nivel, de adentro hacia afuera: el último con la referencia, los otros con el siguiente.
      let item: Record<string, unknown> =
        value === undefined
          ? { id: rows[rows.length - 1] }
          : { id: rows[rows.length - 1], [c.field + "Id"]: value };
      for (let i = c.path!.length - 1; i > 0; i--) {
        item = {
          id: rows[i - 1],
          ...empty(c.path![i].requiredLists),
          [c.path![i].sub]: { update: [item] },
        };
      }
      await update(
        c.entity,
        record,
        { ...requiredEmpty(c), [c.path![0].sub]: { update: [item] } },
        ctx
      );
      const lastModel = s.chain[s.chain.length - 1].model;
      return {
        caso: nameOf(c),
        [s.column]: (
          await columns(lastModel, rows[rows.length - 1], [s.column])
        )[s.column],
      };
    }

    it.each([
      ["null", null],
      ['""', ""],
    ])("%s la vacía: queda en NULL", async (_label, value) => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, value)).toEqual({
          caso: nameOf(c),
          [s.column]: null,
        });
      }
    });

    it("sin el argumento (undefined) no se toca", async () => {
      for (const { c, seeded: s } of cases) {
        expect(await after(c, s, undefined)).toEqual({
          caso: nameOf(c),
          [s.column]: s.first,
        });
      }
    });

    it('sin permiso de ver el modelo al que apunta, "" no la vacía', async () => {
      for (const { c, seeded: s } of cases) {
        if (
          s.target === c.entity ||
          s.chain.some((level) => level.model === s.target)
        )
          continue;
        expect(await after(c, s, "", ctxA([retrieveOf(s.target)]))).toEqual({
          caso: nameOf(c),
          [s.column]: s.first,
        });
      }
    });
  }
);

(CASOS.required.length > 0 ? describe : describe.skip)(
  "una referencia obligatoria",
  () => {
    type Seeded = { record: string; column: string };
    let cases: { c: RefCase; seeded: Seeded }[] = [];
    beforeAll(async () => {
      if (!safe) return;
      cases = await ready("obligatoria", CASOS.required, async (c) => ({
        record: await row(c.entity),
        column: keyOf(c.entity, c.field).own,
      }));
    }, 300000);

    const state = async (c: RefCase, s: Seeded, record: string) => ({
      caso: nameOf(c),
      ...(await columns(c.entity, record, ["version_", s.column])),
    });

    it("null es un faltante: VALIDATION_REQUIRED, y no se guarda nada", async () => {
      for (const { c, seeded: s } of cases) {
        const record = await row(c.entity);
        const before = await state(c, s, record);
        expect(before[s.column]).not.toBeNull();
        const error = await failure(
          update(c.entity, record, { [c.field + "Id"]: null })
        );
        expect({ caso: nameOf(c), code: code(error) }).toEqual({
          caso: nameOf(c),
          code: "VALIDATION_REQUIRED",
        });
        expect(await state(c, s, record)).toEqual(before);
      }
    });

    it('"" no la toca', async () => {
      for (const { c, seeded: s } of cases) {
        const record = await row(c.entity);
        const before = (await state(c, s, record))[s.column];
        await update(c.entity, record, { [c.field + "Id"]: "" });
        expect(await state(c, s, record)).toMatchObject({
          caso: nameOf(c),
          [s.column]: before,
        });
      }
    });
  }
);
