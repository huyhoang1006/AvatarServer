import { Controller, Get, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { DeviceCodeService } from './services/device-code.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { OAuthProfile } from './strategies/google.strategy';
import { renderChooser, renderDone } from './views/auth-views';

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly deviceCodes: DeviceCodeService,
    private readonly cfg: ConfigService,
  ) {}

  // ============================================================
  // Browser-side: user opens this URL in their browser
  // ============================================================

  @Get('oauth')
  async chooser(@Query('code') code: string, @Res() res: Response) {
    if (!code) return res.status(400).send('Missing code');
    const entry = await this.deviceCodes.get(code);
    if (!entry) {
      return res.status(200).send(renderChooser(code, 'Code không tồn tại hoặc đã hết hạn'));
    }
    return res.status(200).send(renderChooser(code));
  }

  // ============================================================
  // Google OAuth
  // ============================================================

  @Get('google/login')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Guard handles redirect to Google; handler never runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') state: string,
  ) {
    return this.handleOAuth(req, res, state, req.user as OAuthProfile);
  }

  // ============================================================
  // Facebook OAuth
  // ============================================================

  @Get('facebook/login')
  @UseGuards(FacebookAuthGuard)
  facebookLogin() {
    // Guard handles redirect to Facebook; handler never runs.
  }

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  async facebookCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') state: string,
  ) {
    return this.handleOAuth(req, res, state, req.user as OAuthProfile);
  }

  // ============================================================
  // /auth/done — final HTML page shown after OAuth round-trip
  // ============================================================

  @Get('done')
  async done(
    @Query('code') code: string,
    @Query('mode') mode: 'login' | 'link',
    @Query('provider') provider: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.status(200).send(renderDone({ success: false, mode: mode ?? 'login', error }));
    }
    if (!code) {
      return res.status(200).send(renderDone({ success: false, mode: 'login', error: 'Thiếu code' }));
    }
    return res.status(200).send(renderDone({ success: true, mode: mode ?? 'login', provider }));
  }

  // ============================================================
  // Shared handler for both providers
  // ============================================================

  private async handleOAuth(
    _req: Request,
    res: Response,
    state: string,
    profile: OAuthProfile,
  ) {
    if (!state) {
      return res.redirect(`/auth/done?error=${encodeURIComponent('Thiếu state')}`);
    }
    const entry = await this.deviceCodes.get(state);
    if (!entry) {
      return res.redirect(`/auth/done?error=${encodeURIComponent('Code không tồn tại hoặc đã hết hạn')}`);
    }

    try {
      if (entry.mode === 'link') {
        if (!entry.userId) throw new Error('Link mode thiếu userId');
        await this.auth.linkProviderToUser(entry.userId, profile);
        await this.deviceCodes.markLinkCompleted(state, profile.provider);
        return res.redirect(`/auth/done?code=${state}&mode=link&provider=${profile.provider}`);
      }

      // mode === 'login'
      const user = await this.auth.findOrCreateOAuthUser(profile);
      const tokenResult = this.auth.issueToken(user);
      await this.deviceCodes.markCompleted(state, {
        accessToken: tokenResult.accessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
        },
      });
      return res.redirect(`/auth/done?code=${state}&mode=login&provider=${profile.provider}`);
    } catch (err: any) {
      this.logger.error(`OAuth failed for ${profile.provider}: ${err?.message}`, err?.stack);
      const msg = err?.message ?? 'OAuth failed';
      await this.deviceCodes.markError(state, msg).catch(() => {});
      return res.redirect(`/auth/done?code=${state}&error=${encodeURIComponent(msg)}`);
    }
  }
}
