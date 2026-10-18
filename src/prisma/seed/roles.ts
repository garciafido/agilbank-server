import { PrismaClient, Prisma } from "../generated-client/client";
import { upsertOne } from "./utils";
import { roleExtensions } from "./rolesCustom";

const roleData: Prisma.RoleCreateInput[] = [
  {
    createdAt_: new Date(),
    version_: "0",
    createdBy_: { connect: { id: "SYSADMIN" } },
    id: "UsersAdmin",
    name: "SYS Administrador/a de usuarios",
    tenant_: { connect: { id: "AGILMIND" } },
    isForAllTenants: false,
    permissions: {
      connect: [
        { id: "user_retrieve" },
        { id: "user_create" },
        { id: "user_update" },
        { id: "role_retrieve" },
        { id: "permission_retrieve" },
      ],
    },
  },
  {
    createdAt_: new Date(),
    version_: "0",
    createdBy_: { connect: { id: "SYSADMIN" } },
    id: "SysAdmin",
    name: "SYS Administrador/a de sistema",
    tenant_: { connect: { id: "AGILMIND" } },
    isForAllTenants: false,
    permissions: {
      connect: [
        { id: "abStatement_retrieve" },
        { id: "abStatement_create" },
        { id: "abStatement_update" },
        { id: "abStatement_delete" },
        { id: "abConceptCorrection_retrieve" },
        { id: "abConceptCorrection_create" },
        { id: "abConceptCorrection_update" },
        { id: "abConceptCorrection_delete" },
        { id: "abReconciliation_retrieve" },
        { id: "abReconciliation_create" },
        { id: "abReconciliation_update" },
        { id: "abReconciliation_delete" },
        { id: "abPaymentBatch_retrieve" },
        { id: "abPaymentBatch_create" },
        { id: "abPaymentBatch_update" },
        { id: "abPaymentBatch_delete" },
        { id: "abDecision_retrieve" },
        { id: "abDecision_create" },
        { id: "abDecision_update" },
        { id: "abDecision_delete" },
        { id: "user_retrieve" },
        { id: "user_create" },
        { id: "user_update" },
        { id: "user_delete" },
        { id: "role_retrieve" },
        { id: "role_create" },
        { id: "role_update" },
        { id: "role_delete" },
        { id: "permission_retrieve" },
        { id: "permission_create" },
        { id: "permission_update" },
        { id: "permission_delete" },
        { id: "tenant_retrieve" },
        { id: "tenant_create" },
        { id: "tenant_update" },
        { id: "tenant_delete" },
        { id: "workerEvent_retrieve" },
        { id: "workerEvent_create" },
        { id: "workerEvent_update" },
        { id: "workerEvent_delete" },
        { id: "integrationClient_retrieve" },
        { id: "integrationClient_create" },
        { id: "integrationClient_update" },
        { id: "integrationClient_delete" },
        { id: "idempotencyRecord_retrieve" },
        { id: "idempotencyRecord_create" },
        { id: "idempotencyRecord_update" },
        { id: "idempotencyRecord_delete" },
        { id: "userNotification_retrieve" },
        { id: "userNotification_create" },
        { id: "userNotification_update" },
        { id: "userNotification_delete" },
        { id: "userNotificationPreference_retrieve" },
        { id: "userNotificationPreference_create" },
        { id: "userNotificationPreference_update" },
        { id: "userNotificationPreference_delete" },
        { id: "emailVerification_retrieve" },
        { id: "emailVerification_create" },
        { id: "emailVerification_update" },
        { id: "emailVerification_delete" },
        { id: "simulation_run" },
        { id: "abStatementRead_retry" },
        { id: "abStatementRead_run" },
      ],
    },
  },
  {
    createdAt_: new Date(),
    version_: "0",
    createdBy_: { connect: { id: "SYSADMIN" } },
    id: "SiteAdmin",
    name: "Administrador/a de sitio",
    tenant_: { connect: { id: "AGILMIND" } },
    isForAllTenants: true,
    permissions: {
      connect: [
        { id: "user_retrieve" },
        { id: "user_create" },
        { id: "user_update" },
        { id: "user_delete" },
        { id: "role_retrieve" },
        { id: "permission_retrieve" },
        { id: "abStatementRead_run" },
      ],
    },
  },
  {
    createdAt_: new Date(),
    version_: "0",
    createdBy_: { connect: { id: "SYSADMIN" } },
    id: "SiteUser",
    name: "Usuario/a de sitio",
    tenant_: { connect: { id: "AGILMIND" } },
    isForAllTenants: true,
    permissions: {
      connect: [{ id: "role_retrieve" }, { id: "permission_retrieve" }],
    },
  },
];

export const seedRoles = async (prisma: PrismaClient) => {
  for (const x of roleData) {
    try {
      const role = await upsertOne(prisma, "role", x);
      console.log(`Created role id: ${role.id}`);
    } catch (e) {
      console.log(`Error on: ${JSON.stringify(x, null, 2)}`);
      throw e;
    }
  }

  // Extensiones de roles del PROYECTO (rolesCustom.ts): permisos extra por rol,
  // sin tocar este archivo generado (evita drift/conflictos en regeneraciones).
  for (const [roleId, permIds] of Object.entries(roleExtensions)) {
    if (!permIds.length) continue;
    try {
      await prisma.role.update({
        where: { id: roleId },
        data: { permissions: { connect: permIds.map((id) => ({ id })) } },
      });
      console.log(
        `  ✅ Role ${roleId}: +${permIds.length} permisos del proyecto (rolesCustom)`
      );
    } catch (e) {
      console.log(
        `  ❌ Role ${roleId}: error conectando permisos del proyecto`,
        e
      );
      throw e;
    }
  }

  // SysAdmin tiene TODOS los permisos que haya en la tabla, no solo los que le
  // conecta roleData: también los que el proyecto agregó por su cuenta. La regla
  // de no elevación (common/utils/roleAssignment) solo deja asignar o quitar un
  // rol a quien tiene todos sus permisos, y SysAdmin tiene que poder con
  // cualquiera.
  const allPermissions = await prisma.permission.findMany({
    select: { id: true },
  });
  await prisma.role.update({
    where: { id: "SysAdmin" },
    data: { permissions: { connect: allPermissions } },
  });
  console.log(
    `  ✅ Role SysAdmin: los ${allPermissions.length} permisos de la tabla`
  );

  // SYSADMIN tiene el rol SysAdmin. Un usuario tiene un solo rol (User.role):
  // volver a conectarlo en cada seed lo deja igual.
  await prisma.user.update({
    where: { id: "SYSADMIN" },
    data: { role: { connect: { id: "SysAdmin" } } },
  });
  console.log("  ✅ Assigned SysAdmin role to SYSADMIN user");
};
