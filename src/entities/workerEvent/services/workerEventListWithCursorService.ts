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
  getErrorMessage,
} from "../../../common/errors";
import { WorkerEvent as WorkerEventGraphQL } from "../../../graphql/types";
import { injectable, inject } from "tsyringe";
import { nullToUndefinedRecursive } from "../../../common/utils";

// Define interface for method arguments for clarity
interface ListWithCursorArgs {
  where?: Prisma.WorkerEventWhereInput;
  // IMPORTANT: For cursor pagination, orderBy MUST include a unique field (like id)
  // Prisma often expects a single object here, not an array, if using cursor.
  // Adjust type based on your actual GraphQL input definition for OrderByCursor!
  orderBy:
    | Prisma.WorkerEventOrderByWithRelationInput
    | Prisma.WorkerEventOrderByWithRelationInput[];
  select?: Prisma.WorkerEventSelect;
  include?: Prisma.WorkerEventInclude;
  cursorKey?: string | number; // The value of the unique cursor field from the last item
  take: number; // Number of items per page
  /** Lectura administrativa cross-tenant explícita (crossTenantForRoles onRequest). */
  allTenants?: boolean;
}

// Constants for pagination limits
const MAX_PAGE_SIZE = Number(process.env.MAX_PAGE_SIZE) || 501;

/**
 * Service responsible for securely fetching paginated lists of WorkerEvent entities using cursor.
 */
@injectable()
export class WorkerEventListWithCursorService {
  private db: SecurePrismaOps<"WorkerEvent">;

  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {
    // Instantiate the secure data access layer
    this.db = new SecurePrismaOps(
      this.context,
      this.prisma,
      this.schemaMetaStore, // Pass the Store instance
      "WorkerEvent",
      {} // Configuración vacía
    );
  }

  /**
   * Fetches a paginated list of WorkerEvent using cursor-based pagination, applying security checks.
   * @param args Arguments including filters, ordering (must contain unique key), cursor, limit, and select.
   * @returns An array of WorkerEvent objects.
   */
  async listWithCursor(
    args: ListWithCursorArgs
  ): Promise<WorkerEventGraphQL[]> {
    // Return type from GraphQL schema

    // Basic user check
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    // Lectura cross-tenant EXPLÍCITA (crossTenantForRoles onRequest): instancia
    // derivada — valida rol, no muta contexto, no salta permisos.
    const db = args.allTenants ? this.db.forAllTenants() : this.db;

    // 1. Validate Pagination Limits
    if (args.take > MAX_PAGE_SIZE) {
      throw new PageSizeTooLargeError(
        `El límite de resultados por página es ${MAX_PAGE_SIZE}.`
      );
    }
    // We don't need a MAX_SKIP_SIZE check for cursor pagination

    // 2. Prepare Secure WHERE Clause
    let combinedWhere = nullToUndefinedRecursive(args.where) ?? {};
    const specificFilter = null;
    if (specificFilter) {
      // Merge specific filter with existing where using AND
      if (combinedWhere.AND) {
        if (Array.isArray(combinedWhere.AND))
          combinedWhere.AND.push(specificFilter);
        else combinedWhere.AND = [combinedWhere.AND, specificFilter];
      } else if (Object.keys(combinedWhere).length > 0) {
        combinedWhere = { AND: [combinedWhere, specificFilter] };
      } else {
        combinedWhere = specificFilter;
      }
    }
    // Tenant filter will be added by this.db.findMany

    // 3. Prepare OrderBy and Cursor
    const orderBy = nullToUndefinedRecursive(args.orderBy);
    let cursorArg: Prisma.WorkerEventWhereUniqueInput | undefined = undefined;

    // Validate orderBy and prepare cursor (using original template's logic - needs careful review)
    if (
      args.cursorKey &&
      orderBy &&
      typeof orderBy === "object" &&
      !Array.isArray(orderBy)
    ) {
      // WARNING: Assumes the first key in the NON-ARRAY orderBy object is the unique cursor field.
      // Consider making the cursor field explicit (e.g., always 'id') or passed as an arg.
      const orderByKey = Object.keys(orderBy)[0];
      if (orderByKey) {
        // Use 'string | number' for value to avoid potential type issues
        const cursorValue: string | number | undefined = args.cursorKey;
        if (cursorValue !== undefined && cursorValue !== null) {
          // Prisma cursor needs an object like { uniqueFieldName: value }
          cursorArg = {
            [orderByKey]: cursorValue,
          } as unknown as Prisma.WorkerEventWhereUniqueInput;
          console.log(
            `[listWithCursor] Using cursor: ${JSON.stringify(cursorArg)}`
          );
        }
      } else {
        console.warn(
          "[listWithCursor] orderBy object provided but has no keys for cursor."
        );
      }
    } else if (args.cursorKey) {
      console.warn(
        "[listWithCursor] cursorKey provided but orderBy is missing, not an object, or is an array. Cursor ignored."
      );
      // Consider throwing an error if cursorKey requires a specific orderBy structure
    }

    try {
      // --- Delegate Execution to SecurePrismaOps ---
      const results = await db.findMany({
        where: combinedWhere,
        orderBy: orderBy,
        cursor: cursorArg, // Pass the constructed cursor object
        take: args.take,
        // Add +1 to 'take' to check if there's a next page easily? Optional.
        // take: args.take + 1,
        skip: cursorArg ? 1 : undefined, // Need to skip the cursor item itself if provided
        select: args.select,
      });

      // Process results if you added +1 to 'take' for hasNextPage detection
      // let hasNextPage = false;
      // if (results.length > args.take) {
      //     hasNextPage = true;
      //     results.pop(); // Remove the extra item
      // }
      // Consider returning { items: results, hasNextPage: hasNextPage };

      return results as WorkerEventGraphQL[]; // Cast to GraphQL type
    } catch (error) {
      // Consistent error handling
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[WorkerEventListWithCursorService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        throw new PrismaError(error);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof PageSizeTooLargeError
      ) {
        throw error;
      } else {
        console.error(
          "[WorkerEventListWithCursorService] Unknown Error:",
          error
        );
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin listWithCursor
} // Fin clase WorkerEventListWithCursorService
