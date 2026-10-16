// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.

import "reflect-metadata";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../src/common/services/securePrismaOps";
import { UnauthorizedError, ValidationError } from "../../../src/common/errors";

const TENANT = "WRITE_TENANT";
const FOREIGN = "WRITE_OTRO_TENANT";

interface Call {
  model: string;
  method: string;
  args: any;
}

/**
 * Prisma que anota todo y devuelve algo plausible.
 *
 * A diferencia del espía de lectura, este NO corta: las escrituras leen antes
 * de escribir —`findFirst` para armar el `previousData` del bus— y cortar en
 * la primera llamada dejaría el `update` real sin ejecutar, que es justo lo
 * que hay que observar.
 */
const prismaSpy = (
  calls: Call[],
  previousRead: any = { id: "x", tenant_id_: TENANT },
  connectedCount = 1
): any =>
  new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$transaction") {
          return (fn: any) =>
            typeof fn === "function" ? fn(prismaSpy(calls)) : Promise.all(fn);
        }
        return new Proxy(
          {},
          {
            get: (_t2, method: string) => (args: any) => {
              calls.push({
                model: String(model),
                method: String(method),
                args,
              });
              // findFirst es la lectura que decide si la fila es tuya. Poder
              // devolver null es lo que permite probar el guard.
              // count es lo que decide validateTenantRelations: cuántas de las
              // filas conectadas son alcanzables desde esta empresa.
              if (method === "count") return Promise.resolve(connectedCount);
              if (method === "findFirst" || method === "findUnique") {
                // `ajena`: la fila EXISTE pero es de otra empresa. La lectura
                // filtrada no la encuentra; una sin filtrar, sí. Es el escenario
                // exacto que distingue un upsert seguro de uno que pisa lo ajeno.
                if (previousRead === "ajena") {
                  return Promise.resolve(
                    tenantFilterOf(args?.where) === undefined
                      ? { id: "x", tenant_id_: FOREIGN }
                      : null
                  );
                }
                return Promise.resolve(previousRead);
              }
              return Promise.resolve({ id: "x", tenant_id_: TENANT });
            },
          }
        );
      },
    }
  );

const context = (permissions: string[]): any => ({
  isSystemMode: false,
  currentUser: {
    id: "WRITE_USER",
    tenant_id_: TENANT,
    active: true,
    roles: [],
  },
  permissions: () => new Set<string>(permissions),
});

/** El VALOR del tenant en un `where`, o undefined. Valor y no booleano: un
 * filtro por el tenant equivocado es una fuga igual de grave. */
const tenantFilterOf = (where: any): unknown => {
  if (where === null || typeof where !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(where, "tenant_id_"))
    return where.tenant_id_;
  for (const v of Object.values(where)) {
    const found = Array.isArray(v)
      ? v.map(tenantFilterOf).find((x) => x !== undefined)
      : tenantFilterOf(v);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** El tenant que un `data` va a grabar, sea por FK o por relación. */
const tenantInData = (data: any): unknown => {
  if (!data || typeof data !== "object") return undefined;
  if (data.tenant_id_ !== undefined) return data.tenant_id_;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("tenant") && v && typeof v === "object") {
      const connected = (v as any).connect?.id;
      if (connected !== undefined) return connected;
    }
  }
  return undefined;
};

const last = (calls: Call[], method: string): Call | undefined =>
  [...calls].reverse().find((l) => l.method === method);

const ENTITIES = [
  { entity: "AbStatement", basePermission: "abStatement", shared: false },
  {
    entity: "AbConceptCorrection",
    basePermission: "abConceptCorrection",
    shared: false,
  },
  {
    entity: "AbReconciliation",
    basePermission: "abReconciliation",
    shared: false,
  },
  { entity: "AbPaymentBatch", basePermission: "abPaymentBatch", shared: false },
  { entity: "User", basePermission: "user", shared: false },
  { entity: "Role", basePermission: "role", shared: false },
  { entity: "Permission", basePermission: "permission", shared: true },
  { entity: "Tenant", basePermission: "tenant", shared: true },
  { entity: "WorkerEvent", basePermission: "workerEvent", shared: false },
  {
    entity: "IntegrationClient",
    basePermission: "integrationClient",
    shared: false,
  },
  {
    entity: "IdempotencyRecord",
    basePermission: "idempotencyRecord",
    shared: false,
  },
  {
    entity: "UserNotification",
    basePermission: "userNotification",
    shared: false,
  },
  {
    entity: "UserNotificationPreference",
    basePermission: "userNotificationPreference",
    shared: false,
  },
  {
    entity: "EmailVerification",
    basePermission: "emailVerification",
    shared: false,
  },
];

