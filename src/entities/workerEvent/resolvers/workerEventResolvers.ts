/* eslint-disable @typescript-eslint/no-unused-vars */
import { MyApolloContext } from "../../../server";
import { Prisma } from "../../../prisma/generated-client/client";
import {
  QueryResolvers,
  MutationResolvers,
  WorkerEventResolvers,
  MutationWorkerEventDeleteArgs,
  QueryWorkerEventOneArgs,
  QueryWorkerEventListWithOffsetArgs,
  QueryWorkerEventListWithCursorArgs,
} from "../../../graphql/types";
import { WorkerEventDeleteService } from "../services/workerEventDeleteService";
import { WorkerEventListWithCursorService } from "../services/workerEventListWithCursorService";
import { WorkerEventListWithOffsetService } from "../services/workerEventListWithOffsetService";
import { WorkerEventOneService } from "../services/workerEventOneService";
import { WorkerEventRetryService } from "../../../services/WorkerEventRetryService";
import {
  infoToSelect,
  infoToSelectFromField,
  nullToUndefinedRecursive,
} from "../../../common/utils";
import {
  workerEventDisplayId,
  workerEventDisplayIdFragments,
} from "./displayId";

export const workerEventResolvers: {
  Query: Pick<
    QueryResolvers,
    "workerEventOne" | "workerEventListWithOffset" | "workerEventListWithCursor"
  >;
  Mutation: Pick<
    MutationResolvers,
    "workerEventCreate" | "workerEventUpdate" | "workerEventDelete"
  >;
  WorkerEvent: WorkerEventResolvers;
} = {
  Query: {
    workerEventOne: async (
      _parent: any,
      args: QueryWorkerEventOneArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance from the request-scoped container
      const serviceInstance = context.container.resolve(WorkerEventOneService);
      // Prepare selection set from GraphQL query info
      const select = {
        ...workerEventDisplayIdFragments,
        ...infoToSelect(info),
      };
      // Delegate execution to the service method
      return serviceInstance.getOne(args, select); // Assuming method name 'getOne'
    },
    workerEventListWithOffset: async (
      _parent: any,
      args: QueryWorkerEventListWithOffsetArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        WorkerEventListWithOffsetService
      );
      // Prepare arguments for the service method
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.WorkerEventWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.WorkerEventOrderByWithRelationInput[];
      const select = {
        ...workerEventDisplayIdFragments,
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
        allTenants: (args as any).allTenants ?? undefined,
      });
    },
    workerEventListWithCursor: async (
      _parent: any,
      args: QueryWorkerEventListWithCursorArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      // Resolve the service instance
      const serviceInstance = context.container.resolve(
        WorkerEventListWithCursorService
      );
      // Prepare arguments
      const where = nullToUndefinedRecursive(
        args.where
      ) as Prisma.WorkerEventWhereInput;
      const orderBy = nullToUndefinedRecursive(
        args.orderBy
      ) as Prisma.WorkerEventOrderByWithRelationInput[]; // Ensure array type is correct
      const select = {
        ...workerEventDisplayIdFragments,
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
        allTenants: (args as any).allTenants ?? undefined,
      });
    },
    workerEventRetryInfo: async (
      _parent,
      args,
      context,
      _info
    ): Promise<any> => {
      const svc = context.container.resolve<WorkerEventRetryService>(
        "WorkerEventRetryService"
      );
      return svc.getRetryInfo(args.id);
    },
  },

  // Resolvers specific to the WorkerEvent type
  WorkerEvent: {
    displayId: (parent) =>
      `${parent?.queueName}-${parent?.jobType}-${parent?.enqueuedAt}`,
  },
  Mutation: {
    workerEventDelete: async (
      _parent: any,
      args: MutationWorkerEventDeleteArgs,
      context: MyApolloContext,
      info: any
    ): Promise<any> => {
      const serviceInstance = context.container.resolve(
        WorkerEventDeleteService
      );
      // Delete often returns the deleted object, so pass select/include
      const select = {
        ...workerEventDisplayIdFragments,
        ...infoToSelect(info),
      };
      return serviceInstance.deleteWorkerEvent(args, select); // Assuming method deleteWorkerEvent
    },
    workerEventRetry: async (_parent, args, context, _info): Promise<any> => {
      const svc = context.container.resolve<WorkerEventRetryService>(
        "WorkerEventRetryService"
      );
      return svc.retry(
        args.id,
        args.mode ?? undefined,
        args.overrides ?? undefined
      );
    },
  },
};
