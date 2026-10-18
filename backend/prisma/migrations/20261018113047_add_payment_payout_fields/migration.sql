/*
  Warnings:

  - A unique constraint covering the columns `[bankReference]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bankAccountSnapshot` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "bankAccountSnapshot" TEXT NOT NULL,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bankReference_key" ON "Payment"("bankReference");

-- CreateIndex
CREATE INDEX "Payment_investmentId_idx" ON "Payment"("investmentId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- an investment can have only one live Payment
CREATE UNIQUE INDEX "Payment_one_live_per_investment"
ON "Payment" ("investmentId")
WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED', 'PROCESSED');

-- the audit log can only be added to, never changed or deleted
CREATE FUNCTION "audit_log_block_changes"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog rows cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_no_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_block_changes"();

CREATE TRIGGER "audit_log_no_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_block_changes"();
