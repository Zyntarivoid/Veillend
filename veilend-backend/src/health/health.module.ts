import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { StellarModule } from '../stellar/stellar.module';
import { IndexerModule } from '../indexer/indexer.module';
import { ProtocolModule } from '../protocol/protocol.module';

@Module({
  imports: [StellarModule, IndexerModule, ProtocolModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
