import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../infra/auth/auth.decorators';
import { ModerateUsernameDto } from './dto/moderate-username.dto';
import { ModerationService } from './moderation.service';

@ApiTags('moderation')
@Controller({ path: 'moderation', version: '1' })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  // Pre-signup check. Unauthenticated by design (the user has no account yet).
  // The client calls this BEFORE creating the account and rejects a flagged
  // name, instead of tearing down a created account on a false positive.
  @Public()
  @Post('username')
  async moderateUsername(@Body() dto: ModerateUsernameDto) {
    const combined = `${dto.username ?? ''} ${dto.displayName ?? ''}`.trim();
    const verdict = await this.moderation.screen(combined);
    return { flagged: verdict.flagged, category: verdict.topCategory ?? null };
  }
}
