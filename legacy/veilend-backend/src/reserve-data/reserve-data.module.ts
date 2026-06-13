import { Module } from '@nestjs/common';
import { ReserveDataController } from './reserve-data.controller';
import { ReserveDataService } from './reserve-data.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [ReserveDataController],
  providers: [ReserveDataService],
  exports: [ReserveDataService],
})
export class ReserveDataModule {}
