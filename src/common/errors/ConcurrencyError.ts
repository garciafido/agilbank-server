import { GraphQLError } from "graphql";

export class ConcurrencyError extends GraphQLError {
  constructor(
    public customMessage?: string,
    public customExtensions?: Record<string, any>
  ) {
    super("RECORD_MODIFIED", {
      extensions: {
        code: "RECORD_MODIFIED",
        handled: true,
        ...customExtensions,
      },
    });
  }
}
