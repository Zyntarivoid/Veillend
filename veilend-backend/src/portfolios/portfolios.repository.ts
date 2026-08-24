import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Asset, Position, AssetInterestState } from '@prisma/client';
import { computeAccruedPosition } from '../common/utils/interest-math.util';

export type PositionWithAsset = Position & {
  asset: Asset & { interestState: AssetInterestState | null };
};

export interface VeilLendPortfolioData {
  positions: PositionWithAsset[];
  collateralValue: number;
  borrowedValue: number;
}

@Injectable()
export class PortfoliosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a user's VeilLend `Position` rows from the indexer tables and sums
   * their last-synced oracle-priced USD values into portfolio totals.
   * `depositedUsd`/`borrowedUsd` on each row are cached by the indexer sync
   * path as (oracle price × amount), so summing them is equivalent to
   * sum(oracle price × deposited) / sum(oracle price × borrowed).
   *
   * Returns `{}` when the wallet has no indexed user or no positions, so
   * callers can tell "nothing to show" apart from a genuine zero-value
   * portfolio.
   */
  async getVeilLendPortfolio(
    userAddress: string,
  ): Promise<VeilLendPortfolioData | Record<string, never>> {
    return this.prisma.withRepeatableRead(
      async (db): Promise<VeilLendPortfolioData | Record<string, never>> => {
        const user = await db.user.findUnique({
          where: { walletAddress: userAddress },
        });
        if (!user) {
          return {};
        }

        const positions = await db.position.findMany({
          where: { userId: user.id },
          include: {
            asset: {
              include: {
                interestState: true,
              },
            },
          },
        });

        if (positions.length === 0) {
          return {};
        }

        // Apply dynamic interest accrual adjustments
        let collateralValue = 0;
        let borrowedValue = 0;

        for (const p of positions) {
          let adjustedDeposited = p.depositedRaw;
          let adjustedBorrowed = p.borrowedRaw;

          if (p.asset.interestState) {
            const state = p.asset.interestState;
            const res = computeAccruedPosition(
              p.depositedRaw,
              p.borrowedRaw,
              p.supplyIndexSnapshot,
              p.borrowIndexSnapshot,
              state.supplyIndex,
              state.borrowIndex,
            );
            adjustedDeposited = res.adjustedDeposited;
            adjustedBorrowed = res.adjustedBorrowed;
          }

          // Re-compute USD value using the adjusted raw amount and the cached price
          // The indexer cached (oracle price × amount) in depositedUsd, but since amount changed,
          // we should extract the implicit oracle price or re-query it.
          // Wait, the USD value in Position is cached at last sync time.
          // A simple way is to scale depositedUsd by (adjustedDeposited / originalDepositedRaw).
          let adjustedDepositedUsd = Number(p.depositedUsd);
          if (p.depositedRaw > 0n) {
            adjustedDepositedUsd =
              (Number(adjustedDeposited) / Number(p.depositedRaw)) *
              adjustedDepositedUsd;
          }

          let adjustedBorrowedUsd = Number(p.borrowedUsd);
          if (p.borrowedRaw > 0n) {
            adjustedBorrowedUsd =
              (Number(adjustedBorrowed) / Number(p.borrowedRaw)) *
              adjustedBorrowedUsd;
          }

          collateralValue += adjustedDepositedUsd;
          borrowedValue += adjustedBorrowedUsd;

          // Mutate the object in place so the caller (PortfoliosService) sees the adjusted values
          p.depositedRaw = adjustedDeposited;
          p.borrowedRaw = adjustedBorrowed;
          // Note: p.depositedUsd and p.borrowedUsd are Decimal types, we can convert back if we want,
          // but the caller of getVeilLendPortfolio actually reads them from PositionWithAsset.
          p.depositedUsd = new Prisma.Decimal(adjustedDepositedUsd);
          p.borrowedUsd = new Prisma.Decimal(adjustedBorrowedUsd);
        }

        return { positions, collateralValue, borrowedValue };
      },
    );
  }
}
