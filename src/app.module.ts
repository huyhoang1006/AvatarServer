import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SessionModule } from './modules/session/session.module';
import { EventsModule } from './modules/events/events.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    // ---- Config (env) ----
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ---- PostgreSQL via TypeORM ----
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get<string>('DB_USERNAME', 'avatar'),
        password: cfg.get<string>('DB_PASSWORD', 'avatar_pass'),
        database: cfg.get<string>('DB_NAME', 'avatar_farm'),
        autoLoadEntities: true,
        synchronize: cfg.get<string>('DB_SYNCHRONIZE', 'true') === 'true',
        logging: cfg.get<string>('NODE_ENV') === 'development' ? ['error', 'warn'] : false,
      }),
    }),

    // ---- BullMQ (Redis-backed jobs) ----
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.get<string>('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    // ---- Rate limit ----
    // Mức nền cho toàn bộ API. Các endpoint nhạy cảm (login/register/poll) siết
    // chặt hơn bằng @Throttle() ngay tại controller.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        // Bộ test tích hợp tạo hàng chục tài khoản một lượt nên sẽ tự đâm vào hạn
        // mức đăng ký. Cho phép tắt, nhưng chỉ ngoài production — đặt nhầm biến
        // này trên server thật cũng không tháo được rate limit.
        skipIf: () =>
          cfg.get<string>('NODE_ENV') !== 'production' &&
          cfg.get<string>('THROTTLE_DISABLED') === 'true',
      }),
    }),

    // ---- Feature modules ----
    AuthModule,
    UsersModule,
    InventoryModule,
    SessionModule,
    EventsModule,
    RealtimeModule,
  ],
  providers: [
    // ThrottlerGuard chỉ chặn HTTP; WebSocket không đi qua đây.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
