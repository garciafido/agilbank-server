import { readFileSync } from "fs";
import { join } from "path";

export const userNotificationTypeDefs = readFileSync(
  join(__dirname, "userNotification.graphql"),
  "utf-8"
);
