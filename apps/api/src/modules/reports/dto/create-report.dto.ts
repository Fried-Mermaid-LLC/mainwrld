import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
}

export class UpdateReportStatusDto {
  @IsIn(['pending', 'resolved', 'dismissed'])
  status!: 'pending' | 'resolved' | 'dismissed';
}
