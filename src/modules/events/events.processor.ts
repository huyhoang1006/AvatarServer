import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventsService } from './events.service';

export const EVENT_QUEUE = 'events';

export type EventJobData =
  | { type: 'event_start'; eventId: number; code: string; name: string; config: any }
  | { type: 'event_end'; eventId: number; code: string }
  | { type: 'event_reminder'; eventId: number; code: string };

/**
 * Flips event status at startAt/endAt. The broadcast to connected clients happens
 * inside EventsService via Redis pub/sub, so RealtimeGateway can live on another
 * instance and still receive it.
 */
@Processor(EVENT_QUEUE, { concurrency: 5 })
export class EventsProcessor extends WorkerHost {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    @Inject(forwardRef(() => EventsService))
    private readonly events: EventsService,
  ) {
    super();
  }

  async process(job: Job<EventJobData>): Promise<any> {
    const data = job.data;
    this.logger.log(`[${data.type}] ${job.name} :: eventId=${data.eventId}`);

    switch (data.type) {
      case 'event_start':
        await this.events.activate(data.eventId);
        break;
      case 'event_end':
        await this.events.end(data.eventId);
        break;
      default:
        // event_reminder chưa dùng tới
        break;
    }

    return { processed: true, ts: Date.now() };
  }
}
