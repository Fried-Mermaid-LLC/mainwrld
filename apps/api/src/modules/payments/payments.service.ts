import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import {
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { PLATFORM_FEE_RATE } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { StripeService } from './stripe.service';
import type { BookCheckoutDto } from './dto/payments.dto';

const DEFAULT_ORIGIN = 'https://mainwrld-f7acf.web.app';
const usd = (cents: number) => Math.round(cents) / 100;

export interface AccountStatus {
  stripeAccountId?: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly stripe: StripeService,
  ) {}

  private get users() {
    return this.db.collection(COLLECTIONS.users);
  }

  private safeOrigin(origin?: string): string {
    if (typeof origin === 'string' && /^https?:\/\/[^\s]+$/.test(origin)) {
      return origin.replace(/\/+$/, '');
    }
    return DEFAULT_ORIGIN;
  }

  async findBookByIdField(
    bookId: string,
  ): Promise<{ ref: DocumentReference; data: Record<string, unknown> } | null> {
    const snap = await this.db
      .collection(COLLECTIONS.books)
      .where('id', '==', bookId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return {
      ref: snap.docs[0].ref,
      data: snap.docs[0].data() as Record<string, unknown>,
    };
  }

  // ---- Seller onboarding & payouts ----

  async createAccountLink(
    uid: string,
    tokenEmail: string | undefined,
    mode?: string,
    origin?: string,
  ): Promise<{ url: string }> {
    const stripe = this.stripe.forMode(mode);
    const safe = this.safeOrigin(origin);
    const userRef = this.users.doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists)
      throw new NotFoundException('User profile missing.');
    const data = userSnap.data() as Record<string, unknown>;

    let accountId = data.stripeAccountId as string | undefined;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: (data.email as string) || tokenEmail || undefined,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        metadata: { uid },
      });
      accountId = account.id;
      await userRef.set({ stripeAccountId: accountId }, { merge: true });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: `${safe}/?connect_return=true`,
      refresh_url: `${safe}/?connect_refresh=true`,
    });
    return { url: link.url };
  }

  async syncAccountStatus(uid: string, mode?: string): Promise<AccountStatus> {
    const userRef = this.users.doc(uid);
    const userSnap = await userRef.get();
    const data = userSnap.exists
      ? (userSnap.data() as Record<string, unknown>)
      : {};
    const accountId = data.stripeAccountId as string | undefined;
    if (!accountId) {
      return {
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      };
    }
    const stripe = this.stripe.forMode(mode);
    const account = await stripe.accounts.retrieve(accountId);
    const status: AccountStatus = {
      stripeAccountId: accountId,
      payoutsEnabled: !!account.payouts_enabled,
      chargesEnabled: !!account.charges_enabled,
      detailsSubmitted: !!account.details_submitted,
    };
    await userRef.set(
      {
        payoutsEnabled: status.payoutsEnabled,
        chargesEnabled: status.chargesEnabled,
        detailsSubmitted: status.detailsSubmitted,
        stripeAccountUpdatedAt: Date.now(),
      },
      { merge: true },
    );
    return status;
  }

  async createDashboardLink(
    uid: string,
    mode?: string,
  ): Promise<{ url: string }> {
    const userSnap = await this.users.doc(uid).get();
    const accountId = (userSnap.data() as Record<string, unknown>)
      ?.stripeAccountId as string | undefined;
    if (!accountId) {
      throw new PreconditionFailedException('No connected payout account.');
    }
    const stripe = this.stripe.forMode(mode);
    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url };
  }

  async getSellerBalance(
    uid: string,
    mode?: string,
  ): Promise<{ availableUsd: number; pendingUsd: number }> {
    const userSnap = await this.users.doc(uid).get();
    const accountId = (userSnap.data() as Record<string, unknown>)
      ?.stripeAccountId as string | undefined;
    if (!accountId) return { availableUsd: 0, pendingUsd: 0 };
    const stripe = this.stripe.forMode(mode);
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: accountId },
    );
    const sumUsd = (entries: Array<{ amount: number; currency: string }>) =>
      usd(
        entries
          .filter((e) => e.currency === 'usd')
          .reduce((acc, e) => acc + e.amount, 0),
      );
    return {
      availableUsd: sumUsd(balance.available || []),
      pendingUsd: sumUsd(balance.pending || []),
    };
  }

  // ---- Reader cash checkout (80/20 destination charge) ----

  async createBookCheckout(
    buyerUid: string,
    dto: BookCheckoutDto,
  ): Promise<{ url: string }> {
    const nativeReturn = dto.nativeReturn === true;
    const found = await this.findBookByIdField(dto.bookId);
    if (!found) throw new NotFoundException('Book not found.');
    const book = found.data;
    if (!book.isMonetized || book.isFree) {
      throw new PreconditionFailedException('Book is not for sale.');
    }
    const sellerUid = (book.sellerUid as string) || (book.authorUid as string);
    const destination = book.sellerStripeAccountId as string | undefined;
    if (!destination) {
      throw new PreconditionFailedException('Seller payout account missing.');
    }
    if (sellerUid === buyerUid) {
      throw new PreconditionFailedException('You can’t buy your own book.');
    }
    const buyerSnap = await this.users.doc(buyerUid).get();
    const buyerData = (buyerSnap.data() as Record<string, unknown>) || {};
    const purchased = (buyerData.purchasedBookIds as string[]) || [];
    if (purchased.includes(dto.bookId)) {
      throw new ConflictException({
        code: 'already-exists',
        message: 'You already own this book.',
      });
    }

    const stripe = this.stripe.forMode(dto.mode);
    const safe = this.safeOrigin(dto.origin);
    const unitAmount = Math.round(((book.price as number) || 9.99) * 100);

    // Optional in-app coupon -> one-time Stripe discount; 80/20 split computed
    // on the DISCOUNTED amount; discount capped so the buyer still pays the
    // Stripe minimum. Marked used by the webhook on success.
    let discountCents = 0;
    let stripeCouponId: string | undefined;
    if (dto.couponId) {
      const coupons = (buyerData.coupons as Array<Record<string, unknown>>) || [];
      const coupon = coupons.find(
        (c) => c.id === dto.couponId && !c.used,
      );
      if (coupon) {
        const raw = Math.round(((coupon.value as number) || 0) * 100);
        discountCents = Math.max(0, Math.min(raw, unitAmount - 50));
        if (discountCents > 0) {
          const sc = await stripe.coupons.create({
            amount_off: discountCents,
            currency: 'usd',
            duration: 'once',
            max_redemptions: 1,
            name: `MainWRLD $${coupon.value as number} coupon`,
          });
          stripeCouponId = sc.id;
        }
      }
    }
    const chargedAmount = unitAmount - discountCents;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      // Stripe Tax needs a buyer address to pick the jurisdiction, then adds
      // sales tax on top of the price for any state where MainWRLD (the
      // merchant of record) has an active tax registration.
      billing_address_collection: 'required',
      automatic_tax: { enabled: true },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: (book.title as string) || 'MainWRLD book',
              // Digital Books — non-subscription, permanent rights. Some states
              // exempt digital books, so this is more accurate than the
              // account-default general tax code.
              tax_code: 'txcd_10302000',
            },
            unit_amount: unitAmount,
            // Price is pre-tax; sales tax is added on top at checkout.
            tax_behavior: 'exclusive',
          },
          quantity: 1,
        },
      ],
      discounts: stripeCouponId ? [{ coupon: stripeCouponId }] : undefined,
      payment_intent_data: {
        // Seller's 80% is a FIXED transfer on the pre-tax, post-discount price.
        // Using transfer_data.amount (instead of application_fee_amount) keeps
        // the collected sales tax with the platform — the merchant of record
        // that has to remit it — instead of leaking it into the seller payout.
        transfer_data: {
          destination,
          amount: Math.round(chargedAmount * (1 - PLATFORM_FEE_RATE)),
        },
      },
      client_reference_id: buyerUid,
      metadata: {
        bookId: dto.bookId,
        sellerUid,
        buyerUid,
        kind: 'book_purchase',
        couponId: stripeCouponId ? dto.couponId! : '',
        bookTitle: (book.title as string) || 'your new book',
      },
      success_url: nativeReturn
        ? `${safe}/checkout-complete.html?bookId=${encodeURIComponent(dto.bookId)}`
        : `${safe}/?book_purchase_success=true&bookId=${encodeURIComponent(dto.bookId)}`,
      cancel_url: nativeReturn
        ? `${safe}/checkout-complete.html?bookId=${encodeURIComponent(dto.bookId)}&cancelled=true`
        : `${safe}/?payment_cancelled=true`,
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (err) {
      // A seller whose Connect account was created in a different Stripe mode
      // (e.g. a test-mode iOS/dev build) leaves a destination acct_… the live
      // key can't resolve, so Stripe throws resource_missing on transfer_data.
      // Surface a clean precondition instead of letting it bubble up as a 500.
      const e = err as { type?: string; param?: string };
      if (
        e?.type === 'StripeInvalidRequestError' &&
        typeof e.param === 'string' &&
        e.param.includes('transfer_data')
      ) {
        throw new PreconditionFailedException({
          code: 'failed-precondition',
          message:
            'This book isn’t available for purchase yet — the seller hasn’t finished setting up live payouts.',
        });
      }
      throw err;
    }
    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL.',
      );
    }
    return { url: session.url };
  }
}
