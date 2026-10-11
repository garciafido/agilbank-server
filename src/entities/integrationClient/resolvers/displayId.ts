import { Prisma } from "../../../prisma/generated-client/client";
import { IntegrationClient } from "../../../graphql/types";

export const integrationClientDisplayIdFragments: Prisma.IntegrationClientSelect =
  { name: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const integrationClientDisplayName = (
  instance: IntegrationClient
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.name ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const integrationClientDisplayId = integrationClientDisplayName;
