import { readFileSync } from "fs";
import { join } from "path";

export const abConceptCorrectionTypeDefs = readFileSync(
  join(__dirname, "abConceptCorrection.graphql"),
  "utf-8"
);
