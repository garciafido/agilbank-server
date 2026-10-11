import { Prisma } from "../../../prisma/generated-client/client";
import { UserNotification } from "../../../graphql/types";

export const userNotificationDisplayIdFragments: Prisma.UserNotificationSelect =
  { title: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const userNotificationDisplayName = (
  instance: UserNotification
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.title ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const userNotificationDisplayId = userNotificationDisplayName;
