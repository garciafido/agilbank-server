/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbReconciliationDeleteService } from "../services/abReconciliationDeleteService";
import { AbReconciliationListWithCursorService } from "../services/abReconciliationListWithCursorService";
import { AbReconciliationListWithOffsetService } from "../services/abReconciliationListWithOffsetService";
import { AbReconciliationOneService } from "../services/abReconciliationOneService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  AbReconciliationResolvers,
  MutationAbReconciliationDeleteArgs,
  QueryAbReconciliationOneArgs,
  QueryAbReconciliationListWithOffsetArgs,
  QueryAbReconciliationListWithCursorArgs,
} from "../../../graphql/types";
import {
  abReconciliationDisplayId,
  abReconciliationDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const abReconciliationResolvers: {
  Query: Pick<
    QueryResolvers,
    | "abReconciliationOne"
    | "abReconciliationListWithOffset"
    | "abReconciliationListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "abReconciliationCreate"
    | "abReconciliationUpdate"
    | "abReconciliationDelete"
  >;
  AbReconciliation: AbReconciliationResolvers;
} = {
  Query: {
    abReconciliationOne: async (
      _parent: any,
      args: QueryAbReconciliationOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        AbReconciliationOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...abReconciliationDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    abReconciliationListWithOffset: async (
      _parent: any,
      args: QueryAbReconciliationListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbReconciliationListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbReconciliationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbReconciliationOrderByWithRelationInput[];
      const select = {
        ...abReconciliationDisplayIdFragments,
        ...infoToSelect(info),
      };
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
    abReconciliationListWithCursor: async (
      _parent: any,
      args: QueryAbReconciliationListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbReconciliationListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbReconciliationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbReconciliationOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...abReconciliationDisplayIdFragments,
        ...infoToSelect(info),
      };
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

  // Resolvers specific to the AbReconciliation type
  AbReconciliation: {
    displayId: (parent) => `${parent?.requestKey}`,
  },
  Mutation: {
    abReconciliationDelete: async (
      _parent: any,
      args: MutationAbReconciliationDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbReconciliationDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...abReconciliationDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteAbReconciliation(args, select); // Assuming method deleteAbReconciliation
    },
  },
};
