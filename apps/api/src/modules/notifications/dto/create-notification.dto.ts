import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

const CATEGORIES = [
  'newAdmirers',
  'bookLikes',
  'comments',
  'appUpdates',
  'messages',
  'system',
] as const;

export class CreateNotificationDto {
  @IsString()
  @MaxLength(64)
  recipient!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(500)
  message!: string;

  @IsString()
  @MaxLength(200)
  icon!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetId?: string;

  @IsOptional()
  @IsInt()
  targetChapterIndex?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  commentId?: string;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: (typeof CATEGORIES)[number];
}
