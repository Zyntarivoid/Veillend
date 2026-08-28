import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistPositionDto, WatchlistPoolDto, WatchlistResponseDto } from './dto/watchlist-response.dto';

const RISK_HEALTH_FACTOR = 1.1;
const LIQUIDATION_DISCOUNT_PERCENT = 10;

@Injectable()
export class LiquidationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWatchlist(userId: string): Promise<WatchlistResponseDto> {
    const [positions, markets, history, myPositions] = await Promise.all([
      this.prisma.position.findMany({
        where: { healthFactor: { lt: RISK_HEALTH_FACTOR }, borrowedRaw: { gt: 0 } },
        include: { user: true, asset: true },
        orderBy: { borrowedUsd: 'desc' },
      }),
      this.prisma.assetInterestState.findMany({ include: { asset: true } }),
      this.prisma.transactionHistory.findMany({
        where: { userId, type: 'LIQUIDATION' },
        include: { asset: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.position.findMany({
        where: { userId, depositedRaw: { gt: 0 } },
        select: { assetId: true },
      }),
    ]);

    const mapped = positions.map((position) => {
      const borrowedUsd = Number(position.borrowedUsd);
      const collateralUsd = Number(position.depositedUsd);
      const shortfallUsd = Math.max(0, borrowedUsd - collateralUsd);
      return {
        id: position.id,
        userId: position.userId,
        walletAddress: position.user.walletAddress,
        borrowedAsset: position.asset.symbol,
        collateralAsset: position.asset.symbol,
        borrowedUsd,
        collateralUsd,
        healthFactor: Number(position.healthFactor),
        shortfallUsd,
        seizableCollateralUsd: Math.min(collateralUsd, borrowedUsd),
        liquidationDiscountPercent: LIQUIDATION_DISCOUNT_PERCENT,
        expectedProfitUsd: Math.min(collateralUsd, borrowedUsd) * LIQUIDATION_DISCOUNT_PERCENT / 100,
        isMyRisk: position.userId === userId,
      } satisfies WatchlistPositionDto;
    });

    const opportunities = mapped
      .sort((a, b) => b.shortfallUsd - a.shortfallUsd)
      .slice(0, 50);
    const myRisk = mapped.filter((position) => position.isMyRisk);
    const myPoolAssets = new Set(myPositions.map((position) => position.assetId));
    const pools: WatchlistPoolDto[] = markets
      .map((market) => {
        const supplied = Number(market.totalSupplied);
        const borrowed = Number(market.totalBorrowed);
        return {
          assetId: market.assetId,
          asset: market.asset.symbol,
          utilizationPercent: supplied > 0 ? Math.min(100, borrowed / supplied * 100) : 0,
          isMyPool: myPoolAssets.has(market.assetId),
        };
      })
      .filter((pool) => pool.utilizationPercent > 90);

    return {
      myRisk,
      opportunities,
      pools,
      myLiquidationsPast: history.map((transaction) => ({
        id: transaction.id,
        status: transaction.status,
        amountUsd: Number(transaction.amountUsd),
        asset: transaction.asset.symbol,
        txHash: transaction.txHash,
        createdAt: transaction.createdAt,
        confirmedAt: transaction.confirmedAt,
      })),
    };
  }
}