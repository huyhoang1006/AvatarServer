import { Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { SessionService } from './session.service';

@Module({
  providers: [redisProvider, SessionService],
  exports: [SessionService, redisProvider],
})
export class SessionModule {}
