import { Prisma } from "../../../prisma/generated-client/client";
import { UserNotificationPreference } from "../../../graphql/types";

export const userNotificationPreferenceDisplayIdFragments: Prisma.UserNotificationPreferenceSelect =
  { notificationType: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const userNotificationPreferenceDisplayName = (
  instance: UserNotificationPreference
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.notificationType ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const userNotificationPreferenceDisplayId =
  userNotificationPreferenceDisplayName;
