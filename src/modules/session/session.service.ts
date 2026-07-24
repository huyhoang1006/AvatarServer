import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { SessionState } from '../../common/types/jwt-payload';
import { REDIS_CLIENT } from './redis.provider';

const SESSION_KEY = (uid: number) => `session:${uid}`;
const ONLINE_SET = 'session:online';

/**
 * SessionService stores per-user mid-game state in Redis with a TTL.
 *
 * Lifecycle:
 *   - login          → start(userId) loads profile from DB into Redis
 *   - WS message     → patch(userId, partial) updates in-memory state
 *   - WS disconnect  → keep in Redis for GRACE_PERIOD_SECONDS
 *   - GRACE expires  → autoSave flushes to DB, then deletes Redis key
 *   - explicit save  → saveToDb(userId) flushes immediately
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly ttl: number;
  private readonly grace: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    cfg: ConfigService,
  ) {
    this.ttl = cfg.get<number>('SESSION_TTL_SECONDS', 1800);
    this.grace = cfg.get<number>('GRACE_PERIOD_SECONDS', 300);
  }

  async start(userId: number, username: string, initial: Partial<SessionState> = {}) {
    const state: SessionState = {
      userId,
      username,
      lastSavedAt: Date.now(),
      ...initial,
    };
    await this.redis.set(SESSION_KEY(userId), JSON.stringify(state), 'EX', this.ttl);
    await this.redis.sadd(ONLINE_SET, String(userId));
    return state;
  }

  async get(userId: number): Promise<SessionState | null> {
    const raw = await this.redis.get(SESSION_KEY(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionState;
    } catch {
      return null;
    }
  }

  async patch(userId: number, partial: Partial<SessionState>) {
    const cur = await this.get(userId);
    if (!cur) return null;
    const next = { ...cur, ...partial };
    await this.redis.set(SESSION_KEY(userId), JSON.stringify(next), 'EX', this.ttl);
    return next;
  }

  /**
   * Called when the WS socket disconnects. Resets TTL to grace period.
   * If user reconnects before grace expires, session is still intact.
   */
  async disconnect(userId: number) {
    await this.redis.srem(ONLINE_SET, String(userId));
    const exists = await this.redis.exists(SESSION_KEY(userId));
    if (exists) {
      await this.redis.expire(SESSION_KEY(userId), this.grace);
      this.logger.debug(`User ${userId} disconnected, grace=${this.grace}s`);
    }
  }

  async isOnline(userId: number) {
    return (await this.redis.sismember(ONLINE_SET, String(userId))) === 1;
  }

  async onlineUserIds(): Promise<number[]> {
    const ids = await this.redis.smembers(ONLINE_SET);
    return ids.map((s) => Number(s));
  }

  async destroy(userId: number) {
    await this.redis.del(SESSION_KEY(userId));
    await this.redis.srem(ONLINE_SET, String(userId));
  }

  /**
   * Hook for flushing state to PostgreSQL. Caller injects the persistence logic
   * (e.g. via a closure passed at boot) to avoid circular module deps.
   */
  async saveToDb(userId: number, persist: (state: SessionState) => Promise<void>) {
    const state = await this.get(userId);
    if (!state) return false;
    await persist(state);
    await this.patch(userId, { lastSavedAt: Date.now() });
    return true;
  }
}
