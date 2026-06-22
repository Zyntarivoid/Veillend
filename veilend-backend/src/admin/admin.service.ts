import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProtocolRiskConfig {
  minCollateralRatioBps: number;
  maxLoanToValueBps: number;
  liquidationThresholdBps: number;
  liquidationPenaltyBps: number;
}

export interface CollateralRule {
  assetSymbol: string;
  collateralFactorBps: number;
  borrowFactorBps: number;
  liquidationThresholdBps: number;
}

export interface ProtocolConfigResponse {
  protocol: string;
  schemaVersion: number;
  network: {
    name: string;
    passphrase: string;
    horizonUrl: string;
    sorobanRpcUrl: string;
    contractId: string;
    indexerStartLedger: number;
    indexerPollIntervalMs: number;
  };
  risk: ProtocolRiskConfig;
  collateralRules: CollateralRule[];
  cache: {
    ttlSeconds: number;
    strategy: string;
  };
}

const DEFAULT_RISK_CONFIG: ProtocolRiskConfig = {
  minCollateralRatioBps: 15_000,
  maxLoanToValueBps: 6_666,
  liquidationThresholdBps: 12_500,
  liquidationPenaltyBps: 500,
};

const COLLATERAL_RULES: CollateralRule[] = [
  {
    assetSymbol: 'XLM',
    collateralFactorBps: 7_500,
    borrowFactorBps: 6_500,
    liquidationThresholdBps: 8_000,
  },
  {
    assetSymbol: 'USDC',
    collateralFactorBps: 8_500,
    borrowFactorBps: 8_000,
    liquidationThresholdBps: 9_000,
  },
];

const CACHE_HINT = {
  ttlSeconds: 60,
  strategy: 'public-read-mostly',
};

@Injectable()
export class AdminService {
  constructor(private readonly configService: ConfigService) {}

  getProtocolConfig(): ProtocolConfigResponse {
    const passphrase = this.configService.get<string>(
      'stellar.networkPassphrase',
      'Test SDF Network ; September 2015',
    );

    return {
      protocol: 'VeilLend',
      schemaVersion: 1,
      network: {
        name: this.resolveNetworkName(passphrase),
        passphrase,
        horizonUrl: this.configService.get<string>(
          'stellar.horizonUrl',
          'https://horizon-testnet.stellar.org',
        ),
        sorobanRpcUrl: this.configService.get<string>(
          'stellar.sorobanRpcUrl',
          'https://soroban-testnet.stellar.org',
        ),
        contractId: this.configService.get<string>('indexer.contractId', ''),
        indexerStartLedger: this.configService.get<number>(
          'indexer.startLedger',
          1,
        ),
        indexerPollIntervalMs: this.configService.get<number>(
          'indexer.pollIntervalMs',
          5000,
        ),
      },
      risk: { ...DEFAULT_RISK_CONFIG },
      collateralRules: COLLATERAL_RULES.map((rule) => ({ ...rule })),
      cache: { ...CACHE_HINT },
    };
  }

  getRiskConfig() {
    return {
      risk: { ...DEFAULT_RISK_CONFIG },
      collateralRules: COLLATERAL_RULES.map((rule) => ({ ...rule })),
      cache: { ...CACHE_HINT },
    };
  }

  private resolveNetworkName(passphrase: string): string {
    if (passphrase === 'Test SDF Network ; September 2015') {
      return 'testnet';
    }

    if (passphrase === 'Public Global Stellar Network ; September 2015') {
      return 'mainnet';
    }

    return 'custom';
  }
}
