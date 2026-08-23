import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AppConfigService } from '../config/app-config.service';
import { OraclePriceService } from './oracle-price.service';
import { RiskReadService } from './risk-read.service';
import { RiskRepository, decodeQueueCursor } from './risk.repository';
import { LiquidationQueueQueryDto } from './dto/liquidation-queue-query.dto';
import { sanitizeAddressForLog } from '../common/logging/sanitize-address.util';

interface AuthenticatedUser {
  walletAddress: string;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Controller()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class RiskController {
  private readonly logger = new Logger(RiskController.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly oracle: OraclePriceService,
    private readonly riskRead: RiskReadService,
    private readonly riskRepository: RiskRepository,
  ) {}

  /**
   * Live per-user risk view for the authenticated wallet: recomputes the
   * portfolio health factor with fresh oracle prices on every request.
   */
  @UseGuards(JwtAuthGuard)
  @Get('risk/positions')
  async getRiskPositions(@Req() req: RequestWithUser) {
    if (!req.user?.walletAddress) {
      throw new UnauthorizedException('No user authenticated');
    }
    const wallet = req.user.walletAddress;
    this.logger.log(
      `Live risk positions requested for ${sanitizeAddressForLog(wallet)}`,
    );

    const contractId = this.configService.indexer.contractId;
    this.oracle.beginTick();

    const portfolio =
      await this.riskRepository.loadUserPortfolioByWallet(wallet);
    if (!portfolio) {
      return {
        band: 'healthy',
        riskStatus: 'priced',
        healthFactor: null,
        debtValueUsd: 0,
        collateralValueUsd: 0,
        weightedCollateralUsd: 0,
        maxRepayableUsd: 0,
        estSeizableUsd: null,
        distanceToLiquidation: null,
        priceMoveToLiquidation: null,
        primaryDebtAssetCode: null,
        closeFactorBps: 5000,
        missingPrices: [],
        stalePrices: [],
        positions: [],
      };
    }

    const snapshot = await this.riskRead.computeUserRisk(portfolio, contractId);

    return {
      ...snapshot,
      positions: portfolio.positions.map((p) => ({
        assetId: p.assetId,
        assetCode: p.asset.code,
        depositedRaw: p.depositedRaw.toString(),
        borrowedRaw: p.borrowedRaw.toString(),
        accruedInterestRaw: p.accruedInterestRaw.toString(),
      })),
    };
  }

  /**
   * Admin liquidation queue: users whose persisted risk state is
   * `liquidatable`, ordered by estimated seizable value (desc).
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/liquidations/queue')
  async getLiquidationQueue(@Query() query: LiquidationQueueQueryDto) {
    let cursor: { estSeizableUsd: number; userId: string } | undefined;
    if (query.cursor) {
      const decoded = decodeQueueCursor(query.cursor);
      if (!decoded) {
        throw new BadRequestException('Invalid pagination cursor');
      }
      cursor = decoded;
    }

    const page = await this.riskRepository.getLiquidationQueuePage({
      limit: query.limit ?? 50,
      cursor,
      minHealthFactor: query.minHealthFactor,
      assetCode: query.asset,
      minSeizableValue: query.minSeizableValue,
    });

    return {
      items: page.items,
      meta: {
        limit: query.limit ?? 50,
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      },
    };
  }
}
