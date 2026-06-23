import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { requireUsername } from '../../infra/auth/require-username';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('messages')
  list(@CurrentUser() user: AuthUser) {
    return this.chat.listForUser(requireUsername(user));
  }

  @Post('messages')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chat.send(
      requireUsername(user),
      user.uid,
      dto.to,
      dto.text,
    );
  }

  @Post('conversations/:peer/read')
  @HttpCode(204)
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('peer') peer: string,
  ) {
    await this.chat.markRead(peer, requireUsername(user));
  }
}
