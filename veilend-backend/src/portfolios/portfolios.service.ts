import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { formatRawAmount } from '../common/utils/format-raw-amount';
import { computeHealthFactor } from '../common/utils/health-factor.util';
import {
  PortfolioResponseDto,
  PositionSummaryDto,
} from './dto/portfolio-response.dto';

@Injectable()
export class PortfoliosService {
  private readonly logger = new Logger(PortfoliosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds a portfolio snapshot from the indexer's Position table, rather
   * than reading live Horizon balances. Positions are the source of truth
   * for VeilLend protocol collateral/debt.
   *
   * Computes health factor using authoritative on-chain weighted MCR rules,
   * flags stale oracle prices, and includes residual bad-debt metrics.
   *
   * Wrapped in RepeatableRead so the position list and any sub-queries see
   * the same consistent snapshot without acquiring write locks.
   */
  async getPortfolio(
    walletAddress: string,
    options: { allowStale?: boolean } = {},
  ): Promise<PortfolioResponseDto> {
    return this.prisma.withRepeatableRead(async (db) => {
      const user = await db.user.findUnique({
        where: { walletAddress },
      });

      if (!user) {
        throw new NotFoundException(
          `No indexed data found for wallet ${walletAddress}`,
        );
      }

      const positions = await db.position.findMany({
        where: { userId: user.id },
        include: { asset: true },
      });

      // Sum residual bad debt if recorded for user
      let badDebtUsd = 0;
      try {
        const liquidationEvents = await db.transactionHistory.findMany({
          where: {
            userId: user.id,
            type: 'LIQUIDATION',
          },
        });
        for (const ev of liquidationEvents) {
          const anyEv = ev as Record<string, unknown>;
          if (anyEv.badDebtUsd && typeof anyEv.badDebtUsd === 'number') {
            badDebtUsd += anyEv.badDebtUsd;
          }
        }
      } catch {
        badDebtUsd = 0;
      }

      const positionSummaries: PositionSummaryDto[] = positions.map((p) => {
        const depositedUsd = Number(p.depositedUsd);
        const borrowedUsd = Number(p.borrowedUsd);

        return {
          assetId: p.assetId,
          assetCode: p.asset.code,
          assetSymbol: p.asset.symbol,
          deposited: formatRawAmount(p.depositedRaw, p.asset.decimals),
          borrowed: formatRawAmount(p.borrowedRaw, p.asset.decimals),
          depositedUsd,
          borrowedUsd,
          minCollateralRatio: p.asset.minCollateralRatio ?? null,
          healthFactor: p.healthFactor === null ? null : Number(p.healthFactor),
          privacyMode: p.privacyMode,
          isStale: p.isStale,
        };
      });

      // Authoritative health factor calculation
      const hfResult = computeHealthFactor(
        positions.map((p) => ({
          assetId: p.assetId,
          assetCode: p.asset.code,
          depositedUsd: Number(p.depositedUsd),
          borrowedUsd: Number(p.borrowedUsd),
          asset: {
            code: p.asset.code,
            minCollateralRatio: p.asset.minCollateralRatio,
          },
          isStale: p.isStale,
        })),
        {},
        {},
        {
          allowStale: options.allowStale,
          badDebtUsd,
        },
      );

      this.logger.debug(
        `Portfolio computed for ${walletAddress}: ${positionSummaries.length} position(s), HF=${hfResult.healthFactor}`,
      );

      return {
        walletAddress,
        collateralValue: hfResult.totalCollateralUsd,
        borrowedValue: hfResult.totalBorrowedUsd,
        availableToBorrow: hfResult.availableToBorrow,
        healthFactor: hfResult.healthFactor,
        hfExBadDebt: hfResult.hfExBadDebt,
        hfWithBadDebt: hfResult.hfWithBadDebt,
        badDebtUsd: hfResult.badDebtUsd,
        isStale: hfResult.isStale,
        stalePrices: hfResult.stalePrices,
        missingPrices: hfResult.missingPrices,
        positions: positionSummaries,
      };
    });
  }

  /**
   * Applies a deposit delta to a user's position for one asset under
   * Serializable isolation with a row-level FOR UPDATE lock, ensuring no
   * concurrent write-skew or lost-update is possible.
   *
   * Uses `{ increment }` Prisma mutations so Prisma pushes the arithmetic
   * to Postgres rather than reading the value to JS and writing it back.
   *
   * This method is the accounting-critical path for deposit events that
   * originate from the API layer (as opposed to the indexer path which goes
   * through IndexerRepository.applyEvent).
   */
  async applyDeposit(
    walletAddress: string,
    assetId: string,
    depositedRawDelta: bigint,
    borrowedRawDelta: bigint,
  ): Promise<void> {
    await this.prisma.withSerializable(async (db: Prisma.TransactionClient) => {
      const user = await db.user.findUnique({
        where: { walletAddress },
      });
      if (!user) {
        throw new NotFoundException(
          `No indexed data found for wallet ${walletAddress}`,
        );
      }

      await db.position.upsert({
        where: { userId_assetId: { userId: user.id, assetId } },
        create: {
          userId: user.id,
          assetId,
          depositedRaw: depositedRawDelta,
          borrowedRaw: borrowedRawDelta,
          isStale: false,
        },
        update: {
          depositedRaw: { increment: depositedRawDelta },
          borrowedRaw: { increment: borrowedRawDelta },
        },
      });
    });
  }
}
