import type { MyApolloContext } from "../../server";

/**
 * Safely gets an entity service from the container
 * @param context The Apollo context with container
 * @param serviceName The name of the service to resolve
 * @returns The resolved service instance
 */
export const getEntityService = <T>(
  context: MyApolloContext,
  serviceName: string
): T => {
  if (!context.container) {
    throw new Error("Container not available in context");
  }

  const service = context.container.resolve(serviceName);
  if (!service) {
    throw new Error(`Service ${serviceName} not found in container`);
  }

  return service as T;
};

/**
 * Helper to ensure we're using services instead of direct Prisma
 * @deprecated This is here to catch direct Prisma usage - DO NOT USE
 */
export const NEVER_USE_PRISMA_DIRECTLY = () => {
  throw new Error(
    "NEVER use Prisma directly in pipelines! Always use entity services that handle SecurePrismaOps, multi-tenancy, and auditing."
  );
};
