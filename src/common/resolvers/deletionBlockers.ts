import type { ServiceContext } from "../../service-context";
import { findDeletionBlockers, type DeletionBlockers } from "../services/deletionBlockers";

/**
 * La consulta `deletionBlockers(entity, id)`: qué impide borrar un registro,
 * antes de pedir la confirmación. Las reglas (entidad de la tabla, permiso de
 * borrado, el de lectura donde el borrado lo exige, registro visible) las aplica
 * findDeletionBlockers, igual que dentro del borrado.
 *
 * El nombre de un registro viaja en uno de dos campos: `nameText` cuando el
 * nombre visible es un texto, `nameI18n` cuando es uno por idioma ({ es, en, pt }).
 */
export const toGraphQLDeletionBlockers = (blockers: DeletionBlockers) => ({
  ...blockers,
  reasons: blockers.reasons.map((reason) => ({
    ...reason,
    visible: reason.visible && {
      count: reason.visible.count,
      items: reason.visible.items.map((item) =>
        typeof item.name === "string"
          ? { id: item.id, nameText: item.name, nameI18n: null }
          : { id: item.id, nameText: null, nameI18n: item.name }
      ),
    },
  })),
});

export const deletionBlockersResolvers = {
  Query: {
    // El contexto de Apollo (MyApolloContext) extiende ServiceContext: es lo único que se usa.
    deletionBlockers: async (_parent: unknown, args: { entity: string; id: string }, context: ServiceContext) =>
      toGraphQLDeletionBlockers(await findDeletionBlockers(args.entity, args.id, context)),
  },
};
