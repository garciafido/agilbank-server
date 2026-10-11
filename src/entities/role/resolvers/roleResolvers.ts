/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  RoleResolvers,
  MutationRoleCreateArgs,
  MutationRoleUpdateArgs,
  MutationRoleDeleteArgs,
  QueryRoleOneArgs,
  QueryRoleListWithOffsetArgs,
  QueryRoleListWithCursorArgs,
} from "../../../graphql/types";
import { RoleCreateService } from "../services/roleCreateService";
import { RoleDeleteService } from "../services/roleDeleteService";
import { RoleListWithCursorService } from "../services/roleListWithCursorService";
import { RoleListWithOffsetService } from "../services/roleListWithOffsetService";
import { RoleOneService } from "../services/roleOneService";
import { RoleUpdateService } from "../services/roleUpdateService";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import { roleDisplayId, roleDisplayIdFragments } from "./displayId";

export const roleResolvers: {
  Query: Pick<
    QueryResolvers,
    "roleOne" | "roleListWithOffset" | "roleListWithCursor"
  >;
  Mutation: Pick<MutationResolvers, "roleCreate" | "roleUpdate" | "roleDelete">;
  Role: RoleResolvers;
} = {
  Query: {
    roleOne: async (
      _parent: any,
      args: QueryRoleOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(RoleOneService);
      // Prepare selection set from GraphQL query info
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    roleListWithOffset: async (
      _parent: any,
      args: QueryRoleListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        RoleListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.RoleWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.RoleOrderByWithRelationInput[];
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
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
    roleListWithCursor: async (
      _parent: any,
      args: QueryRoleListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        RoleListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.RoleWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.RoleOrderByWithRelationInput[]; // Ensure array type is correct
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
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

  // Resolvers specific to the Role type
  Role: {
    displayId: (parent) => `${parent?.name}`,
  },
  Mutation: {
    roleCreate: async (
      _parent: any,
      args: MutationRoleCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(RoleCreateService);
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.createRole(args, select);
    },

    roleUpdate: async (
      _parent: any,
      args: MutationRoleUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(RoleUpdateService);
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.updateRole(args, select);
    },

    roleDelete: async (
      _parent: any,
      args: MutationRoleDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(RoleDeleteService);
      // Delete often returns the deleted object, so pass select/include
      const select = { ...roleDisplayIdFragments, ...infoToSelect(info) };
      return serviceInstance.deleteRole(args, select); // Assuming method deleteRole
    },
  },
};
