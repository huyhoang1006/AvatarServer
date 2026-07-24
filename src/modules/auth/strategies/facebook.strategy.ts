import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { OAuthProfile } from './google.strategy';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  private readonly logger = new Logger(FacebookStrategy.name);

  constructor(cfg: ConfigService) {
    super({
      clientID: cfg.getOrThrow<string>('FACEBOOK_APP_ID'),
      clientSecret: cfg.getOrThrow<string>('FACEBOOK_APP_SECRET'),
      callbackURL: cfg.getOrThrow<string>('FACEBOOK_CALLBACK_URL'),
      // Required to receive email + name fields
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
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
        provider: 'facebook',
        providerUserId: profile.id,
        email: profile.emails?.[0]?.value ?? null,
        displayName: profile.name
          ? `${profile.name.givenName ?? ''} ${profile.name.familyName ?? ''}`.trim() || null
          : null,
        avatar: profile.photos?.[0]?.value ?? null,
      };
      done(null, out);
    } catch (err) {
      this.logger.error('Facebook validate failed', err as any);
      done(err as any, undefined);
    }
  }
}
