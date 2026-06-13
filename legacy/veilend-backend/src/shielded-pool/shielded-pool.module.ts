import { Module } from '@nestjs/common';
import { ShieldedPoolController } from './shielded-pool.controller';
import { ShieldedPoolService } from './shielded-pool.service';
import { StarknetModule } from '../starknet/starknet.module';

@Module({
  imports: [StarknetModule],
  controllers: [ShieldedPoolController],
  providers: [ShieldedPoolService],
  exports: [ShieldedPoolService],
})
export class ShieldedPoolModule {}
