import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Wraps passport-google-oauth20 with dynamic state (the device code) so
 * the callback handler can correlate the OAuth result with the polling client.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    // AuthModule chỉ đăng ký strategy khi có GOOGLE_CLIENT_ID/SECRET. Thiếu thì
    // passport ném "Unknown authentication strategy" -> 500 rất khó hiểu.
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new ServiceUnavailableException(
        'Đăng nhập Google chưa được cấu hình trên máy chủ',
      );
    }
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return {
      state: req.query.state as string,
      session: false,
    };
  }
}
