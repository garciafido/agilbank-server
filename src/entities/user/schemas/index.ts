import { readFileSync } from "fs";
import { join } from "path";

export const userTypeDefs = readFileSync(
  join(__dirname, "user.graphql"),
  "utf-8"
);
