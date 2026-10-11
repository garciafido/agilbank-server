import * as customValidations from "./customValidations";
import {
  MutationIntegrationClientDeleteArgs,
  IntegrationClient as IntegrationClientGraphQL,
} from "../../../graphql/types";
import { Prisma, PrismaClient } from "../../../prisma/generated-client/client";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import { ServiceContext } from "../../../service-context";
import {
  UnauthorizedError,
  PrismaError,
  UnknownError,
  NotFoundError,
  ValidationError,
  getErrorMessage,
} from "../../../common/errors";
import {
  assertNotInUse,
  findDeletable,
} from "../../../common/services/deletionBlockers";
import { injectable, inject } from "tsyringe";
import {
  runWithTransactionScope,
  runAfterCommit,
} from "../../../common/services/transactionScope";

/**
 * Service responsible for securely deleting IntegrationClient entities.
 */
@injectable()
export class IntegrationClientDeleteService {
  private db: SecurePrismaOps<"IntegrationClient">;

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
      "IntegrationClient",
      {} // Configuración vacía
    );
  }

  /**
   * Deletes a IntegrationClient instance after performing security checks.
   * @param args Arguments containing the ID of the entity to delete.
   * @param select Prisma select object to specify returned fields.
   * @returns The deleted IntegrationClient object if select/include is provided.
   */
  async deleteIntegrationClient(
    args: MutationIntegrationClientDeleteArgs,
    select: Prisma.IntegrationClientSelect | undefined
  ): Promise<IntegrationClientGraphQL> {
    // Return type from GraphQL schema

    // Basic user check (actual permission check is done by SecurePrismaOps)
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    // El permiso, antes de cualquier otra cosa. Después de acá corren
    // consultas a la base, trabajo de CPU y las validaciones custom del
    // proyecto: todo eso lo disparaba alguien sin permiso sobre la entidad,
    // y el mensaje de error resultante es un oráculo sobre datos que no
    // puede ver. En el alta, además, evita quemar un hash de contraseña
    // completo para terminar en un rechazo.
    this.db.assertCan("delete");

    // --- Specific Business Logic / Validations ---

    // Add any other pre-delete validation logic here if needed

    const executeDelete = async (txPrisma: PrismaClient) => {
      // --- Que el registro se vea para quien borra ---
      // Antes de los validadores del proyecto: uno que buscara el registro sin
      // el filtro de empresa respondería distinto para uno ajeno que para uno
      // que no existe. Así los dos son "no encontrado", el mismo error que la
      // consulta deletionBlockers.
      const { proof } = await findDeletable(
        "IntegrationClient",
        args.id,
        this.context,
        txPrisma,
        this.schemaMetaStore
      );

      // --- Custom intra-service validations (cross-aggregate invariants, locks) ---
      // Importadas desde ./customValidations.ts (archivo manual editable por el user).
      // Si alguna tira, la tx aborta automáticamente — no se borra nada ni files.
      // Un validator envuelto en skipOnDelete(...) (common/validation/validationPhase) se saltea acá.
      for (const validator of Object.values(customValidations)) {
        if (
          typeof validator === "function" &&
          !(validator as any).__skipOnDelete
        ) {
          await (validator as (a: any, c: any, p: any) => Promise<void>)(
            args,
            this.context,
            txPrisma
          );
        }
      }

      // --- Qué impide borrarlo ---
      // Después de los validadores del proyecto (frenan antes, con su propio
      // mensaje) y antes de borrar: la base informaría un solo motivo y dejaría
      // la transacción abortada; esto los junta todos (ENTITY_IN_USE). Lo vuelve
      // a verificar aunque la consulta previa haya dicho que estaba libre.
      // Con la prueba de findDeletable (esta entidad, este id, este contexto y
      // esta transacción) no se busca el registro otra vez.
      await assertNotInUse(
        "IntegrationClient",
        args.id,
        this.context,
        txPrisma,
        this.schemaMetaStore,
        { proof }
      );

      const txDb = new SecurePrismaOps(
        this.context,
        txPrisma,
        this.schemaMetaStore,
        "IntegrationClient",
        {} // Configuración vacía
      );

      const result = await txDb.delete({
        where: { id: args.id },
        select: select,
      });

      return result;
    };

    try {
      const isInTransaction = (this.context as any).txPrisma !== undefined;
      let result: IntegrationClientGraphQL;

      if (isInTransaction) {
        result = await executeDelete((this.context as any).txPrisma);
      } else {
        // runWithTransactionScope: lo que la mutación despache sale al
        // commitear, no antes. Ver common/services/transactionScope.
        result = await runWithTransactionScope(() =>
          this.prisma.$transaction(executeDelete, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 500,
            timeout: 10000,
          })
        );
      }

      return result;
    } catch (error) {
      // Consistent error handling
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle specific Prisma errors if needed (e.g., P2025 Record not found, although db.delete should handle this)
        console.error(
          "[IntegrationClientDeleteService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        // Con el contexto: de ahí sale el idioma del usuario (como en el update).
        throw new PrismaError(error, undefined, undefined, this.context, {
          deletion: true,
        });
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        // Re-throw errors already handled/thrown by SecurePrismaOps or checks.
        // ValidationError: un customValidation que frena el borrado tiene que
        // llegar con su mensaje, no envuelto como error desconocido.
        throw error;
      } else {
        // Wrap unknown errors
        console.error("[IntegrationClientDeleteService] Unknown Error:", error);
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin deleteIntegrationClient
} // Fin clase IntegrationClientDeleteService
