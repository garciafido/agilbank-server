// After-create hooks for Permission.
//
// Each exported function runs AFTER the insert, inside the SAME transaction, with
// the id of the just-created record. If a hook throws, the transaction aborts
// (the created record is rolled back). Use for atomically creating dependent
// records (e.g. a 1:1 profile).
//
// Hook signature: (createdId, context, txPrisma, args) => Promise<void>
//
// Example:
// import { ServiceContext } from "../../../service-context";
// import { PrismaClient } from "../../../prisma/generated-client/client";
//
// export const createDependent = async (
//   createdId: string,
//   context: ServiceContext,
//   txPrisma: PrismaClient,
// ): Promise<void> => {
//   // await txPrisma.someChild.create({ data: { parent_: { connect: { id: createdId } }, ... } });
// };

// Sin exports el archivo no es un módulo TS y el import * del CreateService rompe.
export {};
