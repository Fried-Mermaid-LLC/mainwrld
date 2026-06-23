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
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listForRecipient(requireUsername(user));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNotificationDto) {
    return this.notifications.create(user.username, dto);
  }

  @Post('read')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(requireUsername(user));
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@Param('id') id: string) {
    await this.notifications.markRead(id);
  }
}
