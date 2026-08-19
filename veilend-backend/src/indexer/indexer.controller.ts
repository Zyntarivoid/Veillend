import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { IndexerService, ReplayScope } from './indexer.service';
import { IndexerRepository } from './indexer.repository';
import type { Request } from 'express';
  Logger,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AdminActionType } from '@prisma/client';
import type { Request } from 'express';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';
import { AddressParamDto } from './dto/address-param.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAddressForLog } from '../common/logging/sanitize-address.util';

interface AuthenticatedUser {
  walletAddress: string;
}

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
  user?: AuthenticatedUser;
}

@Controller('indexer')
export class IndexerController {
  private readonly logger = new Logger(IndexerController.name);

  constructor(
    private readonly indexerService: IndexerService,
    private readonly repository: IndexerRepository,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async getStatus() {
    const checkpoint = await this.repository.getCheckpoint();
    const contractId = this.configService.get<string>('indexer.contractId', '');
    const startLedger = this.configService.get<number>(
      'indexer.startLedger',
      1,
    );
    const pollIntervalMs = this.configService.get<number>(
      'indexer.pollIntervalMs',
      5000,
    );

    return {
      status: 'active',
      contractId,
      startLedger,
      pollIntervalMs,
      lastIndexedLedger: checkpoint.lastIndexedLedger,
    };
  }

  // 1 req/s per IP — these endpoints are otherwise unauthenticated and were
  // previously scrapeable at unlimited rate.
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('positions/:address')
  async getPositions(@Param() { address }: AddressParamDto) {
    this.logger.log(
      `Fetching indexed positions for address: ${sanitizeAddressForLog(address)}`,
    );
    const positions = await this.indexerService.getPositions(address);
    return {
      address,
      positions,
    };
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get('transactions/:address')
  async getTransactions(@Param() { address }: AddressParamDto) {
    this.logger.log(
      `Fetching indexed transactions for address: ${sanitizeAddressForLog(address)}`,
    );
    const transactions = await this.indexerService.getTransactions(address);
    return {
      address,
      transactions,
    };
  }

  // Resets the indexer checkpoint and forces a full replay of the contract
  // event stream — expensive and disruptive (stale data + DB churn while it
  // catches back up), so it's admin-only and audited.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('replay')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  async triggerReplay(
    @Query('scope') scope: string = 'bad-only',
    @Headers('x-confirm-full-wipe') confirmFullWipe: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    const validScopes: ReplayScope[] = ['full', 'bad-only'];
    if (!validScopes.includes(scope as ReplayScope)) {
      throw new BadRequestException(
        `Invalid scope "${scope}". Must be one of: ${validScopes.join(', ')}`,
      );
    }

    const replayScope = scope as ReplayScope;

    if (replayScope === 'full' && confirmFullWipe !== 'yes') {
      throw new BadRequestException(
        'Full wipe requires the "x-confirm-full-wipe: yes" header',
      );
    }

    this.logger.log(
      `Admin ${req.user.walletAddress} triggered database replay (scope=${replayScope})...`,
    );

    await this.indexerService.forceReplay({
      scope: replayScope,
      actorWallet: req.user.walletAddress,
      confirmFullWipe: confirmFullWipe === 'yes',
  async triggerReplay(@Req() req: RequestWithUser) {
    // Belt-and-suspenders: AdminGuard already rejects unauthenticated
    // requests before this handler runs, but the replay + audit write below
    // must never proceed with an unattributed actor.
    if (!req.user?.walletAddress) {
      throw new UnauthorizedException('No user authenticated');
    }
    const actorWallet = req.user.walletAddress;
    this.logger.log(
      `Manually triggered database replay of contract events... actorWallet: ${actorWallet}`,
    );
    await this.indexerService.forceReplay();

    await this.prisma.adminAuditLog.create({
      data: {
        actorWallet,
        action: AdminActionType.INDEXER_REPLAY,
        payload: { reason: 'manual_replay' },
      },
    });

    return {
      message: `Replay triggered successfully (scope=${replayScope}). Indexer checkpoint reset.`,
    };
  }
}
