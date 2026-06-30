import { IsString, Matches, MaxLength } from 'class-validator';

export class RelationshipDto {
  @IsString()
  @MaxLength(64)
  // Targets are always usernames; constrain to the same charset as
  // CreateProfileDto so the deterministic edge id (admirer:target) stays
  // injective and collision/separator-free.
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Target must be a valid username.',
  })
  target!: string;
}
