// Generado desde prisma/schema.prisma y el modelo del DSL: para cada entidad,
// las relaciones que impiden borrarla (RESTRICT o NO ACTION en la base), con el
// camino desde el registro que el usuario conoce (la raíz) hasta la fila que
// referencia. Lo usa common/services/deletionBlockers.ts. No editar: se rehace
// en cada regeneración.

export type DeletionBlockerRelation = {
  /** "reference": un campo del DSL. "audit": el creador o la empresa del registro. */
  kind: "reference" | "audit";
  /** Modelo y campo de Prisma de la fila que referencia. */
  model: string;
  field: string;
  /** El campo escalar de Prisma con el id referenciado. */
  fk: string;
  /** Nombre de la clave foránea en la base. */
  constraint: string;
  /** Campos de relación de Prisma desde la raíz hasta la fila que referencia. */
  path: string[];
  /** Por cada paso del camino: true si es una lista (some), false si es uno solo (is). */
  pathMany: boolean[];
  rootEntity: string;
  /** La raíz no tiene empresa. */
  rootGlobal: boolean;
};

/** El nombre visible de un registro: un texto, o uno por idioma. */
export type DeletionBlockerName = string | Record<string, string>;

export type DeletionBlockerRoot = {
  /** Orden de los nombres: los campos del nombre visible que son columnas, y el id. */
  orderBy: Array<Record<string, "asc">>;
  /** El nombre visible del server, cargado al usarlo (sin ciclos de imports). Null: sin nombres. */
  display:
    | (() => Promise<{
        select: object;
        name: (row: never) => DeletionBlockerName;
      }>)
    | null;
};

export const DELETION_BLOCKERS: Record<string, DeletionBlockerRelation[]> = {
  AbStatement: [],
  AbConceptCorrection: [],
  AbReconciliation: [],
  AbPaymentBatch: [],
  AbDecision: [],
  User: [
    {
      kind: "reference",
      model: "EmailVerification",
      field: "requestedBy",
      fk: "requestedBy_id",
      constraint: "email_verification_requested_by__id_fkey",
      path: [],
      pathMany: [],
      rootEntity: "EmailVerification",
      rootGlobal: false,
    },
    {
      kind: "reference",
      model: "IntegrationClient",
      field: "serviceUser",
      fk: "serviceUser_id",
      constraint: "integration_client_service_user__id_fkey",
      path: [],
      pathMany: [],
      rootEntity: "IntegrationClient",
      rootGlobal: false,
    },
    {
      kind: "reference",
      model: "WorkerEvent",
      field: "triggerUserId",
      fk: "triggerUserId_id",
      constraint: "worker_event_trigger_user_id__id_fkey",
      path: [],
      pathMany: [],
      rootEntity: "WorkerEvent",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbConceptCorrection",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "ab_concept_correction_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbConceptCorrection",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbDecision",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "ab_decision_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbDecision",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbPaymentBatch",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "ab_payment_batch_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbPaymentBatch",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbReconciliation",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "ab_reconciliation_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbReconciliation",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbStatement",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "ab_statement_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbStatement",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "EmailVerification",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "email_verification_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "EmailVerification",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "IdempotencyRecord",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "idempotency_record_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "IdempotencyRecord",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "IntegrationClient",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "integration_client_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "IntegrationClient",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "Permission",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "permission_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "Permission",
      rootGlobal: true,
    },
    {
      kind: "audit",
      model: "Role",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "role_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "Role",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "UserNotification",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "user_notification_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "UserNotification",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "UserNotificationPreference",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "user_notification_preference_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "UserNotificationPreference",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "WorkerEvent",
      field: "createdBy_",
      fk: "createdBy_id_",
      constraint: "worker_event_created_by__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "WorkerEvent",
      rootGlobal: false,
    },
  ],
  Role: [],
  Permission: [],
  Tenant: [
    {
      kind: "audit",
      model: "AbConceptCorrection",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "ab_concept_correction_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbConceptCorrection",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbDecision",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "ab_decision_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbDecision",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbPaymentBatch",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "ab_payment_batch_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbPaymentBatch",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbReconciliation",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "ab_reconciliation_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbReconciliation",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "AbStatement",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "ab_statement_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "AbStatement",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "EmailVerification",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "email_verification_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "EmailVerification",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "IdempotencyRecord",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "idempotency_record_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "IdempotencyRecord",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "IntegrationClient",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "integration_client_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "IntegrationClient",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "Role",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "role_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "Role",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "User",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "user_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "User",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "UserNotification",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "user_notification_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "UserNotification",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "UserNotificationPreference",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "user_notification_preference_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "UserNotificationPreference",
      rootGlobal: false,
    },
    {
      kind: "audit",
      model: "WorkerEvent",
      field: "tenant_",
      fk: "tenant_id_",
      constraint: "worker_event_tenant__id___fkey",
      path: [],
      pathMany: [],
      rootEntity: "WorkerEvent",
      rootGlobal: false,
    },
  ],
  WorkerEvent: [],
  IntegrationClient: [],
  IdempotencyRecord: [],
  UserNotification: [],
  UserNotificationPreference: [],
  EmailVerification: [],
};

