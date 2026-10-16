import { readFileSync } from "fs";
import { join } from "path";

export const abPaymentBatchTypeDefs = readFileSync(
  join(__dirname, "abPaymentBatch.graphql"),
  "utf-8"
);
