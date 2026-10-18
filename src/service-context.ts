// Generated Service Context - Manages request-specific context including user, permissions, and base Prisma client.
export type { ServiceContext } from "./types/context.types";
import type {
  ServiceContext,
  RoleType,
  UserWithRoleAndPermissions,
  Token,
} from "./types/context.types";
import { GraphQLError } from "graphql";
import {
  JsonWebTokenError,
  TokenExpiredError,
  verify,
  decode,
} from "jsonwebtoken";
import {
  Prisma,
  PrismaClient as GeneratedPrismaClient,
  User as PrismaUser,
  Role,
  Permission,
} from "./prisma/generated-client/client";
import { Request } from "express";
import { basePrisma } from "./prisma/client";
import { randomUUID } from "crypto";

// --- Configuration ---
// El secreto se resuelve una vez, al cargar el módulo: si falta en producción,
// el proceso muere acá y no atendiendo la primera request con un token falso.
export const APP_SECRET = (() => {
  const s = process.env.JWT_SECRET || process.env.APP_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET (o APP_SECRET) es obligatorio en producción. Sin secreto no se " +
        "arranca: firmar tokens con un valor por defecto equivale a no tener " +
        "autenticación, y el fallo sería silencioso."
    );
  }
  const efimero = randomUUID();
  console.warn(
    "[auth] Sin JWT_SECRET: se generó uno efímero para desarrollo. Las sesiones " +
      "se invalidan en cada reinicio y esto NO arranca en producción."
  );
  return efimero;
})();

// --- Context Creation Functions ---

/**
 * Creates the service context for a given request.
 * Handles authentication (JWT), fetches the user with its role and permissions,
 * calculates permission helpers, and provides the base Prisma client instance.
 * Middleware logic is NOT applied here anymore.
 *
 * @param req The incoming request object (e.g., from Express).
 * @param isSystemMode Flag to indicate if tenant/permission checks should be bypassed downstream. Defaults to false.
 * @returns A Promise resolving to the ServiceContext for the request.
 */
