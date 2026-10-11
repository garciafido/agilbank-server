import { PrismaClient, Prisma } from "../generated-client/client";
import { upsertOne } from "./utils";

const customPermissionData: Prisma.PermissionCreateInput[] = [];

const customRoleData: Prisma.RoleCreateInput[] = [];

export async function seedCustomRoles(prisma: PrismaClient) {
  for (const x of customPermissionData) {
    await upsertOne(prisma, "permission", x);
    console.log(`Upserted Permission id: ${x.id}`);
  }
  for (const x of customRoleData) {
    await upsertOne(prisma, "role", x);
    console.log(`Upserted Role id: ${x.id}`);
  }
}
