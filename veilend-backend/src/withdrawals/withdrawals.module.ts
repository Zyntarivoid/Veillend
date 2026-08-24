import { Module } from '@nestjs/common';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalSolvencyService } from './withdrawal-solvency.service';
import { WithdrawalWatcherService } from './withdrawal-watcher.service';
import { AuthModule } from '../auth/auth.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProtocolModule } from '../protocol/protocol.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    StellarModule,
    NotificationsModule,
    ProtocolModule,
  ],
  controllers: [WithdrawalsController],
  providers: [
    WithdrawalsService,
    WithdrawalSolvencyService,
    WithdrawalWatcherService,
  ],
  exports: [WithdrawalsService, WithdrawalSolvencyService],
})
export class WithdrawalsModule {}
