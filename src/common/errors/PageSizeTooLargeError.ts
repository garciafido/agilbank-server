import { GraphQLError } from "graphql";

export class PageSizeTooLargeError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("PAGINATION_SIZE_EXCEEDED", {
      extensions: {
        code: "PAGINATION_SIZE_EXCEEDED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
