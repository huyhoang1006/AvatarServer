import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';

/**
 * Validates JWT supplied via either:
 *   - Authorization: Bearer <token>  header
 *   - ?token=<token>  query string (handy for Godot where setting headers is awkward)
 *
 * On success, attaches { userId, username } to the socket's data.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    // The `ws` package does not expose the upgrade request on the socket, so the
    // gateway stashes it in handleConnection().
    const req = client.request as IncomingMessage | undefined;
    if (!req) throw new WsException('Missing request');

    let token: string | undefined;

    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      token = auth.slice(7);
    } else if (req.url) {
      const url = new URL(req.url, 'http://localhost');
      token = url.searchParams.get('token') ?? undefined;
    }

    if (!token) throw new WsException('Missing token');

    try {
      const payload = this.jwt.verify<{ sub: number; username: string }>(token, {
        secret: this.cfg.getOrThrow<string>('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}
