/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  UserNotificationResolvers,
  MutationUserNotificationDeleteArgs,
  QueryUserNotificationOneArgs,
  QueryUserNotificationListWithOffsetArgs,
  QueryUserNotificationListWithCursorArgs,
} from "../../../graphql/types";
import { UserNotificationDeleteService } from "../services/userNotificationDeleteService";
import { UserNotificationListWithCursorService } from "../services/userNotificationListWithCursorService";
import { UserNotificationListWithOffsetService } from "../services/userNotificationListWithOffsetService";
import { UserNotificationOneService } from "../services/userNotificationOneService";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import {
  userNotificationDisplayId,
  userNotificationDisplayIdFragments,
} from "./displayId";

export const userNotificationResolvers: {
  Query: Pick<
    QueryResolvers,
    | "userNotificationOne"
    | "userNotificationListWithOffset"
    | "userNotificationListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "userNotificationCreate"
    | "userNotificationUpdate"
    | "userNotificationDelete"
  >;
  UserNotification: UserNotificationResolvers;
} = {
  Query: {
    userNotificationOne: async (
      _parent: any,
      args: QueryUserNotificationOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        UserNotificationOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...userNotificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    userNotificationListWithOffset: async (
      _parent: any,
      args: QueryUserNotificationListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserNotificationListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserNotificationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserNotificationOrderByWithRelationInput[];
      const select = {
        ...userNotificationDisplayIdFragments,
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
    userNotificationListWithCursor: async (
      _parent: any,
      args: QueryUserNotificationListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserNotificationListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserNotificationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserNotificationOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...userNotificationDisplayIdFragments,
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

  // Resolvers specific to the UserNotification type
  UserNotification: {
    displayId: (parent) => `${parent?.title}`,
  },
  Mutation: {
    userNotificationDelete: async (
      _parent: any,
      args: MutationUserNotificationDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        UserNotificationDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...userNotificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteUserNotification(args, select); // Assuming method deleteUserNotification
    },
  },
};
