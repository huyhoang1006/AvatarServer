import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../database/entities/user.entity';
import { UserProfile } from '../../database/entities/user-profile.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profiles: Repository<UserProfile>,
  ) {}

  async getProfile(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User không tồn tại');

    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile chưa được khởi tạo');

    return {
      id: user.id,
      username: user.username,
      level: profile.level,
      exp: profile.exp,
      coins: profile.coins,
      gems: profile.gems,
      data: profile.data,
      updatedAt: profile.updatedAt,
    };
  }

  async patchProfile(userId: number, patch: Partial<Pick<UserProfile, 'data' | 'level' | 'exp' | 'coins' | 'gems'>>) {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile không tồn tại');

    Object.assign(profile, patch);
    return this.profiles.save(profile);
  }
}
