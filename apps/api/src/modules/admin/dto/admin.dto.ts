import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetAdminDto {
  @IsBoolean()
  admin!: boolean;
}

export class AddStrikeDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reportId?: string;
}
