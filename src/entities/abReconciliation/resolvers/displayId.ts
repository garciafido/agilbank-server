import { Prisma } from "../../../prisma/generated-client/client";
import { AbReconciliation } from "../../../graphql/types";

export const abReconciliationDisplayIdFragments: Prisma.AbReconciliationSelect =
  { requestKey: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const abReconciliationDisplayName = (
  instance: AbReconciliation
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.requestKey ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const abReconciliationDisplayId = abReconciliationDisplayName;
