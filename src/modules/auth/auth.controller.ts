import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { DeviceCodeService } from './services/device-code.service';
import { LoginDto, PollDeviceDto, RegisterDto, StartDeviceDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthProvider } from '../../database/entities/auth-identity.entity';

interface JwtPayload {
  sub: number;
  username: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly deviceCodes: DeviceCodeService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  // ============== LOCAL ==============

  // Hạn mức tính theo IP, mà quán net / ký túc xá thì cả phòng chung một IP —
  // để chặt quá là chặn nhầm người chơi thật. 10/phút vẫn đủ chặn bot.
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // Cũng vì lý do IP dùng chung ở trên. 20 lần/phút vẫn quá chậm để dò mật khẩu.
  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // ============== OAUTH DEVICE FLOW ==============

  /**
   * Start an OAuth device code flow.
   *
   * Without JWT: only login mode allowed.
   * With JWT:    can request link mode (returns a code that links a new provider
   *              to the currently authenticated user instead of creating a new account).
   */
  @Post('device/start')
  @HttpCode(HttpStatus.OK)
  async startDevice(
    @Body() dto: StartDeviceDto,
    @Headers('authorization') authHeader: string,
  ) {
    const requestedMode = dto.mode ?? 'login';

    let userId: number | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<JwtPayload>(authHeader.slice(7), {
          secret: this.cfg.getOrThrow<string>('JWT_SECRET'),
        });
        userId = payload.sub;
      } catch {
        // ignore — fall through as anonymous
      }
    }

    if (requestedMode === 'link' && !userId) {
      throw new UnauthorizedException(
        'Link mode yêu cầu đăng nhập (gửi kèm Authorization: Bearer ...) ',
      );
    }

    const code = await this.deviceCodes.create(requestedMode, userId);
    return code;
  }

  // Client poll 2s/lần nên hạn mức phải rộng, nhưng vẫn đủ chặn việc dò mò device code.
  @Post('device/poll')
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  @HttpCode(HttpStatus.OK)
  async pollDevice(@Body() dto: PollDeviceDto) {
    const entry = await this.deviceCodes.get(dto.deviceCode);
    if (!entry) {
      // Either expired or never existed — same response (don't leak)
      return { status: 'expired' as const };
    }
    if (entry.status === 'pending') {
      return { status: 'pending' as const };
    }
    // Đã completed — code chỉ dùng được đúng một lần. Không xoá thì nó còn sống hết
    // 10 phút TTL và ai biết code cũng poll lại lấy được token.
    await this.deviceCodes.delete(dto.deviceCode);

    if (entry.error) {
      return { status: 'expired' as const };
    }
    if (entry.mode === 'link') {
      return {
        status: 'linked' as const,
        provider: entry.provider,
      };
    }
    return {
      status: 'ready' as const,
      accessToken: entry.result!.accessToken,
      user: entry.result!.user,
    };
  }

  // ============== AUTHENTICATED — account management ==============

  @Get('identities')
  @UseGuards(JwtAuthGuard)
  async listIdentities(@CurrentUser() u: { userId: number }) {
    const providers = await this.auth.listProviders(u.userId);
    return { providers };
  }

  @Delete('identities/:provider')
  @UseGuards(JwtAuthGuard)
  async unlinkIdentity(
    @CurrentUser() u: { userId: number },
    @Param('provider') provider: string,
  ) {
    if (!['local', 'google', 'facebook'].includes(provider)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }
    return this.auth.unlinkProvider(u.userId, provider as AuthProvider);
  }
}
