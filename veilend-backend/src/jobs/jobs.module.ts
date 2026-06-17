import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { Event } from '../events/events.entity';

import { BackfillProcessor } from './processors/backfill.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event]),

    BullModule.registerQueue(
      {
        name: 'events',
      },

      {
        name: 'backfill',
      },
    ),
  ],

  providers: [BackfillProcessor],
})
export class JobsModule {}
