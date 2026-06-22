import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';

describe('PortfoliosController', () => {
  let controller: PortfoliosController;
  let service: jest.Mocked<Pick<PortfoliosService, 'getDashboard'>>;

  beforeEach(() => {
    service = {
      getDashboard: jest.fn().mockResolvedValue({
        walletAddress: 'GWALLET',
        positions: [],
        summary: {
          totalDeposited: '0',
          totalBorrowed: '0',
          netBalance: '0',
          healthFactorBps: null,
          status: 'empty',
        },
      }),
    };
    controller = new PortfoliosController(service as PortfoliosService);
  });

  it('returns the wallet dashboard from the service', async () => {
    await expect(controller.getDashboard('GWALLET')).resolves.toEqual({
      walletAddress: 'GWALLET',
      positions: [],
      summary: {
        totalDeposited: '0',
        totalBorrowed: '0',
        netBalance: '0',
        healthFactorBps: null,
        status: 'empty',
      },
    });
    expect(service.getDashboard).toHaveBeenCalledWith('GWALLET');
  });
});
