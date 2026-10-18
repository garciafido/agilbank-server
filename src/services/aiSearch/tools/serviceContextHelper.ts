/**
 * Service Context Helper
 *
 * Creates a ServiceContext from SearchContext for use with SecurePrismaOps.
 * Bridges the AI Search context to the standard security context.
 */

import { randomUUID } from 'crypto';
import { SearchContext } from '../types';
import { ServiceContext, UserWithRoleAndPermissions } from '../../../types/context.types';
import { PrismaClient } from '../../../prisma/generated-client/client';

/**
 * Cache for user data to avoid repeated DB queries
 */
const userCache = new Map<string, { user: UserWithRoleAndPermissions; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a ServiceContext from SearchContext for use with SecurePrismaOps.
 * This allows AI Search tools to leverage the existing security infrastructure.
 *
 * @param prisma - PrismaClient instance
 * @param searchContext - AI Search context with tenant, user, and permissions
 * @returns ServiceContext compatible with SecurePrismaOps
 */
export async function createServiceContextFromSearch(
  prisma: PrismaClient,
  searchContext: SearchContext
): Promise<ServiceContext> {
  const { userId, tenantId, permissions } = searchContext;

  // Check cache first
  const cacheKey = `${tenantId}:${userId}`;
  const cached = userCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return buildContext(cached.user, tenantId, permissions, prisma);
  }

  // Fetch user with its role, one at most (needed for hasRole helper)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Cache the user
  userCache.set(cacheKey, {
    user: user as UserWithRoleAndPermissions,
    expires: Date.now() + CACHE_TTL_MS,
  });

  return buildContext(user as UserWithRoleAndPermissions, tenantId, permissions, prisma);
}

/**
 * Build ServiceContext from user data
 */
function buildContext(
  user: UserWithRoleAndPermissions,
  tenantId: string,
  permissions: string[],
  prisma: PrismaClient
): ServiceContext {
  const permissionSet = new Set(permissions);
  // Without a role, hasRole is false for every role
  const rolDelUsuario = user.role?.id;

  return {
    prisma,
    currentUser: user,
    hasRole: (...rolesToCheck) => !!rolDelUsuario && rolesToCheck.includes(rolDelUsuario),
    permissions: () => permissionSet,
    req: {} as any, // Not needed for tool execution
    isSystemMode: false,
    traceId: randomUUID(),
  };
}

/**
 * Clear user cache (useful for testing or after permission changes)
 */
export function clearUserCache(): void {
  userCache.clear();
}

/**
 * Remove specific user from cache
 */
export function invalidateUserCache(tenantId: string, userId: string): void {
  userCache.delete(`${tenantId}:${userId}`);
}
