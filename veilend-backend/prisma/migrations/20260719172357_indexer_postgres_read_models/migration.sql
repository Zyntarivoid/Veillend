-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'BORROW', 'REPAY', 'LIQUIDATION');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletNonce" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WalletNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issuer" TEXT,
    "contractId" TEXT,
    "decimals" INTEGER NOT NULL DEFAULT 7,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "isNative" BOOLEAN NOT NULL DEFAULT false,
    "isSupported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "depositedRaw" BIGINT NOT NULL DEFAULT 0,
    "borrowedRaw" BIGINT NOT NULL DEFAULT 0,
    "accruedInterestRaw" BIGINT NOT NULL DEFAULT 0,
    "depositedUsd" DECIMAL(28,7) NOT NULL DEFAULT 0,
    "borrowedUsd" DECIMAL(28,7) NOT NULL DEFAULT 0,
    "collateralFactor" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "liquidationThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "healthFactor" DECIMAL(10,4),
    "privacyMode" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncLedger" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "isStale" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountRaw" BIGINT NOT NULL,
    "amountUsd" DECIMAL(28,7) NOT NULL,
    "txHash" TEXT,
    "ledgerSequence" INTEGER,
    "operationId" TEXT,
    "contractId" TEXT,
    "sorobanEventId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCheckpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastLedger" INTEGER NOT NULL DEFAULT 0,
    "lastLedgerAt" TIMESTAMP(3),
    "eventCursor" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCheckpoint" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "lastIndexedLedger" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_contractId_key" ON "Asset"("contractId");

-- CreateIndex
CREATE INDEX "Asset_contractId_idx" ON "Asset"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_issuer_key" ON "Asset"("code", "issuer");

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE INDEX "Position_assetId_idx" ON "Position"("assetId");

-- CreateIndex
CREATE INDEX "Position_lastSyncAt_idx" ON "Position"("lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "Position_userId_assetId_key" ON "Position"("userId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionHistory_txHash_key" ON "TransactionHistory"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionHistory_sorobanEventId_key" ON "TransactionHistory"("sorobanEventId");

-- CreateIndex
CREATE INDEX "TransactionHistory_userId_createdAt_idx" ON "TransactionHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TransactionHistory_assetId_idx" ON "TransactionHistory"("assetId");

-- CreateIndex
CREATE INDEX "TransactionHistory_txHash_idx" ON "TransactionHistory"("txHash");

-- CreateIndex
CREATE INDEX "TransactionHistory_ledgerSequence_idx" ON "TransactionHistory"("ledgerSequence");

-- CreateIndex
CREATE INDEX "TransactionHistory_sorobanEventId_idx" ON "TransactionHistory"("sorobanEventId");

-- CreateIndex
CREATE INDEX "SyncCheckpoint_userId_idx" ON "SyncCheckpoint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCheckpoint_userId_key" ON "SyncCheckpoint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_walletAddress_key" ON "Admin"("walletAddress");

-- CreateIndex
CREATE INDEX "Admin_walletAddress_idx" ON "Admin"("walletAddress");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCheckpoint" ADD CONSTRAINT "SyncCheckpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
