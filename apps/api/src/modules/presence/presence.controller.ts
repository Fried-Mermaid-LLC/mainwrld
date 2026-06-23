import {
  Body,
  Controller,
  HttpCode,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { PresenceService } from './presence.service';

class HeartbeatDto {
  @IsOptional()
  @IsIn(['Reading', 'Writing', 'Idle'])
  activity?: 'Reading' | 'Writing' | 'Idle';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentBookId?: string;
}

@ApiTags('presence')
@ApiBearerAuth()
@Controller({ path: 'presence', version: '1' })
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Put('heartbeat')
  @HttpCode(204)
  async heartbeat(
    @CurrentUser() user: AuthUser,
    @Body() dto: HeartbeatDto,
  ) {
    await this.presence.heartbeat(user.uid, dto.activity, dto.currentBookId);
  }

  @Post('offline')
  @HttpCode(204)
  async offline(@CurrentUser() user: AuthUser) {
    await this.presence.offline(user.uid);
  }
}
