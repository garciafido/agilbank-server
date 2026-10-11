import { Prisma, PrismaClient } from "../../../prisma/generated-client/client";
import {
  QueryTenantOneArgs,
  Tenant as TenantGraphQL,
} from "../../../graphql/types";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import { ServiceContext } from "../../../service-context";
import {
  UnauthorizedError,
  PrismaError,
  UnknownError,
  NotFoundError,
  getErrorMessage,
} from "../../../common/errors";
import { injectable, inject } from "tsyringe";

/**
 * Service responsible for securely fetching a single Tenant entity by ID.
 */
@injectable()
export class TenantOneService {
  private db: SecurePrismaOps<"Tenant">;

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
      "Tenant",
      {} // Configuración vacía
    );
  }

  /**
   * Fetches a single Tenant by ID, applying security checks.
   * Throws NotFoundError if not found or not accessible by tenant/permissions.
   * @param args Arguments containing the ID of the entity to fetch.
   * @param select Optional Prisma select/include object to specify returned fields.
   * @returns The fetched Tenant object.
   */
  async getOne(
    // Renamed method for clarity within the class
    args: QueryTenantOneArgs,
    select: Prisma.TenantSelect | Prisma.TenantInclude | undefined
  ): Promise<TenantGraphQL> {
    // Return type from GraphQL schema (non-null based on Query definition)

    // Basic user check (actual permission check is done by SecurePrismaOps)
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      // Although secure ops would likely deny, better to check early
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    const db = this.db;

    // --- Specific Business Logic / Validations ---

    // Add any other pre-fetch validation logic here if needed

    try {
      // --- Delegate Execution to SecurePrismaOps ---
      // this.db.findUniqueOrThrow will internally:
      // 1. Check '_retrieve' permission.
      // 2. Apply tenant filter to the 'where' clause.
      // 3. Execute prisma.findUniqueOrThrow (which handles not found).
      // 4. Prune the select based on retrieve permissions before returning.
      const result = await db.findUniqueOrThrow({
        where: { id: args.id }, // Standard where clause by ID
        select, // Pass select object for pruning and final query
      });

      return result;
    } catch (error) {
      // Consistent error handling
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // findUniqueOrThrow throws P2025 if not found after filtering,
        // SecurePrismaOps might catch this or let it bubble up.
        // If SecurePrismaOps throws NotFoundError, it will be caught below.
        console.error(
          "[TenantOneService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        // Map P2025 to NotFoundError if SecurePrismaOps didn't already
        if (error.code === "P2025") {
          throw new NotFoundError(`Tenant con ID ${args.id} no encontrado.`);
        }
        throw new PrismaError(error);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError
      ) {
        // Re-throw errors already handled/thrown by SecurePrismaOps or checks
        throw error;
      } else {
        // Wrap unknown errors
        console.error("[TenantOneService] Unknown Error:", error);
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin getOne
} // Fin clase TenantOneService
