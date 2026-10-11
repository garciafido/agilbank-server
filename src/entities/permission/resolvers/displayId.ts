import { Prisma } from "../../../prisma/generated-client/client";
import { Permission } from "../../../graphql/types";

export const permissionDisplayIdFragments: Prisma.PermissionSelect = {
  name: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const permissionDisplayName = (instance: Permission): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.name ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const permissionDisplayId = permissionDisplayName;
