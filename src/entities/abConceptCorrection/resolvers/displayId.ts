import { Prisma } from "../../../prisma/generated-client/client";
import { AbConceptCorrection } from "../../../graphql/types";

export const abConceptCorrectionDisplayIdFragments: Prisma.AbConceptCorrectionSelect =
  { bankText: true };

/** El nombre visible: el mismo texto que arma el cliente. */
export const abConceptCorrectionDisplayName = (
  instance: AbConceptCorrection
): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.bankText ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const abConceptCorrectionDisplayId = abConceptCorrectionDisplayName;
