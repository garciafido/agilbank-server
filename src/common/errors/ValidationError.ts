import { GraphQLError } from "graphql";

export interface ValidationErrorMeta {
  code?: string;
  field?: string;
  constraint?: string;
  actualValue?: any;
  expectedValue?: any;
  validationErrors?: Array<{
    field: string;
    constraint: string;
    actualValue?: any;
    expectedValue?: any;
    affectedIds?: string[];
  }>;
  suggestedAction?: string;
  [key: string]: any;
}

export class ValidationError extends GraphQLError {
  constructor(message: string, public meta?: ValidationErrorMeta) {
    super(message, {
      extensions: {
        code: meta?.code || "VALIDATION_ERROR",
        handled: true,
        meta,
      },
    });
  }
}
