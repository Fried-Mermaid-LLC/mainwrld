import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ModeOriginDto {
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  origin?: string;
}

export class ModeDto {
  @IsOptional()
  @IsString()
  mode?: string;
}

export class BookCheckoutDto {
  @IsString()
  @MaxLength(128)
  bookId!: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  couponId?: string;

  @IsOptional()
  @IsBoolean()
  nativeReturn?: boolean;
}

export class MonetizationRequestDto {
  @IsString()
  @MaxLength(128)
  bookId!: string;

  @IsNumber()
  priceUsd!: number;
}

export class ReviewMonetizationDto {
  @IsIn(['approve', 'deny'])
  decision!: 'approve' | 'deny';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
