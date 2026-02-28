import { Module } from '@nestjs/common';
import { LendingPoolController } from './lending-pool.controller';
import { LendingPoolService } from './lending-pool.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [LendingPoolController],
  providers: [LendingPoolService],
  exports: [LendingPoolService],
})
export class LendingPoolModule {}
