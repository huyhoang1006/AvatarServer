import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AddItemDto, RemoveItemDto } from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get()
  list(@CurrentUser() u: { userId: number }) {
    return this.inv.list(u.userId);
  }

  @Post()
  add(@CurrentUser() u: { userId: number }, @Body() dto: AddItemDto) {
    return this.inv.add(u.userId, dto);
  }

  @Delete()
  remove(@CurrentUser() u: { userId: number }, @Body() dto: RemoveItemDto) {
    return this.inv.remove(u.userId, dto);
  }
}
