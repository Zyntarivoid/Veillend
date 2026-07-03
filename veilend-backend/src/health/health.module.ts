import { Module } from '@nestjs/common';
import { StellarModule } from '../stellar/stellar.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [StellarModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
