/*
  Warnings:

  - Added the required column `createdById` to the `Investment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `depositId` to the `Investment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roiPercent` to the `Investment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvestmentStatus" ADD VALUE 'FINANCE_VERIFIED';
ALTER TYPE "InvestmentStatus" ADD VALUE 'RETURNED';
ALTER TYPE "InvestmentStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "depositId" TEXT NOT NULL,
ADD COLUMN     "financeVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "financeVerifiedById" TEXT,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "roiPercent" DECIMAL(5,2) NOT NULL,
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "maturityDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "datePaid" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_reference_key" ON "Deposit"("reference");

-- CreateIndex
CREATE INDEX "Deposit_investorId_idx" ON "Deposit"("investorId");

-- CreateIndex
CREATE INDEX "Investment_depositId_idx" ON "Investment"("depositId");

-- CreateIndex
CREATE INDEX "Investment_status_idx" ON "Investment"("status");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_financeVerifiedById_fkey" FOREIGN KEY ("financeVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
