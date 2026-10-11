import { Prisma, PrismaClient } from "../../../prisma/generated-client/client";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import { ServiceContext } from "../../../service-context";
import {
  UnauthorizedError,
  PrismaError,
  UnknownError,
  NotFoundError,
  PageSizeTooLargeError,
  SkipTooLargeError,
  getErrorMessage,
} from "../../../common/errors";
import { WorkerEvent as WorkerEventGraphQL } from "../../../graphql/types";
import { injectable, inject } from "tsyringe";
import { nullToUndefinedRecursive } from "../../../common/utils";

// Define interface for method arguments for clarity
interface ListWithOffsetArgs {
  where?: Prisma.WorkerEventWhereInput;
  orderBy?: Prisma.WorkerEventOrderByWithRelationInput[];
  select?: Prisma.WorkerEventSelect;
  include?: Prisma.WorkerEventInclude;
  skip: number; // Renamed from offset
  take: number;
  /** Lectura administrativa cross-tenant explícita (crossTenantForRoles onRequest). */
  allTenants?: boolean;
}

// Constants for pagination limits
const MAX_PAGE_SIZE = Number(process.env.MAX_PAGE_SIZE) || 501;
const MAX_SKIP_SIZE = Number(process.env.MAX_SKIP_SIZE) || 2001;

/**
 * Service responsible for securely fetching paginated lists of WorkerEvent entities using offset.
 */
@injectable()
export class WorkerEventListWithOffsetService {
  private db: SecurePrismaOps<"WorkerEvent">;

  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {
    // Instantiate the secure data access layer for this model
    this.db = new SecurePrismaOps(
      this.context,
      this.prisma,
      this.schemaMetaStore, // Pass the Store instance
      "WorkerEvent",
      {} // Configuración vacía
    );
  }

  /**
   * Fetches a paginated list of WorkerEvent using offset/limit, applying security checks.
   * @param args Arguments including filters, ordering, pagination, and select/include.
   * @returns An array of WorkerEvent objects.
   */
  async listWithOffset(
    args: ListWithOffsetArgs
  ): Promise<WorkerEventGraphQL[]> {
    // Return type from GraphQL schema

    // Basic user check (actual permission check is done by SecurePrismaOps)
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    // Lectura cross-tenant EXPLÍCITA (crossTenantForRoles onRequest): instancia
    // derivada de SecurePrismaOps — valida el rol, no muta el contexto, no
    // salta permisos (solo omite el filtro de tenant en esta operación).
    const db = args.allTenants ? this.db.forAllTenants() : this.db;

    // 1. Validate Pagination Limits (Business Rule)
    if (args.take > MAX_PAGE_SIZE) {
      throw new PageSizeTooLargeError(
        `El límite de resultados por página es ${MAX_PAGE_SIZE}.`
      );
    }
    if (args.skip > MAX_SKIP_SIZE) {
      throw new SkipTooLargeError(
        `El máximo número de registros a saltar es ${MAX_SKIP_SIZE}.`
      );
    }

    // 2. Prepare Secure WHERE Clause
    // Start with filters passed from the resolver
    let combinedWhere = nullToUndefinedRecursive(args.where) ?? {};

    // Apply specific business logic filters (like hiding SYSTEM users)
    const specificFilter = null; // Get the specific filter string or null
    if (specificFilter) {
      // Merge specific filter with existing where using AND
      if (combinedWhere.AND) {
        if (Array.isArray(combinedWhere.AND)) {
          combinedWhere.AND.push(specificFilter);
        } else {
          combinedWhere.AND = [combinedWhere.AND, specificFilter];
        }
      } else if (Object.keys(combinedWhere).length > 0) {
        combinedWhere = { AND: [combinedWhere, specificFilter] };
      } else {
        combinedWhere = specificFilter;
      }
    }
    // NOTE: Tenant filter will be applied *in addition* to this inside this.db.findMany

    // 3. Prepare other arguments
    const orderBy = nullToUndefinedRecursive(args.orderBy);
    // SecurePrismaOps will handle pruning select/include based on permissions

    try {
      // --- Delegate Execution to SecurePrismaOps ---
      // this.db.findMany will internally:
      // 1. Check '_retrieve' permission.
      // 2. Apply tenant filter to 'combinedWhere'.
      // 3. Prune the select based on retrieve permissions.
      // 4. Execute prisma.findMany.
      const results = await db.findMany({
        where: combinedWhere,
        orderBy: orderBy,
        skip: args.skip,
        take: args.take,
        select: args.select,
      });

      return results as WorkerEventGraphQL[]; // Cast to GraphQL type
    } catch (error) {
      // Consistent error handling
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[WorkerEventListWithOffsetService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        throw new PrismaError(error);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof PageSizeTooLargeError ||
        error instanceof SkipTooLargeError
      ) {
        // Re-throw errors known to this service or SecurePrismaOps
        throw error;
      } else {
        // Wrap unknown errors
        console.error(
          "[WorkerEventListWithOffsetService] Unknown Error:",
          error
        );
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin listWithOffset
} // Fin clase WorkerEventListWithOffsetService
