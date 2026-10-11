import { GraphQLError } from "graphql";

export class MustBeLoggedInError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("AUTH_CREDENTIALS_REQUIRED", {
      extensions: {
        code: "AUTH_CREDENTIALS_REQUIRED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
