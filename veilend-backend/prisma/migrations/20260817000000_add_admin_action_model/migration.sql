-- Rename the AdminAction enum to AdminActionType in place. This keeps the
-- AdminAuditLog.action column (and its values + index) intact while freeing
-- the AdminAction name for the new intent-tracking model below.
ALTER TYPE "AdminAction" RENAME TO "AdminActionType";

-- CreateEnum
CREATE TYPE "AdminActionStatus" AS ENUM ('PENDING', 'SENT', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminAddress" TEXT NOT NULL,
    "action" "AdminActionType" NOT NULL,
    "payload" JSONB NOT NULL,
    "xdr" TEXT NOT NULL DEFAULT '',
    "status" "AdminActionStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "error" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAction_txHash_key" ON "AdminAction"("txHash");

-- CreateIndex
CREATE INDEX "AdminAction_adminAddress_idx" ON "AdminAction"("adminAddress");

-- CreateIndex
CREATE INDEX "AdminAction_action_idx" ON "AdminAction"("action");

-- CreateIndex
CREATE INDEX "AdminAction_status_idx" ON "AdminAction"("status");

-- CreateIndex
CREATE INDEX "AdminAction_txHash_idx" ON "AdminAction"("txHash");
