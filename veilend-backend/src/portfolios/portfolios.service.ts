import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatRawAmount } from '../common/utils/format-raw-amount';
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
   * for VeilLend protocol collateral/debt; Horizon only knows Stellar
   * classic balances, which are unrelated to the protocol's lending state.
   */
  async getPortfolio(walletAddress: string): Promise<PortfolioResponseDto> {
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

    let collateralValue = 0;
    let borrowedValue = 0;

    const positionSummaries: PositionSummaryDto[] = positions.map((p) => {
      const depositedUsd = Number(p.depositedUsd);
      const borrowedUsd = Number(p.borrowedUsd);
      collateralValue += depositedUsd;
      borrowedValue += borrowedUsd;

      return {
        assetId: p.assetId,
        assetCode: p.asset.code,
        assetSymbol: p.asset.symbol,
        deposited: formatRawAmount(p.depositedRaw, p.asset.decimals),
        borrowed: formatRawAmount(p.borrowedRaw, p.asset.decimals),
        depositedUsd,
        borrowedUsd,
        healthFactor: p.healthFactor === null ? null : Number(p.healthFactor),
        privacyMode: p.privacyMode,
        isStale: p.isStale,
      };
    });

    const availableToBorrow = Math.max(collateralValue - borrowedValue, 0);
    const healthFactor =
      borrowedValue > 0 ? collateralValue / borrowedValue : Infinity;

    this.logger.debug(
      `Portfolio computed for ${walletAddress}: ${positionSummaries.length} position(s)`,
    );

    return {
      walletAddress,
      collateralValue,
      borrowedValue,
      availableToBorrow,
      healthFactor,
      positions: positionSummaries,
    };
  }
}