/** Clave foránea → entidad referenciada y todas sus relaciones (una por camino a una raíz): para traducir un rechazo de la base. */
export const FK_CONSTRAINT_TO_RELATION: Record<
  string,
  { target: string; relations: DeletionBlockerRelation[] }
> = {
  email_verification_requested_by__id_fkey: {
    target: "User",
    relations: [
      {
        kind: "reference",
        model: "EmailVerification",
        field: "requestedBy",
        fk: "requestedBy_id",
        constraint: "email_verification_requested_by__id_fkey",
        path: [],
        pathMany: [],
        rootEntity: "EmailVerification",
        rootGlobal: false,
      },
    ],
  },
  integration_client_service_user__id_fkey: {
    target: "User",
    relations: [
      {
        kind: "reference",
        model: "IntegrationClient",
        field: "serviceUser",
        fk: "serviceUser_id",
        constraint: "integration_client_service_user__id_fkey",
        path: [],
        pathMany: [],
        rootEntity: "IntegrationClient",
        rootGlobal: false,
      },
    ],
  },
  worker_event_trigger_user_id__id_fkey: {
    target: "User",
    relations: [
      {
        kind: "reference",
        model: "WorkerEvent",
        field: "triggerUserId",
        fk: "triggerUserId_id",
        constraint: "worker_event_trigger_user_id__id_fkey",
        path: [],
        pathMany: [],
        rootEntity: "WorkerEvent",
        rootGlobal: false,
      },
    ],
  },
  ab_concept_correction_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "AbConceptCorrection",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "ab_concept_correction_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbConceptCorrection",
        rootGlobal: false,
      },
    ],
  },
  ab_decision_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "AbDecision",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "ab_decision_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbDecision",
        rootGlobal: false,
      },
    ],
  },
  ab_payment_batch_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "AbPaymentBatch",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "ab_payment_batch_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbPaymentBatch",
        rootGlobal: false,
      },
    ],
  },
  ab_reconciliation_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "AbReconciliation",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "ab_reconciliation_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbReconciliation",
        rootGlobal: false,
      },
    ],
  },
  ab_statement_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "AbStatement",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "ab_statement_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbStatement",
        rootGlobal: false,
      },
    ],
  },
  email_verification_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "EmailVerification",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "email_verification_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "EmailVerification",
        rootGlobal: false,
      },
    ],
  },
  idempotency_record_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "IdempotencyRecord",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "idempotency_record_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "IdempotencyRecord",
        rootGlobal: false,
      },
    ],
  },
  integration_client_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "IntegrationClient",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "integration_client_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "IntegrationClient",
        rootGlobal: false,
      },
    ],
  },
  permission_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "Permission",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "permission_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "Permission",
        rootGlobal: true,
      },
    ],
  },
  role_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "Role",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "role_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "Role",
        rootGlobal: false,
      },
    ],
  },
  user_notification_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "UserNotification",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "user_notification_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "UserNotification",
        rootGlobal: false,
      },
    ],
  },
  user_notification_preference_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "UserNotificationPreference",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "user_notification_preference_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "UserNotificationPreference",
        rootGlobal: false,
      },
    ],
  },
  worker_event_created_by__id___fkey: {
    target: "User",
    relations: [
      {
        kind: "audit",
        model: "WorkerEvent",
        field: "createdBy_",
        fk: "createdBy_id_",
        constraint: "worker_event_created_by__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "WorkerEvent",
        rootGlobal: false,
      },
    ],
  },
  ab_concept_correction_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "AbConceptCorrection",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "ab_concept_correction_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbConceptCorrection",
        rootGlobal: false,
      },
    ],
  },
  ab_decision_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "AbDecision",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "ab_decision_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbDecision",
        rootGlobal: false,
      },
    ],
  },
  ab_payment_batch_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "AbPaymentBatch",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "ab_payment_batch_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbPaymentBatch",
        rootGlobal: false,
      },
    ],
  },
  ab_reconciliation_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "AbReconciliation",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "ab_reconciliation_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbReconciliation",
        rootGlobal: false,
      },
    ],
  },
  ab_statement_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "AbStatement",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "ab_statement_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "AbStatement",
        rootGlobal: false,
      },
    ],
  },
  email_verification_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "EmailVerification",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "email_verification_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "EmailVerification",
        rootGlobal: false,
      },
    ],
  },
  idempotency_record_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "IdempotencyRecord",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "idempotency_record_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "IdempotencyRecord",
        rootGlobal: false,
      },
    ],
  },
  integration_client_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "IntegrationClient",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "integration_client_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "IntegrationClient",
        rootGlobal: false,
      },
    ],
  },
  role_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "Role",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "role_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "Role",
        rootGlobal: false,
      },
    ],
  },
  user_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "User",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "user_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "User",
        rootGlobal: false,
      },
    ],
  },
  user_notification_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "UserNotification",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "user_notification_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "UserNotification",
        rootGlobal: false,
      },
    ],
  },
  user_notification_preference_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "UserNotificationPreference",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "user_notification_preference_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "UserNotificationPreference",
        rootGlobal: false,
      },
    ],
  },
  worker_event_tenant__id___fkey: {
    target: "Tenant",
    relations: [
      {
        kind: "audit",
        model: "WorkerEvent",
        field: "tenant_",
        fk: "tenant_id_",
        constraint: "worker_event_tenant__id___fkey",
        path: [],
        pathMany: [],
        rootEntity: "WorkerEvent",
        rootGlobal: false,
      },
    ],
  },
};

