import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyAppleDto {
  @IsString()
  @MaxLength(256)
  productId!: string;

  @IsString()
  @MaxLength(256)
  transactionId!: string;

  // Declared for parity with the legacy callable; the body is verified via the
  // App Store Server API by transactionId, so this is accepted but unused.
  @IsOptional()
  @IsString()
  appStoreReceipt?: string;
}
