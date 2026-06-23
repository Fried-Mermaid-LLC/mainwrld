import { IsString, Matches, MaxLength } from 'class-validator';

// Signup profile. uid + email come from the verified token, never the body.
export class CreateProfileDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username may only contain letters, numbers and underscores.',
  })
  username!: string;

  @IsString()
  @MaxLength(64)
  displayName!: string;

  // ISO date string (YYYY-MM-DD); COPPA age is computed server-side.
  @IsString()
  @MaxLength(32)
  birthDate!: string;
}
