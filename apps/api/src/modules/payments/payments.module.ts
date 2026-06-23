import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { MonetizationService } from './monetization.service';
import { MonetizationEffectsService } from './monetization-effects.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    StripeService,
    PaymentsService,
    MonetizationService,
    MonetizationEffectsService,
  ],
  // Exported so the webhook + membership modules can reuse Stripe/effects.
  exports: [StripeService, MonetizationEffectsService, PaymentsService],
})
export class PaymentsModule {}
