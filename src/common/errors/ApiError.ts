import { GraphQLError } from "graphql";

export class ApiError extends GraphQLError {
  constructor(
    public message: string,
    public code: string,
    public customExtensions?: Record<string, any>
  ) {
    super(message, {
      extensions: { code, handled: true, ...customExtensions },
    });
  }
}
