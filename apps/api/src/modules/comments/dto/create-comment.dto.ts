import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(128)
  bookId!: string;

  @IsOptional()
  @IsInt()
  chapterIndex?: number;

  // Commenter display name; authorUsername is server-stamped from the claim.
  @IsString()
  @MaxLength(64)
  author!: string;

  @IsString()
  @MaxLength(500)
  text!: string;
}
