import { readFileSync } from "fs";
import { join } from "path";

export const userNotificationPreferenceTypeDefs = readFileSync(
  join(__dirname, "userNotificationPreference.graphql"),
  "utf-8"
);
