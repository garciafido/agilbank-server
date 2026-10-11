import { readFileSync } from "fs";
import { join } from "path";

export const integrationClientTypeDefs = readFileSync(
  join(__dirname, "integrationClient.graphql"),
  "utf-8"
);