let store: SchemaMetadataStore;

beforeAll(() => {
  store = new SchemaMetadataStore();
  store.build();
});

const ops = (
  entity: string,
  permissions: string[],
  calls: Call[],
  previousRead?: any,
  connectedCount = 1
) =>
  new SecurePrismaOps(
    context(permissions),
    prismaSpy(
      calls,
      previousRead === undefined
        ? { id: "x", tenant_id_: TENANT }
        : previousRead,
      connectedCount
    ),
    store,
    entity as any,
    {} as any
  );

describe("las relaciones que se conectan", () => {
  /** Entidades con una relación a-uno hacia un modelo con tenencia. */
  const withRefs = () =>
    ENTITIES.filter((e: any) => !e.shared).flatMap((e: any) => {
      const meta: any = store.get(e.entity);
      const rel = [...(meta?.relations?.values() ?? [])].find(
        (r: any) =>
          !r.isList &&
          store.get(r.relatedModelName)?.tenantIdField &&
          r.fieldName !== "tenant_"
      );
      return rel
        ? [{ ...e, relation: rel.fieldName, target: rel.relatedModelName }]
        : [];
    });

  const createConnecting = (testCase: any, count: number) => {
    const calls: Call[] = [];
    return ops(
      testCase.entity,
      [`${testCase.basePermission}_create`],
      calls,
      undefined,
      count
    )
      .create({
        data: { [testCase.relation]: { connect: { id: "ajeno" } } },
      } as any)
      .then(() => ({ calls, error: undefined as any }))
      .catch((error: any) => ({ calls, error }));
  };

  it("hay entidades con referencias con tenencia que probar", () => {
    expect(withRefs().length).toBeGreaterThan(0);
  });

  it("conectar algo de otra empresa se rechaza", async () => {
    // El count filtrado devuelve menos filas de las conectadas: esa diferencia
    // ES la señal de que algo no es alcanzable desde esta empresa.
    const passedThrough: string[] = [];
    for (const testCase of withRefs().slice(0, 10)) {
      const { error } = await createConnecting(testCase, 0);
      if (!(error instanceof ValidationError))
        passedThrough.push(`${testCase.entity}.${testCase.relation}`);
    }
    expect(passedThrough).toEqual([]);
  });

  it("conectar algo propio no se rechaza", async () => {
    // El contrapunto: si rechazara siempre, el test de arriba pasaría sin
    // distinguir nada.
    for (const testCase of withRefs().slice(0, 10)) {
      const { error } = await createConnecting(testCase, 1);
      expect(error).not.toBeInstanceOf(ValidationError);
    }
  });

  it("la comprobación se hace filtrando por empresa", async () => {
    // Si el count no filtrara, contaría las filas de todas y nunca faltaría
    // ninguna: la validación pasaría siempre y no protegería nada.
    for (const testCase of withRefs().slice(0, 10)) {
      const { calls } = await createConnecting(testCase, 1);
      const counted = last(calls, "count");
      expect(counted).toBeDefined();
      expect(tenantFilterOf(counted!.args?.where)).toBe(TENANT);
    }
  });
});

