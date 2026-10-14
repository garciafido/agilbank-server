import { AbStatementReadPipelineService } from "./abStatementReadService";
import {
  AbStatementReadReturn,
  MutationAbStatementReadArgs,
  MutationResolvers,
} from "../../graphql/types";
import type { MyApolloContext } from "../../server";

export const abStatementReadResolver: {
  Mutation: Pick<MutationResolvers, "abStatementRead">;
} = {
  Mutation: {
    abStatementRead: async (
      _parent: any,
      args: MutationAbStatementReadArgs,
      context: MyApolloContext
    ): Promise<AbStatementReadReturn | null> => {
      const pipelineService = context.container.resolve(
        AbStatementReadPipelineService
      );
      return pipelineService.execute(args, context);
    },
  },
};
