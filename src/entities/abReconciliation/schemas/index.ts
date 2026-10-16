import { readFileSync } from "fs";
import { join } from "path";

export const abReconciliationTypeDefs = readFileSync(
  join(__dirname, "abReconciliation.graphql"),
  "utf-8"
);
