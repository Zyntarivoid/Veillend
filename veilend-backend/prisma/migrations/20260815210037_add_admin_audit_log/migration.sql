-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('ADD_ADMIN', 'REMOVE_ADMIN', 'CONFIGURE_ASSET', 'SET_ORACLE_PRICE', 'SET_MIN_COLLATERAL_RATIO');

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorWallet" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "target" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorWallet_idx" ON "AdminAuditLog"("actorWallet");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
