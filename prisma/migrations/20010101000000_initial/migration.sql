-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgaudit";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgmq";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AbStatementStatus" AS ENUM ('queued', 'processing', 'read', 'failed');

-- CreateEnum
CREATE TYPE "AbCorrectionReview" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('es', 'en', 'pt');

-- CreateEnum
CREATE TYPE "TenantIvaCondition" AS ENUM ('registeredResponsible', 'monotax', 'exempt');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "IntegrationClientStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('in_progress', 'done', 'failed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('mention', 'assignment', 'comment', 'alert', 'system');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "EmailFrequency" AS ENUM ('immediate', 'daily_digest', 'weekly_digest');

-- CreateEnum
CREATE TYPE "EmailVerificationStatus" AS ENUM ('pending', 'verified', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "browser_name" TEXT,
    "browser_version" TEXT,
    "os_name" TEXT,
    "device_type" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "replaced_by" TEXT,
    "replaced_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "browser_name" TEXT,
    "browser_version" TEXT,
    "os_name" TEXT,
    "device_type" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_status" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "status" TEXT NOT NULL,
    "message" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "estimated_end" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_statement" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "file__server_data" JSONB NOT NULL,
    "file__data" JSONB NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_hash" TEXT,
    "status" "AbStatementStatus" NOT NULL DEFAULT 'queued',
    "verdict" TEXT,
    "bank_code" TEXT,
    "cbu" TEXT,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "opening_balance" DECIMAL(65,30),
    "closing_balance" DECIMAL(65,30),
    "line_count" INTEGER,
    "declared_account" JSONB,
    "reading" JSONB,
    "error" TEXT,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "ab_statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_concept_correction" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "bank_code" TEXT,
    "operation_code" TEXT,
    "bank_text" TEXT NOT NULL,
    "canonical_type" TEXT NOT NULL,
    "rate" DECIMAL(65,30),
    "review" "AbCorrectionReview" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "ab_concept_correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "tenant_display_name" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'es',
    "avatar" TEXT,
    "avatar__server_data" JSONB,
    "avatar__data" JSONB,
    "cellphone" TEXT,
    "two_fase_auth" BOOLEAN DEFAULT false,
    "two_fa_secret" TEXT,
    "two_fa_backup_codes" TEXT,
    "two_fa_verified_at" TIMESTAMP(3),
    "password_reset_token" TEXT,
    "password_reset_expires_at" TIMESTAMP(3),
    "profile" JSONB,
    "password" TEXT NOT NULL,
    "welcome_email_sent_at__" TIMESTAMP(3),
    "password_reset_email_sent_at__" TIMESTAMP(3),
    "last_email_error__" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_for_all_tenants" BOOLEAN NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "iva_condition" "TenantIvaCondition" NOT NULL DEFAULT 'registeredResponsible',
    "gross_receipts_jurisdiction" TEXT,
    "withholding_agent" BOOLEAN NOT NULL DEFAULT false,
    "imputation_min_confidence" INTEGER,
    "logo" TEXT,
    "logo__server_data" JSONB,
    "logo__data" JSONB,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_event" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enqueued_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" JSONB,
    "retry_count" INTEGER NOT NULL,
    "manual_retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "duration" INTEGER,
    "correlation_id" TEXT,
    "trigger_user_id__id" TEXT NOT NULL,

    CONSTRAINT "worker_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_client" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" "IntegrationClientStatus" NOT NULL DEFAULT 'active',
    "service_user__id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "integration_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'in_progress',
    "result" JSONB,
    "failure_reason" TEXT,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actor_user__id" TEXT,
    "object_type" TEXT,
    "object_id" TEXT,
    "action_url" TEXT,
    "read_at" TIMESTAMP(3),
    "notification_created_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "user_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preference" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_frequency" "EmailFrequency" NOT NULL DEFAULT 'daily_digest',

    CONSTRAINT "user_notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailVerificationStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3),
    "requested_by__id" TEXT NOT NULL,
    "source_entity" TEXT,
    "source_record_id" TEXT,
    "validation_changes" JSONB,
    "validation_submitted_at" TIMESTAMP(3),

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_User_roles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_User_roles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Role_permissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Role_permissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens" USING HASH ("token");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_token_hash_key" ON "trusted_devices"("token_hash");

-- CreateIndex
CREATE INDEX "trusted_devices_user_id_idx" ON "trusted_devices"("user_id");

-- CreateIndex
CREATE INDEX "trusted_devices_expires_at_idx" ON "trusted_devices"("expires_at");

-- CreateIndex
CREATE INDEX "ab_statement_tenant__id___created_at___idx" ON "ab_statement"("tenant__id__", "created_at__");

-- CreateIndex
CREATE UNIQUE INDEX "ab_statement_tenant__id___content_hash_key" ON "ab_statement"("tenant__id__", "content_hash");

-- CreateIndex
CREATE INDEX "ab_concept_correction_tenant__id___idx" ON "ab_concept_correction"("tenant__id__");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "role_tenant__id___idx" ON "role"("tenant__id__");

-- CreateIndex
CREATE UNIQUE INDEX "role_tenant__id___name_key" ON "role"("tenant__id__", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_name_key" ON "permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_name_key" ON "tenant"("name");

-- CreateIndex
CREATE INDEX "worker_event_trigger_user_id__id_enqueued_at_idx" ON "worker_event"("trigger_user_id__id", "enqueued_at");

-- CreateIndex
CREATE INDEX "worker_event_correlation_id_idx" ON "worker_event"("correlation_id");

-- CreateIndex
CREATE INDEX "worker_event_job_type_completed_at_idx" ON "worker_event"("job_type", "completed_at");

-- CreateIndex
CREATE INDEX "worker_event_queue_name_status_idx" ON "worker_event"("queue_name", "status");

-- CreateIndex
CREATE INDEX "worker_event_tenant__id___enqueued_at_idx" ON "worker_event"("tenant__id__", "enqueued_at");

-- CreateIndex
CREATE INDEX "integration_client_token_hash_idx" ON "integration_client"("token_hash");

-- CreateIndex
CREATE INDEX "integration_client_tenant__id___idx" ON "integration_client"("tenant__id__");

-- CreateIndex
CREATE INDEX "integration_client_service_user__id_idx" ON "integration_client"("service_user__id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_client_tenant__id___name_key" ON "integration_client"("tenant__id__", "name");

-- CreateIndex
CREATE INDEX "idempotency_record_status_idx" ON "idempotency_record"("status");

-- CreateIndex
CREATE INDEX "idempotency_record_tenant__id___created_at___idx" ON "idempotency_record"("tenant__id__", "created_at__");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_tenant__id___client_key_key" ON "idempotency_record"("tenant__id__", "client", "key");

-- CreateIndex
CREATE INDEX "user_notification_actor_user__id_idx" ON "user_notification"("actor_user__id");

-- CreateIndex
CREATE INDEX "user_notification_tenant__id___notification_created_at_idx" ON "user_notification"("tenant__id__", "notification_created_at");

-- CreateIndex
CREATE INDEX "user_notification_preference_tenant__id___notification_type_idx" ON "user_notification_preference"("tenant__id__", "notification_type");

-- CreateIndex
CREATE INDEX "email_verification_tenant__id___idx" ON "email_verification"("tenant__id__");

-- CreateIndex
CREATE INDEX "email_verification_requested_by__id_idx" ON "email_verification"("requested_by__id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tenant__id___email_key" ON "email_verification"("tenant__id__", "email");

-- CreateIndex
CREATE INDEX "_User_roles_B_index" ON "_User_roles"("B");

-- CreateIndex
CREATE INDEX "_Role_permissions_B_index" ON "_Role_permissions"("B");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_statement" ADD CONSTRAINT "ab_statement_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_statement" ADD CONSTRAINT "ab_statement_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_statement" ADD CONSTRAINT "ab_statement_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_concept_correction" ADD CONSTRAINT "ab_concept_correction_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_concept_correction" ADD CONSTRAINT "ab_concept_correction_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_concept_correction" ADD CONSTRAINT "ab_concept_correction_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_event" ADD CONSTRAINT "worker_event_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_event" ADD CONSTRAINT "worker_event_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_event" ADD CONSTRAINT "worker_event_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_event" ADD CONSTRAINT "worker_event_trigger_user_id__id_fkey" FOREIGN KEY ("trigger_user_id__id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_client" ADD CONSTRAINT "integration_client_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_client" ADD CONSTRAINT "integration_client_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_client" ADD CONSTRAINT "integration_client_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_client" ADD CONSTRAINT "integration_client_service_user__id_fkey" FOREIGN KEY ("service_user__id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_actor_user__id_fkey" FOREIGN KEY ("actor_user__id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preference" ADD CONSTRAINT "user_notification_preference_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preference" ADD CONSTRAINT "user_notification_preference_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preference" ADD CONSTRAINT "user_notification_preference_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_requested_by__id_fkey" FOREIGN KEY ("requested_by__id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_User_roles" ADD CONSTRAINT "_User_roles_A_fkey" FOREIGN KEY ("A") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_User_roles" ADD CONSTRAINT "_User_roles_B_fkey" FOREIGN KEY ("B") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Role_permissions" ADD CONSTRAINT "_Role_permissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Role_permissions" ADD CONSTRAINT "_Role_permissions_B_fkey" FOREIGN KEY ("B") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

