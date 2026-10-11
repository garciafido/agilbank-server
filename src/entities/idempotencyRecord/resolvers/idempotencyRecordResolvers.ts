/* eslint-disable @typescript-eslint/no-unused-vars */
import { IdempotencyRecordDeleteService } from "../services/idempotencyRecordDeleteService";
import { IdempotencyRecordListWithCursorService } from "../services/idempotencyRecordListWithCursorService";
import { IdempotencyRecordListWithOffsetService } from "../services/idempotencyRecordListWithOffsetService";
import { IdempotencyRecordOneService } from "../services/idempotencyRecordOneService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  IdempotencyRecordResolvers,
  MutationIdempotencyRecordDeleteArgs,
  QueryIdempotencyRecordOneArgs,
  QueryIdempotencyRecordListWithOffsetArgs,
  QueryIdempotencyRecordListWithCursorArgs,
} from "../../../graphql/types";
import {
  idempotencyRecordDisplayId,
  idempotencyRecordDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const idempotencyRecordResolvers: {
  Query: Pick<
    QueryResolvers,
    | "idempotencyRecordOne"
    | "idempotencyRecordListWithOffset"
    | "idempotencyRecordListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "idempotencyRecordCreate"
    | "idempotencyRecordUpdate"
    | "idempotencyRecordDelete"
  >;
  IdempotencyRecord: IdempotencyRecordResolvers;
} = {
  Query: {
    idempotencyRecordOne: async (
      _parent: any,
      args: QueryIdempotencyRecordOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        IdempotencyRecordOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...idempotencyRecordDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    idempotencyRecordListWithOffset: async (
      _parent: any,
      args: QueryIdempotencyRecordListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        IdempotencyRecordListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.IdempotencyRecordWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.IdempotencyRecordOrderByWithRelationInput[];
      const select = {
        ...idempotencyRecordDisplayIdFragments,
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
    idempotencyRecordListWithCursor: async (
      _parent: any,
      args: QueryIdempotencyRecordListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        IdempotencyRecordListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.IdempotencyRecordWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.IdempotencyRecordOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...idempotencyRecordDisplayIdFragments,
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

  // Resolvers specific to the IdempotencyRecord type
  IdempotencyRecord: {
    displayId: (parent) => `${parent?.client}:${parent?.key}`,
  },
  Mutation: {
    idempotencyRecordDelete: async (
      _parent: any,
      args: MutationIdempotencyRecordDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        IdempotencyRecordDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...idempotencyRecordDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteIdempotencyRecord(args, select); // Assuming method deleteIdempotencyRecord
    },
  },
};
