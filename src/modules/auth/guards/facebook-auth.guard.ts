import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class FacebookAuthGuard extends AuthGuard('facebook') {
  canActivate(context: ExecutionContext) {
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      throw new ServiceUnavailableException(
        'Đăng nhập Facebook chưa được cấu hình trên máy chủ',
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
