import { readFileSync } from "fs";
import { join } from "path";

export { abStatementReadResolver } from "./abStatementRead/abStatementReadResolver";
export { AbStatementReadPipelineService } from "./abStatementRead/abStatementReadService";

// Temporary stub for EditionGenerateFinalPipelineService
export class EditionGenerateFinalPipelineService {
  async execute(args: any, context: any): Promise<any> {
    console.warn("EditionGenerateFinalPipelineService is not implemented yet");
    return {
      result: "OK",
      message: "EditionGenerateFinal pipeline not implemented",
    };
  }
}

export const abStatementReadTypeDefs = readFileSync(
  join(__dirname, "./abStatementRead/abStatementRead.graphql"),
  "utf-8"
);
