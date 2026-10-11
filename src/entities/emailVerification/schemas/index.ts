import { readFileSync } from "fs";
import { join } from "path";

export const emailVerificationTypeDefs = readFileSync(
  join(__dirname, "emailVerification.graphql"),
  "utf-8"
);
