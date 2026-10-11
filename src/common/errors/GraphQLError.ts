export type GraphQLErrorType = {
  code?: string;
  message?: string;
  description?: string;
  langMessages?: Record<string, string>;
};

export class GraphQLError extends Error {
  code = "GraphQLError";
  customExtensions: GraphQLErrorType = {
    message: "Error",
    description: "",
    langMessages: {
      en: "Error",
      es: "Error",
      pt: "Erro",
    },
  };
}
