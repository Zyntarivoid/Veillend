import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { rpc } from '@stellar/stellar-sdk';
import { AppConfigService } from '../config/app-config.service';
import { SorobanRpcService } from '../stellar/soroban-rpc.service';
import { IndexerService } from '../indexer/indexer.service';
import { AdminActionRepository } from './admin-action.repository';

/**
 * Watches Soroban RPC for admin action intents that have been reported as
 * submitted (status SENT) and flips them to CONFIRMED or FAILED based on the
 * on-chain outcome of the recorded txHash. On confirmation it opportunistically
 * triggers the event indexer so any events emitted by the mutation are picked
 * up immediately (the indexer also picks them up on its normal poll cycle).
 */
@Injectable()
export class AdminActionWatcherService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AdminActionWatcherService.name);
  private isProcessing = false;
  private pollTimeout?: NodeJS.Timeout;

  constructor(
    private readonly configService: AppConfigService,
    private readonly rpcService: SorobanRpcService,
    private readonly repository: AdminActionRepository,
    private readonly indexerService: IndexerService,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Starting admin action watcher polling loop...');
    this.startPolling();
  }

  onModuleDestroy() {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
  }

  private startPolling() {
    const interval = this.configService.adminActions.watcherPollIntervalMs;
    this.pollTimeout = setTimeout(() => {
      void this.runWatcher().then(() => {
        this.startPolling();
      });
    }, interval);
  }

  /**
   * One watch cycle: resolve every SENT action against Soroban RPC. NOT_FOUND
   * results are left for the next cycle (the transaction may not have been
   * included yet).
   */
  async runWatcher() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      const pending = await this.repository.findSubmitted();
      for (const action of pending) {
        if (!action.txHash) {
          continue;
        }
        try {
          const result = await this.rpcService
            .getClient()
            .getTransaction(action.txHash);

          if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            await this.repository.markConfirmed(action.id);
            this.logger.log(
              `Admin action ${action.id} confirmed on-chain (tx ${action.txHash})`,
            );
            // Opportunistic re-ingest so emitted events surface immediately.
            void this.indexerService.runIndexer().catch((error) => {
              this.logger.warn(
                `Failed to re-run indexer after confirming action ${action.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
          } else if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
            await this.repository.markFailed(
              action.id,
              'Transaction failed on-chain',
            );
            this.logger.warn(
              `Admin action ${action.id} failed on-chain (tx ${action.txHash})`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to poll admin action ${action.id} tx ${action.txHash}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in admin action watcher cycle: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
