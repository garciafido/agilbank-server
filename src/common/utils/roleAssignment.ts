import { PrismaClient } from "../../prisma/generated-client/client";
import { ServiceContext } from "../../service-context";
import { SchemaMetadataStore } from "../services/schemaMetadata";
import { SecurePrismaOps } from "../services/securePrismaOps";
import { UnauthorizedError } from "../errors";

/**
 * La regla de no elevación: asignar o quitar un rol exige tener todos sus
 * permisos. Sin ella, quien edita usuarios (user_update) podía dar —o darse— un
 * rol con más permisos que los propios, SysAdmin incluido.
 *
 * `roleIds` son los roles que la escritura cambia: en una edición, los que
 * agrega y los que quita respecto de los actuales; en un alta, todos. En modo
 * sistema (seeds, migraciones, procesos internos) no aplica, y sin roles no
 * consulta nada.
 *
 * Los roles se leen por la capa segura, con el filtro de lectura de Role: uno
 * que el operador no ve (de otra empresa y no compartido con todas) no
 * participa, y la validación de referencias de SecurePrismaOps lo rechaza
 * después con el mismo error que a un id que no existe. Leídos con el cliente
 * crudo, la respuesta de esta regla diría qué roles existen en otras empresas.
 *
 * Leer roles exige role_retrieve (lo exige la capa). Ver sus permisos exige
 * permission_retrieve: sin él, la capa poda la relación, y sin los permisos a
 * la vista no hay con qué comparar, así que se rechaza.
 */
export async function assertRolesAssignable(
  context: ServiceContext,
  prisma: PrismaClient,
  schemaMetadataStore: SchemaMetadataStore,
  roleIds: string[]
): Promise<void> {
  if (context.isSystemMode || roleIds.length === 0) return;
  const roles: Array<{ id: string; permissions?: Array<{ id: string }> }> =
    await new SecurePrismaOps(
      context,
      prisma,
      schemaMetadataStore,
      "Role",
      {}
    ).findMany({
      where: { id: { in: roleIds } },
      select: { id: true, permissions: { select: { id: true } } },
    });
  const own = context.permissions();
  const missing = new Set<string>();
  for (const role of roles) {
    if (!Array.isArray(role.permissions)) {
      console.warn(
        `[Permission Denied] User ${context.currentUser?.id} lacks permission_retrieve to assign or remove role ${role.id}`
      );
      throw new UnauthorizedError(
        "Permission denied: 'permission_retrieve' required to assign or remove roles."
      );
    }
    for (const permission of role.permissions) {
      if (!own.has(permission.id)) missing.add(permission.id);
    }
  }
  if (missing.size > 0) {
    console.warn(
      `[Permission Denied] User ${context.currentUser?.id} lacks ${Array.from(
        missing
      ).join(", ")} to assign or remove roles ${roles
        .map((role) => role.id)
        .join(", ")}`
    );
    throw new UnauthorizedError(
      "No puedes asignar ni quitar un rol con permisos que no tienes."
    );
  }
}
