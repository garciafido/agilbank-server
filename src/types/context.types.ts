import { Request } from "express";
import {
  PrismaClient,
  Prisma,
  User,
  Role,
  Permission,
} from "../prisma/generated-client/client";

// Define aquí los tipos que serán compartidos
export type RoleType = "SysAdmin" | "User";

export type UserWithRolesAndPermissions = Prisma.UserGetPayload<{
  include: { roles: { include: { permissions: true } } };
}>;
// Usar Prisma.UserGetPayload es más robusto que la intersección manual

// Para ExtendedPrismaClient, si no tienes un tipo exacto, 'any' o un tipo base es común
export type ExtendedPrismaClient = PrismaClient; // O un tipo más específico si lo generas

export type ServiceContext = {
  prisma: ExtendedPrismaClient;
  currentUser: UserWithRolesAndPermissions | null;
  hasRole: (...roles: RoleType[]) => boolean;
  permissions: () => Set<string>;
  req: Request;
  isSystemMode: boolean;
  traceId?: string; // Para trazabilidad de operaciones a través del sistema
};

export interface Token {
  // Si también la necesitas en otros lados
  userId: string;
}
