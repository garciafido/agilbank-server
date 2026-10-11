import { Prisma } from "../../../prisma/generated-client/client";
import { Role } from "../../../graphql/types";

export const roleDisplayIdFragments: Prisma.RoleSelect = { name: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const roleDisplayName = (instance: Role): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.name ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const roleDisplayId = roleDisplayName;
