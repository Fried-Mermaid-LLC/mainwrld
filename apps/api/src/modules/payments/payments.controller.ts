import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../infra/auth/auth.decorators';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import { MonetizationService } from './monetization.service';
import { PaymentsService } from './payments.service';
import {
  BookCheckoutDto,
  ModeOriginDto,
  MonetizationRequestDto,
  ReviewMonetizationDto,
} from './dto/payments.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly monetization: MonetizationService,
  ) {}

  // ---- Stripe Connect ----

  @Post('stripe/account-link')
  accountLink(@CurrentUser() user: AuthUser, @Body() dto: ModeOriginDto) {
    return this.payments.createAccountLink(
      user.uid,
      user.email,
      dto.mode,
      dto.origin,
    );
  }

  @Get('stripe/account-status')
  accountStatus(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode?: string,
  ) {
    return this.payments.syncAccountStatus(user.uid, mode);
  }

  @Post('stripe/dashboard-link')
  dashboardLink(@CurrentUser() user: AuthUser, @Body() dto: ModeOriginDto) {
    return this.payments.createDashboardLink(user.uid, dto.mode);
  }

  @Get('stripe/balance')
  balance(@CurrentUser() user: AuthUser, @Query('mode') mode?: string) {
    return this.payments.getSellerBalance(user.uid, mode);
  }

  @Post('stripe/book-checkout')
  bookCheckout(@CurrentUser() user: AuthUser, @Body() dto: BookCheckoutDto) {
    return this.payments.createBookCheckout(user.uid, dto);
  }

  // ---- Monetization lifecycle ----

  @Post('monetization/requests')
  submitMonetization(
    @CurrentUser() user: AuthUser,
    @Body() dto: MonetizationRequestDto,
  ) {
    return this.monetization.submit(user, dto.bookId, dto.priceUsd);
  }

  @Roles('admin')
  @Post('monetization/:bookId/review')
  reviewMonetization(
    @CurrentUser() user: AuthUser,
    @Param('bookId') bookId: string,
    @Body() dto: ReviewMonetizationDto,
  ) {
    return this.monetization.review(
      user.username || 'admin',
      user.uid,
      bookId,
      dto.decision,
      dto.reason,
    );
  }
}
