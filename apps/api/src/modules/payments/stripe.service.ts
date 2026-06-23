import { Injectable, PreconditionFailedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { AppConfiguration } from '../../infra/config/configuration';

// Picks the live or test secret key based on the client-supplied mode — the
// exact test/live split the legacy callables used. The client sends 'live' only
// in prod builds.
@Injectable()
export class StripeService {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  forMode(mode?: string): Stripe {
    const secrets = this.config.get('secrets', { infer: true });
    const key =
      mode === 'live' ? secrets.stripeSecretKey : secrets.stripeTestSecretKey;
    if (!key) {
      throw new PreconditionFailedException({
        code: 'failed-precondition',
        message:
          'Stripe is not configured. Set STRIPE_SECRET_KEY / STRIPE_TEST_SECRET_KEY.',
      });
    }
    return new Stripe(key);
  }

  // Returns a Stripe client for the given mode without throwing when the key is
  // absent (used by the webhook, which only needs constructEvent).
  optional(mode?: string): Stripe | null {
    const secrets = this.config.get('secrets', { infer: true });
    const key =
      mode === 'live' ? secrets.stripeSecretKey : secrets.stripeTestSecretKey;
    return key ? new Stripe(key) : null;
  }
}
