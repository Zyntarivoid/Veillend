import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminActionRepository } from './admin-action.repository';
import { AdminTransactionBuilderService } from './admin-transaction-builder.service';
import { AdminActionWatcherService } from './admin-action-watcher.service';
import { AuthModule } from '../auth/auth.module';
import { StellarModule } from '../stellar/stellar.module';
import { IndexerModule } from '../indexer/indexer.module';
import { ConfigModule } from '../config/config.module';
import { ProtocolModule } from '../protocol/protocol.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [ConfigModule, AuthModule, StellarModule, IndexerModule, ProtocolModule, AssetsModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminActionRepository,
    AdminTransactionBuilderService,
    AdminActionWatcherService,
  ],
})
export class AdminModule {}
