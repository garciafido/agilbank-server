// After-update hooks for UserNotificationPreference.
//
// Each exported function runs AFTER the update, inside the SAME transaction, with
// the id of the updated record. If a hook throws, the transaction aborts. Use for
// save-bound side effects (e.g. enqueue a job when relevant fields change).
//
// Hook signature: (updatedId, context, txPrisma, args) => Promise<void>
//
// Example:
// import { ServiceContext } from "../../../service-context";
// import { PrismaClient } from "../../../prisma/generated-client/client";
//
// export const onUpdate = async (
//   updatedId: string,
//   context: ServiceContext,
//   txPrisma: PrismaClient,
//   args: { id: string; [k: string]: any },
// ): Promise<void> => {
//   // side effect...
// };

// Sin exports el archivo no es un módulo TS y el import * del UpdateService rompe.
export {};