describe("la lectura anidada", () => {
  /** Entidades con una relación a-muchos hacia un modelo con tenencia. */
  const withChildren = () =>
    ENTITIES.filter((e: any) => !e.shared).flatMap((e: any) => {
      const meta: any = store.get(e.entity);
      const rel = [...(meta?.relations?.values() ?? [])].find(
        (r: any) => r.isList && store.get(r.relatedModelName)?.tenantIdField
      );
      return rel
        ? [{ ...e, relation: rel.fieldName, child: rel.relatedModelName }]
        : [];
    });

  const readWithSelect = async (testCase: any, permissions: string[]) => {
    const calls: Call[] = [];
    await ops(testCase.entity, permissions, calls)
      .findMany({
        select: { id: true, [testCase.relation]: { select: { id: true } } },
      } as any)
      .catch(() => undefined);
    return last(calls, "findMany");
  };

  it("sin permiso sobre el hijo, la relación se poda", async () => {
    // Pedir un subregistro que no se puede leer no debe devolverlo: la poda es
    // lo que impide que un select anidado sea una puerta lateral al permiso.
    for (const testCase of withChildren().slice(0, 8)) {
      const readCall = await readWithSelect(testCase, [
        `${testCase.basePermission}_retrieve`,
      ]);
      expect(readCall).toBeDefined();
      expect(readCall!.args?.select?.[testCase.relation]).toBeUndefined();
    }
  });

  it("con permiso sobre el hijo, la relación sobrevive", async () => {
    // El contrapunto: si la poda sacara todo, el test de arriba pasaría sin
    // probar nada.
    for (const testCase of withChildren().slice(0, 8)) {
      const childPermission = `${testCase.child
        .charAt(0)
        .toLowerCase()}${testCase.child.slice(1)}_retrieve`;
      const readCall = await readWithSelect(testCase, [
        `${testCase.basePermission}_retrieve`,
        childPermission,
      ]);
      expect(readCall).toBeDefined();
      expect(readCall!.args?.select?.[testCase.relation]).toBeDefined();
    }
  });

  it("la relación anidada se filtra por empresa", async () => {
    // La poda mira el PERMISO, no la empresa. Un hijo con tenencia alcanzado
    // por una relación tiene que llevar su propio filtro: de lo contrario lo
    // único que hoy evita la fuga es que el schema GraphQL no proyecte esas
    // relaciones — una defensa accidental, no del cuello de botella.
    const unfiltered: string[] = [];

    for (const testCase of withChildren()) {
      const childPermission = `${testCase.child
        .charAt(0)
        .toLowerCase()}${testCase.child.slice(1)}_retrieve`;
      const readCall = await readWithSelect(testCase, [
        `${testCase.basePermission}_retrieve`,
        childPermission,
      ]);
      const nested = readCall?.args?.select?.[testCase.relation];
      if (nested && tenantFilterOf(nested.where) !== TENANT) {
        unfiltered.push(`${testCase.entity}.${testCase.relation}`);
      }
    }

    expect(unfiltered).toEqual([]);
  });
});

