import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { ModeDto } from '../payments/dto/payments.dto';
import { MembershipService } from './membership.service';

@ApiTags('membership')
@ApiBearerAuth()
@Controller({ path: 'membership', version: '1' })
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Body() dto: ModeDto) {
    return this.membership.cancel(user.uid, dto.mode);
  }
}
