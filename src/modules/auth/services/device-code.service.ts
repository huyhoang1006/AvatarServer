import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { REDIS_CLIENT } from '../../session/redis.provider';

export type DeviceMode = 'login' | 'link';

export interface DeviceCodeEntry {
  status: 'pending' | 'completed';
  mode: DeviceMode;
  userId?: number; // for 'link' mode
  provider?: 'google' | 'facebook';
  result?: {
    accessToken: string;
    user: { id: number; username: string | null; email: string | null; displayName: string | null };
  };
  error?: string;
}

const KEY = (code: string) => `auth:device:${code}`;
const TTL_SECONDS = 600; // 10 minutes — plenty for OAuth round-trip

/** Friendly code like "ABCD-1234". 8 chars, easy to read & type. */
function generateCode(): string {
  const raw = randomBytes(6).toString('base64').replace(/[+/=]/g, '').toUpperCase().slice(0, 8);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

@Injectable()
export class DeviceCodeService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly cfg: ConfigService,
  ) {}

  private baseUrl(): string {
    return this.cfg.get<string>('PUBLIC_BASE_URL', 'http://localhost:3000');
  }

  async create(mode: DeviceMode, userId?: number): Promise<{
    deviceCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  }> {
    let code = generateCode();
    // ensure unique
    for (let i = 0; i < 5; i++) {
      const exists = await this.redis.exists(KEY(code));
      if (!exists) break;
      code = generateCode();
    }

    const entry: DeviceCodeEntry = { status: 'pending', mode, userId };
    await this.redis.set(KEY(code), JSON.stringify(entry), 'EX', TTL_SECONDS);

    return {
      deviceCode: code,
      verificationUri: `${this.baseUrl()}/auth/oauth?code=${code}`,
      expiresIn: TTL_SECONDS,
      interval: 2,
    };
  }

  async get(code: string): Promise<DeviceCodeEntry | null> {
    const raw = await this.redis.get(KEY(code));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DeviceCodeEntry;
    } catch {
      return null;
    }
  }

  async markCompleted(code: string, result: DeviceCodeEntry['result']) {
    const cur = await this.get(code);
    if (!cur) return false;
    cur.status = 'completed';
    cur.result = result;
    await this.redis.set(KEY(code), JSON.stringify(cur), 'EX', TTL_SECONDS);
    return true;
  }

  async markLinkCompleted(code: string, provider: 'google' | 'facebook') {
    const cur = await this.get(code);
    if (!cur) return false;
    cur.status = 'completed';
    cur.provider = provider;
    await this.redis.set(KEY(code), JSON.stringify(cur), 'EX', TTL_SECONDS);
    return true;
  }

  async markError(code: string, error: string) {
    const cur = await this.get(code);
    if (!cur) return false;
    cur.status = 'completed';
    cur.error = error;
    await this.redis.set(KEY(code), JSON.stringify(cur), 'EX', TTL_SECONDS);
    return true;
  }

  async delete(code: string) {
    await this.redis.del(KEY(code));
  }
}
