-- Generado por Haiku — índices GIN trigram (gin_trgm_ops) para búsqueda substring.
-- Cubren contains / ILIKE '%x%' (que el btree NO acelera) en columnas .searchable del
-- snapshot y en campos .listTextSearch de entidades vivas. Idempotente.
-- Incluir en la migración (junto al backfill de columnas .searchable) o aplicar con psql.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "user_name_trgm_idx" ON "user" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "role_name_trgm_idx" ON "role" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "permission_name_trgm_idx" ON "permission" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tenant_name_trgm_idx" ON "tenant" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "tenant_tax_id_trgm_idx" ON "tenant" USING gin ("tax_id" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "worker_event_queue_name_trgm_idx" ON "worker_event" USING gin ("queue_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "worker_event_job_type_trgm_idx" ON "worker_event" USING gin ("job_type" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "integration_client_name_trgm_idx" ON "integration_client" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idempotency_record_client_trgm_idx" ON "idempotency_record" USING gin ("client" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idempotency_record_key_trgm_idx" ON "idempotency_record" USING gin ("key" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_notification_title_trgm_idx" ON "user_notification" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "user_notification_body_trgm_idx" ON "user_notification" USING gin ("body" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "email_verification_email_trgm_idx" ON "email_verification" USING gin ("email" gin_trgm_ops);
