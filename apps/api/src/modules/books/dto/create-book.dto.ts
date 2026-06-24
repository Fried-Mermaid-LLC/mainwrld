import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChapterMetaDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;
}

// Full set of author-writable book fields (matches what useReading sends on
// publish/save-draft). Server-managed fields (authorUid, monetizationAttempts,
// isMonetized, monetizationStatus, sellerUid, favoritesTotal, …) are omitted on
// purpose: `whitelist` drops them silently (the client is never trusted for
// them), and the service stamps authorUid/authorUsername itself. We do NOT use
// forbidNonWhitelisted, so an unexpected extra field is dropped, not rejected.
export class CreateBookDto {
  // Optional caller-supplied id (so a cover can be uploaded before the doc exists).
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  // Denormalized author fields; authorUsername is overridden server-side.
  @IsOptional()
  @IsString()
  authorUsername?: string;

  @IsOptional()
  @IsString()
  authorDisplayName?: string;

  @IsOptional()
  @IsString()
  coverColor?: string;

  // URL (schema 2) or null when absent.
  @IsOptional()
  @IsString()
  coverImage?: string | null;

  @IsOptional()
  @IsString()
  coverPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tagline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  // Per-chapter like counts.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  likes?: number[];

  @IsOptional()
  @IsInt()
  commentsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  publishedDate?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  wasCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  isMature?: boolean;

  @IsOptional()
  @IsInt()
  chaptersCount?: number;

  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @IsOptional()
  @IsBoolean()
  commentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsInt()
  minLikesPerChapter?: number;

  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChapterMetaDto)
  chapterMeta?: ChapterMetaDto[];
}
