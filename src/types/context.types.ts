import { Request } from "express";
import {
  PrismaClient,
  Prisma,
  User,
  Role,
  Permission,
} from "../prisma/generated-client/client";

// Define aquí los tipos que serán compartidos
// El id de un rol: los roles son filas de Role, no una lista fija.
export type RoleType = string;

// Un usuario tiene como máximo un rol (User.role), con sus permisos.
export type UserWithRoleAndPermissions = Prisma.UserGetPayload<{
  include: { role: { include: { permissions: true } } };
}>;
// Usar Prisma.UserGetPayload es más robusto que la intersección manual

// Para ExtendedPrismaClient, si no tienes un tipo exacto, 'any' o un tipo base es común
export type ExtendedPrismaClient = PrismaClient; // O un tipo más específico si lo generas

export type ServiceContext = {
  prisma: ExtendedPrismaClient;
  currentUser: UserWithRoleAndPermissions | null;
  hasRole: (...roles: RoleType[]) => boolean;
  permissions: () => Set<string>;
  req: Request;
  isSystemMode: boolean;
  traceId?: string; // Para trazabilidad de operaciones a través del sistema
};

export interface Token {
  // Si también la necesitas en otros lados
  userId: string;
  // Solo el access token abre sesión (createContext lo exige): el refresh token
  // y los temporales de 2FA se firman con el mismo secreto, sin este tipo.
  type: "access";
}
