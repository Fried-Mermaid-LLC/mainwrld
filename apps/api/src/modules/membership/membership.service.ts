import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { StripeService } from '../payments/stripe.service';

// Cancel-membership (F06). Stripe rail only — Apple subscriptions are cancelled
// in the App Store. Sets cancel_at_period_end; the member keeps access until the
// period ends, and the subscription.updated webhook reconciles the mirror.
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly stripe: StripeService,
  ) {}

  async cancel(
    uid: string,
    mode?: string,
  ): Promise<{ ok: boolean; cancelAtPeriodEnd: boolean }> {
    const userRef = this.db.collection(COLLECTIONS.users).doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) throw new NotFoundException('User not found.');
    const data = snap.data() as Record<string, unknown>;

    if (data.isPremium !== true) {
      throw new PreconditionFailedException(
        'You do not have an active membership.',
      );
    }
    if (data.premiumProvider === 'apple') {
      throw new PreconditionFailedException(
        'Manage your Apple subscription from the App Store.',
      );
    }

    // Best-effort: even if the Stripe call fails we still record the cancel
    // intent; the subscription.updated webhook reconciles later.
    let cancelAtPeriodEnd = false;
    const subId = data.stripeSubscriptionId as string | undefined;
    if (subId) {
      try {
        const stripe = this.stripe.optional(mode);
        if (stripe) {
          const sub = await stripe.subscriptions.update(subId, {
            cancel_at_period_end: true,
          });
          cancelAtPeriodEnd = !!sub.cancel_at_period_end;
        }
      } catch (err) {
        this.logger.error('cancelMembership: Stripe update failed', err as Error);
      }
    }

    await userRef.set(
      {
        membershipAutoRenew: false,
        membershipCancelledAt: new Date().toISOString(),
        premiumCancelAtPeriodEnd: true,
      },
      { merge: true },
    );
    this.logger.log(
      `Membership cancelled ${uid} (cancelAtPeriodEnd=${cancelAtPeriodEnd}, hadSub=${!!subId})`,
    );
    return { ok: true, cancelAtPeriodEnd };
  }
}
