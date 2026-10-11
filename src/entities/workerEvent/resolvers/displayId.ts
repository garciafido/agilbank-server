import { Prisma } from "../../../prisma/generated-client/client";
import { WorkerEvent } from "../../../graphql/types";
import { graphqlToDateTime } from "../../../common/utils/conversions";

export const workerEventDisplayIdFragments: Prisma.WorkerEventSelect = {
  queueName: true,
  jobType: true,
  enqueuedAt: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const workerEventDisplayName = (instance: WorkerEvent): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.queueName ?? "∅"}-${instance.jobType ?? "∅"}-${
    instance.enqueuedAt === null || instance.enqueuedAt === undefined
      ? "∅"
      : graphqlToDateTime(instance.enqueuedAt, "America/Argentina/Buenos_Aires")
  }`;
};

/** El nombre como texto, como siempre (los multilingües, con el JSON embebido que resuelve langStore.displayIdByLang). */
export const workerEventDisplayId = (instance: WorkerEvent): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.queueName ?? "∅"}-${
    instance.jobType ?? "∅"
  }-${graphqlToDateTime(instance.enqueuedAt)}`;
};
