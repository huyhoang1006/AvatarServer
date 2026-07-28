import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Server, WebSocket } from 'ws';

import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { SessionService } from '../session/session.service';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { REDIS_CLIENT } from '../session/redis.provider';
import { Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { SessionState } from '../../common/types/jwt-payload';
import { stripTransient } from './session-state.util';
import { SESSION_QUEUE, SessionFlushJob, flushJobId } from './session-flush.processor';

interface AuthedClient extends WebSocket {
  /** Upgrade request, stashed in handleConnection — `ws` doesn't keep it on the socket. */
  request?: IncomingMessage;
  data: {
    userId?: number;
    username?: string;
  };
}

/**
 * Real-time gateway. Messages are JSON:
 *   client → server: { type: "patch", state: { scene, position, ... } }
 *   client → server: { type: "save" }                       // flush Redis→DB
 *   client → server: { type: "ping" }
 *
 *   server → client: { type: "welcome", userId, ttl }
 *   server → client: { type: "patched", state }
 *   server → client: { type: "saved", at }
 *   server → client: { type: "event_start", code, name, config }
 *   server → client: { type: "event_end",   code }
 *   server → client: { type: "error", message }
 *   server → client: { type: "pong", t }
 */
@WebSocketGateway({ path: process.env.WS_PATH || '/ws' })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  private sub!: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly sessions: SessionService,
    private readonly events: EventsService,
    private readonly users: UsersService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(SESSION_QUEUE) private readonly sessionQueue: Queue<SessionFlushJob>,
  ) {}

  async onModuleInit() {
    // Dedicated connection for pub/sub subscriber
    this.sub = this.redis.duplicate();
    await this.sub.subscribe(EventsService.PUB_CHANNEL);
    this.sub.on('message', (channel, message) => {
      if (channel !== EventsService.PUB_CHANNEL) return;
      try {
        const payload = JSON.parse(message);
        this.broadcast(payload);
      } catch (e) {
        this.logger.error(`Bad pubsub message: ${e}`);
      }
    });
    this.logger.log(`Subscribed to ${EventsService.PUB_CHANNEL}`);
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: AuthedClient, req: IncomingMessage) {
    // Auth happens on the first message via WsJwtGuard (more forgiving than on connect,
    // because Godot clients may set headers late), so keep the upgrade request around —
    // that's where the ?token= query string and Authorization header live.
    client.request = req;
    client.data = {};
    this.logger.debug(`+ connection (pending auth)`);
  }

  async handleDisconnect(client: AuthedClient) {
    const uid = client.data?.userId;
    if (!uid) return;

    await this.sessions.disconnect(uid);

    // Hẹn giờ lưu nốt: quá grace period mà không quay lại thì job này ghi state
    // cuối xuống Postgres rồi dọn Redis. Vào lại trước hạn thì onAuth huỷ nó.
    const graceMs = this.sessions.gracePeriodSeconds * 1000;
    await this.sessionQueue.remove(flushJobId(uid));
    await this.sessionQueue.add(
      flushJobId(uid),
      { userId: uid },
      { jobId: flushJobId(uid), delay: graceMs, removeOnComplete: true, removeOnFail: 100 },
    );

    this.logger.debug(`- user ${uid} disconnected, hen flush sau ${graceMs / 1000}s`);
  }

  @SubscribeMessage('auth')
  async onAuth(
    @ConnectedSocket() client: AuthedClient,
    @MessageBody() body: { token?: string },
  ) {
    const guard = new WsJwtGuard(this.jwt, this.cfg);
    // Fake an ExecutionContext so we can reuse the guard logic
    const ctx = {
      switchToWs: () => ({ getClient: () => client }),
    } as any;
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      return { type: 'error', message: e?.message ?? 'unauthorized' };
    }

    // Set by the guard above; if either is missing the guard would have thrown.
    const userId = client.data.userId!;
    const username = client.data.username ?? '';

    // Quay lại kịp trong grace period — huỷ job flush đang chờ, nếu không nó sẽ
    // xoá mất session ngay giữa lúc đang chơi.
    await this.sessionQueue.remove(flushJobId(userId));

    // Còn session trong Redis nghĩa là vừa rớt mạng và quay lại kịp — giữ nguyên
    // state đang dở. Chỉ khi không còn gì mới nạp lại từ Postgres.
    //
    // Blob lưu được spread phẳng vào session; bọc nó dưới key `data` sẽ khiến mỗi
    // vòng save→load lồng thêm một tầng.
    let state = await this.sessions.resume(userId);
    if (!state) {
      const profile = await this.users.getProfile(userId);
      state = await this.sessions.start(
        userId,
        username,
        stripTransient(profile.data as Record<string, any> | null),
      );
    }

    return { type: 'welcome', userId, username, ttl: state };
  }

  @SubscribeMessage('patch')
  async onPatch(
    @ConnectedSocket() client: AuthedClient,
    @MessageBody() body: { state?: Partial<SessionState> },
  ) {
    if (!client.data?.userId) return { type: 'error', message: 'not_authenticated' };
    const next = await this.sessions.patch(client.data.userId, body.state ?? {});
    return { type: 'patched', state: next };
  }

  @SubscribeMessage('save')
  async onSave(@ConnectedSocket() client: AuthedClient) {
    if (!client.data?.userId) return { type: 'error', message: 'not_authenticated' };
    const userId = client.data.userId;
    const ok = await this.sessions.saveToDb(userId, async (state) => {
      // The session already holds everything that was loaded at auth time, so this is a
      // straight replace — merging the stored blob back in would resurrect stale keys.
      await this.users.patchProfile(userId, { data: stripTransient(state) });
    });
    return ok ? { type: 'saved', at: Date.now() } : { type: 'error', message: 'no_active_session' };
  }

  @SubscribeMessage('ping')
  onPing(@MessageBody() body: { t?: number }) {
    return { type: 'pong', t: body?.t ?? Date.now() };
  }

  // ---- Internal broadcast helper ----
  private broadcast(payload: Record<string, any>) {
    const msg = JSON.stringify(payload);
    for (const ws of this.server.clients) {
      if ((ws as WebSocket).readyState === WebSocket.OPEN) {
        (ws as WebSocket).send(msg);
      }
    }
  }
}