describe("forTenant: escribir en otra empresa, pidiéndolo", () => {
  /** Las que declaran .tenantSelectableBy: las únicas donde es legítimo. */
  const withPrivilege = () =>
    ENTITIES.filter(
      (e: any) => !e.shared && store.get(e.entity)?.tenantSelectableBy?.length
    );

  it("sin el rol, forTenant es un error explícito", () => {
    // El privilegio se pide en el call site y se valida acá, igual que la
    // lectura. Un rol que no lo tiene recibe un no, no un silencio.
    for (const e of withPrivilege()) {
      expect(() =>
        (ops(e.entity, [`${e.basePermission}_create`], []) as any).forTenant(
          FOREIGN
        )
      ).toThrow(UnauthorizedError);
    }
  });

  it("en una entidad sin el privilegio declarado, tampoco", () => {
    const withoutPrivilege = ENTITIES.filter(
      (e: any) => !e.shared && !store.get(e.entity)?.tenantSelectableBy?.length
    );
    expect(withoutPrivilege.length).toBeGreaterThan(0);
    for (const e of withoutPrivilege.slice(0, 5)) {
      expect(() =>
        (ops(e.entity, [`${e.basePermission}_create`], []) as any).forTenant(
          FOREIGN
        )
      ).toThrow(UnauthorizedError);
    }
  });

  it("con la lista de roles VACÍA tampoco habilita", () => {
    // Distinto de "no declarado": el atributo existe pero no nombra a nadie.
    // Sin este caso, el guard se puede romper a la mitad y nadie se entera.
    const meta: any = {
      ...store.get(ENTITIES.find((e: any) => !e.shared)!.entity),
      tenantSelectableBy: [],
    };
    // Derivado del store real: el constructor de SecurePrismaOps exige una
    // instancia de verdad, y hace bien. Se cambia solo la respuesta para este
    // modelo.
    const riggedStore: any = Object.create(Object.getPrototypeOf(store));
    Object.assign(riggedStore, store);
    riggedStore.get = (n: string) =>
      n === meta.modelName ? meta : store.get(n as any);
    const ops2: any = new SecurePrismaOps(
      {
        isSystemMode: false,
        currentUser: {
          id: "u",
          tenant_id_: TENANT,
          active: true,
          roles: [{ id: "SysAdmin" }],
        },
        permissions: () => new Set<string>(),
      } as any,
      prismaSpy([]),
      riggedStore,
      meta.modelName,
      {} as any
    );
    expect(() => ops2.forTenant(FOREIGN)).toThrow(UnauthorizedError);
  });

  it("el rechazo NOMBRA los roles que sí pueden", () => {
    // Un "no autorizado" pelado obliga a leer el DSL para saber qué falta.
    const e: any = withPrivilege()[0];
    expect(e).toBeDefined();
    const roles: string[] = store.get(e.entity)!.tenantSelectableBy!;
    try {
      (ops(e.entity, [], []) as any).forTenant(FOREIGN);
      throw new Error("no rechazó");
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnauthorizedError);
      const text = `${err.customMessage ?? ""} ${err.message ?? ""}`;
      for (const r of roles) expect(text).toContain(r);
    }
  });

  it("poder leer todas las empresas no habilita escribir en otra", () => {
    // La distinción que el atributo nuevo existe para hacer: crossTenantForRoles
    // sin tenantSelectableBy es lectura administrativa, nada más.
    const readOnlyOnes = ENTITIES.filter(
      (e: any) =>
        !e.shared &&
        store.get(e.entity)?.crossTenantForRoles &&
        !store.get(e.entity)?.tenantSelectableBy?.length
    );
    expect(readOnlyOnes.length).toBeGreaterThan(0);
    for (const e of readOnlyOnes) {
      const meta: any = store.get(e.entity);
      const roles = meta.crossTenantForRoles.roles.map((id: string) => ({
        id,
      }));
      const ctx: any = {
        isSystemMode: false,
        currentUser: {
          id: "WRITE_USER",
          tenant_id_: TENANT,
          active: true,
          roles,
        },
        permissions: () => new Set<string>([`${e.basePermission}_create`]),
      };
      const base = new SecurePrismaOps(
        ctx,
        prismaSpy([]),
        store,
        e.entity as any,
        {} as any
      );
      expect(() => (base as any).forTenant(FOREIGN)).toThrow(UnauthorizedError);
    }
  });

  it("con el rol, el alta y sus hijos nacen en la empresa pedida", async () => {
    const testCases = withPrivilege();
    expect(testCases.length).toBeGreaterThan(0);

    for (const e of testCases) {
      const meta: any = store.get(e.entity);
      const roles = meta.tenantSelectableBy.map((id: string) => ({ id }));
      const calls: Call[] = [];
      const ctx: any = {
        isSystemMode: false,
        currentUser: {
          id: "WRITE_USER",
          tenant_id_: TENANT,
          active: true,
          roles,
        },
        permissions: () => new Set<string>([`${e.basePermission}_create`]),
      };
      const base = new SecurePrismaOps(
        ctx,
        prismaSpy(calls),
        store,
        e.entity as any,
        {} as any
      );

      await (base as any)
        .forTenant(FOREIGN)
        .create({ data: {} })
        .catch(() => undefined);

      const created = last(calls, "create");
      expect(created).toBeDefined();
      // La empresa pedida, no la del operador: si acá saliera TENANT, el
      // privilegio sería decorativo.
      expect(tenantInData(created!.args?.data)).toBe(FOREIGN);
    }
  });
});

