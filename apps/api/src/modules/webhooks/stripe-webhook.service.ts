import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import type { AppConfiguration } from '../../infra/config/configuration';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import {
  bookPurchaseEmail,
  couponPurchaseEmail,
  membershipWelcomeEmail,
  pointsPurchaseEmail,
} from '../../shared/email/email.templates';

// SKU maps — keep in sync with the Apple IAP maps + app/iap.ts.
const POINTS_BY_SKU: Record<string, number> = {
  points_100: 100,
  points_300: 300,
  points_500: 500,
  points_1000: 1000,
};
const PREMIUM_SKUS = new Set(['premium_yearly']);
const COUPON_VALUE_BY_SKU: Record<string, number> = {
  coupon_100: 1,
  coupon_300: 3,
  coupon_500: 5,
  coupon_1000: 10,
};
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface WebhookResult {
  status: number;
  body: string;
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly config: ConfigService<AppConfiguration, true>,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly email: EmailService,
  ) {}

  async handle(rawBody: Buffer, sig?: string): Promise<WebhookResult> {
    if (!sig) return { status: 400, body: 'Missing stripe-signature header' };

    // Dummy key — constructEvent is pure HMAC and ignores the API key.
    const stripe = new Stripe('sk_dummy_unused_for_webhook_only');
    const secrets = this.config.get('secrets', { infer: true });

    let event: Stripe.Event | null = null;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        secrets.stripeLiveWebhookSecret ?? '',
      );
    } catch {
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          secrets.stripeTestWebhookSecret ?? '',
        );
      } catch (err) {
        this.logger.warn('Webhook signature verification failed');
        return { status: 400, body: 'Signature verification failed' };
      }
    }
    if (!event) return { status: 400, body: 'Could not parse event' };

    if (event.type === 'account.updated') {
      return this.handleAccountUpdated(event);
    }
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      return this.handleSubscription(event);
    }
    if (event.type !== 'checkout.session.completed') {
      this.logger.log(`Skipping unhandled Stripe event ${event.type}`);
      return { status: 200, body: 'skipped: unhandled type' };
    }
    return this.handleCheckout(event);
  }

  private get users() {
    return this.db.collection(COLLECTIONS.users);
  }

  private get stripeEvents() {
    return this.db.collection(COLLECTIONS.stripeEvents);
  }

  private async handleAccountUpdated(
    event: Stripe.Event,
  ): Promise<WebhookResult> {
    const account = event.data.object as Stripe.Account;
    let uid = account.metadata?.uid as string | undefined;
    if (!uid) {
      const q = await this.users
        .where('stripeAccountId', '==', account.id)
        .limit(1)
        .get();
      if (!q.empty) uid = q.docs[0].id;
    }
    if (!uid) return { status: 200, body: 'skipped: account has no linked user' };

    const eventRef = this.stripeEvents.doc(event.id);
    const userRef = this.users.doc(uid);
    try {
      await this.db.runTransaction(async (t) => {
        const ev = await t.get(eventRef);
        if (ev.exists) return;
        t.set(
          userRef,
          {
            payoutsEnabled: !!account.payouts_enabled,
            chargesEnabled: !!account.charges_enabled,
            detailsSubmitted: !!account.details_submitted,
            stripeAccountUpdatedAt: Date.now(),
          },
          { merge: true },
        );
        t.set(eventRef, {
          uid,
          eventType: 'account.updated',
          accountId: account.id,
          livemode: event.livemode,
          processedAt: FieldValue.serverTimestamp(),
        });
      });
      return { status: 200, body: 'ok' };
    } catch (err) {
      this.logger.error('account.updated processing failed', err as Error);
      return { status: 500, body: 'processing error' };
    }
  }

  private async handleSubscription(
    event: Stripe.Event,
  ): Promise<WebhookResult> {
    const sub = event.data.object as Stripe.Subscription;
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    let uid = (sub.metadata as Record<string, string> | undefined)?.uid;
    if (!uid && customerId) {
      const q = await this.users
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
      if (!q.empty) uid = q.docs[0].id;
    }
    if (!uid)
      return { status: 200, body: 'skipped: subscription has no linked user' };

    // Read both pre-2025 and 2025+ Stripe subscription shapes.
    const subAny = sub as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const periodEndSec =
      subAny.current_period_end ||
      subAny.items?.data?.[0]?.current_period_end ||
      0;
    const active = sub.status === 'active' || sub.status === 'trialing';
    const deleted = event.type === 'customer.subscription.deleted';

    try {
      await this.users.doc(uid).set(
        {
          stripeSubscriptionId: sub.id,
          premiumProvider: 'stripe',
          premiumRenewalAt: periodEndSec
            ? periodEndSec * 1000
            : FieldValue.delete(),
          premiumCancelAtPeriodEnd: !!sub.cancel_at_period_end,
          subscriptionStatus: sub.status,
          isPremium: deleted ? false : active,
        },
        { merge: true },
      );
      return { status: 200, body: 'ok' };
    } catch (err) {
      this.logger.error('Subscription sync failed', err as Error);
      return { status: 500, body: 'processing error' };
    }
  }

  private async handleCheckout(event: Stripe.Event): Promise<WebhookResult> {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.client_reference_id;
    const sku = session.metadata?.sku;
    if (!uid) {
      this.logger.warn('Stripe session missing client_reference_id');
      return { status: 200, body: 'skipped: missing client_reference_id' };
    }

    // ---- book_purchase (checked BEFORE the sku-required guard) ----
    if (session.metadata?.kind === 'book_purchase') {
      const bookId = session.metadata.bookId;
      const sellerUid = session.metadata.sellerUid || null;
      const paymentIntentId =
        (typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id) || session.id;
      const amountTotal = session.amount_total ?? 0;
      // amount_total includes any sales tax Stripe Tax added; tax is a platform
      // pass-through liability, so the 80/20 split is computed on the pre-tax
      // base (which equals the seller's fixed transfer at checkout).
      const amountTax = session.total_details?.amount_tax ?? 0;
      const preTax = amountTotal - amountTax;
      if (!bookId)
        return { status: 200, body: 'skipped: book_purchase missing bookId' };

      const eventRef = this.stripeEvents.doc(event.id);
      const purchaseRef = this.db
        .collection(COLLECTIONS.bookPurchases)
        .doc(paymentIntentId);
      const userRef = this.users.doc(uid);
      const couponId = session.metadata?.couponId || '';

      try {
        const newlyProcessed = await this.db.runTransaction(async (t) => {
          const ev = await t.get(eventRef);
          if (ev.exists) {
            this.logger.log('book_purchase replay no-op');
            return false;
          }
          const userSnap = await t.get(userRef);
          const userData = (userSnap.data() as Record<string, unknown>) || {};
          const sellerNet = Math.round(preTax * 0.8);
          const platformFee = preTax - sellerNet;
          const userUpdate: Record<string, unknown> = {
            ownedBookIds: FieldValue.arrayUnion(bookId),
            purchasedBookIds: FieldValue.arrayUnion(bookId),
          };
          if (couponId && Array.isArray(userData.coupons)) {
            userUpdate.coupons = (
              userData.coupons as Array<Record<string, unknown>>
            ).map((c) => (c.id === couponId ? { ...c, used: true } : c));
          }
          t.update(userRef, userUpdate);
          t.set(purchaseRef, {
            buyerUid: uid,
            sellerUid,
            bookId,
            rail: 'cash',
            priceUsd: preTax / 100,
            taxUsd: amountTax / 100,
            totalChargedUsd: amountTotal / 100,
            platformFeeUsd: platformFee / 100,
            sellerNetUsd: sellerNet / 100,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            livemode: event.livemode,
            createdAt: FieldValue.serverTimestamp(),
          });
          t.set(eventRef, {
            uid,
            eventType: 'book_purchase',
            bookId,
            sellerUid,
            sessionId: session.id,
            paymentIntentId,
            livemode: event.livemode,
            processedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
        if (newlyProcessed) {
          const buyer = await this.email.userContact(uid);
          if (buyer.email) {
            const title = session.metadata?.bookTitle || 'your new book';
            const mail = bookPurchaseEmail(buyer.displayName, title);
            await this.email.send(buyer.email, mail.subject, mail.html);
          }
        }
        return { status: 200, body: 'ok' };
      } catch (err) {
        this.logger.error('Failed to grant book purchase', err as Error);
        return { status: 500, body: 'processing error' };
      }
    }

    // ---- points / premium / coupon (require sku) ----
    if (!sku) {
      this.logger.warn('Stripe session missing metadata.sku');
      return { status: 200, body: 'skipped: missing metadata.sku' };
    }
    const points = POINTS_BY_SKU[sku] ?? 0;
    const isPremium = PREMIUM_SKUS.has(sku);
    const couponValue = COUPON_VALUE_BY_SKU[sku] ?? 0;
    if (!points && !isPremium && !couponValue) {
      this.logger.warn('Unknown Stripe sku — no credit applied');
      return { status: 200, body: 'skipped: unknown sku' };
    }

    const eventRef = this.stripeEvents.doc(event.id);
    const userRef = this.users.doc(uid);
    const stripeCustomerId =
      (typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id) || null;
    const stripeSubscriptionId =
      (typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id) || null;

    try {
      const newlyProcessed = await this.db.runTransaction(async (t) => {
        const ev = await t.get(eventRef);
        if (ev.exists) {
          this.logger.log('Event already processed — replay no-op');
          return false;
        }
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) {
          throw new Error(
            `User ${uid} not found for Stripe session ${session.id}`,
          );
        }
        if (points) {
          t.update(userRef, { points: FieldValue.increment(points) });
        }
        if (isPremium) {
          const existingRenewal = (userSnap.data() as Record<string, unknown>)
            ?.premiumRenewalAt as number | undefined;
          t.update(userRef, {
            isPremium: true,
            premiumSince: new Date().toISOString(),
            membershipStartDate: Date.now(),
            premiumProvider: 'stripe',
            membershipAutoRenew: true,
            premiumRenewalAt: existingRenewal || Date.now() + YEAR_MS,
            ...(stripeCustomerId ? { stripeCustomerId } : {}),
            ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
          });
        }
        if (couponValue) {
          t.update(userRef, {
            coupons: FieldValue.arrayUnion({
              id: `buy_${session.id}`,
              value: couponValue,
              used: false,
            }),
          });
        }
        t.set(eventRef, {
          uid,
          sku,
          sessionId: session.id,
          livemode: event.livemode,
          pointsAdded: points,
          isPremium,
          couponValue,
          processedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (newlyProcessed) {
        const buyer = await this.email.userContact(uid);
        if (buyer.email) {
          const mail = isPremium
            ? membershipWelcomeEmail(buyer.displayName)
            : points
              ? pointsPurchaseEmail(buyer.displayName, points)
              : couponValue
                ? couponPurchaseEmail(buyer.displayName, couponValue)
                : undefined;
          if (mail) await this.email.send(buyer.email, mail.subject, mail.html);
        }
      }
      return { status: 200, body: 'ok' };
    } catch (err) {
      this.logger.error('Failed to apply Stripe credit', err as Error);
      // 500 so Stripe retries the delivery.
      return { status: 500, body: 'processing error' };
    }
  }
}
