import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface OAuthProfile {
  provider: 'google' | 'facebook';
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatar: string | null;
}

/**
 * We don't use Passport sessions. After verifying, we stash the device code (passed via `state`)
 * on the returned object so the callback route handler can pick it up via req.user.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(cfg: ConfigService) {
    super({
      clientID: cfg.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: cfg.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: cfg.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const out: OAuthProfile = {
        provider: 'google',
        providerUserId: profile.id,
        email: profile.emails?.[0]?.value ?? null,
        displayName: profile.displayName ?? null,
        avatar: profile.photos?.[0]?.value ?? null,
      };
      done(null, out);
    } catch (err) {
      this.logger.error('Google validate failed', err as any);
      done(err as any, undefined);
    }
  }
}
