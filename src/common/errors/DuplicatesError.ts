import { ApiError } from "./ApiError";

export class DuplicatesError extends ApiError {
  constructor(
    public message: string,
    public customExtensions?: Record<string, any>
  ) {
    super(message, "API_DUPLICATES", customExtensions);
  }
}
