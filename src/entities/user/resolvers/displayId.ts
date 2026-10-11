import { Prisma } from "../../../prisma/generated-client/client";
import { User } from "../../../graphql/types";

export const userDisplayIdFragments: Prisma.UserSelect = {
  email: true,
  name: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const userDisplayName = (instance: User): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.email ?? "∅"} ${instance.name ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const userDisplayId = userDisplayName;
