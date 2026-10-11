import { Prisma } from "../../../prisma/generated-client/client";
import { IdempotencyRecord } from "../../../graphql/types";

export const idempotencyRecordDisplayIdFragments: Prisma.IdempotencyRecordSelect =
  { client: true, key: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const idempotencyRecordDisplayName = (
  instance: IdempotencyRecord
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.client ?? "∅"}:${instance.key ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const idempotencyRecordDisplayId = idempotencyRecordDisplayName;
