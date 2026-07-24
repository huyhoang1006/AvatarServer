import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

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

    // ---- Feature modules ----
    AuthModule,
    UsersModule,
    InventoryModule,
    SessionModule,
    EventsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
