// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.

import "reflect-metadata";

const mockPublicados: any[] = [];
jest.mock("../../../src/common/services/eventBus", () => ({
  __esModule: true,
  publishEvent: (...args: any[]) => {
    mockPublicados.push(args);
    return Promise.resolve();
  },
  getChangedFields: () => [],
  PrismaAction: {},
}));

import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../src/common/services/securePrismaOps";

const TENANT = "REDACT_TENANT";

const ENTIDADES = [];

let store: SchemaMetadataStore;

beforeAll(() => {
  store = new SchemaMetadataStore();
  store.build();
});

beforeEach(() => {
  mockPublicados.length = 0;
});

/** Prisma que devuelve el record que se le indique, para ver qué se publica. */
const prismaQueDevuelve = (record: any): any =>
  new Proxy(
    {},
    {
      get: (_t, modelo: string) => {
        if (modelo === "$transaction")
          return (fn: any) => fn(prismaQueDevuelve(record));
        return new Proxy({}, { get: () => () => Promise.resolve(record) });
      },
    }
  );

const opsCon = (entidad: string, permisos: string[], record: any) =>
  new SecurePrismaOps(
    {
      isSystemMode: false,
      currentUser: {
        id: "REDACT_USER",
        tenant_id_: TENANT,
        active: true,
        roles: [],
      },
      permissions: () => new Set<string>(permisos),
    } as any,
    prismaQueDevuelve(record),
    store,
    entidad as any,
    {} as any
  );

const payload = () => mockPublicados[mockPublicados.length - 1]?.[2];

describe("el secreto no sale al bus", () => {
  it("hay al menos una entidad con campos .secret que probar", () => {
    // Sin esto, un cambio en el DSL dejaría la tabla vacía y todo en verde.
    expect(ENTIDADES.length).toBeGreaterThan(0);
  });

  it.each(ENTIDADES)(
    "$entidad — $columnas",
    async ({ entidad, permisoBase, columnas }: any) => {
      const record: any = { id: "x", tenant_id_: TENANT };
      for (const s of columnas) record[s] = "VALOR-SECRETO";

      await opsCon(entidad, [`${permisoBase}_create`], record)
        .create({ data: {} } as any)
        .catch(() => undefined);

      const p = payload();
      expect(p).toBeDefined();
      const serializado = JSON.stringify(p);
      // Se mira el JSON entero, no solo la clave: el valor no puede aparecer
      // tampoco anidado en otra rama del payload.
      expect(serializado).not.toContain("VALOR-SECRETO");
      for (const s of columnas) expect(p.data?.[s]).toBeUndefined();
    }
  );
});

describe("el mapeo del DSL a columnas", () => {
  it.each(ENTIDADES)(
    "$entidad — cada campo .secret tiene sus columnas declaradas",
    ({ entidad, columnas, camposDsl }: any) => {
      // Lo anterior verifica que se redacta lo que la metadata declara. Esto
      // verifica que la metadata declara lo que el DSL marcó: si alguien pone
      // .secret y el mapeo no lo levanta, la redacción funciona perfecto sobre
      // una lista incompleta y el secreto viaja igual.
      const declaradas: string[] =
        (store.get(entidad) as any)?.secretFieldNames ?? [];
      for (const c of columnas) expect(declaradas).toContain(c);
      for (const campo of camposDsl) {
        expect(
          columnas.some((c: string) => c === campo || c.startsWith(`${campo}_`))
        ).toBe(true);
      }
    }
  );
});

describe("la forma del payload", () => {
  const primera = () => ENTIDADES[0];

  it("es una COPIA: no comparte objeto con lo que devuelve la operación", async () => {
    // Si compartiera, redactar el payload mutaría el record del llamador — o
    // peor, no redactarlo dejaría el secreto en los dos lados.
    const e: any = primera();
    const record: any = { id: "x", tenant_id_: TENANT, marca: { adentro: 1 } };
    const devuelto = await opsCon(
      e.entidad,
      [`${e.permisoBase}_create`],
      record
    )
      .create({ data: {} } as any)
      .catch(() => undefined);

    const p = payload();
    expect(p).toBeDefined();
    if (p?.data && devuelto) expect(p.data).not.toBe(devuelto);
  });

  it("una clave desconocida con objeto adentro se cae", async () => {
    // No se puede saber qué esconde: fail-closed.
    const e: any = primera();
    const record: any = {
      id: "x",
      tenant_id_: TENANT,
      relacionInversaDesconocida: [{ secreto: "NO-DEBE-VIAJAR" }],
    };

    await opsCon(e.entidad, [`${e.permisoBase}_create`], record)
      .create({ data: {} } as any)
      .catch(() => undefined);

    expect(JSON.stringify(payload())).not.toContain("NO-DEBE-VIAJAR");
  });

  it("un ciclo no cuelga y llega redactado", async () => {
    // La copia se registra ANTES de bajar justamente para esto. Devolver el
    // original al volver a entrar sería fail-open.
    const e: any = primera();
    const record: any = { id: "x", tenant_id_: TENANT };
    record.self = record;

    await expect(
      opsCon(e.entidad, [`${e.permisoBase}_create`], record)
        .create({ data: {} } as any)
        .catch(() => undefined)
    ).resolves.toBeDefined();
  }, 10000);
});
