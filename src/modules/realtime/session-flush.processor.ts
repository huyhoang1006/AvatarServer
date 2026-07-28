import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { SessionService } from '../session/session.service';
import { UsersService } from '../users/users.service';
import { stripTransient } from './session-state.util';

export const SESSION_QUEUE = 'session';

export interface SessionFlushJob {
  userId: number;
}

export const flushJobId = (userId: number) => `session_flush-${userId}`;

/**
 * Lưới an toàn cho trường hợp người chơi mất kết nối rồi không quay lại.
 *
 * Khi socket đứt, gateway hẹn một job sau đúng grace period. Người chơi vào lại
 * trước hạn thì job bị huỷ. Quá hạn thì job này ghi state cuối cùng từ Redis
 * xuống Postgres rồi mới xoá — nếu không, key Redis hết TTL là mất trắng phần
 * chưa kịp save.
 */
@Processor(SESSION_QUEUE, { concurrency: 5 })
export class SessionFlushProcessor extends WorkerHost {
  private readonly logger = new Logger(SessionFlushProcessor.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {
    super();
  }

  async process(job: Job<SessionFlushJob>): Promise<any> {
    const { userId } = job.data;

    const flushed = await this.sessions.saveToDb(userId, async (state) => {
      await this.users.patchProfile(userId, { data: stripTransient(state) });
    });

    if (flushed) {
      await this.sessions.destroy(userId);
      this.logger.log(`Đã lưu và dọn session của user ${userId} sau grace period`);
    } else {
      // Session đã biến mất (người chơi tự save rồi thoát, hoặc TTL hết sớm).
      this.logger.debug(`User ${userId} không còn session để flush`);
    }

    return { flushed, ts: Date.now() };
  }
}
