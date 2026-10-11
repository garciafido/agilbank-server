/* eslint-disable @typescript-eslint/no-unused-vars */
import { IntegrationClientCreateService } from "../services/integrationClientCreateService";
import { IntegrationClientDeleteService } from "../services/integrationClientDeleteService";
import { IntegrationClientListWithCursorService } from "../services/integrationClientListWithCursorService";
import { IntegrationClientListWithOffsetService } from "../services/integrationClientListWithOffsetService";
import { IntegrationClientOneService } from "../services/integrationClientOneService";
import { IntegrationClientUpdateService } from "../services/integrationClientUpdateService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  IntegrationClientResolvers,
  MutationIntegrationClientCreateArgs,
  MutationIntegrationClientUpdateArgs,
  MutationIntegrationClientDeleteArgs,
  QueryIntegrationClientOneArgs,
  QueryIntegrationClientListWithOffsetArgs,
  QueryIntegrationClientListWithCursorArgs,
} from "../../../graphql/types";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import {
  integrationClientDisplayId,
  integrationClientDisplayIdFragments,
} from "./displayId";

export const integrationClientResolvers: {
  Query: Pick<
    QueryResolvers,
    | "integrationClientOne"
    | "integrationClientListWithOffset"
    | "integrationClientListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "integrationClientCreate"
    | "integrationClientUpdate"
    | "integrationClientDelete"
  >;
  IntegrationClient: IntegrationClientResolvers;
} = {
  Query: {
    integrationClientOne: async (
      _parent: any,
      args: QueryIntegrationClientOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        IntegrationClientOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...integrationClientDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    integrationClientListWithOffset: async (
      _parent: any,
      args: QueryIntegrationClientListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        IntegrationClientListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.IntegrationClientWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.IntegrationClientOrderByWithRelationInput[];
      const select = {
        ...integrationClientDisplayIdFragments,
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
    integrationClientListWithCursor: async (
      _parent: any,
      args: QueryIntegrationClientListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        IntegrationClientListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.IntegrationClientWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.IntegrationClientOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...integrationClientDisplayIdFragments,
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

  // Resolvers specific to the IntegrationClient type
  IntegrationClient: {
    displayId: (parent) => `${parent?.name}`,
  },
  Mutation: {
    integrationClientCreate: async (
      _parent: any,
      args: MutationIntegrationClientCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        IntegrationClientCreateService
      );
      const select = {
        ...integrationClientDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createIntegrationClient(args, select);
    },

    integrationClientUpdate: async (
      _parent: any,
      args: MutationIntegrationClientUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        IntegrationClientUpdateService
      );
      const select = {
        ...integrationClientDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateIntegrationClient(args, select);
    },

    integrationClientDelete: async (
      _parent: any,
      args: MutationIntegrationClientDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        IntegrationClientDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...integrationClientDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteIntegrationClient(args, select); // Assuming method deleteIntegrationClient
    },
  },
};