export const DELETION_BLOCKER_ROOTS: Record<string, DeletionBlockerRoot> = {
  WorkerEvent: {
    orderBy: [
      { queueName: "asc" },
      { jobType: "asc" },
      { enqueuedAt: "asc" },
      { id: "asc" },
    ],
    display: async () => {
      const m = await import("../../entities/workerEvent/resolvers/displayId");
      return {
        select: m.workerEventDisplayIdFragments,
        name: m.workerEventDisplayName,
      };
    },
  },
  IntegrationClient: {
    orderBy: [{ name: "asc" }, { id: "asc" }],
    display: async () => {
      const m = await import(
        "../../entities/integrationClient/resolvers/displayId"
      );
      return {
        select: m.integrationClientDisplayIdFragments,
        name: m.integrationClientDisplayName,
      };
    },
  },
  EmailVerification: {
    orderBy: [{ email: "asc" }, { id: "asc" }],
    display: async () => {
      const m = await import(
        "../../entities/emailVerification/resolvers/displayId"
      );
      return {
        select: m.emailVerificationDisplayIdFragments,
        name: m.emailVerificationDisplayName,
      };
    },
  },
};

/**
 * Las entidades cuyo borrado exige también el permiso de lectura: su servicio de
 * borrado lee el registro antes de borrarlo (sus archivos). La consulta de los
 * motivos exige lo mismo que el borrado.
 */
export const DELETION_REQUIRES_RETRIEVE: string[] = [
  "AbStatement",
  "User",
  "Tenant",
];

/**
 * Las entidades por las que responde la consulta de los motivos: las que se
 * borran por su mutación <entidad>Delete. Por las demás responde "no encontrado"
 * (el borrado interno, assertNotInUse, usa toda la tabla).
 */
export const DELETION_QUERYABLE: string[] = [
  "AbStatement",
  "AbConceptCorrection",
  "AbReconciliation",
  "AbPaymentBatch",
  "AbDecision",
  "User",
  "Role",
  "Permission",
  "Tenant",
  "WorkerEvent",
  "IntegrationClient",
  "IdempotencyRecord",
  "UserNotification",
  "UserNotificationPreference",
  "EmailVerification",
];
