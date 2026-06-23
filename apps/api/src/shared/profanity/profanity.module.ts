import { Global, Module } from '@nestjs/common';
import { ProfanityService } from './profanity.service';

// Global so any domain (moderation, users, books, comments, chat) can inject
// ProfanityService without re-importing.
@Global()
@Module({
  providers: [ProfanityService],
  exports: [ProfanityService],
})
export class ProfanityModule {}
