/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbDecisionDeleteService } from "../services/abDecisionDeleteService";
import { AbDecisionListWithCursorService } from "../services/abDecisionListWithCursorService";
import { AbDecisionListWithOffsetService } from "../services/abDecisionListWithOffsetService";
import { AbDecisionOneService } from "../services/abDecisionOneService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  AbDecisionResolvers,
  MutationAbDecisionDeleteArgs,
  QueryAbDecisionOneArgs,
  QueryAbDecisionListWithOffsetArgs,
  QueryAbDecisionListWithCursorArgs,
} from "../../../graphql/types";
import { abDecisionDisplayId, abDecisionDisplayIdFragments } from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const abDecisionResolvers: {
  Query: Pick<
    QueryResolvers,
    "abDecisionOne" | "abDecisionListWithOffset" | "abDecisionListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "abDecisionCreate" | "abDecisionUpdate" | "abDecisionDelete"
  >;
  AbDecision: AbDecisionResolvers;
} = {
  Query: {
    abDecisionOne: async (
      _parent: any,
      args: QueryAbDecisionOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(AbDecisionOneService);
      // Prepare selection set from GraphQL query info
      const select = { ...abDecisionDisplayIdFragments, ...infoToSelect(info) };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    abDecisionListWithOffset: async (
      _parent: any,
      args: QueryAbDecisionListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbDecisionListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbDecisionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbDecisionOrderByWithRelationInput[];
      const select = { ...abDecisionDisplayIdFragments, ...infoToSelect(info) };
      // Delegate execution to the service method
      return serviceInstance.listWithOffset({
        // Assuming method takes an options object
        where,
        orderBy,
        skip: args.offset, // Map GQL 'offset' to Prisma 'skip'
        take: args.take,
        select,
      });
    },
    abDecisionListWithCursor: async (
      _parent: any,
      args: QueryAbDecisionListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbDecisionListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbDecisionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbDecisionOrderByWithRelationInput[]; // Ensure array type is correct
      const select = { ...abDecisionDisplayIdFragments, ...infoToSelect(info) };
      // Delegate execution to the service method
      return serviceInstance.listWithCursor({
        // Assuming method takes an options object
        where,
        orderBy,
        cursorKey: args.cursorKey ? { id: args.cursorKey } : undefined, // Assuming cursor is on 'id' field
        take: args.take,
        select,
      });
    },
  },

  // Resolvers specific to the AbDecision type
  AbDecision: {
    displayId: (parent) => `${parent?.decisionKey}`,
  },
  Mutation: {
    abDecisionDelete: async (
      _parent: any,
      args: MutationAbDecisionDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbDecisionDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = { ...abDecisionDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.deleteAbDecision(args, select); // Assuming method deleteAbDecision
    },
  },
};
