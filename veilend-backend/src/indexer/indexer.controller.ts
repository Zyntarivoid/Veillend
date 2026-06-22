import { Controller, Get, Post, Param, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IndexerService } from './indexer.service';
import { IndexerRepository } from './indexer.repository';

@ApiTags('indexer')
@Controller({ path: 'indexer', version: '1' })
export class IndexerController {
  private readonly logger = new Logger(IndexerController.name);

  constructor(
    private readonly indexerService: IndexerService,
    private readonly repository: IndexerRepository,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Return indexer configuration and checkpoint status' })
  @ApiOkResponse({
    description: 'Current indexer status and the last indexed ledger checkpoint.',
    schema: {
      example: {
        status: 'active',
        contractId: 'CB3EXAMPLE...',
        startLedger: 123456,
        pollIntervalMs: 5000,
        lastIndexedLedger: 123789,
      },
      type: 'object',
    },
  })
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
  @ApiOperation({ summary: 'Return indexed positions for a wallet address' })
  @ApiParam({ name: 'address', example: 'GABCD...EXAMPLE' })
  @ApiOkResponse({
    description: 'Wallet address and indexed protocol positions.',
    schema: {
      example: { address: 'GABCD...EXAMPLE', positions: [] },
      type: 'object',
    },
  })
  async getPositions(@Param('address') address: string) {
    this.logger.log(`Fetching indexed positions for address: ${address}`);
    const positions = await this.indexerService.getPositions(address);
    return {
      address,
      positions,
    };
  }

  @Get('transactions/:address')
  @ApiOperation({ summary: 'Return indexed transactions for a wallet address' })
  @ApiParam({ name: 'address', example: 'GABCD...EXAMPLE' })
  @ApiOkResponse({
    description: 'Wallet address and indexed protocol transactions.',
    schema: {
      example: { address: 'GABCD...EXAMPLE', transactions: [] },
      type: 'object',
    },
  })
  async getTransactions(@Param('address') address: string) {
    this.logger.log(`Fetching indexed transactions for address: ${address}`);
    const transactions = await this.indexerService.getTransactions(address);
    return {
      address,
      transactions,
    };
  }

  @Post('replay')
  @ApiOperation({ summary: 'Trigger a replay of indexed contract events' })
  @ApiOkResponse({
    description: 'Confirmation that replay was queued or started.',
    schema: {
      example: {
        message:
          'Replay triggered successfully. Indexer checkpoint reset to start.',
      },
      type: 'object',
    },
  })
  async triggerReplay() {
    this.logger.log('Manually triggered database replay of contract events...');
    await this.indexerService.forceReplay();
    return {
      message:
        'Replay triggered successfully. Indexer checkpoint reset to start.',
    };
  }
}
