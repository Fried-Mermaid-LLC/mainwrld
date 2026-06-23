import { Global, Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

// Global so write endpoints in books / chapters / comments / chat can inject
// ModerationService for inline pre-moderation.
@Global()
@Module({
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