describe("el filtro de lectura, rama por rama", () => {
  const USER = "WRITE_USER";

  /**
   * Un store con la metadata del modelo reemplazada por la que pide el caso.
   *
   * Hay que trucar `getAll()`, no `get()`: el filtro de lectura resuelve la
   * metadata desde el mapa que copió en el constructor. Trucando solo `get` los
   * tests pasaban sin que el atributo bajo prueba llegara nunca al código —
   * verde por el comportamiento por defecto, no por lo que decían probar.
   */
  const storeWith = (entity: string, extra: any) => {
    const fake: any = Object.create(Object.getPrototypeOf(store));
    Object.assign(fake, store);
    const map = new Map(store.getAll());
    map.set(entity, { ...store.get(entity as any), ...extra } as any);
    fake.get = (n: string) => map.get(n);
    fake.getAll = () => map;
    return fake;
  };

  const withTenancy = () =>
    ENTITIES.filter(
      (e: any) => !e.shared && store.get(e.entity)?.tenantIdField
    );

  /** Corre un findMany y devuelve el where que llegó a prisma. */
  const whereOf = async (
    entity: string,
    basePermission: string,
    extra: any,
    roles: any[] = [],
    ctxExtra: any = {}
  ) => {
    const calls: Call[] = [];
    const ctx: any = {
      isSystemMode: false,
      currentUser: { id: USER, tenant_id_: TENANT, active: true, roles },
      permissions: () => new Set<string>([`${basePermission}_retrieve`]),
      ...ctxExtra,
    };
    const o: any = new SecurePrismaOps(
      ctx,
      prismaSpy(calls),
      storeWith(entity, extra),
      entity as any,
      {} as any
    );
    await o.findMany({}).catch(() => undefined);
    return last(calls, "findMany")?.args?.where;
  };

  it("sin el rol, crossTenantForRoles NO exime del filtro", async () => {
    const e: any = withTenancy()[0];
    const meta: any = store.get(e.entity);
    const w = await whereOf(
      e.entity,
      e.basePermission,
      {
        crossTenantForRoles: { roles: ["ADMIN"], mode: "always" },
      },
      [{ id: "OTRO_ROL" }]
    );
    expect(w?.[meta.tenantIdField]).toBe(TENANT);
  });

  it("con el rol y mode always, sí exime", async () => {
    const e: any = withTenancy()[0];
    const meta: any = store.get(e.entity);
    const w = await whereOf(
      e.entity,
      e.basePermission,
      {
        crossTenantForRoles: { roles: ["ADMIN"], mode: "always" },
      },
      [{ id: "ADMIN" }]
    );
    expect(w?.[meta.tenantIdField]).toBeUndefined();
  });

  it("con mode onRequest, el rol solo NO alcanza: hay que pedirlo", async () => {
    const e: any = withTenancy()[0];
    const meta: any = store.get(e.entity);
    const w = await whereOf(
      e.entity,
      e.basePermission,
      {
        crossTenantForRoles: { roles: ["ADMIN"], mode: "onRequest" },
      },
      [{ id: "ADMIN" }]
    );
    expect(w?.[meta.tenantIdField]).toBe(TENANT);
  });

  it("ownerScoped filtra por quien creó, siempre", async () => {
    const e: any = withTenancy()[0];
    const w = await whereOf(e.entity, e.basePermission, { ownerScoped: true }, [
      { id: "CUALQUIERA" },
    ]);
    expect(w?.createdBy_id_).toBe(USER);
  });

  it("userScopedForRoles filtra si TODOS los roles del usuario están alcanzados", async () => {
    const e: any = withTenancy()[0];
    const reached = await whereOf(
      e.entity,
      e.basePermission,
      { userScopedForRoles: ["JUNIOR"] },
      [{ id: "JUNIOR" }]
    );
    expect(reached?.createdBy_id_).toBe(USER);
    // Con un rol fuera de la lista, el usuario ve todo el tenant: el scoping es
    // por rol, no por usuario, y un rol más amplio manda.
    const mixed = await whereOf(
      e.entity,
      e.basePermission,
      { userScopedForRoles: ["JUNIOR"] },
      [{ id: "JUNIOR" }, { id: "SENIOR" }]
    );
    expect(mixed?.createdBy_id_).toBeUndefined();
  });

  it("con el flag híbrido, el filtro es lo compartido O lo propio, no todo", async () => {
    const e: any = withTenancy()[0];
    const meta: any = store.get(e.entity);
    const w = await whereOf(
      e.entity,
      e.basePermission,
      { hybridTenantFlagField: "isGlobal" },
      []
    );
    const cond = w?.AND?.[1];
    expect(cond?.OR).toEqual([
      { isGlobal: true },
      { [meta.tenantIdField]: TENANT },
    ]);
  });

  it("sin tenant en el contexto, la lectura no sale sin filtro: corta", async () => {
    const e: any = withTenancy()[0];
    const calls: Call[] = [];
    const ctx: any = {
      isSystemMode: false,
      currentUser: { id: USER, tenant_id_: undefined, active: true, roles: [] },
      permissions: () => new Set<string>([`${e.basePermission}_retrieve`]),
    };
    const o: any = new SecurePrismaOps(
      ctx,
      prismaSpy(calls),
      store,
      e.entity as any,
      {} as any
    );
    await expect(o.findMany({})).rejects.toThrow();
    expect(last(calls, "findMany")).toBeUndefined();
  });
});

