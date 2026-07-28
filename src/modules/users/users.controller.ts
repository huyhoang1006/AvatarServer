import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Cố tình KHÔNG có level/exp/coins/gems: những thứ đó do server tự cộng qua gameplay.
 * Trước đây client gửi thẳng {"coins": 999999} là server lưu nguyên.
 *
 * `data` là state gameplay do client làm chủ (vị trí, ruộng, túi đồ) — chấp nhận
 * client quyết định, vì đây là game offline là chính.
 */
class UpdateProfileDto {
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: { userId: number }) {
    return this.users.getProfile(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: { userId: number }, @Body() dto: UpdateProfileDto) {
    return this.users.patchProfile(user.userId, dto);
  }
}
