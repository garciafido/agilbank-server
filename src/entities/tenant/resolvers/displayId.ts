import { Prisma } from "../../../prisma/generated-client/client";
import { Tenant } from "../../../graphql/types";

export const tenantDisplayIdFragments: Prisma.TenantSelect = { name: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const tenantDisplayName = (instance: Tenant): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.name ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const tenantDisplayId = tenantDisplayName;
