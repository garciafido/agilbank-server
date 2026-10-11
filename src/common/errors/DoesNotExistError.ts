import { GraphQLError } from "graphql";

export class DoesNotExistError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("RECORD_NOT_FOUND", {
      extensions: {
        code: "RECORD_NOT_FOUND",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