export async function createContext(
  req: Request,
  isSystemMode = false
): Promise<ServiceContext> {
  let currentUser: UserWithRoleAndPermissions | null = null; // Initialize tenantId if multitenant
  const authHeader = req.get("Authorization");

  // Generate or extract traceId for request tracing
  const traceId =
    (req.headers["x-trace-id"] as string) ||
    (req.headers["x-request-id"] as string) ||
    randomUUID();

  // 1. Authenticate User (if token provided)
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    let verifiedToken: Token | undefined;

    try {
      verifiedToken = verify(token, APP_SECRET) as Token;
    } catch (error: unknown) {
      // Handle specific JWT errors gracefully
      if (error instanceof TokenExpiredError) {
        console.warn("Context Error: Token expired");
        throw new GraphQLError(
          "Your session has expired. Please log in again.",
          {
            extensions: {
              code: "UNAUTHENTICATED",
              originalError: "TOKEN_EXPIRED",
              http: { status: 401 },
            },
          }
        );
      } else if (error instanceof JsonWebTokenError) {
        console.warn("Context Error: Invalid token:", error.message);
        throw new GraphQLError("Invalid token. Please log in again.", {
          extensions: {
            code: "UNAUTHENTICATED",
            originalError: "INVALID_TOKEN",
            http: { status: 401 },
          },
        });
      } else {
        console.error(
          "Context Error: Unknown token verification error:",
          error
        );
        throw new Error("Authentication failed due to an unexpected error."); // Internal error
      }
    }

    // Solo el token de acceso abre sesión. El refresh token y los temporales de
    // 2FA se firman con el mismo secreto y también traen userId: sin este
    // chequeo, el tempToken que el login entrega con solo la contraseña valía
    // como sesión y salteaba el segundo factor. El rechazo es el mismo que el de
    // una firma inválida, y llega antes de tocar la base.
    if (verifiedToken?.type !== "access") {
      console.warn("Context Error: Invalid token: not an access token");
      throw new GraphQLError("Invalid token. Please log in again.", {
        extensions: {
          code: "UNAUTHENTICATED",
          originalError: "INVALID_TOKEN",
          http: { status: 401 },
        },
      });
    }

    // 2. Fetch User from DB (using BASE Prisma client to bypass potential middleware)
    if (verifiedToken?.userId) {
      try {
        // Fetch user including its role (one at most) and the role's permissions
        const user = await basePrisma.user.findUnique({
          where: { id: String(verifiedToken.userId) },
          // IMPORTANT: Ensure this include matches the UserWithRoleAndPermissions type
          include: {
            role: {
              include: {
                permissions: true,
              },
            },
            tenant_: {
              select: {
                id: true,
                name: true,
                logo: true,
                logo_data: true,
              },
            },
          },
        });

        // Assign user (cast needed if include structure matches the type)
        currentUser = (user as UserWithRoleAndPermissions) ?? null;

        if (!currentUser) {
          // Valid token but user deleted or not found
          console.warn(
            `Context Warning: User ID ${verifiedToken.userId} from token not found in DB.`
          );
          throw new GraphQLError("User associated with token not found.", {
            extensions: {
              code: "UNAUTHENTICATED",
              originalError: "USER_NOT_FOUND",
              http: { status: 401 },
            },
          });
        }

        // Assign tenantId if multitenant and user was found
      } catch (dbError) {
        console.error("Context Error: Database error fetching user:", dbError);
        // Don't expose DB error details to client
        throw new Error("Could not retrieve user information.");
      }
    } else {
      // Token was verified but didn't contain expected userId
      console.warn(
        "Context Warning: Verified token did not contain userId.",
        verifiedToken
      );
      throw new GraphQLError("Invalid token payload.", {
        extensions: {
          code: "UNAUTHENTICATED",
          originalError: "INVALID_TOKEN_PAYLOAD",
          http: { status: 401 },
        },
      });
    }
  } // End if (authHeader)

  // 3. Define Role and Permission Helper Functions
  // A user has one role at most (User.role). Without a role, hasRole is false
  // for every role and permissions() is empty: it fails closed.
  const rolDelUsuario = currentUser?.role?.id;
  // Checks if the user's role is one of the specified roles
  const hasRole = (...rolesToCheck: RoleType[]): boolean =>
    !!rolDelUsuario && rolesToCheck.includes(rolDelUsuario);

  // Calculates and returns the Set of permission IDs of the user's role (memoized per request)
  let _permissionsCache: Set<string> | null = null;
  const permissions = (): Set<string> => {
    if (!currentUser) return new Set<string>();
    if (_permissionsCache) return _permissionsCache;
    _permissionsCache = new Set<string>(
      (currentUser.role?.permissions ?? []).map((p) => p.id)
    );
    return _permissionsCache;
  };

  // 4. Construct the final ServiceContext object
  const finalContext: ServiceContext = {
    req,
    currentUser,
    hasRole,
    permissions,
    // Provide the BASE Prisma client instance
    prisma: basePrisma,
    // Include tenantId if multitenant

    // Pass the isSystemMode flag
    isSystemMode,
    // Include traceId for request tracing
    traceId,
  };

  return finalContext;
}

/**
 * Creates a "system" context, bypassing normal tenant/permission logic
 * by setting the isSystemMode flag to true.
 * Useful for internal processes, migrations, or super-admin tasks.
 * @param req The incoming request object (may be mocked for internal tasks).
 * @returns A Promise resolving to the ServiceContext configured for system mode.
 */
export async function createSystemContext(
  req: Request
): Promise<ServiceContext> {
  // Calls the main context creation function, forcing isSystemMode = true
  // Note: Authentication might still run depending on createContext logic,
  // you might want a separate path if system context doesn't need a user.
  return createContext(req, true);
}
