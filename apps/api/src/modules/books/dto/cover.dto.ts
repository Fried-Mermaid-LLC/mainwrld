import { IsIn, IsOptional, IsString } from 'class-validator';

export class UploadCoverDto {
  // base64 data URL: "data:image/jpeg;base64,...."
  @IsString()
  dataUrl!: string;

  // Previous cover path to delete after a successful replace (best-effort).
  @IsOptional()
  @IsString()
  oldPath?: string;
}

export class FavoriteDto {
  @IsIn([1, -1])
  delta!: 1 | -1;
}
