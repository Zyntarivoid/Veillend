import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface SeedTransaction {
  id: string;
  userAddress: string;
  type: 'deposit' | 'borrow' | 'repay' | 'withdraw';
  assetAddress: string;
  amount: string;
  ledger: number;
  txHash: string;
  timestamp: string;
}

export interface SeedPosition {
  userAddress: string;
  assetAddress: string;
  deposited: string;
  borrowed: string;
  updatedAt: string;
}

export interface SeedAsset {
  assetAddress: string;
  supported: boolean;
  updatedAt: string;
}

export interface SeedSchema {
  checkpoint: {
    lastIndexedLedger: number;
  };
  transactions: SeedTransaction[];
  positions: SeedPosition[];
  assets: SeedAsset[];
}

const DEMO_USER_ADDRESS =
  'GDEMO7VEILENDLOCALTESTUSER000000000000000000000000000000000';
const XLM_ASSET_ADDRESS = 'native:XLM';
const USDC_ASSET_ADDRESS = 'credit:USDC:testnet';
const SEEDED_AT = '2026-06-01T12:00:00.000Z';

export function createLocalSeedData(): SeedSchema {
  return {
    checkpoint: {
      lastIndexedLedger: 2_500,
    },
    assets: [
      {
        assetAddress: XLM_ASSET_ADDRESS,
        supported: true,
        updatedAt: SEEDED_AT,
      },
      {
        assetAddress: USDC_ASSET_ADDRESS,
        supported: true,
        updatedAt: SEEDED_AT,
      },
    ],
    positions: [
      {
        userAddress: DEMO_USER_ADDRESS,
        assetAddress: XLM_ASSET_ADDRESS,
        deposited: '75000000000',
        borrowed: '25000000000',
        updatedAt: SEEDED_AT,
      },
      {
        userAddress: DEMO_USER_ADDRESS,
        assetAddress: USDC_ASSET_ADDRESS,
        deposited: '5000000000',
        borrowed: '1000000000',
        updatedAt: SEEDED_AT,
      },
    ],
    transactions: [
      {
        id: 'seed-deposit-xlm-001',
        userAddress: DEMO_USER_ADDRESS,
        type: 'deposit',
        assetAddress: XLM_ASSET_ADDRESS,
        amount: '75000000000',
        ledger: 2_401,
        txHash: 'seed-tx-deposit-xlm-001',
        timestamp: '2026-06-01T12:01:00.000Z',
      },
      {
        id: 'seed-borrow-xlm-001',
        userAddress: DEMO_USER_ADDRESS,
        type: 'borrow',
        assetAddress: XLM_ASSET_ADDRESS,
        amount: '25000000000',
        ledger: 2_420,
        txHash: 'seed-tx-borrow-xlm-001',
        timestamp: '2026-06-01T12:07:00.000Z',
      },
      {
        id: 'seed-deposit-usdc-001',
        userAddress: DEMO_USER_ADDRESS,
        type: 'deposit',
        assetAddress: USDC_ASSET_ADDRESS,
        amount: '5000000000',
        ledger: 2_450,
        txHash: 'seed-tx-deposit-usdc-001',
        timestamp: '2026-06-01T12:15:00.000Z',
      },
      {
        id: 'seed-repay-usdc-001',
        userAddress: DEMO_USER_ADDRESS,
        type: 'repay',
        assetAddress: USDC_ASSET_ADDRESS,
        amount: '1000000000',
        ledger: 2_490,
        txHash: 'seed-tx-repay-usdc-001',
        timestamp: '2026-06-01T12:30:00.000Z',
      },
    ],
  };
}

export async function writeLocalSeedData(outputPath = defaultOutputPath()) {
  const resolvedPath = resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(
    resolvedPath,
    `${JSON.stringify(createLocalSeedData(), null, 2)}\n`,
    'utf8',
  );

  return resolvedPath;
}

function defaultOutputPath(): string {
  return (
    process.env.VEILEND_SEED_DB_PATH ||
    resolve(process.cwd(), 'veilend-db.json')
  );
}

async function main() {
  const outputPath = await writeLocalSeedData();
  console.log(`Seeded local VeilLend data at ${outputPath}`);
  console.log(`Demo wallet: ${DEMO_USER_ADDRESS}`);
}

if (require.main === module) {
  void main();
}
