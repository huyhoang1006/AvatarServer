import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Inventory } from '../../database/entities/inventory.entity';
import { AddItemDto, RemoveItemDto } from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly repo: Repository<Inventory>,
  ) {}

  list(userId: number) {
    return this.repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  async add(userId: number, dto: AddItemDto) {
    let row = await this.repo.findOne({ where: { userId, itemId: dto.itemId } });

    if (!row) {
      row = this.repo.create({
        userId,
        itemId: dto.itemId,
        quantity: 0,
        metadata: dto.metadata ?? null,
      });
    }

    row.quantity += dto.quantity;
    if (dto.metadata) row.metadata = { ...(row.metadata ?? {}), ...dto.metadata };
    return this.repo.save(row);
  }

  async remove(userId: number, dto: RemoveItemDto) {
    const row = await this.repo.findOne({ where: { userId, itemId: dto.itemId } });
    if (!row) throw new NotFoundException(`Không có item ${dto.itemId}`);
    if (row.quantity < dto.quantity) {
      throw new BadRequestException(
        `Không đủ ${dto.itemId} (có ${row.quantity}, cần ${dto.quantity})`,
      );
    }
    row.quantity -= dto.quantity;
    if (row.quantity === 0) {
      await this.repo.delete({ id: row.id });
      return { removed: true };
    }
    return this.repo.save(row);
  }
}
