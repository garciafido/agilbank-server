import { Prisma } from "../../../prisma/generated-client/client";
import { EmailVerification } from "../../../graphql/types";

export const emailVerificationDisplayIdFragments: Prisma.EmailVerificationSelect =
  { email: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const emailVerificationDisplayName = (
  instance: EmailVerification
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.email ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const emailVerificationDisplayId = emailVerificationDisplayName;
