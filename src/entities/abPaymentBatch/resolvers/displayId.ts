import { Prisma } from "../../../prisma/generated-client/client";
import { AbPaymentBatch } from "../../../graphql/types";

export const abPaymentBatchDisplayIdFragments: Prisma.AbPaymentBatchSelect = {
  originalName: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const abPaymentBatchDisplayName = (instance: AbPaymentBatch): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.originalName ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const abPaymentBatchDisplayId = abPaymentBatchDisplayName;
