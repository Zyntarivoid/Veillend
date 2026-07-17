import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';

@Processor('events')
export class EventProcessor {
  private readonly logger = new Logger(EventProcessor.name);

  @Process('process-event')
  handle(job: Job<{ eventId: number }>) {
    const { eventId } = job.data;

    this.processEvent(eventId);
  }

  private processEvent(eventId: number) {
    this.logger.log(`Processing event: ${eventId}`);
  }
}
