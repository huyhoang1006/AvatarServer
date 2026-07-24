import {
  IsString,
  IsDateString,
  IsOptional,
  IsObject,
  IsIn,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['global', 'guild', 'personal'])
  scope?: 'global' | 'guild' | 'personal';

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;
}

export class ScoreEventDto {
  @IsString()
  action: string; // e.g. "harvest", "kill_boss", ...

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
