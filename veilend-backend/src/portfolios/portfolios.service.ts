import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
   */
  async getPortfolio(
    walletAddress: string,
    options: { allowStale?: boolean } = {},
  ): Promise<PortfolioResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      throw new NotFoundException(
        `No indexed data found for wallet ${walletAddress}`,
      );
    }

    const positions = await this.prisma.position.findMany({
      where: { userId: user.id },
      include: { asset: true },
    });

    // Sum residual bad debt if recorded for user
    let badDebtUsd = 0;
    try {
      const liquidationEvents = await this.prisma.transactionHistory.findMany({
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
  }
}
