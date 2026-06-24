import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReportReason } from '@mainwrld/types';

const REPORT_REASONS = [
  'sexual',
  'harassment',
  'spam',
  'hate',
  'violence',
  'other',
] as const;

export class CreateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  id?: string;

  @IsIn(['Book', 'Comment', 'User'])
  type!: 'Book' | 'Comment' | 'User';

  @IsString()
  @MaxLength(128)
  targetId!: string;

  @IsOptional()
  @IsIn(REPORT_REASONS)
  reason?: ReportReason;
}

export class UpdateReportStatusDto {
  @IsIn(['pending', 'resolved', 'dismissed'])
  status!: 'pending' | 'resolved' | 'dismissed';
}
