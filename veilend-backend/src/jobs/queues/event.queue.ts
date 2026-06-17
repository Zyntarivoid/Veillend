import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

export class EventQueue {
  constructor(
    @InjectQueue('events')
    private queue: Queue,
  ) {}

  async add(eventId: string) {
    await this.queue.add(
      'process-event',
      {
        eventId,
      },
      {
        attempts: 5,
        backoff: 5000,
      },
    );
  }
}
