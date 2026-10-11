import { readFileSync } from "fs";
import { join } from "path";

export const workerEventTypeDefs = readFileSync(
  join(__dirname, "workerEvent.graphql"),
  "utf-8"
);
