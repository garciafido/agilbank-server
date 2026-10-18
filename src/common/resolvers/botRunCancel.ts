import { Resolvers } from "../../graphql/types";
import { UnauthorizedError, NotFoundError } from "../errors";
import { deadLetterHandlers } from "../../workers/deadLetterHandlers";
import { logger } from "../../utils/logger";
import { generatedSchemaMetadata } from "../services/schemaMetadata.generated";

/**
 * Detención manual de un BotRun en ejecución (SysAdmin, desde la grilla de bots).
 *
 * Dos niveles:
 * - Sin `force`: cancelación COOPERATIVA — se estampa cancellationRequestedAt y
 *   el orquestador aborta limpio en el próximo límite de fase. Para bots vivos.
 * - Con `force`: el run se marca `failed` en el acto (mismo shape que el barrido
 *   de huérfanos) y el TRÁMITE cae a su failure-state reusando el registry de
 *   dead-letter del proyecto (deadLetterHandlers[pipelineId] dispara la
 *   transición `fallar*` + persiste el error operacional). Ahí quedan
 *   disponibles los botones de recovery de siempre para relanzar. Para bots
 *   colgados que nunca van a leer la cancelación.
 *
 * El job en cola no revive el proceso: el fencing por expectedState de los
 * stagePreconditions aborta cualquier redelivery contra un estado ya movido.
 */
export const botRunCancelResolvers: Resolvers = {
  Mutation: {
    botRunCancel: async (_parent, args, context, _info) => {
      if (!context.isSystemMode && !context.hasRole("SysAdmin")) {
        throw new UnauthorizedError("Permission denied: SysAdmin role required to cancel bot runs.");
      }
      const prisma = context.prisma;

      // El run se lee ACOTADO a la empresa de quien pide. Que hoy el guard exija
      // SysAdmin no alcanza: el resolver no miraba el privilegio, simplemente no
      // filtraba, así que el acceso cross-tenant salía de la ausencia de condición y
      // no de una declaración. Un proyecto que le dé este permiso a otro rol —o que
      // no declare el privilegio en BotRun— quedaría con cancelación entre empresas
      // sin que nada lo diga. El escape es el `crossTenantForRoles` declarado.
      const botRunMeta = generatedSchemaMetadata.get("BotRun" as any) as any;
      const ct = botRunMeta?.crossTenantForRoles;
      const rol = context.currentUser?.role?.id;
      const crossesTenants = !!ct && !!rol && ct.roles.includes(rol);
      const callerTenant = context.currentUser?.tenant_id_;
      // Sin empresa y sin privilegio: inalcanzable. `tenant_id_: undefined` en un
      // where de Prisma OMITE la condición, que acá sería cancelar el bot de cualquiera.
      if (!context.isSystemMode && !crossesTenants && !callerTenant) {
        throw new NotFoundError(`BotRun ${args.botRunId} not found`);
      }
      const tenantScope =
        context.isSystemMode || crossesTenants ? {} : { tenant_id_: callerTenant };

      const run = await prisma.botRun.findFirst({
        where: { id: args.botRunId, ...tenantScope },
        select: {
          id: true,
          status: true,
          startedAt: true,
          currentPhase: true,
          cancellationRequestedAt: true,
          workerEvent: { select: { id: true, jobType: true, payload: true } },
        },
      });
      if (!run) {
        throw new NotFoundError(`BotRun ${args.botRunId} not found`);
      }
      if (run.status !== "running") {
        return run.status;
      }

      const userId = context.currentUser?.id ?? "SYSADMIN";

      if (!args.force) {
        await prisma.botRun.update({
          where: { id: run.id },
          data: {
            cancellationRequestedAt: new Date(),
            cancellationRequestedBy: { connect: { id: userId } },
            cancellationReason: "Detención solicitada por el operador",
          },
        });
        return "cancellation_requested";
      }

      // FORZAR: el bot no responde — marcar el run y hacer caer el trámite.
      await prisma.botRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          requiresHumanIntervention: true,
          interventionReason: "Detenido manualmente por el operador",
          error: {
            errorType: "cancelled",
            severity: "critical",
            recoverable: false,
            message:
              `Detención forzada por el operador. En ejecución desde ` +
              `${run.startedAt?.toISOString() ?? "?"}; última fase: ${run.currentPhase ?? "?"}.`,
            timestamp: new Date().toISOString(),
          } as any,
        },
      });

      const jobType = run.workerEvent?.jobType;
      if (jobType) {
        const pipelineId = String(jobType).split(".")[0];
        const handler = deadLetterHandlers[pipelineId];
        if (handler) {
          try {
            await handler({
              pipelineId,
              payload: run.workerEvent?.payload,
              prisma: prisma as any,
              logger,
            });
          } catch (error) {
            logger.warn(
              { botRunId: run.id, pipelineId, error },
              "[botRunCancel] La transición de falla del trámite no pudo dispararse"
            );
          }
        } else {
          logger.info(
            { botRunId: run.id, pipelineId },
            "[botRunCancel] Sin dead-letter handler registrado para el pipeline — solo se marcó el run"
          );
        }
      }

      return "failed";
    },
  },
};
