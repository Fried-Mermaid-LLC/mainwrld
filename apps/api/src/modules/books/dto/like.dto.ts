import { IsInt, Min } from 'class-validator';

export class LikeChapterDto {
  @IsInt()
  @Min(0)
  chapterIndex!: number;
}
