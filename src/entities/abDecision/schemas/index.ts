import { readFileSync } from "fs";
import { join } from "path";

export const abDecisionTypeDefs = readFileSync(
  join(__dirname, "abDecision.graphql"),
  "utf-8"
);
