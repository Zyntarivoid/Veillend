import { Injectable } from '@nestjs/common';
import {
  IndexerPosition,
  IndexerRepository,
} from '../indexer/indexer.repository';

export interface DashboardPosition {
  assetAddress: string;
  deposited: string;
  borrowed: string;
  netBalance: string;
  collateralValue: string;
  borrowedValue: string;
}

export interface PortfolioDashboard {
  walletAddress: string;
  positions: DashboardPosition[];
  summary: {
    totalDeposited: string;
    totalBorrowed: string;
    netBalance: string;
    healthFactorBps: string | null;
    status: 'empty' | 'healthy' | 'at_risk';
  };
}

@Injectable()
export class PortfoliosService {
  constructor(private readonly indexerRepository: IndexerRepository) {}

  async getDashboard(walletAddress: string): Promise<PortfolioDashboard> {
    const positions = await this.indexerRepository.getPositions(walletAddress);
    const dashboardPositions = positions.map((position) =>
      this.toDashboardPosition(position),
    );
    const totalDeposited = this.sumAmounts(
      dashboardPositions.map((position) => position.deposited),
    );
    const totalBorrowed = this.sumAmounts(
      dashboardPositions.map((position) => position.borrowed),
    );
    const netBalance = totalDeposited - totalBorrowed;

    return {
      walletAddress,
      positions: dashboardPositions,
      summary: {
        totalDeposited: totalDeposited.toString(),
        totalBorrowed: totalBorrowed.toString(),
        netBalance: netBalance.toString(),
        healthFactorBps: this.calculateHealthFactorBps(
          totalDeposited,
          totalBorrowed,
        ),
        status: this.resolveStatus(totalDeposited, totalBorrowed),
      },
    };
  }

  private toDashboardPosition(position: IndexerPosition): DashboardPosition {
    const deposited = BigInt(position.deposited);
    const borrowed = BigInt(position.borrowed);

    return {
      assetAddress: position.assetAddress,
      deposited: position.deposited,
      borrowed: position.borrowed,
      netBalance: (deposited - borrowed).toString(),
      collateralValue: position.deposited,
      borrowedValue: position.borrowed,
    };
  }

  private sumAmounts(amounts: string[]): bigint {
    return amounts.reduce((total, amount) => total + BigInt(amount), 0n);
  }

  private calculateHealthFactorBps(
    totalDeposited: bigint,
    totalBorrowed: bigint,
  ): string | null {
    if (totalBorrowed === 0n) {
      return null;
    }

    return ((totalDeposited * 10_000n) / totalBorrowed).toString();
  }

  private resolveStatus(
    totalDeposited: bigint,
    totalBorrowed: bigint,
  ): 'empty' | 'healthy' | 'at_risk' {
    if (totalDeposited === 0n && totalBorrowed === 0n) {
      return 'empty';
    }

    return totalDeposited * 10_000n >= totalBorrowed * 15_000n
      ? 'healthy'
      : 'at_risk';
  }
}
