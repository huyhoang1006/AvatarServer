import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { User } from '../../database/entities/user.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';
import { AuthIdentity, AuthProvider } from '../../database/entities/auth-identity.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { OAuthProfile } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserProfile) private readonly profiles: Repository<UserProfile>,
    @InjectRepository(AuthIdentity)
    private readonly identities: Repository<AuthIdentity>,
    private readonly jwt: JwtService,
  ) {}

  // ============== LOCAL (username/password) ==============

  async register(dto: RegisterDto) {
    const exists = await this.identities.findOne({
      where: { provider: 'local', providerUserId: dto.username },
    });
    if (exists) throw new ConflictException('Username đã tồn tại');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.users.create({
      username: dto.username,
      displayName: dto.username,
      email: null,
      avatar: null,
      active: true,
    });
    const saved = await this.users.save(user);

    await this.profiles.save(
      this.profiles.create({ userId: saved.id, level: 1, exp: 0, coins: 0, gems: 0, data: {} }),
    );

    await this.identities.save(
      this.identities.create({
        userId: saved.id,
        provider: 'local',
        providerUserId: dto.username,
        passwordHash,
        providerEmail: null,
      }),
    );

    return this.issueToken(saved);
  }

  async login(dto: LoginDto) {
    const identity = await this.identities.findOne({
      where: { provider: 'local', providerUserId: dto.username },
    });
    if (!identity || !identity.passwordHash) {
      throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
    }
    const ok = await bcrypt.compare(dto.password, identity.passwordHash);
    if (!ok) throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');

    const user = await this.users.findOne({ where: { id: identity.userId } });
    if (!user || !user.active) throw new UnauthorizedException('Tài khoản đã bị khoá');

    return this.issueToken(user);
  }

  // ============== OAUTH ==============

  /**
   * Find an existing user for this OAuth profile, or create one.
   * Priority:
   *   1. Exact (provider, providerUserId) match in auth_identities → use that user
   *   2. Email match in users table → AUTO-LINK new identity to that user
   *   3. Create new user + identity
   */
  async findOrCreateOAuthUser(profile: OAuthProfile): Promise<User> {
    const existing = await this.identities.findOne({
      where: { provider: profile.provider, providerUserId: profile.providerUserId },
    });
    if (existing) {
      const user = await this.users.findOne({ where: { id: existing.userId } });
      if (user && user.active) {
        // Update avatar/email if provider gave fresher data
        let dirty = false;
        if (profile.avatar && user.avatar !== profile.avatar) {
          user.avatar = profile.avatar;
          dirty = true;
        }
        if (profile.displayName && user.displayName !== profile.displayName) {
          user.displayName = profile.displayName;
          dirty = true;
        }
        if (dirty) await this.users.save(user);
        return user;
      }
    }

    // Auto-link by email
    if (profile.email) {
      const byEmail = await this.users.findOne({ where: { email: profile.email } });
      if (byEmail && byEmail.active) {
        const alreadyLinked = await this.identities.findOne({
          where: { provider: profile.provider, userId: byEmail.id },
        });
        if (!alreadyLinked) {
          await this.identities.save(
            this.identities.create({
              userId: byEmail.id,
              provider: profile.provider,
              providerUserId: profile.providerUserId,
              providerEmail: profile.email,
              passwordHash: null,
            }),
          );
          // Backfill missing fields
          let dirty = false;
          if (!byEmail.email) { byEmail.email = profile.email; dirty = true; }
          if (!byEmail.avatar && profile.avatar) { byEmail.avatar = profile.avatar; dirty = true; }
          if (!byEmail.displayName && profile.displayName) {
            byEmail.displayName = profile.displayName;
            dirty = true;
          }
          if (dirty) await this.users.save(byEmail);
          this.logger.log(
            `Auto-linked ${profile.provider} (${profile.email}) → user #${byEmail.id}`,
          );
          return byEmail;
        }
      }
    }

    // Brand new user
    const newUser = this.users.create({
      username: null,
      email: profile.email,
      displayName: profile.displayName,
      avatar: profile.avatar,
      active: true,
    });
    const saved = await this.users.save(newUser);

    await this.profiles.save(
      this.profiles.create({ userId: saved.id, level: 1, exp: 0, coins: 0, gems: 0, data: {} }),
    );

    await this.identities.save(
      this.identities.create({
        userId: saved.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
        passwordHash: null,
      }),
    );

    return saved;
  }

  async linkProviderToUser(userId: number, profile: OAuthProfile) {
    const existing = await this.identities.findOne({
      where: { provider: profile.provider, providerUserId: profile.providerUserId },
    });
    if (existing) {
      if (existing.userId === userId) {
        return { ok: true, alreadyLinked: true };
      }
      throw new ConflictException(
        `${profile.provider} này đã được liên kết với tài khoản khác`,
      );
    }

    const sameProviderForUser = await this.identities.findOne({
      where: { provider: profile.provider, userId },
    });
    if (sameProviderForUser) {
      throw new ConflictException(`Bạn đã liên kết ${profile.provider} rồi`);
    }

    await this.identities.save(
      this.identities.create({
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
        passwordHash: null,
      }),
    );
    return { ok: true, alreadyLinked: false };
  }

  async unlinkProvider(userId: number, provider: AuthProvider) {
    const identities = await this.identities.find({ where: { userId } });
    if (identities.length <= 1) {
      throw new BadRequestException(
        'Không thể gỡ liên kết cuối cùng — tài khoản phải còn ít nhất 1 cách đăng nhập',
      );
    }
    const target = identities.find((i) => i.provider === provider);
    if (!target) throw new NotFoundException(`Chưa liên kết ${provider}`);
    await this.identities.delete({ id: target.id });
    return { ok: true };
  }

  async listProviders(userId: number): Promise<AuthProvider[]> {
    const rows = await this.identities.find({ where: { userId } });
    return rows.map((r) => r.provider);
  }

  async getUserById(userId: number): Promise<User | null> {
    return this.users.findOne({ where: { id: userId } });
  }

  // ============== HELPERS ==============

  issueToken(user: User) {
    const token = this.jwt.sign({ sub: user.id, username: user.username ?? '' });
    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    };
  }
}
