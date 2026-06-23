import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsInt()
  likes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  likedBy?: string[];
}
