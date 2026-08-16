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

interface AuthenticatedUser {
  walletAddress: string;
}

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('indexer')
export class IndexerController {
  private readonly logger = new Logger(IndexerController.name);

  constructor(
    private readonly indexerService: IndexerService,
    private readonly repository: IndexerRepository,
    private readonly configService: ConfigService,
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

  @Get('positions/:address')
  async getPositions(@Param('address') address: string) {
    this.logger.log(`Fetching indexed positions for address: ${address}`);
    const positions = await this.indexerService.getPositions(address);
    return {
      address,
      positions,
    };
  }

  @Get('transactions/:address')
  async getTransactions(@Param('address') address: string) {
    this.logger.log(`Fetching indexed transactions for address: ${address}`);
    const transactions = await this.indexerService.getTransactions(address);
    return {
      address,
      transactions,
    };
  }

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
    });

    return {
      message: `Replay triggered successfully (scope=${replayScope}). Indexer checkpoint reset.`,
    };
  }
}
