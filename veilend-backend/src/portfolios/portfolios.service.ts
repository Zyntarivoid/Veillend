import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import { HorizonService } from '../stellar/horizon.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PortfolioBalanceDto,
  PortfolioData,
  PortfolioPositionDto,
} from './dto/portfolio-response.dto';

@Injectable()
export class PortfoliosService {
  private readonly logger = new Logger(PortfoliosService.name);

  constructor(
    private readonly horizonService: HorizonService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Build a dashboard portfolio for a Stellar wallet address.
   *
   * - Invalid addresses fail with 400 (clear client error).
   * - Unknown / unfunded accounts return a successful empty-state payload
   *   rather than 404, so mobile clients can render zeroed UI cleanly.
   * - Protocol positions (when indexed) supply collateral / borrow metrics;
   *   Horizon supplies free balances.
   */
  async getPortfolio(walletAddress: string): Promise<PortfolioData> {
    const address = this.assertWalletAddress(walletAddress);

    const [horizon, protocol] = await Promise.all([
      this.loadHorizonBalances(address),
      this.loadProtocolPositions(address),
    ]);

    const collateralValue = protocol.positions.reduce(
      (sum, p) => sum + p.depositedUsd,
      0,
    );
    const borrowedValue = protocol.positions.reduce(
      (sum, p) => sum + p.borrowedUsd,
      0,
    );
    const availableToBorrow = Math.max(0, collateralValue - borrowedValue);

    let healthFactor: number | null = null;
    if (borrowedValue > 0) {
      healthFactor = collateralValue / borrowedValue;
    } else if (protocol.positions.some((p) => p.healthFactor != null)) {
      // Prefer the worst (lowest) recorded per-position HF when debt is only
      // present in raw units but USD cache is still zero.
      const factors = protocol.positions
        .map((p) => p.healthFactor)
        .filter((h): h is number => h != null && Number.isFinite(h));
      healthFactor = factors.length > 0 ? Math.min(...factors) : null;
    }

    const empty =
      !horizon.found &&
      protocol.positions.length === 0 &&
      horizon.balances.length === 0;

    return {
      walletAddress: address,
      empty,
      balance: horizon.nativeBalance,
      collateralValue,
      borrowedValue,
      availableToBorrow,
      healthFactor,
      balances: horizon.balances,
      positions: protocol.positions,
      source: {
        horizon: horizon.found,
        protocol: protocol.positions.length > 0,
      },
    };
  }

  private assertWalletAddress(walletAddress: string): string {
    const address = (walletAddress ?? '').trim();
    if (!address || !StrKey.isValidEd25519PublicKey(address)) {
      throw new BadRequestException(
        `Invalid Stellar wallet address: "${walletAddress}". Expected a G… public key.`,
      );
    }
    return address;
  }

  private async loadHorizonBalances(walletAddress: string): Promise<{
    found: boolean;
    nativeBalance: number;
    balances: PortfolioBalanceDto[];
  }> {
    try {
      const client = this.horizonService.getClient();
      const account = await client.loadAccount(walletAddress);

      const balances: PortfolioBalanceDto[] = account.balances.map((b) => {
        if (b.asset_type === 'native') {
          return {
            asset: 'XLM',
            balance: parseFloat(b.balance),
            issuer: null,
          };
        }
        const coded = b as {
          asset_code?: string;
          asset_issuer?: string;
          balance: string;
        };
        return {
          asset: coded.asset_code ?? b.asset_type ?? 'UNKNOWN',
          balance: parseFloat(coded.balance),
          issuer: coded.asset_issuer ?? null,
        };
      });

      const native = balances.find((b) => b.asset === 'XLM');
      return {
        found: true,
        nativeBalance: native?.balance ?? 0,
        balances,
      };
    } catch (error: unknown) {
      // Horizon 404 / not found → unfunded account; treat as empty balances.
      const status =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { status?: number } }).response
          ?.status === 'number'
          ? (error as { response: { status: number } }).response.status
          : undefined;

      if (status === 404) {
        this.logger.debug(
          `Horizon account not found for ${walletAddress}; returning empty balances`,
        );
        return { found: false, nativeBalance: 0, balances: [] };
      }

      const message =
        error instanceof Error ? error.message : 'Horizon portfolio fetch failed';
      this.logger.warn(
        `Horizon balance load failed for ${walletAddress}: ${message}`,
      );
      // Soft-fail Horizon so protocol-only wallets still get a response.
      return { found: false, nativeBalance: 0, balances: [] };
    }
  }

  private async loadProtocolPositions(walletAddress: string): Promise<{
    positions: PortfolioPositionDto[];
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { walletAddress },
        include: {
          positions: {
            include: { asset: true },
          },
        },
      });

      if (!user) {
        return { positions: [] };
      }

      const positions: PortfolioPositionDto[] = user.positions.map((p) => ({
        assetCode: p.asset.code,
        assetContractId: p.asset.contractId,
        depositedRaw: p.depositedRaw.toString(),
        borrowedRaw: p.borrowedRaw.toString(),
        depositedUsd: Number(p.depositedUsd),
        borrowedUsd: Number(p.borrowedUsd),
        healthFactor:
          p.healthFactor == null ? null : Number(p.healthFactor),
        isStale: p.isStale,
      }));

      return { positions };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Protocol position load failed';
      this.logger.warn(
        `Protocol positions unavailable for ${walletAddress}: ${message}`,
      );
      return { positions: [] };
    }
  }
}
