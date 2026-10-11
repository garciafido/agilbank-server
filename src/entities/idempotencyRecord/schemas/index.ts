import { readFileSync } from "fs";
import { join } from "path";

export const idempotencyRecordTypeDefs = readFileSync(
  join(__dirname, "idempotencyRecord.graphql"),
  "utf-8"
);
