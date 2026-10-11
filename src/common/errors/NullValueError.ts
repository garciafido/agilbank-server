import { GraphQLError } from "graphql";

export class NullValueError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("VALIDATION_REQUIRED", {
      extensions: {
        code: "VALIDATION_REQUIRED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
