import { Prisma, PrismaClient } from "../generated-client/client";

export const fakeContext = (userId: string, tenantId: string) => {
  return {
    currentUser: {
      id: userId,
      tenantId: tenantId,
    },
  };
};

export const systemContext = fakeContext("SYSTEM", "AGILMIND");

const now = new Date();

export const systemFieldsCreate = {
  version_: "0",
  createdAt_: now,
  createdBy_: { connect: { id: "SYSTEM" } },
  lastUpdatedAt_: now,
  lastUpdatedBy_: { connect: { id: "SYSTEM" } },
};

export const systemFieldsUpdate = {
  version_: "0",
  lastUpdatedAt_: now,
  lastUpdatedBy_: { connect: { id: "SYSTEM" } },
};

// Transforms { connect: [...] } to { set: [...] } for update operations
// This ensures relations are replaced instead of just appended
function transformConnectToSet(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(transformConnectToSet);
  if (obj instanceof Date) return obj;

  const result: any = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      // If it has a 'connect' property with an array, transform to 'set'
      if ("connect" in value && Array.isArray(value.connect)) {
        result[key] = { set: value.connect };
      } else {
        result[key] = transformConnectToSet(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function upsertOne(
  prisma: PrismaClient,
  model: Uncapitalize<Prisma.ModelName>,
  x: any,
  context: any = undefined,
  createOnlyFields: string[] = []
) {
  // Transform connect to set for update (ensures relations are replaced, not appended)
  const updateData = transformConnectToSet(x);

  // Remove createdAt_ and createdBy_ from update data (they are create-only fields)
  const { createdAt_, createdBy_, ...updateDataWithoutCreateFields } =
    updateData;

  // Campos create-only adicionales (ej: password en users — el create los
  // necesita para validar, el update jamás debe pisarlos).
  for (const field of createOnlyFields) {
    delete (updateDataWithoutCreateFields as any)[field];
  }

  // @ts-ignore
  return prisma[model].upsert({
    where: { id: x.id },
    context: context,
    update: {
      ...systemFieldsUpdate,
      ...updateDataWithoutCreateFields,
    },
    create: {
      ...systemFieldsCreate,
      ...x,
    },
  });
}
