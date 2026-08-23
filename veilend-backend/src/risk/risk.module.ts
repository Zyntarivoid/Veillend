import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../config/config.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StellarModule } from '../stellar/stellar.module';
import { OraclePriceService } from './oracle-price.service';
import { PositionRiskScannerService } from './position-risk-scanner.service';
import { RiskController } from './risk.controller';
import { RiskReadService } from './risk-read.service';
import { RiskRepository } from './risk.repository';

/**
 * Liquidation pipeline: periodic position-risk scanning, oracle price
 * reads, the persisted liquidation queue, and the admin/user endpoints.
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    StellarModule,
    NotificationsModule,
  ],
  controllers: [RiskController],
  providers: [
    RiskRepository,
    OraclePriceService,
    RiskReadService,
    PositionRiskScannerService,
  ],
  exports: [
    RiskRepository,
    OraclePriceService,
    RiskReadService,
    PositionRiskScannerService,
  ],
})
export class RiskModule {}
