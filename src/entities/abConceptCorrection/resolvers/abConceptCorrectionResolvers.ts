/* eslint-disable @typescript-eslint/no-unused-vars */
import { AbConceptCorrectionCreateService } from "../services/abConceptCorrectionCreateService";
import { AbConceptCorrectionDeleteService } from "../services/abConceptCorrectionDeleteService";
import { AbConceptCorrectionListWithCursorService } from "../services/abConceptCorrectionListWithCursorService";
import { AbConceptCorrectionListWithOffsetService } from "../services/abConceptCorrectionListWithOffsetService";
import { AbConceptCorrectionOneService } from "../services/abConceptCorrectionOneService";
import { AbConceptCorrectionUpdateService } from "../services/abConceptCorrectionUpdateService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  AbConceptCorrectionResolvers,
  MutationAbConceptCorrectionCreateArgs,
  MutationAbConceptCorrectionUpdateArgs,
  MutationAbConceptCorrectionDeleteArgs,
  QueryAbConceptCorrectionOneArgs,
  QueryAbConceptCorrectionListWithOffsetArgs,
  QueryAbConceptCorrectionListWithCursorArgs,
} from "../../../graphql/types";
import {
  abConceptCorrectionDisplayId,
  abConceptCorrectionDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const abConceptCorrectionResolvers: {
  Query: Pick<
    QueryResolvers,
    | "abConceptCorrectionOne"
    | "abConceptCorrectionListWithOffset"
    | "abConceptCorrectionListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "abConceptCorrectionCreate"
    | "abConceptCorrectionUpdate"
    | "abConceptCorrectionDelete"
  >;
  AbConceptCorrection: AbConceptCorrectionResolvers;
} = {
  Query: {
    abConceptCorrectionOne: async (
      _parent: any,
      args: QueryAbConceptCorrectionOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    abConceptCorrectionListWithOffset: async (
      _parent: any,
      args: QueryAbConceptCorrectionListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbConceptCorrectionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbConceptCorrectionOrderByWithRelationInput[];
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
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
    abConceptCorrectionListWithCursor: async (
      _parent: any,
      args: QueryAbConceptCorrectionListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.AbConceptCorrectionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.AbConceptCorrectionOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
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

  // Resolvers specific to the AbConceptCorrection type
  AbConceptCorrection: {
    displayId: (parent) => `${parent?.bankText}`,
  },
  Mutation: {
    abConceptCorrectionCreate: async (
      _parent: any,
      args: MutationAbConceptCorrectionCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionCreateService
      );
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createAbConceptCorrection(args, select);
    },

    abConceptCorrectionUpdate: async (
      _parent: any,
      args: MutationAbConceptCorrectionUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionUpdateService
      );
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateAbConceptCorrection(args, select);
    },

    abConceptCorrectionDelete: async (
      _parent: any,
      args: MutationAbConceptCorrectionDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        AbConceptCorrectionDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...abConceptCorrectionDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteAbConceptCorrection(args, select); // Assuming method deleteAbConceptCorrection
    },
  },
};
