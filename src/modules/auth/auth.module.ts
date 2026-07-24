import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { OAuthController } from './oauth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { DeviceCodeService } from './services/device-code.service';

import { User } from '../../database/entities/user.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { AuthIdentity } from '../../database/entities/auth-identity.entity';
import { SessionModule } from '../session/session.module';

/**
 * OAuth strategies are registered ONLY if credentials are present in env.
 * This lets the server boot and serve local auth before you wire up Google/FB.
 * If you add credentials later, restart the server to register them.
 */
const hasGoogleCreds = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const hasFacebookCreds = !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_APP_SECRET;

const oauthProviders = [
  ...(hasGoogleCreds ? [GoogleStrategy] : []),
  ...(hasFacebookCreds ? [FacebookStrategy] : []),
];

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserProfile, AuthIdentity]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN', '7d') as any },
      }),
    }),
    SessionModule, // gives us REDIS_CLIENT for DeviceCodeService
  ],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, JwtStrategy, DeviceCodeService, ...oauthProviders],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
