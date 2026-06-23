import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { AdminService } from './admin.service';
import { AddStrikeDto, SetAdminDto } from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: 'admin/users/:uid', version: '1' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('admin')
  setAdmin(
    @CurrentUser() user: AuthUser,
    @Param('uid') uid: string,
    @Body() dto: SetAdminDto,
  ) {
    return this.admin.setAdmin(user.uid, uid, dto.admin);
  }

  @Post('ban')
  ban(@CurrentUser() user: AuthUser, @Param('uid') uid: string) {
    return this.admin.ban(user.uid, uid);
  }

  @Post('unban')
  unban(@Param('uid') uid: string) {
    return this.admin.unban(uid);
  }

  @Post('strikes')
  addStrike(
    @CurrentUser() user: AuthUser,
    @Param('uid') uid: string,
    @Body() dto: AddStrikeDto,
  ) {
    return this.admin.addStrike(user.uid, uid, dto.reportId);
  }
}
