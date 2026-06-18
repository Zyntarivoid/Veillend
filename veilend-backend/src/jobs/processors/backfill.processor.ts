import { Processor, Process } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

import { Event } from '../../events/events.entity';

@Processor('backfill')
export class BackfillProcessor {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,

    @InjectQueue('events')
    private readonly eventQueue: Queue,
  ) {}

  @Process('events-backfill')
  async process() {
    const events = await this.eventRepository.find();

    for (const event of events) {
      await this.eventQueue.add('process-event', {
        eventId: event.id,
      });
    }
  }
}
