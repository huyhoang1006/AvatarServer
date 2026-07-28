import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';

import { Event } from '../../database/entities/event.entity';
import { EventLog } from '../../database/entities/event-log.entity';
import { Leaderboard } from '../../database/entities/leaderboard.entity';
import { CreateEventDto, ScoreEventDto } from './dto/event.dto';
import { EVENT_QUEUE, EventJobData } from './events.processor';
import { REDIS_CLIENT } from '../session/redis.provider';

const LB_KEY = (eventId: number) => `leaderboard:${eventId}`;
const PUB_CHANNEL = 'events:broadcast';

// Trần mặc định, ghi đè được cho từng sự kiện qua config.maxActionsPerMinute / config.maxScore
const DEFAULT_MAX_ACTIONS_PER_MINUTE = 60;
const DEFAULT_MAX_EVENT_SCORE = 100_000;

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(EventLog) private readonly logs: Repository<EventLog>,
    @InjectRepository(Leaderboard) private readonly lb: Repository<Leaderboard>,
    @InjectQueue(EVENT_QUEUE) private readonly queue: Queue<EventJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    // Reschedule any active/scheduled events that survived a restart
    const upcoming = await this.events.find({
      where: [{ status: 'scheduled' }, { status: 'active' }],
    });
    for (const e of upcoming) {
      await this.scheduleEvent(e);
    }
    this.logger.log(`Rescheduled ${upcoming.length} events on boot`);
  }

  async create(dto: CreateEventDto) {
    const e = this.events.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      scope: dto.scope ?? 'global',
      config: dto.config ?? {},
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      status: 'scheduled',
    });
    const saved = await this.events.save(e);
    // The row is already committed at this point, so a queue failure must not turn into
    // a 500 — that would report "failed" for an event the caller can see in GET /events.
    try {
      await this.scheduleEvent(saved);
    } catch (err) {
      this.logger.error(`Không hẹn giờ được event ${saved.code}: ${err}`);
      return { ...saved, scheduled: false };
    }
    return { ...saved, scheduled: true };
  }

  /**
   * Queue BullMQ jobs to flip status at startAt/endAt.
   * The actual broadcast happens via Redis pub/sub (decoupled, multi-instance safe).
   */
  private async scheduleEvent(e: Event) {
    const now = Date.now();
    const startMs = new Date(e.startAt).getTime();
    const endMs = new Date(e.endAt).getTime();

    // BullMQ rejects a jobId containing ':' ("Custom Id cannot contain :"), so these
    // ids use '-'. Keep them stable — re-scheduling relies on removing the old ones.
    const startJobId = `event_start-${e.id}`;
    const endJobId = `event_end-${e.id}`;

    await this.queue.remove(startJobId);
    await this.queue.remove(endJobId);

    if (startMs > now) {
      await this.queue.add(
        startJobId,
        { type: 'event_start', eventId: e.id, code: e.code, name: e.name, config: e.config },
        { jobId: startJobId, delay: startMs - now, removeOnComplete: true },
      );
    }
    if (endMs > now) {
      await this.queue.add(
        endJobId,
        { type: 'event_end', eventId: e.id, code: e.code },
        { jobId: endJobId, delay: endMs - now, removeOnComplete: true },
      );
    }
  }

  async activate(eventId: number) {
    const e = await this.events.findOne({ where: { id: eventId } });
    if (!e) throw new NotFoundException();
    e.status = 'active';
    await this.events.save(e);
    await this.redis.publish(
      PUB_CHANNEL,
      JSON.stringify({ type: 'event_start', code: e.code, name: e.name, config: e.config }),
    );
    return e;
  }

  async end(eventId: number) {
    const e = await this.events.findOne({ where: { id: eventId } });
    if (!e) throw new NotFoundException();
    e.status = 'ended';
    await this.events.save(e);
    await this.redis.publish(
      PUB_CHANNEL,
      JSON.stringify({ type: 'event_end', code: e.code, eventId: e.id }),
    );
    // Snapshot leaderboard to Postgres when event ends
    await this.snapshotLeaderboard(e.id);

    // Dọn key Redis sau khi đã snapshot. Không dọn thì một sự kiện sau trùng id
    // (hay gặp nhất là sau khi wipe DB lúc dev) sẽ thừa hưởng điểm cũ.
    await this.redis.del(LB_KEY(e.id));
    const rateKeys = await this.redis.keys(`event:rate:${e.id}:*`);
    if (rateKeys.length) await this.redis.del(...rateKeys);

    return e;
  }

  async list() {
    return this.events.find({ order: { startAt: 'DESC' }, take: 50 });
  }

  // ---- Per-user scoring during an event ----

  async scoreEvent(userId: number, username: string, eventCode: string, dto: ScoreEventDto) {
    const ev = await this.events.findOne({ where: { code: eventCode } });
    if (!ev || ev.status !== 'active') {
      return { ok: false, reason: 'event_not_active' };
    }

    // Game chơi offline là chính nên server không có cách nào thẩm định "tôi vừa
    // thu hoạch" là thật hay bịa. Thay vì giả vờ xác thực, đặt hai cái trần cứng:
    // số lần ghi điểm mỗi phút, và tổng điểm tối đa cho cả sự kiện. Người chơi
    // thật không bao giờ chạm tới, còn script cày thì bị chặn ở đây.
    const perMinute = Number(ev.config?.maxActionsPerMinute ?? DEFAULT_MAX_ACTIONS_PER_MINUTE);
    const rateKey = `event:rate:${ev.id}:${userId}`;
    const used = await this.redis.incr(rateKey);
    if (used === 1) {
      await this.redis.expire(rateKey, 60);
    }
    if (used > perMinute) {
      return { ok: false, reason: 'rate_limited' };
    }

    const points = (ev.config?.points as number) ?? 1;

    const maxScore = Number(ev.config?.maxScore ?? DEFAULT_MAX_EVENT_SCORE);
    const current = Number((await this.redis.zscore(LB_KEY(ev.id), String(userId))) ?? 0);
    if (current + points > maxScore) {
      return { ok: false, reason: 'score_cap_reached', score: current };
    }

    await this.logs.save(
      this.logs.create({
        eventId: ev.id,
        userId,
        action: dto.action,
        payload: dto.payload ?? {},
      }),
    );

    await this.redis.zincrby(LB_KEY(ev.id), points, String(userId));
    const total = await this.redis.zscore(LB_KEY(ev.id), String(userId));
    const rank = await this.redis.zrevrank(LB_KEY(ev.id), String(userId));

    return { ok: true, score: Number(total), rank: rank != null ? rank + 1 : null };
  }

  async getLeaderboard(eventCode: string, top = 50) {
    const ev = await this.events.findOne({ where: { code: eventCode } });
    if (!ev) throw new NotFoundException();
    const raw = await this.redis.zrevrange(LB_KEY(ev.id), 0, top - 1, 'WITHSCORES');
    const out: { userId: number; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ userId: Number(raw[i]), score: Number(raw[i + 1]) });
    }
    return { eventCode, entries: out };
  }

  private async snapshotLeaderboard(eventId: number) {
    const raw = await this.redis.zrevrange(LB_KEY(eventId), 0, -1, 'WITHSCORES');
    const rows: Partial<Leaderboard>[] = [];
    const now = new Date();
    for (let i = 0; i < raw.length; i += 2) {
      rows.push({
        eventId,
        userId: Number(raw[i]),
        score: Number(raw[i + 1]),
        snapshotAt: now,
      });
    }
    if (rows.length) await this.lb.save(rows);
  }

  static get PUB_CHANNEL() {
    return PUB_CHANNEL;
  }
}
