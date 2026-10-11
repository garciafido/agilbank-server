// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.

import "reflect-metadata";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../src/common/services/securePrismaOps";

const TENANT = "READSEC_TENANT";

// Campos de auth de User: no son campos del DSL (se ocultan solo por el SDL), así
// que la denylist base de SecurePrismaOps es la única que los tapa en lectura.
const AUTH_FIELDS = [
  "password",
  "twoFaSecret",
  "twoFaBackupCodes",
  "passwordResetToken",
];

const SUJETO = "AbStatement";
const SUJETO_PERM = "abStatement_retrieve";

const CON_SECRETOS = [];

let store: SchemaMetadataStore;
beforeAll(() => {
  store = new SchemaMetadataStore();
  store.build();
});

/** Prisma que anota los `args` con que lo llamaron y corta ahí: lo que se prueba
 *  es la transformación, no el resultado. */
const prismaEspia = (reg: { args?: any }): any =>
  new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          {
            get: () => (args: any) => {
              reg.args = args;
              throw new Error("__INTERCEPTADO__");
            },
          }
        ),
    }
  );

const opsCon = (entidad: string, permisos: string[], reg: { args?: any }) =>
  new SecurePrismaOps(
    {
      isSystemMode: false,
      currentUser: {
        id: "READSEC_USER",
        tenant_id_: TENANT,
        active: true,
        roles: [],
      },
      permissions: () => new Set<string>(permisos),
    } as any,
    prismaEspia(reg),
    store,
    entidad as any,
    {} as any
  );

describe("redacción de campo en lectura", () => {
  it("hay al menos una entidad con .secret que probar", () => {
    // Sin esto, un cambio del DSL vaciaría la tabla y todo quedaría en verde.
    expect(CON_SECRETOS.length).toBeGreaterThan(0);
  });

  it.each(CON_SECRETOS)(
    "$entidad — las columnas .secret.encrypted SOBREVIVEN al select",
    async ({ entidad, permisoBase, columnas }: any) => {
      // Contra-intuitivo pero correcto: las columnas _encrypted/_iv/_tag de un .secret
      // NO se redactan en esta capa. Son la fuente de los resolvers de descifrado (apiKey,
      // sadaicFtpPassword) y de presencia (dndaUploadPasswordHasValue), que las inyectan al
      // select server-side; la exposición al cliente la gobierna el resolver. Redactarlas
      // acá los starva y devuelven null/false. El bus de eventos las redacta aparte.
      const reg: { args?: any } = {};
      const select: any = { id: true };
      for (const c of columnas) select[c] = true;
      await opsCon(entidad, [`${permisoBase}_retrieve`], reg)
        .findMany({ select } as any)
        .catch(() => undefined);

      expect(reg.args?.select?.id).toBe(true);
      for (const c of columnas) expect(reg.args.select[c]).toBe(true);
    }
  );

  it("User — el select de los campos de auth no los devuelve", async () => {
    const reg: { args?: any } = {};
    const select: any = { id: true };
    for (const f of AUTH_FIELDS) select[f] = true;
    await opsCon("User", ["user_retrieve"], reg)
      .findMany({ select } as any)
      .catch(() => undefined);

    expect(reg.args?.select?.id).toBe(true);
    for (const f of AUTH_FIELDS) expect(reg.args.select[f]).toBeUndefined();
  });

  it("User — un select SOLO de un secreto cae a { id: true }, no a todos los escalares", async () => {
    const reg: { args?: any } = {};
    await opsCon("User", ["user_retrieve"], reg)
      .findMany({ select: { password: true } } as any)
      .catch(() => undefined);
    expect(reg.args?.select).toEqual({ id: true });
  });

  it("User — un secreto anidado bajo una relación no-DSL se borra en profundidad", async () => {
    // refreshTokens no está en meta.relations → _pruneRecursive lo conserva entero;
    // el barrido profundo de la denylist igual saca el campo de auth de adentro.
    const reg: { args?: any } = {};
    await opsCon("User", ["user_retrieve"], reg)
      .findMany({
        select: {
          id: true,
          refreshTokens: { select: { id: true, tokenHash: true } },
        },
      } as any)
      .catch(() => undefined);
    const anidado = reg.args?.select?.refreshTokens?.select;
    if (anidado) expect(anidado.tokenHash).toBeUndefined();
  });

  it("User — orderBy por un campo de auth se redacta", async () => {
    const reg: { args?: any } = {};
    await opsCon("User", ["user_retrieve"], reg)
      .findMany({ orderBy: { password: "asc", id: "asc" } } as any)
      .catch(() => undefined);
    expect(reg.args?.orderBy?.id).toBe("asc");
    expect(reg.args.orderBy.password).toBeUndefined();
  });

  it("User — distinct por un campo de auth se redacta", async () => {
    const reg: { args?: any } = {};
    await opsCon("User", ["user_retrieve"], reg)
      .findMany({ distinct: ["password", "id"] } as any)
      .catch(() => undefined);
    expect(reg.args?.distinct).toEqual(["id"]);
  });
});

describe("descenso del filtro de empresa a las relaciones del where", () => {
  it(`${SUJETO} — createdBy_ (→ User) queda acotado por empresa`, async () => {
    const reg: { args?: any } = {};
    await opsCon(SUJETO, [SUJETO_PERM], reg)
      .findMany({
        where: { createdBy_: { email: { equals: "x@y.z" } } },
      } as any)
      .catch(() => undefined);
    // createdBy_ no está en meta.relations (es baseField); se resuelve a User y se
    // le baja el tenant. Sin el fix, este predicado enumeraría users cross-tenant.
    expect(reg.args?.where?.createdBy_?.tenant_id_).toBe(TENANT);
  });

  it(`${SUJETO} — lastUpdatedBy_ { is: null } no rompe (sin tenant hermano)`, async () => {
    const reg: { args?: any } = {};
    await opsCon(SUJETO, [SUJETO_PERM], reg)
      .findMany({ where: { lastUpdatedBy_: { is: null } } } as any)
      .catch(() => undefined);
    // is:null no tiene where donde bajar empresa; sumarle tenant_id_ como hermano
    // haría un input inválido para Prisma.
    expect(reg.args?.where?.lastUpdatedBy_).toEqual({ is: null });
  });

  it(`${SUJETO} — una relación no resoluble con contenedor corta la consulta (fail-closed)`, async () => {
    const reg: { args?: any } = {};
    let cortó = false;
    await opsCon(SUJETO, [SUJETO_PERM], reg)
      .findMany({
        where: { __relacionInexistente__: { some: { x: 1 } } },
      } as any)
      .then(() => undefined)
      .catch(() => {
        cortó = true;
      });
    // La invariante: la consulta se CORTA antes de llegar a Prisma. No se mira el tipo ni
    // el mensaje del error — UnauthorizedError es un GraphQLError con message fijo, y
    // atarse a eso es frágil. Que haya tirado + que el espía no capturara nada alcanza.
    expect(cortó).toBe(true);
    expect(reg.args).toBeUndefined();
  });
});
