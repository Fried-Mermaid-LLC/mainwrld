import { IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MaxLength(64)
  to!: string;

  @IsString()
  @MaxLength(500)
  text!: string;
}
