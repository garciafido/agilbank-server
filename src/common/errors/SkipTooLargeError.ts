import { GraphQLError } from "graphql";

export class SkipTooLargeError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("PAGINATION_OFFSET_EXCEEDED", {
      extensions: {
        code: "PAGINATION_OFFSET_EXCEEDED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
