import { Injectable, Logger } from '@nestjs/common';
import { HorizonService } from '../stellar/horizon.service';
import { ServiceResponse } from '../stellar/types';

export interface PortfolioData {
  walletAddress: string;
  balance: number;
  collateralValue: number;
  borrowedValue: number;
  availableToBorrow: number;
  healthFactor: number;
  balances: Array<{
    asset: string;
    balance: number;
  }>;
}

@Injectable()
export class PortfoliosService {
  private readonly logger = new Logger(PortfoliosService.name);

  constructor(private readonly horizonService: HorizonService) {}

  async getPortfolio(walletAddress: string): Promise<ServiceResponse<PortfolioData>> {
    try {
      const client = this.horizonService.getClient();
      const account = await client.loadAccount(walletAddress);

      const nativeBalance = account.balances.find(
        (b) => b.asset_type === 'native',
      );
      const totalBalance = nativeBalance ? parseFloat(nativeBalance.balance) : 0;

      const balances = account.balances.map((b) => {
        let asset = 'UNKNOWN';
        if (b.asset_type === 'native') {
          asset = 'XLM';
        } else if (b.asset_code) {
          asset = b.asset_code;
        } else if (b.asset_type) {
          asset = b.asset_type;
        }
        return {
          asset,
          balance: parseFloat(b.balance),
        };
      });

      // For now, use balance as collateral placeholder
      // TODO: Integrate with Soroban for VeilLend protocol positions
      const collateralValue = totalBalance * 0.8; // 80% LTV assumption
      const borrowedValue = 0; // Placeholder until protocol integration
      const availableToBorrow = collateralValue - borrowedValue;
      const healthFactor = borrowedValue > 0 ? collateralValue / borrowedValue : 999;

      return {
        success: true,
        data: {
          walletAddress,
          balance: totalBalance,
          collateralValue,
          borrowedValue,
          availableToBorrow,
          healthFactor,
          balances,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch portfolio';
      this.logger.warn(`Portfolio fetch failed for ${walletAddress}: ${message}`);
      return {
        success: false,
        error: { message, code: 'PORTFOLIO_FETCH_ERROR', rawError: error },
      };
    }
  }
}
