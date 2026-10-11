import { merge } from "lodash";
import { GraphQLSchema } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { commonTypeDefs } from "../common/schemas";
import { fileUploadResolvers } from "../common/resolvers/fileUpload";
import { profileResolvers } from "../common/resolvers/profileResolvers";
import { maintenanceResolvers } from "../common/resolvers/maintenance";
import { botRunCancelResolvers } from "../common/resolvers/botRunCancel";
import { deletionBlockersResolvers } from "../common/resolvers/deletionBlockers";
import { customTypeDefs, customResolvers } from "../graphql/customSchema";

// Notifications
import {
  notificationsTypeDefs,
  notificationsResolvers,
} from "../services/notifications/graphql";
// Alerts (always included)
import { alertsTypeDefs, alertsResolvers } from "../alerts/graphql";
// Entities Type Defs
import { abStatementTypeDefs } from "./abStatement/schemas";
import { abConceptCorrectionTypeDefs } from "./abConceptCorrection/schemas";
import { userTypeDefs } from "./user/schemas";
import { roleTypeDefs } from "./role/schemas";
import { permissionTypeDefs } from "./permission/schemas";
import { tenantTypeDefs } from "./tenant/schemas";
import { workerEventTypeDefs } from "./workerEvent/schemas";
import { integrationClientTypeDefs } from "./integrationClient/schemas";
import { idempotencyRecordTypeDefs } from "./idempotencyRecord/schemas";
import { userNotificationTypeDefs } from "./userNotification/schemas";
import { userNotificationPreferenceTypeDefs } from "./userNotificationPreference/schemas";
import { emailVerificationTypeDefs } from "./emailVerification/schemas";
// Entities Resolvers
import { abStatementResolvers } from "./abStatement/resolvers/abStatementResolvers";
import { abConceptCorrectionResolvers } from "./abConceptCorrection/resolvers/abConceptCorrectionResolvers";
import { userResolvers } from "./user/resolvers/userResolvers";
import { roleResolvers } from "./role/resolvers/roleResolvers";
import { permissionResolvers } from "./permission/resolvers/permissionResolvers";
import { tenantResolvers } from "./tenant/resolvers/tenantResolvers";
import { workerEventResolvers } from "./workerEvent/resolvers/workerEventResolvers";
import { integrationClientResolvers } from "./integrationClient/resolvers/integrationClientResolvers";
import { idempotencyRecordResolvers } from "./idempotencyRecord/resolvers/idempotencyRecordResolvers";
import { userNotificationResolvers } from "./userNotification/resolvers/userNotificationResolvers";
import { userNotificationPreferenceResolvers } from "./userNotificationPreference/resolvers/userNotificationPreferenceResolvers";
import { emailVerificationResolvers } from "./emailVerification/resolvers/emailVerificationResolvers";
// Projections Type Defs

// Projections Resolvers

// Pipelines Type Defs

// Pipelines Resolvers

// Workflows Type Defs

// Workflows Resolvers

// DisplayIds
export * from "./abStatement/resolvers/displayId";
export * from "./abConceptCorrection/resolvers/displayId";
export * from "./user/resolvers/displayId";
export * from "./role/resolvers/displayId";
export * from "./permission/resolvers/displayId";
export * from "./tenant/resolvers/displayId";
export * from "./workerEvent/resolvers/displayId";
export * from "./integrationClient/resolvers/displayId";
export * from "./idempotencyRecord/resolvers/displayId";
export * from "./userNotification/resolvers/displayId";
export * from "./userNotificationPreference/resolvers/displayId";
export * from "./emailVerification/resolvers/displayId";

const resolvers = merge(
  fileUploadResolvers,
  profileResolvers,
  maintenanceResolvers,
  botRunCancelResolvers,
  deletionBlockersResolvers,

  notificationsResolvers,
  alertsResolvers,
  abStatementResolvers,
  abConceptCorrectionResolvers,
  userResolvers,
  roleResolvers,
  permissionResolvers,
  tenantResolvers,
  workerEventResolvers,
  integrationClientResolvers,
  idempotencyRecordResolvers,
  userNotificationResolvers,
  userNotificationPreferenceResolvers,
  emailVerificationResolvers,
  // Extensiones de schema del PROYECTO (graphql/customSchema.ts, punto de
  // extensión — servicios custom sin tocar este archivo generado).
  ...customResolvers
);

export const schema: GraphQLSchema = makeExecutableSchema({
  typeDefs: [
    commonTypeDefs,

    notificationsTypeDefs,
    alertsTypeDefs,
    abStatementTypeDefs,
    abConceptCorrectionTypeDefs,
    userTypeDefs,
    roleTypeDefs,
    permissionTypeDefs,
    tenantTypeDefs,
    workerEventTypeDefs,
    integrationClientTypeDefs,
    idempotencyRecordTypeDefs,
    userNotificationTypeDefs,
    userNotificationPreferenceTypeDefs,
    emailVerificationTypeDefs,
    ...customTypeDefs,
  ],
  resolvers,
});
