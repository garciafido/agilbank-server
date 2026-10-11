import { Resolvers } from "../../graphql/types";
import { UnauthorizedError } from "../errors";
import { sseManager } from "../../services/sse/SSEManager";

/**
 * Broadcast del modo mantenimiento a TODOS los clientes conectados por SSE
 * (mensaje sin tenantId/userId → shouldReceiveMessage lo deja pasar a todos).
 *
 * Es el aviso best-effort de la capa 1 del esquema de mantenimiento: la señal
 * autoritativa es el 503 {maintenance: true} que responde el edge (Traefik)
 * cuando el switch está puesto — este broadcast solo agrega la gracia previa
 * ("guardá lo que tengas abierto") y el aviso de fin cuando no hubo corte.
 *
 * - active=true + until futuro → los clientes muestran el banner de aviso
 * - active=true sin until      → overlay bloqueante inmediato
 * - active=false               → limpia el aviso (si hubo corte real, la
 *                                recuperación la decide el polling del cliente)
 */
export const maintenanceResolvers: Resolvers = {
  Mutation: {
    broadcastMaintenance: async (_parent, args, context, _info) => {
      if (!context.hasRole("SysAdmin")) {
        throw new UnauthorizedError("Permission denied: SysAdmin role required to broadcast maintenance mode.");
      }

      const sentCount = sseManager.publish({
        type: "maintenance",
        payload: {
          active: args.active,
          message: args.message ?? null,
          until: args.until ?? null,
        },
      });

      console.log(`[Maintenance] Broadcast active=${args.active} sent to ${sentCount} SSE clients`);
      return sentCount;
    },
  },
};
