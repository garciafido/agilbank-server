-- CreateTable
CREATE TABLE "ab_reconciliation" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "proposal_count" INTEGER NOT NULL,

    CONSTRAINT "ab_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_payment_batch" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "transfers" JSONB NOT NULL,
    "transfer_count" INTEGER NOT NULL,
    "failed_count" INTEGER NOT NULL,

    CONSTRAINT "ab_payment_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ab_reconciliation_tenant__id___created_at___idx" ON "ab_reconciliation"("tenant__id__", "created_at__");

-- CreateIndex
CREATE UNIQUE INDEX "ab_reconciliation_tenant__id___request_key_key" ON "ab_reconciliation"("tenant__id__", "request_key");

-- CreateIndex
CREATE INDEX "ab_payment_batch_tenant__id___created_at___idx" ON "ab_payment_batch"("tenant__id__", "created_at__");

-- CreateIndex
CREATE UNIQUE INDEX "ab_payment_batch_tenant__id___content_hash_key" ON "ab_payment_batch"("tenant__id__", "content_hash");

-- AddForeignKey
ALTER TABLE "ab_reconciliation" ADD CONSTRAINT "ab_reconciliation_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_reconciliation" ADD CONSTRAINT "ab_reconciliation_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_reconciliation" ADD CONSTRAINT "ab_reconciliation_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_payment_batch" ADD CONSTRAINT "ab_payment_batch_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_payment_batch" ADD CONSTRAINT "ab_payment_batch_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_payment_batch" ADD CONSTRAINT "ab_payment_batch_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
