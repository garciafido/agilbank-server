import { readFileSync } from "fs";
import { join } from "path";

export const tenantTypeDefs = readFileSync(
  join(__dirname, "tenant.graphql"),
  "utf-8"
);
