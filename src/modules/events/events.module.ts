import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsProcessor, EVENT_QUEUE } from './events.processor';
import { Event } from '../../database/entities/event.entity';
import { EventLog } from '../../database/entities/event-log.entity';
import { Leaderboard } from '../../database/entities/leaderboard.entity';
import { User } from '../../database/entities/user.entity';
import { SessionModule } from '../session/session.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    // User có mặt ở đây vì AdminGuard được dựng trong context của module này
    // (@UseGuards tạo instance mới, không dùng lại provider export từ AuthModule).
    TypeOrmModule.forFeature([Event, EventLog, Leaderboard, User]),
    BullModule.registerQueue({ name: EVENT_QUEUE }),
    SessionModule, // for REDIS_CLIENT provider
    AuthModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventsProcessor],
  exports: [EventsService],
})
export class EventsModule {}
