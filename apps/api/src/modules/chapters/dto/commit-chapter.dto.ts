import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CommitChapterDto {
  @IsString()
  content!: string;

  @IsInt()
  order!: number;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @IsOptional()
  @IsString()
  authorUsername?: string;

  // Parent book metadata to update in the same batch (chapterMeta, chaptersCount,
  // cover, status). Server-managed book fields are stripped service-side.
  @IsOptional()
  @IsObject()
  bookUpdates?: Record<string, unknown>;
}

export class DeleteChapterDto {
  @IsOptional()
  @IsObject()
  bookUpdates?: Record<string, unknown>;
}
