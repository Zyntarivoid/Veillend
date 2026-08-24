import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
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
  user?: AuthenticatedUser;
}

export interface ReplayRequestDto {
  fromLedger?: number;
  toLedger?: number;
  chunk?: number;
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
    const stats = await this.indexerService.getSyncStats();
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
      syncStatus: stats.syncStatus,
      contractId,
      startLedger,
      pollIntervalMs,
      lastIndexedLedger: stats.currentLedger,
      currentLedger: stats.currentLedger,
      latestLedger: stats.latestLedger,
      lag: stats.lag,
      percent: stats.percent,
      eta: stats.eta,
      dedupCounter: stats.dedupCounter,
      insertedCounter: stats.insertedCounter,
      lastError: stats.lastError,
      unhandledEventTopics: stats.unhandledEventTopics,
      replay: stats.replay,
    };
  }

  @Get('replay/status')
  getReplayStatus() {
    return this.indexerService.getReplayState();
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

  // Resets the indexer checkpoint and forces a full or chunked replay of the contract
  // event stream — expensive and disruptive (stale data + DB churn while it
  // catches back up), so it's admin-only and audited.
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('replay')
  async triggerReplay(
    @Req() req: RequestWithUser,
    @Query('fromLedger') queryFrom?: string,
    @Query('toLedger') queryTo?: string,
    @Query('chunk') queryChunk?: string,
    @Body() body?: ReplayRequestDto,
  ) {
    if (!req.user?.walletAddress) {
      throw new UnauthorizedException('No user authenticated');
    }
    const actorWallet = req.user.walletAddress;
    this.logger.log(
      `Manually triggered database replay of contract events... actorWallet: ${actorWallet}`,
    );

    const fromLedger =
      queryFrom !== undefined
        ? parseInt(queryFrom, 10)
        : body?.fromLedger !== undefined
          ? Number(body.fromLedger)
          : undefined;

    const toLedger =
      queryTo !== undefined
        ? parseInt(queryTo, 10)
        : body?.toLedger !== undefined
          ? Number(body.toLedger)
          : undefined;

    const chunk =
      queryChunk !== undefined
        ? parseInt(queryChunk, 10)
        : body?.chunk !== undefined
          ? Number(body.chunk)
          : undefined;

    const result = await this.indexerService.replay({
      fromLedger: !isNaN(fromLedger as number) ? fromLedger : undefined,
      toLedger: !isNaN(toLedger as number) ? toLedger : undefined,
      chunk: !isNaN(chunk as number) ? chunk : undefined,
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorWallet,
        action: AdminActionType.INDEXER_REPLAY,
        payload: {
          fromLedger: result.fromLedger,
          toLedger: result.toLedger,
          chunk: result.chunk,
          inserted: result.inserted,
          already_processed: result.already_processed,
        },
      },
    });

    return {
      message: result.message,
      success: result.success,
      status: result.status,
      fromLedger: result.fromLedger,
      toLedger: result.toLedger,
      chunk: result.chunk,
      inserted: result.inserted,
      already_processed: result.already_processed,
      alreadyProcessed: result.alreadyProcessed,
      currentLedger: result.currentLedger,
      percent: result.percent,
    };
  }
}
