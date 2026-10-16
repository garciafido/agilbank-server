-- AlterTable
ALTER TABLE "ab_reconciliation" ADD COLUMN     "bank_code" TEXT;

-- CreateTable
CREATE TABLE "ab_decision" (
    "id" TEXT NOT NULL,
    "version__" TEXT NOT NULL,
    "created_at__" TIMESTAMP(3) NOT NULL,
    "created_by__id__" TEXT NOT NULL,
    "last_updated_at__" TIMESTAMP(3),
    "last_updated_by__id__" TEXT,
    "tenant__id__" TEXT NOT NULL,
    "decision_key" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "bank_code" TEXT,
    "concept_key" TEXT NOT NULL,
    "canonical_type" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "proposed_kind" TEXT NOT NULL,
    "proposed_pair" JSONB,
    "chosen_kind" TEXT NOT NULL,
    "chosen_pair" JSONB,
    "chosen" JSONB NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ab_decision_tenant__id___decided_at_idx" ON "ab_decision"("tenant__id__", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "ab_decision_tenant__id___decision_key_key" ON "ab_decision"("tenant__id__", "decision_key");

-- AddForeignKey
ALTER TABLE "ab_decision" ADD CONSTRAINT "ab_decision_created_by__id___fkey" FOREIGN KEY ("created_by__id__") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_decision" ADD CONSTRAINT "ab_decision_last_updated_by__id___fkey" FOREIGN KEY ("last_updated_by__id__") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_decision" ADD CONSTRAINT "ab_decision_tenant__id___fkey" FOREIGN KEY ("tenant__id__") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
