import { GraphQLError } from "graphql";

export interface UnknownErrorMeta {
  code?: string;
  operation?: string;
  stage?: string;
  originalError?: string;
  timestamp?: string;
  context?: Record<string, any>;
  [key: string]: any;
}

export class UnknownError extends GraphQLError {
  constructor(message: string, public meta?: UnknownErrorMeta) {
    super(message, {
      extensions: {
        code: meta?.code || "SYSTEM_UNKNOWN_ERROR",
        meta,
      },
    });
  }
}
