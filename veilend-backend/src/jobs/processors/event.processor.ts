import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';

@Processor('events')
export class EventProcessor {
  @Process('process-event')
  handle(job: Job<{ eventId: number }>) {
    const { eventId } = job.data;

    this.processEvent(eventId);
  }

  private processEvent(eventId: number) {
    console.log('Processing event:', eventId);
  }
}
