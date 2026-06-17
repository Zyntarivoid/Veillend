import { Controller, Get, Post, Param, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';

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
  async triggerReplay() {
    this.logger.log('Manually triggered database replay of contract events...');
    await this.indexerService.forceReplay();
    return {
      message:
        'Replay triggered successfully. Indexer checkpoint reset to start.',
    };
  }
}