describe("upsert: la rama create es un alta, y como tal se comporta", () => {
  const withTenancy = () =>
    ENTITIES.filter(
      (e: any) => !e.shared && store.get(e.entity)?.tenantIdField
    );

  it("la rama create de un upsert tampoco puede elegir el tenant", async () => {
    // upsert inyectaba el tenant SOLO si el campo faltaba, así que un
    // `tenant_id_` ajeno pasaba derecho y la fila nacía en otra empresa.
    // `validateTenantRelations` no lo tapa: mira las relaciones, no el escalar.
    const offenders: string[] = [];

    for (const testCase of withTenancy()) {
      const calls: Call[] = [];
      // lecturaPrevia null: la fila no existe, así que se toma la rama create.
      await ops(
        testCase.entity,
        [
          `${testCase.basePermission}_create`,
          `${testCase.basePermission}_update`,
        ],
        calls,
        null
      )
        .upsert({
          where: { id: "x" },
          create: { tenant_id_: FOREIGN },
          update: {},
        } as any)
        .catch(() => undefined);

      const u = last(calls, "upsert");
      if (u && tenantInData(u.args?.create) === FOREIGN)
        offenders.push(testCase.entity);
    }

    expect(offenders).toEqual([]);
  });

  it("un upsert exige los DOS permisos, no alcanza con uno", async () => {
    const testCase: any = withTenancy()[0];
    expect(testCase).toBeDefined();
    // upsert es async: el throw sincrónico de checkPermission llega como
    // promesa rechazada, no como excepción. Con toThrow() el test no lo ve.
    const withOnly = (permission: string) =>
      (
        ops(
          testCase.entity,
          [`${testCase.basePermission}_${permission}`],
          []
        ) as any
      ).upsert({
        where: { id: "x" },
        create: {},
        update: {},
      });
    await expect(withOnly("create")).rejects.toThrow(UnauthorizedError);
    await expect(withOnly("update")).rejects.toThrow(UnauthorizedError);
  });
});

