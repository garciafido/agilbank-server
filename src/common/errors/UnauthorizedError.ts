import { GraphQLError } from "graphql";

export class UnauthorizedError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("AUTH_UNAUTHORIZED", {
      extensions: {
        code: "AUTH_UNAUTHORIZED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
