/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbPaymentBatchDeleteService } from "../services/abPaymentBatchDeleteService";
import { AbPaymentBatchListWithCursorService } from "../services/abPaymentBatchListWithCursorService";
import { AbPaymentBatchListWithOffsetService } from "../services/abPaymentBatchListWithOffsetService";
import { AbPaymentBatchOneService } from "../services/abPaymentBatchOneService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  AbPaymentBatchResolvers,
  MutationAbPaymentBatchDeleteArgs,
  QueryAbPaymentBatchOneArgs,
  QueryAbPaymentBatchListWithOffsetArgs,
  QueryAbPaymentBatchListWithCursorArgs,
} from "../../../graphql/types";
import {
  abPaymentBatchDisplayId,
  abPaymentBatchDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const abPaymentBatchResolvers: {
  Query: Pick<
    QueryResolvers,
    | "abPaymentBatchOne"
    | "abPaymentBatchListWithOffset"
    | "abPaymentBatchListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "abPaymentBatchCreate" | "abPaymentBatchUpdate" | "abPaymentBatchDelete"
  >;
  AbPaymentBatch: AbPaymentBatchResolvers;
} = {
  Query: {
    abPaymentBatchOne: async (
      _parent: any,
      args: QueryAbPaymentBatchOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        AbPaymentBatchOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...abPaymentBatchDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    abPaymentBatchListWithOffset: async (
      _parent: any,
      args: QueryAbPaymentBatchListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbPaymentBatchListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbPaymentBatchWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbPaymentBatchOrderByWithRelationInput[];
      const select = {
        ...abPaymentBatchDisplayIdFragments,
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
    abPaymentBatchListWithCursor: async (
      _parent: any,
      args: QueryAbPaymentBatchListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbPaymentBatchListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbPaymentBatchWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbPaymentBatchOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...abPaymentBatchDisplayIdFragments,
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

  // Resolvers specific to the AbPaymentBatch type
  AbPaymentBatch: {
    displayId: (parent) => `${parent?.originalName}`,
  },
  Mutation: {
    abPaymentBatchDelete: async (
      _parent: any,
      args: MutationAbPaymentBatchDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbPaymentBatchDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...abPaymentBatchDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteAbPaymentBatch(args, select); // Assuming method deleteAbPaymentBatch
    },
  },
};
