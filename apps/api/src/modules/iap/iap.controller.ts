import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { VerifyAppleDto } from './dto/verify-apple.dto';
import { IapService } from './iap.service';

@ApiTags('iap')
@ApiBearerAuth()
@Controller({ path: 'iap', version: '1' })
export class IapController {
  constructor(private readonly iap: IapService) {}

  @Post('verify-apple')
  verifyApple(@CurrentUser() user: AuthUser, @Body() dto: VerifyAppleDto) {
    return this.iap.verifyApple(user, dto.productId, dto.transactionId);
  }
}
