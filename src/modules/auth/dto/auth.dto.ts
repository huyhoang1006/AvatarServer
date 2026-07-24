import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
  IsOptional,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username chỉ chứa chữ cái, số và dấu gạch dưới',
  })
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password: string;
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

export class StartDeviceDto {
  @IsOptional()
  @IsIn(['login', 'link'])
  mode?: 'login' | 'link';
}

export class PollDeviceDto {
  @IsString()
  deviceCode: string;
}
