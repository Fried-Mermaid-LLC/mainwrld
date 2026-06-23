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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: (book.title as string) || 'MainWRLD book' },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      discounts: stripeCouponId ? [{ coupon: stripeCouponId }] : undefined,
      payment_intent_data: {
        application_fee_amount: Math.round(chargedAmount * PLATFORM_FEE_RATE),
        transfer_data: { destination },
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
    });
    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL.',
      );
    }
    return { url: session.url };
  }
}
