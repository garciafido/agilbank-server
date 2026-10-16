import { Prisma } from "../../../prisma/generated-client/client";
import { AbDecision } from "../../../graphql/types";

export const abDecisionDisplayIdFragments: Prisma.AbDecisionSelect = {
  decisionKey: true,
};

/** El nombre visible: el mismo texto que arma el cliente. */
export const abDecisionDisplayName = (instance: AbDecision): string => {
  if (!instance) {
    return "∅";
  }
  return `${instance.decisionKey ?? "∅"}`;
};

/** El nombre como texto: el mismo que <entidad>DisplayName. */
export const abDecisionDisplayId = abDecisionDisplayName;
