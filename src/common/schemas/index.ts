import { readFileSync } from "fs";
import { join } from "path";

export const commonTypeDefs = readFileSync(
  join(__dirname, "common.graphql"),
  "utf-8"
);
