import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createLocalSeedData,
  writeLocalSeedData,
} from '../../scripts/seed-local-data';

describe('local seed data', () => {
  it('matches the indexer read model schema', () => {
    const seedData = createLocalSeedData();

    expect(seedData.checkpoint.lastIndexedLedger).toBeGreaterThan(0);
    expect(seedData.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetAddress: 'native:XLM',
          supported: true,
        }),
        expect.objectContaining({
          assetAddress: 'credit:USDC:testnet',
          supported: true,
        }),
      ]),
    );
    const xlmPosition = seedData.positions.find(
      (position) => position.assetAddress === 'native:XLM',
    );
    expect(xlmPosition?.userAddress.startsWith('G')).toBe(true);
    expect(typeof xlmPosition?.deposited).toBe('string');
    expect(typeof xlmPosition?.borrowed).toBe('string');

    const depositTransaction = seedData.transactions.find(
      (transaction) => transaction.type === 'deposit',
    );
    expect(depositTransaction?.id.startsWith('seed-')).toBe(true);
    expect(typeof depositTransaction?.amount).toBe('string');
    expect(typeof depositTransaction?.ledger).toBe('number');
    expect(typeof depositTransaction?.txHash).toBe('string');
  });

  it('writes the seed file to a requested path', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'veillend-seed-'));
    const outputPath = join(tempDir, 'veilend-db.json');

    try {
      await expect(writeLocalSeedData(outputPath)).resolves.toBe(outputPath);

      const parsed = JSON.parse(
        await readFile(outputPath, 'utf8'),
      ) as ReturnType<typeof createLocalSeedData>;

      expect(parsed.transactions).toHaveLength(4);
      expect(parsed.positions).toHaveLength(2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
