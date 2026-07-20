import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { AppConfigService } from '../config/app-config.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: AppConfigService,
          useValue: {
            stellar: {
              sorobanRpcUrl: 'https://test',
              horizonUrl: 'https://test',
              network: 'testnet',
              networkPassphrase: 'Test SDF Network ; September 2015',
            },
            auth: {
              jwtSecret: 'test',
            },
            indexer: {
              contractId:
                'CCW57ZST4NV43YS7JZKMGLG62624NV43YS7JZKMGLG62624NV43YS7JZ',
              startLedger: 1,
              pollIntervalMs: 5000,
            },
          },
        },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('validate returns the payload wallet address', () => {
    const payload = { walletAddress: 'GABC' };
    expect(strategy.validate(payload)).toEqual({
      walletAddress: 'GABC',
    });
  });
});
