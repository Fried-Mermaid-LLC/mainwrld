import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { requireUsername } from '../../infra/auth/require-username';
import { RelationshipDto } from './dto/relationship.dto';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Controller({ path: 'relationships', version: '1' })
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get()
  list() {
    return this.social.list();
  }

  @Get('exists')
  async exists(
    @CurrentUser() user: AuthUser,
    @Query('target') target: string,
  ) {
    const exists = await this.social.exists(requireUsername(user), target);
    return { exists };
  }

  @Post()
  @HttpCode(204)
  async add(@CurrentUser() user: AuthUser, @Body() dto: RelationshipDto) {
    await this.social.add(requireUsername(user), dto.target);
  }

  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Query('target') target: string,
  ) {
    await this.social.remove(requireUsername(user), target);
  }
}
