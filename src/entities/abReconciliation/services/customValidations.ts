// Custom intra-service validations for AbReconciliation.
//
// Add validators here. They run inside the update/delete transaction,
// at the start of executeUpdate/executeDelete (before any write or file move).
// If a validator throws, the transaction aborts cleanly.
//
// Validator signature: (args, context, txPrisma) => Promise<void>
//
// Example:
// import { ServiceContext } from "../../../service-context";
// import { PrismaClient } from "../../../prisma/generated-client/client";
// import { ValidationError } from "../../../common/errors";
//
// export const validateXxx = async (
//   args: any,
//   context: ServiceContext,
//   txPrisma: PrismaClient,
// ): Promise<void> => {
//   // Throw ValidationError if invalid.
// };

export {};
