import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsObject, IsInt, Min, IsOptional } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  exp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coins?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  gems?: number;

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
