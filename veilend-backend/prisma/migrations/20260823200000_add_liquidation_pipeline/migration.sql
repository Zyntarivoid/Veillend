-- Liquidation pipeline: indexer read model + risk scanner state.

-- CreateEnum
CREATE TYPE "TransactionPartyRole" AS ENUM ('PRIMARY', 'BORROWER', 'LIQUIDATOR');

-- Widen the per-event uniqueness so the borrower and liquidator copies of a
-- single liquidation event can share txHash + eventIndex.
ALTER TABLE "TransactionHistory" DROP CONSTRAINT "TransactionHistory_txHash_eventIndex_key";
ALTER TABLE "TransactionHistory" ADD COLUMN "partyRole" "TransactionPartyRole" NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_txHash_eventIndex_partyRole_key" UNIQUE ("txHash", "eventIndex", "partyRole");

-- CreateTable
CREATE TABLE "LiquidationEvent" (
    "id" TEXT NOT NULL,
    "sorobanEventId" TEXT NOT NULL,
    "txHash" TEXT,
    "ledger" INTEGER NOT NULL,
    "liquidatorAddress" TEXT NOT NULL,
    "borrowerAddress" TEXT NOT NULL,
    "debtAssetId" TEXT NOT NULL,
    "collateralAssetId" TEXT NOT NULL,
    "repaidRaw" BIGINT NOT NULL,
    "seizedRaw" BIGINT NOT NULL,
    "bonusBps" INTEGER,
    "clipped" BOOLEAN NOT NULL DEFAULT false,
    "clippedByBps" INTEGER,
    "badDebt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRiskState" (
    "userId" TEXT NOT NULL,
    "healthFactor" DOUBLE PRECISION,
    "band" TEXT NOT NULL DEFAULT 'healthy',
    "riskStatus" TEXT NOT NULL DEFAULT 'priced',
    "distanceToLiquidation" DOUBLE PRECISION,
    "priceMoveToLiquidation" DOUBLE PRECISION,
    "debtValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collateralValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxRepayableUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estSeizableUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primaryDebtAssetId" TEXT,
    "primaryCollateralAssetId" TEXT,
    "oracleFreshness" JSONB,
    "lastEvaluatedBand" TEXT,
    "lastNotifiedBand" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRiskState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RiskScanState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastScanStartedAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "lastDurationMs" INTEGER,
    "usersEvaluated" INTEGER NOT NULL DEFAULT 0,
    "positionsEvaluated" INTEGER NOT NULL DEFAULT 0,
    "notificationsSent" INTEGER NOT NULL DEFAULT 0,
    "unpricedCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskScanState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiquidationEvent_borrowerAddress_createdAt_idx" ON "LiquidationEvent"("borrowerAddress" "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LiquidationEvent_liquidatorAddress_createdAt_idx" ON "LiquidationEvent"("liquidatorAddress" "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LiquidationEvent_ledger_idx" ON "LiquidationEvent"("ledger");

-- CreateIndex
CREATE INDEX "UserRiskState_band_estSeizableUsd_idx" ON "UserRiskState"("band", "estSeizableUsd" DESC);

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_debtAssetId_fkey" FOREIGN KEY ("debtAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidationEvent" ADD CONSTRAINT "LiquidationEvent_collateralAssetId_fkey" FOREIGN KEY ("collateralAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRiskState" ADD CONSTRAINT "UserRiskState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
