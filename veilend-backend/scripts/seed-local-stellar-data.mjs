import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_OUTPUT = path.join(process.cwd(), 'veilend-db.json');
const FIXED_TIMESTAMP = '2026-01-15T12:00:00.000Z';

const args = process.argv.slice(2);

function readOption(name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(name);
  if (index !== -1) return args[index + 1];

  return undefined;
}

const outputPath = path.resolve(
  readOption('--output') || process.env.VEILEND_SEED_OUTPUT || DEFAULT_OUTPUT,
);

const users = {
  lender: 'GDEMOLOCALSTELLARLENDER00000000000000000000000000000001',
  borrower: 'GDEMOLOCALSTELLARBORROWER000000000000000000000000000001',
};

const assets = {
  usdc: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624USDC',
  xlm: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624XLM1',
};

function transaction(
  id,
  userAddress,
  type,
  assetAddress,
  amount,
  ledger,
  txHash,
) {
  return {
    id,
    userAddress,
    type,
    assetAddress,
    amount,
    ledger,
    txHash,
    timestamp: new Date(Date.parse(FIXED_TIMESTAMP) + ledger).toISOString(),
  };
}

const seed = {
  checkpoint: { lastIndexedLedger: 424242 },
  transactions: [
    transaction(
      'demo-424201-0001',
      users.lender,
      'deposit',
      assets.usdc,
      '2500000000',
      424201,
      'demo_tx_424201_deposit_usdc',
    ),
    transaction(
      'demo-424202-0001',
      users.borrower,
      'deposit',
      assets.xlm,
      '5000000000',
      424202,
      'demo_tx_424202_deposit_xlm',
    ),
    transaction(
      'demo-424203-0001',
      users.borrower,
      'borrow',
      assets.usdc,
      '750000000',
      424203,
      'demo_tx_424203_borrow_usdc',
    ),
    transaction(
      'demo-424204-0001',
      users.borrower,
      'repay',
      assets.usdc,
      '125000000',
      424204,
      'demo_tx_424204_repay_usdc',
    ),
    transaction(
      'demo-424205-0001',
      users.lender,
      'withdraw',
      assets.usdc,
      '250000000',
      424205,
      'demo_tx_424205_withdraw_usdc',
    ),
  ],
  positions: [
    {
      userAddress: users.lender,
      assetAddress: assets.usdc,
      deposited: '2250000000',
      borrowed: '0',
      updatedAt: FIXED_TIMESTAMP,
    },
    {
      userAddress: users.borrower,
      assetAddress: assets.xlm,
      deposited: '5000000000',
      borrowed: '0',
      updatedAt: FIXED_TIMESTAMP,
    },
    {
      userAddress: users.borrower,
      assetAddress: assets.usdc,
      deposited: '0',
      borrowed: '625000000',
      updatedAt: FIXED_TIMESTAMP,
    },
  ],
  assets: [
    {
      assetAddress: assets.usdc,
      supported: true,
      updatedAt: FIXED_TIMESTAMP,
    },
    {
      assetAddress: assets.xlm,
      supported: true,
      updatedAt: FIXED_TIMESTAMP,
    },
    {
      assetAddress: 'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624DISA',
      supported: false,
      updatedAt: FIXED_TIMESTAMP,
    },
  ],
};

const seenTransactionIds = new Set();
for (const tx of seed.transactions) {
  if (seenTransactionIds.has(tx.id)) {
    throw new Error(`Duplicate seed transaction id: ${tx.id}`);
  }
  seenTransactionIds.add(tx.id);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');

console.log(`Seeded VeilLend local indexer data at ${outputPath}`);
console.log(
  `Created ${seed.assets.length} assets, ${seed.positions.length} positions, and ${seed.transactions.length} transactions.`,
);
