/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  UserNotificationPreferenceResolvers,
  MutationUserNotificationPreferenceCreateArgs,
  MutationUserNotificationPreferenceUpdateArgs,
  MutationUserNotificationPreferenceDeleteArgs,
  QueryUserNotificationPreferenceOneArgs,
  QueryUserNotificationPreferenceListWithOffsetArgs,
  QueryUserNotificationPreferenceListWithCursorArgs,
} from "../../../graphql/types";
import { UserNotificationPreferenceCreateService } from "../services/userNotificationPreferenceCreateService";
import { UserNotificationPreferenceDeleteService } from "../services/userNotificationPreferenceDeleteService";
import { UserNotificationPreferenceListWithCursorService } from "../services/userNotificationPreferenceListWithCursorService";
import { UserNotificationPreferenceListWithOffsetService } from "../services/userNotificationPreferenceListWithOffsetService";
import { UserNotificationPreferenceOneService } from "../services/userNotificationPreferenceOneService";
import { UserNotificationPreferenceUpdateService } from "../services/userNotificationPreferenceUpdateService";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import {
  userNotificationPreferenceDisplayId,
  userNotificationPreferenceDisplayIdFragments,
} from "./displayId";

export const userNotificationPreferenceResolvers: {
  Query: Pick<
    QueryResolvers,
    | "userNotificationPreferenceOne"
    | "userNotificationPreferenceListWithOffset"
    | "userNotificationPreferenceListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "userNotificationPreferenceCreate"
    | "userNotificationPreferenceUpdate"
    | "userNotificationPreferenceDelete"
  >;
  UserNotificationPreference: UserNotificationPreferenceResolvers;
} = {
  Query: {
    userNotificationPreferenceOne: async (
      _parent: any,
      args: QueryUserNotificationPreferenceOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    userNotificationPreferenceListWithOffset: async (
      _parent: any,
      args: QueryUserNotificationPreferenceListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserNotificationPreferenceWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserNotificationPreferenceOrderByWithRelationInput[];
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
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
    userNotificationPreferenceListWithCursor: async (
      _parent: any,
      args: QueryUserNotificationPreferenceListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.UserNotificationPreferenceWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.UserNotificationPreferenceOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
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

  // Resolvers specific to the UserNotificationPreference type
  UserNotificationPreference: {
    displayId: (parent) => `${parent?.notificationType}`,
  },
  Mutation: {
    userNotificationPreferenceCreate: async (
      _parent: any,
      args: MutationUserNotificationPreferenceCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceCreateService
      );
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createUserNotificationPreference(args, select);
    },

    userNotificationPreferenceUpdate: async (
      _parent: any,
      args: MutationUserNotificationPreferenceUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceUpdateService
      );
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateUserNotificationPreference(args, select);
    },

    userNotificationPreferenceDelete: async (
      _parent: any,
      args: MutationUserNotificationPreferenceDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        UserNotificationPreferenceDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...userNotificationPreferenceDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteUserNotificationPreference(args, select); // Assuming method deleteUserNotificationPreference
    },
  },
};
