import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { SessionModule } from '../session/session.module';
import { EventsModule } from '../events/events.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SessionModule, EventsModule, UsersModule, AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
