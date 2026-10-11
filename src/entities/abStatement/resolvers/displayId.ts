import { Prisma } from "../../../prisma/generated-client/client";
import { AbStatement } from "../../../graphql/types";

export const abStatementDisplayIdFragments: Prisma.AbStatementSelect = {
  originalName: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const abStatementDisplayName = (instance: AbStatement): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.originalName ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const abStatementDisplayId = abStatementDisplayName;
