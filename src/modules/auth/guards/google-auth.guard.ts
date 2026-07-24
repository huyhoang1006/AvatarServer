import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Wraps passport-google-oauth20 with dynamic state (the device code) so
 * the callback handler can correlate the OAuth result with the polling client.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return {
      state: req.query.state as string,
      session: false,
    };
  }
}
