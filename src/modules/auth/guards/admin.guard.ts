import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';

/**
 * Chỉ cho qua nếu users.is_admin = true. Phải dùng SAU JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Cố tình tra DB thay vì đọc claim trong JWT — thu quyền admin có hiệu lực ngay,
 * không phải đợi token cũ hết hạn.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: number | undefined = req.user?.userId;
    if (!userId) throw new ForbiddenException('Cần đăng nhập');

    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, isAdmin: true, active: true },
    });
    if (!user || !user.active || !user.isAdmin) {
      throw new ForbiddenException('Chức năng này chỉ dành cho admin');
    }
    return true;
  }
}
