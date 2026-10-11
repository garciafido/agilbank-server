// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.

import "reflect-metadata";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { AbStatementOneService } from "../../../src/entities/abStatement/services/abStatementOneService";
import { AbStatementListWithOffsetService } from "../../../src/entities/abStatement/services/abStatementListWithOffsetService";
import { AbConceptCorrectionOneService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionOneService";
import { AbConceptCorrectionListWithOffsetService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionListWithOffsetService";
import { UserOneService } from "../../../src/entities/user/services/userOneService";
import { UserListWithOffsetService } from "../../../src/entities/user/services/userListWithOffsetService";
import { RoleOneService } from "../../../src/entities/role/services/roleOneService";
import { RoleListWithOffsetService } from "../../../src/entities/role/services/roleListWithOffsetService";
import { PermissionOneService } from "../../../src/entities/permission/services/permissionOneService";
import { PermissionListWithOffsetService } from "../../../src/entities/permission/services/permissionListWithOffsetService";
import { TenantOneService } from "../../../src/entities/tenant/services/tenantOneService";
import { TenantListWithOffsetService } from "../../../src/entities/tenant/services/tenantListWithOffsetService";
import { WorkerEventOneService } from "../../../src/entities/workerEvent/services/workerEventOneService";
import { WorkerEventListWithOffsetService } from "../../../src/entities/workerEvent/services/workerEventListWithOffsetService";
import { IntegrationClientOneService } from "../../../src/entities/integrationClient/services/integrationClientOneService";
import { IntegrationClientListWithOffsetService } from "../../../src/entities/integrationClient/services/integrationClientListWithOffsetService";
import { IdempotencyRecordOneService } from "../../../src/entities/idempotencyRecord/services/idempotencyRecordOneService";
import { IdempotencyRecordListWithOffsetService } from "../../../src/entities/idempotencyRecord/services/idempotencyRecordListWithOffsetService";
import { UserNotificationOneService } from "../../../src/entities/userNotification/services/userNotificationOneService";
import { UserNotificationListWithOffsetService } from "../../../src/entities/userNotification/services/userNotificationListWithOffsetService";
import { UserNotificationPreferenceOneService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceOneService";
import { UserNotificationPreferenceListWithOffsetService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceListWithOffsetService";
import { EmailVerificationOneService } from "../../../src/entities/emailVerification/services/emailVerificationOneService";
import { EmailVerificationListWithOffsetService } from "../../../src/entities/emailVerification/services/emailVerificationListWithOffsetService";

const TENANT = "TENANCY_TENANT";

/** Prisma que anota con qué `where` lo llamaron y corta ahí. */
const prismaEspia = (registro: { where?: any }): any =>
  new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          {
            get: () => (args: any) => {
              registro.where = args?.where;
              // Cortar acá: lo que se prueba es el filtro, no el resultado.
              throw new Error("__CONSULTA_INTERCEPTADA__");
            },
          }
        ),
    }
  );

/** Un usuario con todos los permisos: acá lo que se mira es el filtro. */
const contextoConPermisos = (permiso: string): any => ({
  isSystemMode: false,
  currentUser: {
    id: "TENANCY_USER",
    tenant_id_: TENANT,
    active: true,
    roles: [],
  },
  permissions: () => new Set<string>([permiso]),
});

/**
 * El VALOR del filtro de tenant, o undefined si no hay ninguno.
 *
 * Devuelve el valor y no un booleano a propósito: comprobar solo que la clave
 * exista dejaría pasar un filtro por el tenant equivocado, que es una fuga
 * igual de grave y bastante más difícil de ver.
 */
const filtroDeTenant = (where: any): unknown => {
  if (where === null || typeof where !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(where, "tenant_id_"))
    return where.tenant_id_;
  for (const v of Object.values(where)) {
    const encontrado = Array.isArray(v)
      ? v.map(filtroDeTenant).find((x) => x !== undefined)
      : filtroDeTenant(v);
    if (encontrado !== undefined) return encontrado;
  }
  return undefined;
};

const ENTIDADES = [
  {
    entidad: "AbStatement",
    permiso: "abStatement_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new AbStatementOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new AbStatementListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "AbConceptCorrection",
    permiso: "abConceptCorrection_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new AbConceptCorrectionOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new AbConceptCorrectionListWithOffsetService(c, p, s).listWithOffset(
        {} as any
      ),
  },
  {
    entidad: "User",
    permiso: "user_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new UserOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new UserListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "Role",
    permiso: "role_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new RoleOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new RoleListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "Permission",
    permiso: "permission_retrieve",
    compartida: true,
    leerUno: (c: any, p: any, s: any) =>
      new PermissionOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new PermissionListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "Tenant",
    permiso: "tenant_retrieve",
    compartida: true,
    leerUno: (c: any, p: any, s: any) =>
      new TenantOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new TenantListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "WorkerEvent",
    permiso: "workerEvent_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new WorkerEventOneService(c, p, s).getOne({ id: "x" } as any, undefined),
    listar: (c: any, p: any, s: any) =>
      new WorkerEventListWithOffsetService(c, p, s).listWithOffset({} as any),
  },
  {
    entidad: "IntegrationClient",
    permiso: "integrationClient_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new IntegrationClientOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new IntegrationClientListWithOffsetService(c, p, s).listWithOffset(
        {} as any
      ),
  },
  {
    entidad: "IdempotencyRecord",
    permiso: "idempotencyRecord_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new IdempotencyRecordOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new IdempotencyRecordListWithOffsetService(c, p, s).listWithOffset(
        {} as any
      ),
  },
  {
    entidad: "UserNotification",
    permiso: "userNotification_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new UserNotificationOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new UserNotificationListWithOffsetService(c, p, s).listWithOffset(
        {} as any
      ),
  },
  {
    entidad: "UserNotificationPreference",
    permiso: "userNotificationPreference_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceListWithOffsetService(
        c,
        p,
        s
      ).listWithOffset({} as any),
  },
  {
    entidad: "EmailVerification",
    permiso: "emailVerification_retrieve",
    compartida: false,
    leerUno: (c: any, p: any, s: any) =>
      new EmailVerificationOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
    listar: (c: any, p: any, s: any) =>
      new EmailVerificationListWithOffsetService(c, p, s).listWithOffset(
        {} as any
      ),
  },
];

