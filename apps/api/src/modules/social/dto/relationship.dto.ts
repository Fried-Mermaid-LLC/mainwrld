import { IsString, MaxLength } from 'class-validator';

export class RelationshipDto {
  @IsString()
  @MaxLength(64)
  target!: string;
}
