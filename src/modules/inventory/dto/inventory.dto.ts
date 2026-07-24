import { IsString, IsInt, Min, IsObject, IsOptional } from 'class-validator';

export class AddItemDto {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class RemoveItemDto {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