describe("el tenant en las creaciones anidadas", () => {
  /**
   * La relación se elige de la metadata en tiempo de corrida, no se hornea en
   * la plantilla: así el test sigue al DSL sin que el generador tenga que
   * adivinar qué relación existe en cada proyecto.
   */
  const withTenantChildren = () =>
    ENTITIES.filter((e: any) => !e.shared).flatMap((e: any) => {
      const meta: any = store.get(e.entity);
      const rel = [...(meta?.relations?.values() ?? [])].find(
        (r: any) => r.isList && store.get(r.relatedModelName)?.tenantIdField
      );
      return rel ? [{ ...e, relation: rel.fieldName }] : [];
    });

  it("un hijo anidado no puede nacer en otra empresa", async () => {
    // El padre queda bien —la raíz sí se corrige— y el hijo se cuela: el
    // recursor inyecta solo `if (!item.tenant_ && !item[tenantIdField])`, así
    // que un valor propio pasa derecho. Queda un registro partido entre dos
    // empresas, sin ningún error.
    const offenders: string[] = [];

    for (const testCase of withTenantChildren()) {
      const calls: Call[] = [];
      await ops(testCase.entity, [`${testCase.basePermission}_create`], calls)
        .create({
          data: { [testCase.relation]: { create: [{ tenant_id_: FOREIGN }] } },
        } as any)
        .catch(() => undefined);

      const created = last(calls, "create");
      const child = created?.args?.data?.[testCase.relation]?.create?.[0];
      if (child && tenantInData(child) === FOREIGN) {
        offenders.push(`${testCase.entity}.${testCase.relation}`);
      }
    }

    // Se listan todas de una: saber cuántas y cuáles vale más que frenar en la
    // primera.
    expect(offenders).toEqual([]);
  });

  /**
   * Prisma acepta un create anidado por MUCHOS caminos, y el recursor los trata
   * uno por uno. El test de arriba solo recorría `create` como arreglo: los
   * demás caminos quedaban sin una sola prueba, y una mutación que los rompiera
   * pasaba en verde.
   *
   * No es cobertura por cobertura: cada forma de esta tabla es una manera real
   * de que un cliente mande un hijo con el tenant de otra empresa.
   */
  const SHAPES: { name: string; payload: (rel: string) => any }[] = [
    {
      name: "create como objeto",
      payload: (rel) => ({ [rel]: { create: { tenant_id_: FOREIGN } } }),
    },
    {
      name: "create como arreglo",
      payload: (rel) => ({ [rel]: { create: [{ tenant_id_: FOREIGN }] } }),
    },
    {
      name: "connectOrCreate como objeto",
      payload: (rel) => ({
        [rel]: {
          connectOrCreate: {
            where: { id: "x" },
            create: { tenant_id_: FOREIGN },
          },
        },
      }),
    },
    {
      name: "connectOrCreate como arreglo",
      payload: (rel) => ({
        [rel]: {
          connectOrCreate: [
            { where: { id: "x" }, create: { tenant_id_: FOREIGN } },
          ],
        },
      }),
    },
    {
      name: "upsert.create como objeto",
      payload: (rel) => ({
        [rel]: {
          upsert: {
            where: { id: "x" },
            create: { tenant_id_: FOREIGN },
            update: {},
          },
        },
      }),
    },
    {
      name: "upsert.create como arreglo",
      payload: (rel) => ({
        [rel]: {
          upsert: [
            { where: { id: "x" }, create: { tenant_id_: FOREIGN }, update: {} },
          ],
        },
      }),
    },
  ];

  /** Todos los creates anidados que haya en el payload, sin importar el camino. */
  const nestedCreates = (branch: any): any[] => {
    if (!branch || typeof branch !== "object") return [];
    const output: any[] = [];
    const asList = (x: any) => (Array.isArray(x) ? x : [x]);
    if (branch.create) output.push(...asList(branch.create));
    for (const coc of asList(branch.connectOrCreate ?? [])) {
      if (coc?.create) output.push(...asList(coc.create));
    }
    for (const up of asList(branch.upsert ?? [])) {
      if (up?.create) output.push(...asList(up.create));
    }
    return output.filter(Boolean);
  };

  it.each(SHAPES)(
    "un hijo con tenant ajeno tampoco pasa por $name",
    async ({ payload }) => {
      const offenders: string[] = [];

      for (const testCase of withTenantChildren()) {
        const calls: Call[] = [];
        await ops(testCase.entity, [`${testCase.basePermission}_create`], calls)
          .create({ data: payload(testCase.relation) } as any)
          .catch(() => undefined);

        const created = last(calls, "create");
        for (const child of nestedCreates(
          created?.args?.data?.[testCase.relation]
        )) {
          if (tenantInData(child) === FOREIGN) {
            offenders.push(`${testCase.entity}.${testCase.relation}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    }
  );

  it("hay al menos una entidad con hijos con tenencia que probar", () => {
    // Sin esto, un cambio en la metadata dejaría el test de arriba recorriendo
    // una lista vacía y pasando en verde sin haber probado nada.
    expect(withTenantChildren().length).toBeGreaterThan(0);
  });
});

describe("el tenant en las escrituras", () => {
  describe.each(ENTITIES)(
    "$entity",
    ({ entity, basePermission, shared }: any) => {
      it("al crear, el registro nace en el tenant de quien escribe", async () => {
        const calls: Call[] = [];
        await ops(entity, [`${basePermission}_create`], calls)
          .create({ data: {} } as any)
          .catch(() => undefined);

        const created = last(calls, "create");
        // Si no llegó a Prisma, algo lo frenó antes y este test no probó nada.
        expect(created).toBeDefined();
        expect(tenantInData(created!.args?.data)).toBe(
          shared ? undefined : TENANT
        );
      });

      if (!shared) {
        it("al crear NO se puede elegir el tenant ajeno a mano", async () => {
          // Sin esto, cualquiera con permiso de alta escribe en la empresa que
          // quiera con solo mandar el campo.
          const calls: Call[] = [];
          await ops(entity, [`${basePermission}_create`], calls)
            .create({ data: { tenant_id_: FOREIGN } } as any)
            .catch(() => undefined);

          const created = last(calls, "create");
          if (created)
            expect(tenantInData(created!.args?.data)).not.toBe(FOREIGN);
        });

        it("al actualizar, no se alcanza una fila de otra empresa", async () => {
          const calls: Call[] = [];
          await ops(
            entity,
            [`${basePermission}_update`, `${basePermission}_retrieve`],
            calls
          )
            .update({ where: { id: "x" }, data: {} } as any)
            .catch(() => undefined);

          // La lectura previa arma el previousData del bus: si ESA no filtra,
          // el payload del evento ya viaja con datos ajenos aunque el update falle.
          const readCall = last(calls, "findFirst");
          expect(readCall).toBeDefined();
          expect(tenantFilterOf(readCall!.args?.where)).toBe(TENANT);
        });

        it("si la fila no es tuya, el update NO llega a ejecutarse", async () => {
          // La protección es comprobar-y-después-actuar: la lectura filtrada no
          // encuentra la fila ajena y corta con NotFound. Se afirma la garantía
          // —no se toca lo ajeno— y no la forma en que se consigue, que puede
          // cambiar sin que la garantía cambie.
          const calls: Call[] = [];
          await ops(
            entity,
            [`${basePermission}_update`, `${basePermission}_retrieve`],
            calls,
            null
          )
            .update({ where: { id: "x" }, data: {} } as any)
            .catch(() => undefined);

          expect(last(calls, "update")).toBeUndefined();
        });

        it("al actualizar no se puede mudar el registro a otra empresa", async () => {
          const calls: Call[] = [];
          await ops(
            entity,
            [`${basePermission}_update`, `${basePermission}_retrieve`],
            calls
          )
            .update({
              where: { id: "x" },
              data: { tenant_id_: FOREIGN },
            } as any)
            .catch(() => undefined);

          const updatedCall = last(calls, "update");
          // Mudar una fila de empresa la hace desaparecer de la suya y aparecer
          // en otra: fuga y pérdida en el mismo movimiento.
          if (updatedCall)
            expect(tenantInData(updatedCall!.args?.data)).not.toBe(FOREIGN);
        });

        it("al borrar, no se alcanza una fila de otra empresa", async () => {
          const calls: Call[] = [];
          await ops(
            entity,
            [`${basePermission}_delete`, `${basePermission}_retrieve`],
            calls
          )
            .delete({ where: { id: "x" } } as any)
            .catch(() => undefined);

          const readCall = last(calls, "findFirst");
          expect(readCall).toBeDefined();
          expect(tenantFilterOf(readCall!.args?.where)).toBe(TENANT);
        });

        it("un upsert sobre una fila de otra empresa NO la pisa", async () => {
          // El sondeo va filtrado y no la encuentra, así que decide "no existe".
          // Pero Prisma la encuentra por la llave única y toma la rama UPDATE:
          // escribe sobre lo ajeno sin que nadie haya tocado el tenant. Y el
          // evento sale rotulado como alta, así que la auditoría también miente.
          const calls: Call[] = [];
          await ops(
            entity,
            [
              `${basePermission}_create`,
              `${basePermission}_update`,
              `${basePermission}_retrieve`,
            ],
            calls,
            "ajena"
          )
            .upsert({ where: { id: "x" }, create: {}, update: {} } as any)
            .catch(() => undefined);

          expect(last(calls, "upsert")).toBeUndefined();
        });

        it("si la fila no es tuya, el delete NO llega a ejecutarse", async () => {
          const calls: Call[] = [];
          await ops(
            entity,
            [`${basePermission}_delete`, `${basePermission}_retrieve`],
            calls,
            null
          )
            .delete({ where: { id: "x" } } as any)
            .catch(() => undefined);

          expect(last(calls, "delete")).toBeUndefined();
        });
      }
    }
  );
});
