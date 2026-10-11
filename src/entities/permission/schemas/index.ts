import { readFileSync } from "fs";
import { join } from "path";

export const permissionTypeDefs = readFileSync(
  join(__dirname, "permission.graphql"),
  "utf-8"
);
