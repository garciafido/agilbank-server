/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  TenantResolvers,
  MutationTenantCreateArgs,
  MutationTenantUpdateArgs,
  MutationTenantDeleteArgs,
  QueryTenantOneArgs,
  QueryTenantListWithOffsetArgs,
  QueryTenantListWithCursorArgs,
} from "../../../graphql/types";
import { TenantCreateService } from "../services/tenantCreateService";
import { TenantDeleteService } from "../services/tenantDeleteService";
import { TenantListWithCursorService } from "../services/tenantListWithCursorService";
import { TenantListWithOffsetService } from "../services/tenantListWithOffsetService";
import { TenantOneService } from "../services/tenantOneService";
import { TenantUpdateService } from "../services/tenantUpdateService";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import { tenantDisplayId, tenantDisplayIdFragments } from "./displayId";

const tenantFileDataFragments: Prisma.TenantSelect = {
  logo_data: true,
};

export const tenantResolvers: {
  Query: Pick<
    QueryResolvers,
    "tenantOne" | "tenantListWithOffset" | "tenantListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "tenantCreate" | "tenantUpdate" | "tenantDelete"
  >;
  Tenant: TenantResolvers;
} = {
  Query: {
    tenantOne: async (
      _parent: any,
      args: QueryTenantOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(TenantOneService);
      // Prepare selection set from GraphQL query info
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    tenantListWithOffset: async (
      _parent: any,
      args: QueryTenantListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        TenantListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.TenantWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.TenantOrderByWithRelationInput[];
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
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
    tenantListWithCursor: async (
      _parent: any,
      args: QueryTenantListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        TenantListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.TenantWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.TenantOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
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

  // Resolvers specific to the Tenant type
  Tenant: {
    displayId: (parent) => `${parent?.name}`,
  },
  Mutation: {
    tenantCreate: async (
      _parent: any,
      args: MutationTenantCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(TenantCreateService);
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createTenant(args, select);
    },

    tenantUpdate: async (
      _parent: any,
      args: MutationTenantUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(TenantUpdateService);
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateTenant(args, select);
    },

    tenantDelete: async (
      _parent: any,
      args: MutationTenantDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(TenantDeleteService);
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...tenantDisplayIdFragments,
        ...tenantFileDataFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteTenant(args, select); // Assuming method deleteTenant
    },
  },
};
