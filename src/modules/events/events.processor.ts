import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export const EVENT_QUEUE = 'events';

export type EventJobData =
  | { type: 'event_start'; eventId: number; code: string; name: string; config: any }
  | { type: 'event_end'; eventId: number; code: string }
  | { type: 'event_reminder'; eventId: number; code: string };

@Processor(EVENT_QUEUE, { concurrency: 5 })
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventsProcessor.name);

  // This processor is a thin dispatcher. The actual broadcast happens via Redis pub/sub
  // (see EventsGateway), so this code can run on a separate worker instance too.
  async process(job: Job<EventJobData>): Promise<any> {
    const data = job.data;
    this.logger.log(`[${data.type}] ${job.name} :: ${JSON.stringify(data)}`);
    // No-op stub: real broadcast happens in EventsGateway which subscribes to the same channel.
    return { processed: true, ts: Date.now() };
  }
}
