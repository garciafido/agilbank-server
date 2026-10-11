/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { PermissionCreateService } from "../services/permissionCreateService";
import { PermissionDeleteService } from "../services/permissionDeleteService";
import { PermissionListWithCursorService } from "../services/permissionListWithCursorService";
import { PermissionListWithOffsetService } from "../services/permissionListWithOffsetService";
import { PermissionOneService } from "../services/permissionOneService";
import { PermissionUpdateService } from "../services/permissionUpdateService";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  PermissionResolvers,
  MutationPermissionCreateArgs,
  MutationPermissionUpdateArgs,
  MutationPermissionDeleteArgs,
  QueryPermissionOneArgs,
  QueryPermissionListWithOffsetArgs,
  QueryPermissionListWithCursorArgs,
} from "../../../graphql/types";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import { permissionDisplayId, permissionDisplayIdFragments } from "./displayId";

export const permissionResolvers: {
  Query: Pick<
    QueryResolvers,
    "permissionOne" | "permissionListWithOffset" | "permissionListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "permissionCreate" | "permissionUpdate" | "permissionDelete"
  >;
  Permission: PermissionResolvers;
} = {
  Query: {
    permissionOne: async (
      _parent: any,
      args: QueryPermissionOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(PermissionOneService);
      // Prepare selection set from GraphQL query info
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    permissionListWithOffset: async (
      _parent: any,
      args: QueryPermissionListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        PermissionListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.PermissionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.PermissionOrderByWithRelationInput[];
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
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
    permissionListWithCursor: async (
      _parent: any,
      args: QueryPermissionListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        PermissionListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.PermissionWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.PermissionOrderByWithRelationInput[]; // Ensure array type is correct
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
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

  // Resolvers specific to the Permission type
  Permission: {
    displayId: (parent) => `${parent?.name}`,
  },
  Mutation: {
    permissionCreate: async (
      _parent: any,
      args: MutationPermissionCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        PermissionCreateService
      );
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.createPermission(args, select);
    },

    permissionUpdate: async (
      _parent: any,
      args: MutationPermissionUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        PermissionUpdateService
      );
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.updatePermission(args, select);
    },

    permissionDelete: async (
      _parent: any,
      args: MutationPermissionDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        PermissionDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = { ...permissionDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.deletePermission(args, select); // Assuming method deletePermission
    },
  },
};
