import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateUsernameDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
