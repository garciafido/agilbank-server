import { GraphQLError } from "graphql";

export interface NotFoundErrorMeta {
  code?: string;
  resourceType?: string;
  resourceId?: string;
  tenantId?: string;
  operation?: string;
  searchCriteria?: Record<string, any>;
  availableAlternatives?: number;
  hint?: string;
  [key: string]: any;
}

export class NotFoundError extends GraphQLError {
  constructor(message: string, public meta?: NotFoundErrorMeta) {
    super(message, {
      extensions: {
        code: meta?.code || "NOT_FOUND",
        handled: true,
        meta,
      },
    });
  }
}
