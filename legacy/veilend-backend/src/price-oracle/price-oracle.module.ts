import { Module } from '@nestjs/common';
import { PriceOracleController } from './price-oracle.controller';
import { PriceOracleService } from './price-oracle.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [PriceOracleController],
  providers: [PriceOracleService],
  exports: [PriceOracleService],
})
export class PriceOracleModule {}
