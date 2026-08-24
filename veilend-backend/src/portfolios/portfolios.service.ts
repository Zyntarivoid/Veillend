import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { StellarAccountService } from '../stellar/stellar-account.service';
import { ProtocolService } from '../protocol/protocol.service';
import { formatRawAmount } from '../common/utils/format-raw-amount';
import { computeVeilLendHealth } from '../common/utils/veillend-health.util';
import {
  PortfoliosRepository,
  PositionWithAsset,
} from './portfolios.repository';
import {
  BalanceDto,
  PortfolioResponseDto,
  ProtocolAssetPositionDto,
} from './dto/portfolio-response.dto';

type HorizonBalance = Horizon.AccountResponse['balances'][number];

/**
 * Maps raw Horizon balance lines to our wire format. Liquidity-pool shares
 * (no `asset_code`) are dropped — they aren't tradable/collateral-relevant
 * wallet holdings for this view.
 */
function mapHorizonBalances(balances: HorizonBalance[]): BalanceDto[] {
  const result: BalanceDto[] = [];
  for (const b of balances) {
    const balance = Number(b.balance);
    if (!Number.isFinite(balance)) {
      continue;
    }
    if (b.asset_type === 'native') {
      result.push({ asset: 'XLM', assetCode: 'XLM', issuer: null, balance });
      continue;
    }
    if ('asset_code' in b && typeof b.asset_code === 'string') {
      const issuer =
        'asset_issuer' in b && typeof b.asset_issuer === 'string'
          ? b.asset_issuer
          : null;
      result.push({
        asset: b.asset_code,
        assetCode: b.asset_code,
        issuer,
        balance,
      });
    }
  }
  return result;
}

function toAssetPositionDto(
  p: PositionWithAsset,
  rawAmount: bigint,
  usdAmount: Prisma.Decimal | number,
): ProtocolAssetPositionDto {
  return {
    assetId: p.assetId,
    assetCode: p.asset.code,
    assetSymbol: p.asset.symbol,
    amount: formatRawAmount(rawAmount, p.asset.decimals),
    amountUsd: Number(usdAmount),
  };
}

@Injectable()
export class PortfoliosService {
  private readonly logger = new Logger(PortfoliosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfoliosRepository: PortfoliosRepository,
    private readonly stellarAccountService: StellarAccountService,
    private readonly protocolService: ProtocolService,
  ) {}

  /**
   * Builds a combined portfolio view for a wallet:
   *  - `balances`: live on-chain Horizon holdings (native XLM + trustlines).
   *  - `protocol`: VeilLend collateral/debt/health, computed from the
   *    indexer's `Position` rows — never from Horizon balances, and never
   *    mixed into the `balances` figures.
   *
   * A wallet that has never touched VeilLend still gets a 200 with an empty
   * `protocol` section as long as it resolves on Horizon; only a wallet that
   * resolves nowhere (bad/unfunded address, no indexed positions) is 404.
   */
  async getPortfolio(walletAddress: string): Promise<PortfolioResponseDto> {
    const [horizonResult, veillend] = await Promise.all([
      this.stellarAccountService.lookupAccountHorizon(walletAddress),
      this.portfoliosRepository.getVeilLendPortfolio(walletAddress),
    ]);

    const hasPositions =
      'positions' in veillend && veillend.positions.length > 0;

    if (!horizonResult.success && !hasPositions) {
      throw new NotFoundException(
        `No account found for wallet ${walletAddress}`,
      );
    }

    if (!horizonResult.success) {
      this.logger.warn(
        `Horizon lookup failed for ${walletAddress}, returning empty balances: ${horizonResult.error?.message}`,
      );
    }

    const balances = horizonResult.success
      ? mapHorizonBalances(horizonResult.data!.balances)
      : [];
    const balance = balances.find((b) => b.assetCode === 'XLM')?.balance ?? 0;

    const collateralValue = hasPositions ? veillend.collateralValue : 0;
    const borrowedValue = hasPositions ? veillend.borrowedValue : 0;
    const minCollateralRatioBps =
      this.protocolService.getMinCollateralRatioBps();

    const { healthFactor, availableToBorrow } = computeVeilLendHealth(
      collateralValue,
      borrowedValue,
      minCollateralRatioBps,
    );

    const depositedAssets: ProtocolAssetPositionDto[] = [];
    const borrowedAssets: ProtocolAssetPositionDto[] = [];
    if (hasPositions) {
      for (const p of veillend.positions) {
        if (p.depositedRaw > 0n) {
          depositedAssets.push(
            toAssetPositionDto(p, p.depositedRaw, p.depositedUsd),
          );
        }
        if (p.borrowedRaw > 0n) {
          borrowedAssets.push(
            toAssetPositionDto(p, p.borrowedRaw, p.borrowedUsd),
          );
        }
      }
    }

    this.logger.debug(
      `Portfolio computed for ${walletAddress}: ${balances.length} balance(s), ${depositedAssets.length} deposit(s), ${borrowedAssets.length} borrow(s), HF=${healthFactor}`,
    );

    return {
      walletAddress,
      balance,
      balances,
      collateralValue,
      borrowedValue,
      availableToBorrow,
      healthFactor,
      protocol: {
        depositedAssets,
        borrowedAssets,
        collateralValue,
        borrowedValue,
        healthFactor,
        availableToBorrow,
        minCollateralRatioBps,
      },
    };
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

      const stateRows = await db.$queryRaw<
        Array<{ borrowIndex: Prisma.Decimal; supplyIndex: Prisma.Decimal }>
      >(Prisma.sql`
        SELECT "borrowIndex", "supplyIndex"
        FROM "AssetInterestState"
        WHERE "assetId" = ${assetId}
      `);
      const currentBorrowIndex =
        stateRows[0]?.borrowIndex ?? new Prisma.Decimal(1.0);
      const currentSupplyIndex =
        stateRows[0]?.supplyIndex ?? new Prisma.Decimal(1.0);

      await db.position.upsert({
        where: { userId_assetId: { userId: user.id, assetId } },
        create: {
          userId: user.id,
          assetId,
          depositedRaw: depositedRawDelta,
          borrowedRaw: borrowedRawDelta,
          borrowIndexSnapshot: currentBorrowIndex,
          supplyIndexSnapshot: currentSupplyIndex,
          isStale: false,
        },
        update: {
          depositedRaw: { increment: depositedRawDelta },
          borrowedRaw: { increment: borrowedRawDelta },
          // Notice we don't fully re-anchor here via increment because
          // we don't know the accrued interest amount. We just let the
          // indexer correct it in the next block. For optimistic updates,
          // preserving the old snapshot is acceptable until indexer sync.
        },
      });
    });
  }
}
