/**
 * GraphQL del sistema de alertas: query `availableAlertTypes` que expone el catálogo
 * de tipos registrados (el registry ES la fuente de verdad de "qué está implementado").
 * Alimenta el dropdown del form de AlertRule en el cliente.
 */

import type { MyApolloContext } from "../../server";
import { UnauthorizedError } from "../../common/errors";
import { alertRegistry } from "../registry";

export const alertsTypeDefs = `
  type AlertParamSpecInfo {
    key: String!
    type: String!
    labelEs: String!
    labelEn: String!
    labelPt: String!
    required: Boolean!
    default: String
    min: Float
    max: Float
  }

  type AlertTypeInfo {
    id: String!
    labelEs: String!
    labelEn: String!
    labelPt: String!
    descriptionEs: String
    descriptionEn: String
    descriptionPt: String
    cadence: String!
    params: [AlertParamSpecInfo!]!
  }

  extend type Query {
    availableAlertTypes: [AlertTypeInfo!]!
  }
`;

export const alertsResolvers = {
  Query: {
    availableAlertTypes: async (_parent: any, _args: any, context: MyApolloContext) => {
      if (!context.currentUser?.id) {
        throw new UnauthorizedError("Usuario no autenticado.");
      }
      return alertRegistry.list().map((d) => ({
        id: d.id,
        labelEs: d.labels.es,
        labelEn: d.labels.en,
        labelPt: d.labels.pt,
        descriptionEs: d.description?.es ?? null,
        descriptionEn: d.description?.en ?? null,
        descriptionPt: d.description?.pt ?? null,
        cadence: d.cadence,
        params: d.params.map((p) => ({
          key: p.key,
          type: p.type,
          labelEs: p.label.es,
          labelEn: p.label.en,
          labelPt: p.label.pt,
          required: p.required ?? false,
          default: p.default !== undefined ? String(p.default) : null,
          min: p.min ?? null,
          max: p.max ?? null,
        })),
      }));
    },
  },
};
