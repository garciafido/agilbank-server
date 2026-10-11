import { readFileSync } from "fs";
import { join } from "path";

export const abStatementTypeDefs = readFileSync(
  join(__dirname, "abStatement.graphql"),
  "utf-8"
);
