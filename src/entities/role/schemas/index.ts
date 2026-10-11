import { readFileSync } from "fs";
import { join } from "path";

export const roleTypeDefs = readFileSync(
  join(__dirname, "role.graphql"),
  "utf-8"
);