describe("el filtro de tenant se aplica donde corresponde", () => {
  it("hay entidades que probar", () => {
    // Sin esto, una tabla vacía deja `it.each([])` sin casos y la suite pasa en
    // verde sin haber verificado el aislamiento de una sola entidad — que es lo
    // único que impide que una empresa lea los datos de otra.
    expect(ENTIDADES.length).toBeGreaterThan(0);
  });

  let store: SchemaMetadataStore;

  beforeAll(() => {
    store = new SchemaMetadataStore();
    store.build();
  });

  // Las dos operaciones que leen. La lista es la más peligrosa: sin filtro
  // devuelve TODAS las filas de todas las empresas, no una ajena por error.
  const OPERACIONES = ["leerUno", "listar"] as const;

  it.each(ENTIDADES.flatMap((e) => OPERACIONES.map((op) => ({ ...e, op }))))(
    "$entidad — $op",
    async ({ entidad, permiso, compartida, op, ...fns }: any) => {
      const registro: { where?: any } = {};
      const ctx = contextoConPermisos(permiso);
      await fns[op](ctx, prismaEspia(registro), store).catch(() => undefined);

      // Si esto falla, la consulta ni siquiera llegó a Prisma: algo la frenó
      // antes y el test no estaría probando nada.
      expect(registro.where).toBeDefined();

      const tenant = filtroDeTenant(registro.where);
      if (compartida) {
        // Dato nacional: filtrarlo por empresa dejaría a cada una viendo vacío.
        expect(tenant).toBeUndefined();
      } else {
        // Y con el tenant de QUIEN CONSULTA: un filtro por otro es fuga igual.
        expect(tenant).toBe(TENANT);
      }
    }
  );
});
