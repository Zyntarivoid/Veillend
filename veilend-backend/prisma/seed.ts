/**
 * VeilLend Seed Script
 *
 * Seeds representative demo data for local development and contributor testing
 * of dashboard and history endpoints. All data matches the Stellar-backed
 * Prisma schema (PostgreSQL read-models populated by the Soroban indexer).
 *
 * Usage:
 *   npx prisma db seed          # via Prisma CLI (preferred)
 *   npm run seed                # convenience wrapper
 */

import {
  PrismaClient,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── Stellar testnet-style addresses ────────────────────────────────────────

const WALLETS = {
  alice: 'GALZ4WOY2BSOQWXK6FNMNBI45NPU3O3YZQ5TVXHP7FJRJYDZQY2HXLM7',
  bob: 'GBR3RS2T2UQBFN5VIT4H6KRGZMOC42YUV3Q5YUQ7KZNV5RQVZJ222222',
  carol: 'GC7Z3FBHEFUXDZ3K3Q4WZQ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5',
} as const;

const ADMIN_WALLET =
  'GADMIN7K3FBHEFUXDZ3K3Q4WZQ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5ZADMIN';

// Soroban contract IDs (testnet-style, 56-char hex)
const CONTRACTS = {
  usdc: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  eth: 'CBVNIQ5Q4NKNBE7Q2HBTAFOSG4VXKQ3F5IV7DXWJYYKZQY2HHGCYSC01',
  btc: 'CAC3Z3FY2D3MOQ5J5HP6LUIY3Q4WZQ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5BTC',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

function fakeTxHash(seed: number): string {
  const hex = seed.toString(16).padStart(4, '0');
  return `${hex}A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4`;
}

function fakeSorobanEventId(seed: number): string {
  return `${seed}-event-veilend-demo`;
}

// ─── Seed ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding VeilLend demo data...\n');

  // Clean existing demo data (order matters due to FK constraints)
  console.log('  Cleaning existing seed data...');
  await prisma.session.deleteMany();
  await prisma.walletNonce.deleteMany();
  await prisma.transactionHistory.deleteMany();
  await prisma.position.deleteMany();
  await prisma.syncCheckpoint.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.user.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.indexerCheckpoint.deleteMany();

  // ── Admin ───────────────────────────────────────────────────────────────
  console.log('  Creating admin...');
  await prisma.admin.create({
    data: { walletAddress: ADMIN_WALLET },
  });

  // ── Users ───────────────────────────────────────────────────────────────
  console.log('  Creating demo users...');
  const [alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: { walletAddress: WALLETS.alice },
    }),
    prisma.user.create({
      data: { walletAddress: WALLETS.bob },
    }),
    prisma.user.create({
      data: { walletAddress: WALLETS.carol },
    }),
  ]);

  // ── Assets ──────────────────────────────────────────────────────────────
  console.log('  Creating Stellar assets...');
  const [xlm, usdc, eth, btc] = await Promise.all([
    prisma.asset.create({
      data: {
        code: 'XLM',
        issuer: null,
        contractId: null,
        decimals: 7,
        symbol: 'XLM',
        name: 'Stellar Lumens',
        logoUrl: 'https://assets.stellar.network/xlm.png',
        isNative: true,
        isSupported: true,
      },
    }),
    prisma.asset.create({
      data: {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        contractId: CONTRACTS.usdc,
        decimals: 7,
        symbol: 'USDC',
        name: 'USD Coin (Soroban)',
        logoUrl: 'https://assets.stellar.network/usdc.png',
        isNative: false,
        isSupported: true,
      },
    }),
    prisma.asset.create({
      data: {
        code: 'ETH',
        issuer: 'GBETH2FMX5DHWQOGQT7PKPBE5BZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z',
        contractId: CONTRACTS.eth,
        decimals: 7,
        symbol: 'ETH',
        name: 'Ethereum (Soroban Wrapped)',
        logoUrl: 'https://assets.stellar.network/eth.png',
        isNative: false,
        isSupported: true,
      },
    }),
    prisma.asset.create({
      data: {
        code: 'BTC',
        issuer: 'GBBTC2FMX5DHWQOGQT7PKPBE5BZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z',
        contractId: CONTRACTS.btc,
        decimals: 7,
        symbol: 'BTC',
        name: 'Bitcoin (Soroban Wrapped)',
        logoUrl: 'https://assets.stellar.network/btc.png',
        isNative: false,
        isSupported: false, // not yet configured by indexer
      },
    }),
  ]);

  // ── Positions ───────────────────────────────────────────────────────────
  console.log('  Creating positions...');

  // Alice: healthy lender – USDC deposit, no debt
  await prisma.position.create({
    data: {
      userId: alice.id,
      assetId: usdc.id,
      depositedRaw: BigInt('50000000000'), // 5,000 USDC (7 decimals)
      borrowedRaw: BigInt(0),
      accruedInterestRaw: BigInt('1234567'), // ~0.12 USDC accrued
      depositedUsd: 5000.0,
      borrowedUsd: 0,
      collateralFactor: 0.75,
      liquidationThreshold: 0.8,
      healthFactor: null,
      privacyMode: false,
      lastSyncLedger: 150000,
      lastSyncAt: hoursAgo(2),
      isStale: false,
    },
  });

  // Alice: XLM collateral position
  await prisma.position.create({
    data: {
      userId: alice.id,
      assetId: xlm.id,
      depositedRaw: BigInt('100000000000'), // 10,000 XLM
      borrowedRaw: BigInt(0),
      accruedInterestRaw: BigInt(0),
      depositedUsd: 2500.0,
      borrowedUsd: 0,
      collateralFactor: 0.6,
      liquidationThreshold: 0.7,
      healthFactor: null,
      privacyMode: false,
      lastSyncLedger: 150000,
      lastSyncAt: hoursAgo(2),
      isStale: false,
    },
  });

  // Bob: borrower – USDC collateral, ETH borrowed
  await prisma.position.create({
    data: {
      userId: bob.id,
      assetId: usdc.id,
      depositedRaw: BigInt('100000000000'), // 10,000 USDC collateral
      borrowedRaw: BigInt(0),
      accruedInterestRaw: BigInt(0),
      depositedUsd: 10000.0,
      borrowedUsd: 0,
      collateralFactor: 0.75,
      liquidationThreshold: 0.8,
      healthFactor: null,
      privacyMode: false,
      lastSyncLedger: 149500,
      lastSyncAt: hoursAgo(5),
      isStale: false,
    },
  });

  await prisma.position.create({
    data: {
      userId: bob.id,
      assetId: eth.id,
      depositedRaw: BigInt(0),
      borrowedRaw: BigInt('250000000'), // 2.5 ETH borrowed
      accruedInterestRaw: BigInt('500000'), // small accrued interest
      depositedUsd: 0,
      borrowedUsd: 7500.0,
      collateralFactor: 0.7,
      liquidationThreshold: 0.78,
      healthFactor: 1.3333, // healthy but leveraged
      privacyMode: false,
      lastSyncLedger: 149500,
      lastSyncAt: hoursAgo(5),
      isStale: false,
    },
  });

  // Carol: privacy-mode user with stale data
  await prisma.position.create({
    data: {
      userId: carol.id,
      assetId: xlm.id,
      depositedRaw: BigInt('500000000000'), // 50,000 XLM
      borrowedRaw: BigInt('10000000000'), // 1,000 XLM borrowed
      accruedInterestRaw: BigInt('50000'),
      depositedUsd: 12500.0,
      borrowedUsd: 250.0,
      collateralFactor: 0.6,
      liquidationThreshold: 0.7,
      healthFactor: 50.0, // very safe
      privacyMode: true,
      lastSyncLedger: 100000,
      lastSyncAt: daysAgo(14),
      isStale: true,
    },
  });

  // ── Transaction History ─────────────────────────────────────────────────
  console.log('  Creating transaction history...');

  const txns = [
    // Alice deposits USDC
    {
      userId: alice.id,
      assetId: usdc.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('50000000000'),
      amountUsd: 5000.0,
      txHash: fakeTxHash(1),
      ledgerSequence: 148000,
      operationId: '148000-1',
      contractId: CONTRACTS.usdc,
      sorobanEventId: fakeSorobanEventId(1),
      memo: 'Initial USDC deposit',
      createdAt: daysAgo(7),
      confirmedAt: daysAgo(7),
    },
    // Alice deposits XLM
    {
      userId: alice.id,
      assetId: xlm.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('100000000000'),
      amountUsd: 2500.0,
      txHash: fakeTxHash(2),
      ledgerSequence: 148100,
      operationId: '148100-1',
      contractId: null,
      sorobanEventId: fakeSorobanEventId(2),
      memo: 'XLM collateral deposit',
      createdAt: daysAgo(6),
      confirmedAt: daysAgo(6),
    },
    // Bob deposits USDC
    {
      userId: bob.id,
      assetId: usdc.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('100000000000'),
      amountUsd: 10000.0,
      txHash: fakeTxHash(3),
      ledgerSequence: 148200,
      operationId: '148200-1',
      contractId: CONTRACTS.usdc,
      sorobanEventId: fakeSorobanEventId(3),
      memo: null,
      createdAt: daysAgo(5),
      confirmedAt: daysAgo(5),
    },
    // Bob borrows ETH
    {
      userId: bob.id,
      assetId: eth.id,
      type: TransactionType.BORROW,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('250000000'),
      amountUsd: 7500.0,
      txHash: fakeTxHash(4),
      ledgerSequence: 148300,
      operationId: '148300-1',
      contractId: CONTRACTS.eth,
      sorobanEventId: fakeSorobanEventId(4),
      memo: 'Borrow ETH against USDC collateral',
      createdAt: daysAgo(5),
      confirmedAt: daysAgo(5),
    },
    // Carol deposits XLM
    {
      userId: carol.id,
      assetId: xlm.id,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('500000000000'),
      amountUsd: 12500.0,
      txHash: fakeTxHash(5),
      ledgerSequence: 100000,
      operationId: '100000-1',
      contractId: null,
      sorobanEventId: fakeSorobanEventId(5),
      memo: null,
      createdAt: daysAgo(30),
      confirmedAt: daysAgo(30),
    },
    // Carol borrows XLM
    {
      userId: carol.id,
      assetId: xlm.id,
      type: TransactionType.BORROW,
      status: TransactionStatus.CONFIRMED,
      amountRaw: BigInt('10000000000'),
      amountUsd: 250.0,
      txHash: fakeTxHash(6),
      ledgerSequence: 100100,
      operationId: '100100-1',
      contractId: null,
      sorobanEventId: fakeSorobanEventId(6),
      memo: null,
      createdAt: daysAgo(28),
      confirmedAt: daysAgo(28),
    },
    // Alice repays a small amount (pending – not yet confirmed on-chain)
    {
      userId: alice.id,
      assetId: usdc.id,
      type: TransactionType.REPAY,
      status: TransactionStatus.PENDING,
      amountRaw: BigInt('500000000'),
      amountUsd: 50.0,
      txHash: fakeTxHash(7),
      ledgerSequence: null,
      operationId: null,
      contractId: CONTRACTS.usdc,
      sorobanEventId: null,
      memo: 'Partial repay – awaiting confirmation',
      createdAt: hoursAgo(1),
      confirmedAt: null,
    },
    // Bob's failed withdraw attempt
    {
      userId: bob.id,
      assetId: usdc.id,
      type: TransactionType.WITHDRAW,
      status: TransactionStatus.FAILED,
      amountRaw: BigInt('200000000000'),
      amountUsd: 20000.0,
      txHash: fakeTxHash(8),
      ledgerSequence: 149000,
      operationId: '149000-1',
      contractId: CONTRACTS.usdc,
      sorobanEventId: fakeSorobanEventId(8),
      memo: 'Exceeds available balance – reverted',
      createdAt: daysAgo(3),
      confirmedAt: null,
    },
  ];

  for (const tx of txns) {
    await prisma.transactionHistory.create({ data: tx });
  }

  // ── Sync Checkpoints ────────────────────────────────────────────────────
  console.log('  Creating sync checkpoints...');
  await Promise.all([
    prisma.syncCheckpoint.create({
      data: {
        userId: alice.id,
        lastLedger: 150000,
        lastLedgerAt: hoursAgo(2),
        eventCursor: '150000-cursor-alice',
        syncStatus: 'idle',
      },
    }),
    prisma.syncCheckpoint.create({
      data: {
        userId: bob.id,
        lastLedger: 149500,
        lastLedgerAt: hoursAgo(5),
        eventCursor: '149500-cursor-bob',
        syncStatus: 'idle',
      },
    }),
    prisma.syncCheckpoint.create({
      data: {
        userId: carol.id,
        lastLedger: 100000,
        lastLedgerAt: daysAgo(14),
        eventCursor: '100000-cursor-carol',
        syncStatus: 'error',
        lastError: 'Stellar RPC timeout – will retry',
      },
    }),
  ]);

  // ── Wallet Nonces ─────────────────────────────────────────────────────
  console.log('  Creating wallet nonces...');
  await Promise.all([
    prisma.walletNonce.create({
      data: {
        walletAddress: WALLETS.alice,
        nonce: 'nonce-alice-001',
        expiresAt: hoursAgo(-1), // expires in 1 hour (unused)
        used: false,
      },
    }),
    prisma.walletNonce.create({
      data: {
        walletAddress: WALLETS.bob,
        nonce: 'nonce-bob-001',
        expiresAt: hoursAgo(2),
        used: true,
      },
    }),
  ]);

  // ── Sessions ──────────────────────────────────────────────────────────
  console.log('  Creating sessions...');
  await Promise.all([
    prisma.session.create({
      data: {
        userId: alice.id,
        token: 'session-token-alice-active',
        expiresAt: hoursAgo(-12), // expires in 12 hours
        lastSeenAt: hoursAgo(1),
      },
    }),
    prisma.session.create({
      data: {
        userId: bob.id,
        token: 'session-token-bob-active',
        expiresAt: hoursAgo(-6),
        lastSeenAt: hoursAgo(3),
      },
    }),
    prisma.session.create({
      data: {
        userId: carol.id,
        token: 'session-token-carol-expired',
        expiresAt: daysAgo(1), // already expired
        lastSeenAt: daysAgo(2),
      },
    }),
  ]);

  // ── Indexer Checkpoint ──────────────────────────────────────────────────
  console.log('  Creating indexer checkpoint...');
  await prisma.indexerCheckpoint.create({
    data: {
      id: 'global',
      lastIndexedLedger: 150000,
    },
  });

  console.log('\n✅ Seed complete!\n');
  console.log('  Users:');
  console.log(`    Alice (lender):      ${WALLETS.alice}`);
  console.log(`    Bob (borrower):      ${WALLETS.bob}`);
  console.log(`    Carol (privacy):     ${WALLETS.carol}`);
  console.log(`  Admin:                 ${ADMIN_WALLET}`);
  console.log('\n  Assets: XLM, USDC, ETH, BTC');
  console.log('  Positions: 5 (across 3 users)');
  console.log('  Transactions: 8 (confirmed, pending, failed)');
  console.log('  Wallet Nonces: 2 (1 unused, 1 used)');
  console.log('  Sessions: 3 (2 active, 1 expired)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
