import { IndexerRepository } from '../indexer/indexer.repository';
import { PortfoliosService } from './portfolios.service';

describe('PortfoliosService', () => {
  let repository: jest.Mocked<Pick<IndexerRepository, 'getPositions'>>;
  let service: PortfoliosService;

  beforeEach(() => {
    repository = {
      getPositions: jest.fn(),
    };
    service = new PortfoliosService(repository as IndexerRepository);
  });

  it('returns dashboard positions and summary metrics for a wallet', async () => {
    repository.getPositions.mockResolvedValue([
      {
        userAddress: 'GWALLET',
        assetAddress: 'native:XLM',
        deposited: '75000000000',
        borrowed: '25000000000',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
      {
        userAddress: 'GWALLET',
        assetAddress: 'credit:USDC:testnet',
        deposited: '5000000000',
        borrowed: '1000000000',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
    ]);

    await expect(service.getDashboard('GWALLET')).resolves.toEqual({
      walletAddress: 'GWALLET',
      positions: [
        {
          assetAddress: 'native:XLM',
          deposited: '75000000000',
          borrowed: '25000000000',
          netBalance: '50000000000',
          collateralValue: '75000000000',
          borrowedValue: '25000000000',
        },
        {
          assetAddress: 'credit:USDC:testnet',
          deposited: '5000000000',
          borrowed: '1000000000',
          netBalance: '4000000000',
          collateralValue: '5000000000',
          borrowedValue: '1000000000',
        },
      ],
      summary: {
        totalDeposited: '80000000000',
        totalBorrowed: '26000000000',
        netBalance: '54000000000',
        healthFactorBps: '30769',
        status: 'healthy',
      },
    });
  });

  it('returns a graceful empty dashboard', async () => {
    repository.getPositions.mockResolvedValue([]);

    await expect(service.getDashboard('GEMPTY')).resolves.toEqual({
      walletAddress: 'GEMPTY',
      positions: [],
      summary: {
        totalDeposited: '0',
        totalBorrowed: '0',
        netBalance: '0',
        healthFactorBps: null,
        status: 'empty',
      },
    });
  });
});
