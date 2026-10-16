// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
// Los tests propios del proyecto van en tests/custom/, que el generador nunca toca.

import "reflect-metadata";
import { SchemaMetadataStore } from "../../../src/common/services/schemaMetadata";
import { UnauthorizedError } from "../../../src/common/errors";
import { AbStatementOneService } from "../../../src/entities/abStatement/services/abStatementOneService";
import { AbStatementDeleteService } from "../../../src/entities/abStatement/services/abStatementDeleteService";
import { AbConceptCorrectionOneService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionOneService";
import { AbConceptCorrectionCreateService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionCreateService";
import { AbConceptCorrectionUpdateService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionUpdateService";
import { AbConceptCorrectionDeleteService } from "../../../src/entities/abConceptCorrection/services/abConceptCorrectionDeleteService";
import { AbReconciliationOneService } from "../../../src/entities/abReconciliation/services/abReconciliationOneService";
import { AbReconciliationDeleteService } from "../../../src/entities/abReconciliation/services/abReconciliationDeleteService";
import { AbPaymentBatchOneService } from "../../../src/entities/abPaymentBatch/services/abPaymentBatchOneService";
import { AbPaymentBatchDeleteService } from "../../../src/entities/abPaymentBatch/services/abPaymentBatchDeleteService";
import { AbDecisionOneService } from "../../../src/entities/abDecision/services/abDecisionOneService";
import { AbDecisionDeleteService } from "../../../src/entities/abDecision/services/abDecisionDeleteService";
import { UserOneService } from "../../../src/entities/user/services/userOneService";
import { UserCreateService } from "../../../src/entities/user/services/userCreateService";
import { UserUpdateService } from "../../../src/entities/user/services/userUpdateService";
import { UserDeleteService } from "../../../src/entities/user/services/userDeleteService";
import { RoleOneService } from "../../../src/entities/role/services/roleOneService";
import { RoleCreateService } from "../../../src/entities/role/services/roleCreateService";
import { RoleUpdateService } from "../../../src/entities/role/services/roleUpdateService";
import { RoleDeleteService } from "../../../src/entities/role/services/roleDeleteService";
import { PermissionOneService } from "../../../src/entities/permission/services/permissionOneService";
import { PermissionCreateService } from "../../../src/entities/permission/services/permissionCreateService";
import { PermissionUpdateService } from "../../../src/entities/permission/services/permissionUpdateService";
import { PermissionDeleteService } from "../../../src/entities/permission/services/permissionDeleteService";
import { TenantOneService } from "../../../src/entities/tenant/services/tenantOneService";
import { TenantCreateService } from "../../../src/entities/tenant/services/tenantCreateService";
import { TenantUpdateService } from "../../../src/entities/tenant/services/tenantUpdateService";
import { TenantDeleteService } from "../../../src/entities/tenant/services/tenantDeleteService";
import { WorkerEventOneService } from "../../../src/entities/workerEvent/services/workerEventOneService";
import { WorkerEventDeleteService } from "../../../src/entities/workerEvent/services/workerEventDeleteService";
import { IntegrationClientOneService } from "../../../src/entities/integrationClient/services/integrationClientOneService";
import { IntegrationClientCreateService } from "../../../src/entities/integrationClient/services/integrationClientCreateService";
import { IntegrationClientUpdateService } from "../../../src/entities/integrationClient/services/integrationClientUpdateService";
import { IntegrationClientDeleteService } from "../../../src/entities/integrationClient/services/integrationClientDeleteService";
import { IdempotencyRecordOneService } from "../../../src/entities/idempotencyRecord/services/idempotencyRecordOneService";
import { IdempotencyRecordDeleteService } from "../../../src/entities/idempotencyRecord/services/idempotencyRecordDeleteService";
import { UserNotificationOneService } from "../../../src/entities/userNotification/services/userNotificationOneService";
import { UserNotificationDeleteService } from "../../../src/entities/userNotification/services/userNotificationDeleteService";
import { UserNotificationPreferenceOneService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceOneService";
import { UserNotificationPreferenceCreateService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceCreateService";
import { UserNotificationPreferenceUpdateService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceUpdateService";
import { UserNotificationPreferenceDeleteService } from "../../../src/entities/userNotificationPreference/services/userNotificationPreferenceDeleteService";
import { EmailVerificationOneService } from "../../../src/entities/emailVerification/services/emailVerificationOneService";
import { EmailVerificationCreateService } from "../../../src/entities/emailVerification/services/emailVerificationCreateService";
import { EmailVerificationUpdateService } from "../../../src/entities/emailVerification/services/emailVerificationUpdateService";
import { EmailVerificationDeleteService } from "../../../src/entities/emailVerification/services/emailVerificationDeleteService";

/**
 * Prisma que grita si alguien lo toca. El permiso se verifica ANTES de la
 * consulta: si esto se dispara, el orden se invirtió y una consulta sin
 * permiso llegó a la base.
 */
const prismaQueNoSeDebeTocar = (): any =>
  new Proxy(
    {},
    {
      get: (_t, modelo) =>
        new Proxy(
          {},
          {
            get: (_t2, metodo) => () => {
              throw new Error(
                `La base se consultó antes de verificar el permiso: ${String(
                  modelo
                )}.${String(metodo)}()`
              );
            },
          }
        ),
    }
  );

/** Un usuario autenticado y sin ningún permiso. */
const contextoSinPermisos = (): any => ({
  isSystemMode: false,
  currentUser: {
    id: "RBAC_USER",
    tenant_id_: "RBAC_TENANT",
    active: true,
    roles: [],
  },
  permissions: () => new Set<string>(),
});

const ENTIDADES = [
  {
    entidad: "AbStatement",
    accion: "retrieve",
    permiso: "abStatement_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new AbStatementOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "AbStatement",
    accion: "delete",
    permiso: "abStatement_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new AbStatementDeleteService(c, p, s).deleteAbStatement(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbConceptCorrection",
    accion: "retrieve",
    permiso: "abConceptCorrection_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new AbConceptCorrectionOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbConceptCorrection",
    accion: "create",
    permiso: "abConceptCorrection_create",
    ejecutar: (c: any, p: any, s: any) =>
      new AbConceptCorrectionCreateService(c, p, s).createAbConceptCorrection(
        {} as any,
        undefined
      ),
  },
  {
    entidad: "AbConceptCorrection",
    accion: "update",
    permiso: "abConceptCorrection_update",
    ejecutar: (c: any, p: any, s: any) =>
      new AbConceptCorrectionUpdateService(c, p, s).updateAbConceptCorrection(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "AbConceptCorrection",
    accion: "delete",
    permiso: "abConceptCorrection_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new AbConceptCorrectionDeleteService(c, p, s).deleteAbConceptCorrection(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbReconciliation",
    accion: "retrieve",
    permiso: "abReconciliation_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new AbReconciliationOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbReconciliation",
    accion: "delete",
    permiso: "abReconciliation_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new AbReconciliationDeleteService(c, p, s).deleteAbReconciliation(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbPaymentBatch",
    accion: "retrieve",
    permiso: "abPaymentBatch_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new AbPaymentBatchOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbPaymentBatch",
    accion: "delete",
    permiso: "abPaymentBatch_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new AbPaymentBatchDeleteService(c, p, s).deleteAbPaymentBatch(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "AbDecision",
    accion: "retrieve",
    permiso: "abDecision_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new AbDecisionOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "AbDecision",
    accion: "delete",
    permiso: "abDecision_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new AbDecisionDeleteService(c, p, s).deleteAbDecision(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "User",
    accion: "retrieve",
    permiso: "user_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new UserOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "User",
    accion: "create",
    permiso: "user_create",
    ejecutar: (c: any, p: any, s: any) =>
      new UserCreateService(c, p, s).createUser({} as any, undefined),
  },
  {
    entidad: "User",
    accion: "update",
    permiso: "user_update",
    ejecutar: (c: any, p: any, s: any) =>
      new UserUpdateService(c, p, s).updateUser(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "User",
    accion: "delete",
    permiso: "user_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new UserDeleteService(c, p, s).deleteUser({ id: "x" } as any, undefined),
  },
  {
    entidad: "Role",
    accion: "retrieve",
    permiso: "role_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new RoleOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "Role",
    accion: "create",
    permiso: "role_create",
    ejecutar: (c: any, p: any, s: any) =>
      new RoleCreateService(c, p, s).createRole({} as any, undefined),
  },
  {
    entidad: "Role",
    accion: "update",
    permiso: "role_update",
    ejecutar: (c: any, p: any, s: any) =>
      new RoleUpdateService(c, p, s).updateRole(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "Role",
    accion: "delete",
    permiso: "role_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new RoleDeleteService(c, p, s).deleteRole({ id: "x" } as any, undefined),
  },
  {
    entidad: "Permission",
    accion: "retrieve",
    permiso: "permission_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new PermissionOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "Permission",
    accion: "create",
    permiso: "permission_create",
    ejecutar: (c: any, p: any, s: any) =>
      new PermissionCreateService(c, p, s).createPermission(
        {} as any,
        undefined
      ),
  },
  {
    entidad: "Permission",
    accion: "update",
    permiso: "permission_update",
    ejecutar: (c: any, p: any, s: any) =>
      new PermissionUpdateService(c, p, s).updatePermission(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "Permission",
    accion: "delete",
    permiso: "permission_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new PermissionDeleteService(c, p, s).deletePermission(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "Tenant",
    accion: "retrieve",
    permiso: "tenant_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new TenantOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "Tenant",
    accion: "create",
    permiso: "tenant_create",
    ejecutar: (c: any, p: any, s: any) =>
      new TenantCreateService(c, p, s).createTenant({} as any, undefined),
  },
  {
    entidad: "Tenant",
    accion: "update",
    permiso: "tenant_update",
    ejecutar: (c: any, p: any, s: any) =>
      new TenantUpdateService(c, p, s).updateTenant(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "Tenant",
    accion: "delete",
    permiso: "tenant_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new TenantDeleteService(c, p, s).deleteTenant(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "WorkerEvent",
    accion: "retrieve",
    permiso: "workerEvent_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new WorkerEventOneService(c, p, s).getOne({ id: "x" } as any, undefined),
  },
  {
    entidad: "WorkerEvent",
    accion: "delete",
    permiso: "workerEvent_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new WorkerEventDeleteService(c, p, s).deleteWorkerEvent(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "IntegrationClient",
    accion: "retrieve",
    permiso: "integrationClient_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new IntegrationClientOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "IntegrationClient",
    accion: "create",
    permiso: "integrationClient_create",
    ejecutar: (c: any, p: any, s: any) =>
      new IntegrationClientCreateService(c, p, s).createIntegrationClient(
        {} as any,
        undefined
      ),
  },
  {
    entidad: "IntegrationClient",
    accion: "update",
    permiso: "integrationClient_update",
    ejecutar: (c: any, p: any, s: any) =>
      new IntegrationClientUpdateService(c, p, s).updateIntegrationClient(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "IntegrationClient",
    accion: "delete",
    permiso: "integrationClient_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new IntegrationClientDeleteService(c, p, s).deleteIntegrationClient(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "IdempotencyRecord",
    accion: "retrieve",
    permiso: "idempotencyRecord_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new IdempotencyRecordOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "IdempotencyRecord",
    accion: "delete",
    permiso: "idempotencyRecord_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new IdempotencyRecordDeleteService(c, p, s).deleteIdempotencyRecord(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "UserNotification",
    accion: "retrieve",
    permiso: "userNotification_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "UserNotification",
    accion: "delete",
    permiso: "userNotification_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationDeleteService(c, p, s).deleteUserNotification(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "UserNotificationPreference",
    accion: "retrieve",
    permiso: "userNotificationPreference_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "UserNotificationPreference",
    accion: "create",
    permiso: "userNotificationPreference_create",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceCreateService(
        c,
        p,
        s
      ).createUserNotificationPreference({} as any, undefined),
  },
  {
    entidad: "UserNotificationPreference",
    accion: "update",
    permiso: "userNotificationPreference_update",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceUpdateService(
        c,
        p,
        s
      ).updateUserNotificationPreference(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "UserNotificationPreference",
    accion: "delete",
    permiso: "userNotificationPreference_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new UserNotificationPreferenceDeleteService(
        c,
        p,
        s
      ).deleteUserNotificationPreference({ id: "x" } as any, undefined),
  },
  {
    entidad: "EmailVerification",
    accion: "retrieve",
    permiso: "emailVerification_retrieve",
    ejecutar: (c: any, p: any, s: any) =>
      new EmailVerificationOneService(c, p, s).getOne(
        { id: "x" } as any,
        undefined
      ),
  },
  {
    entidad: "EmailVerification",
    accion: "create",
    permiso: "emailVerification_create",
    ejecutar: (c: any, p: any, s: any) =>
      new EmailVerificationCreateService(c, p, s).createEmailVerification(
        {} as any,
        undefined
      ),
  },
  {
    entidad: "EmailVerification",
    accion: "update",
    permiso: "emailVerification_update",
    ejecutar: (c: any, p: any, s: any) =>
      new EmailVerificationUpdateService(c, p, s).updateEmailVerification(
        { id: "x", version_: "0" } as any,
        undefined
      ),
  },
  {
    entidad: "EmailVerification",
    accion: "delete",
    permiso: "emailVerification_delete",
    ejecutar: (c: any, p: any, s: any) =>
      new EmailVerificationDeleteService(c, p, s).deleteEmailVerification(
        { id: "x" } as any,
        undefined
      ),
  },
];

describe("ninguna operación se ejecuta sin su permiso", () => {
  it("hay entidades que probar", () => {
    // La tabla se desenrolla en GENERACIÓN, así que si el filtro de emisión
    // cambia y deja de incluir entidades, este archivo queda con la lista vacía
    // y `it.each([])` no corre nada: verde sin haber comprobado un permiso.
    //
    // Es el mismo guard que ya tenían eventRedaction, readSecurity y
    // writeTenancy. Faltaba justo en las dos suites más importantes.
    expect(ENTIDADES.length).toBeGreaterThan(0);
  });

  let store: SchemaMetadataStore;

  beforeAll(() => {
    store = new SchemaMetadataStore();
    store.build();
  });

  it.each(ENTIDADES)(
    "$entidad — $accion exige $permiso",
    async ({ entidad, permiso, ejecutar }) => {
      const prisma = prismaQueNoSeDebeTocar();

      const error = await ejecutar(contextoSinPermisos(), prisma, store).catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(UnauthorizedError);
      // El texto va en customMessage: UnauthorizedError deja un código
      // ("AUTH_UNAUTHORIZED") en el message que ve GraphQL.
      const detalle = (error as UnauthorizedError).customMessage ?? "";
      // El permiso nombrado tiene que ser el de ESTA entidad y ESTA acción: si el
      // servicio construyó su guardián con otro modelo, acá aparece el nombre
      // ajeno. Y si el chequeo quedó después de las validaciones del proyecto, el
      // doble de Prisma tira primero y esto no llega a comparar nada.
      expect(detalle).toContain(permiso);
      expect(detalle).toContain(entidad);
    }
  );
});
