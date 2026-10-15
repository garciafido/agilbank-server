import { injectable, inject } from "tsyringe";
import { Prisma, PrismaClient } from "../../prisma/generated-client/client";
import { SchemaMetadataStore } from "../../common/services/schemaMetadata";
import { runWithTransactionScope } from "../../common/services/transactionScope";
import {
  UnauthorizedError,
  PrismaError,
  UnknownError,
  NullValueError,
  ValidationError,
  NotFoundError,
  getErrorMessage,
} from "../../common/errors";
import {
  MutationAbStatementReadArgs,
  AbStatementReadReturn,
} from "../../graphql/types";
import type { MyApolloContext } from "../../server";
import { StageContext } from "../pipeline/types";
import { generatedSchemaMetadata } from "../../common/services/schemaMetadata.generated";
import { enqueuePipelineJob } from "../../utils/pgmq";
import { randomUUID } from "crypto";
import { read } from "./stages";

/**
 * Servicio orquestador de AbStatementRead.
 * Utiliza SecurePrismaOps para interacción segura con la BD y aplica lógica de negocio específica.
 */
@injectable()
export class AbStatementReadPipelineService {
  constructor(
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {}

  async execute(
    args: MutationAbStatementReadArgs,
    apolloContext: MyApolloContext
  ): Promise<AbStatementReadReturn> {
    if (!apolloContext.isSystemMode && !apolloContext.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }
    // Gate de tenant: la entidad dueña (AbStatement) tiene que ser de la
    // empresa del que llama, verificado antes de correr los stages.
    if (!apolloContext.isSystemMode) {
      const ownerId = (args as any).statementId;
      const ownerTenant = apolloContext.currentUser?.tenant_id_;
      // Sin empresa o sin id: inalcanzable. tenant_id_ undefined en el where OMITE
      // la condición (lectura global) — cortar, no degradar.
      const ownerRow =
        ownerTenant && ownerId
          ? await this.prisma.abStatement.findFirst({
              where: { id: ownerId, tenant_id_: ownerTenant },
              select: { id: true },
            })
          : null;
      if (!ownerRow) {
        const meta = generatedSchemaMetadata.get("AbStatement" as any);
        const ct = (meta as any)?.crossTenantForRoles;
        const userRoles =
          apolloContext.currentUser?.roles?.map((r: any) => r.id) ?? [];
        const allowed =
          !!ct && userRoles.some((r: string) => ct.roles.includes(r));
        if (!allowed) {
          throw new NotFoundError("AbStatement " + ownerId + " no encontrada");
        }
      }
    }
    try {
      // Función que ejecuta el pipeline con el prisma proporcionado
      const executeWithPrisma = async (
        prismaClient: PrismaClient
      ): Promise<AbStatementReadReturn> => {
        // Crear StageContext una sola vez para todos los stages
        const stageContext: StageContext = {
          ...apolloContext,
          txPrisma: prismaClient,
          schemaMetaStore: this.schemaMetaStore,
        };

        // Stage 1. read - EJECUTAR EN WORKER
        const readWorkerEvent = await prismaClient.workerEvent.create({
          data: {
            queueName: "pipeline_jobs",
            jobType: "AbStatementRead.read",
            status: "queued",
            enqueuedAt: new Date(),
            payload: {
              statementId: args.statementId,
              pipelineId: "AbStatementRead",
              stageId: "read",
            },
            result: { progress: 0, total: 0, current: 0 },
            retryCount: 0,
            version_: randomUUID(),
            createdAt_: new Date(),
            triggerUserId: { connect: { id: apolloContext.currentUser!.id } },
            createdBy_: { connect: { id: apolloContext.currentUser!.id } },
            ...(apolloContext.currentUser?.tenant_id_ && {
              tenant_: {
                connect: { id: apolloContext.currentUser.tenant_id_ },
              },
            }),
          },
        });

        // Publicar en la MISMA transacción que creó el worker_event: el
        // mensaje se vuelve visible atómicamente con el commit, así el
        // worker nunca puede leerlo antes de que la fila exista.
        await enqueuePipelineJob(
          "AbStatementRead",
          "read",
          {
            statementId: args.statementId,
            workerEventId: readWorkerEvent.id,
          },
          undefined,
          prismaClient
        );

        const readReturn = {
          _jobId: readWorkerEvent.id,
          _status: "queued",
          status: null,
        };

        return {
          result: "OK",
          status: readReturn.status,
        };
      };

      // Si el contexto ya tiene un prisma diferente, es transaccional del workflow
      if (apolloContext.prisma && apolloContext.prisma !== this.prisma) {
        return await executeWithPrisma(apolloContext.prisma);
      }

      // Si no, crear transacción propia
      // Lo que este bloque despache sale al commitear. Ver common/services/transactionScope.
      return await runWithTransactionScope(() =>
        this.prisma.$transaction(async (txPrisma) => {
          return await executeWithPrisma(txPrisma as PrismaClient);
        })
      );
    } catch (error) {
      // Manejo de errores centralizado y consistente
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[AbStatementReadService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        throw new PrismaError(error, undefined, undefined, apolloContext);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof NullValueError
      ) {
        // Re-lanzar errores de negocio/permiso/validación conocidos
        throw error;
      } else {
        // Envolver errores desconocidos
        console.error("[AbStatementReadService] Unknown Error:", error);
        throw new UnknownError(getErrorMessage(error));
      }
    }
  }

  /**
   * Método standalone para ejecutar read.
   * Llamado por el worker de forma asíncrona.
   * NOTA: Este stage NO usa transacción envolvente (.transactional(false)).
   * El stage es responsable de manejar sus propias transacciones.
   */
  async executeRead(
    input: {
      statementId: string;
      workerEventId: string;
      simulation?: StageContext["simulation"];
    },
    apolloContext: MyApolloContext
  ): Promise<{ status: string }> {
    const stageContext: StageContext = {
      ...apolloContext,
      txPrisma: this.prisma,
      schemaMetaStore: this.schemaMetaStore,
    };

    const result = await read(
      stageContext,
      input.statementId,
      input.workerEventId
    );

    return result;
  }
}
