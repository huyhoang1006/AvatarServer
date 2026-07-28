import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { RealtimeGateway } from './realtime.gateway';
import { SessionFlushProcessor, SESSION_QUEUE } from './session-flush.processor';
import { SessionModule } from '../session/session.module';
import { EventsModule } from '../events/events.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

// Job flush session nằm ở đây chứ không ở SessionModule: nó cần UsersService, mà
// SessionModule -> UsersModule -> AuthModule -> SessionModule sẽ thành vòng lặp.
@Module({
  imports: [
    SessionModule,
    EventsModule,
    UsersModule,
    AuthModule,
    BullModule.registerQueue({ name: SESSION_QUEUE }),
  ],
  providers: [RealtimeGateway, SessionFlushProcessor],
})
export class RealtimeModule {}
