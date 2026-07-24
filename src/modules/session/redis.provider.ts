import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => {
    const client = new Redis({
      host: cfg.get<string>('REDIS_HOST', 'localhost'),
      port: cfg.get<number>('REDIS_PORT', 6379),
      password: cfg.get<string>('REDIS_PASSWORD') || undefined,
      db: cfg.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: null, // required for BullMQ blocking commands
      enableReadyCheck: true,
    });
    client.on('error', (e) => console.error('[redis]', e));
    return client;
  },
};
