import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  imports: [PaymentsModule], // for StripeService
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
