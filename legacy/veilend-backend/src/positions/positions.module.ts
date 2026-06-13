import { Module } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';

@Module({
  controllers: [PositionsController],
  providers: [PositionsService],
})
export class PositionsModule {}
