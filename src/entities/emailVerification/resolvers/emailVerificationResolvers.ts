/* eslint-disable @typescript-eslint/no-unused-vars */
import { EmailVerificationCreateService } from "../services/emailVerificationCreateService";
import { EmailVerificationDeleteService } from "../services/emailVerificationDeleteService";
import { EmailVerificationListWithCursorService } from "../services/emailVerificationListWithCursorService";
import { EmailVerificationListWithOffsetService } from "../services/emailVerificationListWithOffsetService";
import { EmailVerificationOneService } from "../services/emailVerificationOneService";
import { EmailVerificationUpdateService } from "../services/emailVerificationUpdateService";
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  EmailVerificationResolvers,
  MutationEmailVerificationCreateArgs,
  MutationEmailVerificationUpdateArgs,
  MutationEmailVerificationDeleteArgs,
  QueryEmailVerificationOneArgs,
  QueryEmailVerificationListWithOffsetArgs,
  QueryEmailVerificationListWithCursorArgs,
} from "../../../graphql/types";
import {
  emailVerificationDisplayId,
  emailVerificationDisplayIdFragments,
} from "./displayId";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";

export const emailVerificationResolvers: {
  Query: Pick<
    QueryResolvers,
    | "emailVerificationOne"
    | "emailVerificationListWithOffset"
    | "emailVerificationListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    | "emailVerificationCreate"
    | "emailVerificationUpdate"
    | "emailVerificationDelete"
  >;
  EmailVerification: EmailVerificationResolvers;
} = {
  Query: {
    emailVerificationOne: async (
      _parent: any,
      args: QueryEmailVerificationOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(
        EmailVerificationOneService
      );
      // Prepare selection set from GraphQL query info
      const select = {
        ...emailVerificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    emailVerificationListWithOffset: async (
      _parent: any,
      args: QueryEmailVerificationListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        EmailVerificationListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.EmailVerificationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.EmailVerificationOrderByWithRelationInput[];
      const select = {
        ...emailVerificationDisplayIdFragments,
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
    emailVerificationListWithCursor: async (
      _parent: any,
      args: QueryEmailVerificationListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        EmailVerificationListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.EmailVerificationWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.EmailVerificationOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...emailVerificationDisplayIdFragments,
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

  // Resolvers specific to the EmailVerification type
  EmailVerification: {
    displayId: (parent) => `${parent?.email}`,
  },
  Mutation: {
    emailVerificationCreate: async (
      _parent: any,
      args: MutationEmailVerificationCreateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        EmailVerificationCreateService
      );
      const select = {
        ...emailVerificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.createEmailVerification(args, select);
    },

    emailVerificationUpdate: async (
      _parent: any,
      args: MutationEmailVerificationUpdateArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        EmailVerificationUpdateService
      );
      const select = {
        ...emailVerificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.updateEmailVerification(args, select);
    },

    emailVerificationDelete: async (
      _parent: any,
      args: MutationEmailVerificationDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        EmailVerificationDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...emailVerificationDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteEmailVerification(args, select); // Assuming method deleteEmailVerification
    },
  },
};
