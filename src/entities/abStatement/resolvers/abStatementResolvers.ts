/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbStatementDeleteService } from "../services/abStatementDeleteService";
import { AbStatementListWithCursorService } from "../services/abStatementListWithCursorService";
import { AbStatementListWithOffsetService } from "../services/abStatementListWithOffsetService";
import { AbStatementOneService } from "../services/abStatementOneService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  AbStatementResolvers,
  MutationAbStatementDeleteArgs,
  QueryAbStatementOneArgs,
  QueryAbStatementListWithOffsetArgs,
  QueryAbStatementListWithCursorArgs,
} from "../../../graphql/types";
import {
  abStatementDisplayId,
  abStatementDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

const abStatementFileDataFragments: Prisma.AbStatementSelect = {
  file_data: true,
};

export const abStatementResolvers: {
  Query: Pick<
    QueryResolvers,
    "abStatementOne" | "abStatementListWithOffset" | "abStatementListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "abStatementCreate" | "abStatementUpdate" | "abStatementDelete"
  >;
  AbStatement: AbStatementResolvers;
} = {
  Query: {
    abStatementOne: async (
      _parent: any,
      args: QueryAbStatementOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(AbStatementOneService);
      // Prepare selection set from GraphQL query info
      const select = {
        ...abStatementDisplayIdFragments,
        ...abStatementFileDataFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    abStatementListWithOffset: async (
      _parent: any,
      args: QueryAbStatementListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbStatementListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbStatementWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbStatementOrderByWithRelationInput[];
      const select = {
        ...abStatementDisplayIdFragments,
        ...abStatementFileDataFragments,
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
    abStatementListWithCursor: async (
      _parent: any,
      args: QueryAbStatementListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbStatementListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbStatementWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbStatementOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...abStatementDisplayIdFragments,
        ...abStatementFileDataFragments,
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

  // Resolvers specific to the AbStatement type
  AbStatement: {
    displayId: (parent) => `${parent?.originalName}`,
  },
  Mutation: {
    abStatementDelete: async (
      _parent: any,
      args: MutationAbStatementDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbStatementDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...abStatementDisplayIdFragments,
        ...abStatementFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteAbStatement(args, select); // Assuming method deleteAbStatement
    },
  },
};
