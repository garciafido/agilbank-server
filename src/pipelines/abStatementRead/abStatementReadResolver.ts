import { AbStatementReadPipelineService } from "./abStatementReadService";
import {
  AbStatementReadReturn,
  MutationAbStatementReadArgs,
  MutationResolvers,
} from "../../graphql/types";
import type { MyApolloContext } from "../../server";
import { UnauthorizedError } from "../../common/errors";

export const abStatementReadResolver: {
  Mutation: Pick<MutationResolvers, "abStatementRead">;
} = {
  Mutation: {
    abStatementRead: async (
      _parent: any,
      args: MutationAbStatementReadArgs,
      context: MyApolloContext
    ): Promise<AbStatementReadReturn | null> => {
      // Permiso de ejecución (patrón checkPermission de SecurePrismaOps), antes de
      // resolver el service: el service verifica la sesión y que la entidad dueña
      // sea de la empresa, no quién puede correr el pipeline.
      if (
        !context.isSystemMode &&
        !context.permissions().has("abStatementRead_run")
      ) {
        throw new UnauthorizedError(
          "Permission denied: 'abStatementRead_run' required for AbStatementRead."
        );
      }
      const pipelineService = context.container.resolve(
        AbStatementReadPipelineService
      );
      return pipelineService.execute(args, context);
    },
  },
};
