import { IsString, MaxLength } from 'class-validator';

export class FcmTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}

export class LibraryDto {
  @IsString()
  @MaxLength(128)
  bookId!: string;
}
