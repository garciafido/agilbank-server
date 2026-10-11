import { PrismaClient } from "@prisma/client";

export interface TestContext {
  currentUser: {
    id: string;
    tenantId: string;
  };
  hasRole: (role: string) => boolean;
  prisma?: PrismaClient;
}

export type PrismaContextArgs = {
  context?: TestContext;
};

export const createContext = (
  tenantId: string,
  isAdmin: boolean = false
): TestContext => ({
  currentUser: {
    id: "test-user-id",
    tenantId,
  },
  hasRole: (role: string) => role === "SUPER_ADMIN" && isAdmin,
});
