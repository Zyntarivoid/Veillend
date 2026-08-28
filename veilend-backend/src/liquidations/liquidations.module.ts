import { Module } from '@nestjs/common';
import { LiquidationsController } from './liquidations.controller';
import { LiquidationsService } from './liquidations.service';

@Module({
  controllers: [LiquidationsController],
  providers: [LiquidationsService],
})
export class LiquidationsModule {}
