// Mock the Stripe SDK: the service does `new Stripe(...)` purely so it can call
// `stripe.webhooks.constructEvent`. We control what that returns per-test.
const constructEvent = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent },
  })),
);

import { StripeWebhookService } from './stripe-webhook.service';
import { FakeFirestore, fakeConfig, createFakeEmail } from '../../testing/test-utils';

describe('StripeWebhookService', () => {
  let fs: FakeFirestore;
  let email: ReturnType<typeof createFakeEmail>;
  let svc: StripeWebhookService;

  // Build the service with a fresh fake graph.
  beforeEach(() => {
    fs = new FakeFirestore();
    email = createFakeEmail();
    svc = new StripeWebhookService(fakeConfig() as any, fs as any, email as any);
    constructEvent.mockReset();
  });

  // Helper: make constructEvent return a crafted checkout.session.completed event.
  const stubEvent = (event: any) => {
    constructEvent.mockReturnValueOnce(event);
  };

  const checkoutEvent = (
    object: any,
    over: Partial<{ id: string; livemode: boolean; type: string }> = {},
  ) => ({
    id: over.id ?? 'evt_1',
    type: over.type ?? 'checkout.session.completed',
    livemode: over.livemode ?? false,
    data: { object },
  });

  const RAW = Buffer.from('{}');

  describe('signature / parsing', () => {
    it('returns 400 when the stripe-signature header is missing', async () => {
      const res = await svc.handle(RAW, undefined);
      expect(res.status).toBe(400);
      expect(res.body).toMatch(/Missing stripe-signature/i);
      // constructEvent must never run without a signature.
      expect(constructEvent).not.toHaveBeenCalled();
    });

    it('returns 400 when signature verification fails for both secrets', async () => {
      constructEvent.mockImplementation(() => {
        throw new Error('bad sig');
      });
      const res = await svc.handle(RAW, 'sig_bad');
      expect(res.status).toBe(400);
      expect(res.body).toMatch(/Signature verification failed/i);
      // tried both live + test secrets.
      expect(constructEvent).toHaveBeenCalledTimes(2);
    });

    it('skips an unhandled event type with 200', async () => {
      stubEvent({
        id: 'evt_x',
        type: 'payment_intent.succeeded',
        livemode: false,
        data: { object: {} },
      });
      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/skipped/i);
    });
  });

  describe('book_purchase', () => {
    const bookSession = (over: Record<string, any> = {}) => ({
      id: 'cs_book_1',
      client_reference_id: 'buyer1',
      payment_intent: 'pi_book_1',
      amount_total: 1000, // $10.00
      customer: null,
      subscription: null,
      metadata: {
        kind: 'book_purchase',
        bookId: 'b1',
        sellerUid: 'seller1',
        bookTitle: 'My Book',
        ...over,
      },
    });

    it('grants ownership, computes a 30% platform fee, writes the purchase, and emails the buyer', async () => {
      fs.seed('users/buyer1', { points: 0 });
      stubEvent(checkoutEvent(bookSession()));

      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);

      const user = fs.dump('users/buyer1')!;
      expect(user.ownedBookIds).toEqual(['b1']);
      expect(user.purchasedBookIds).toEqual(['b1']);

      const purchase = fs.dump('bookPurchases/pi_book_1')!;
      // platformFee = round(1000 * 0.3) = 300 -> $3.00; net = $7.00.
      expect(purchase.platformFeeUsd).toBe(3);
      expect(purchase.priceUsd).toBe(10);
      expect(purchase.sellerNetUsd).toBe(7);
      expect(purchase.buyerUid).toBe('buyer1');
      expect(purchase.sellerUid).toBe('seller1');
      expect(purchase.bookId).toBe('b1');
      expect(purchase.rail).toBe('cash');
      expect(purchase.stripePaymentIntentId).toBe('pi_book_1');

      // event recorded under its id for idempotency.
      expect(fs.dump('stripeEvents/evt_1')).toBeDefined();

      // buyer emailed exactly once.
      expect(email.userContact).toHaveBeenCalledWith('buyer1');
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('marks the applied coupon as used', async () => {
      fs.seed('users/buyer1', {
        coupons: [
          { id: 'cpn_a', value: 5, used: false },
          { id: 'cpn_b', value: 3, used: false },
        ],
      });
      stubEvent(checkoutEvent(bookSession({ couponId: 'cpn_a' })));

      await svc.handle(RAW, 'sig');

      const coupons = fs.dump('users/buyer1')!.coupons as any[];
      expect(coupons.find((c) => c.id === 'cpn_a').used).toBe(true);
      expect(coupons.find((c) => c.id === 'cpn_b').used).toBe(false);
    });

    it('is a replay no-op when the event was already processed (no double credit, no email)', async () => {
      fs.seed('users/buyer1', { ownedBookIds: ['b1'], purchasedBookIds: ['b1'] });
      fs.seed('stripeEvents/evt_1', { uid: 'buyer1', eventType: 'book_purchase' });
      stubEvent(checkoutEvent(bookSession()));

      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);

      // ownership unchanged (no arrayUnion duplication path executed).
      const user = fs.dump('users/buyer1')!;
      expect(user.ownedBookIds).toEqual(['b1']);
      // no purchase doc written on replay.
      expect(fs.dump('bookPurchases/pi_book_1')).toBeUndefined();
      // email NOT sent.
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips with 200 when bookId is missing', async () => {
      fs.seed('users/buyer1', {});
      stubEvent(checkoutEvent(bookSession({ bookId: undefined })));
      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/missing bookId/i);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('falls back to the session id as paymentIntentId when payment_intent is absent', async () => {
      fs.seed('users/buyer1', {});
      const session = bookSession();
      delete (session as any).payment_intent;
      stubEvent(checkoutEvent(session));
      await svc.handle(RAW, 'sig');
      expect(fs.dump('bookPurchases/cs_book_1')).toBeDefined();
    });
  });

  describe('points / premium / coupon credit', () => {
    const skuSession = (sku: string | undefined, over: Record<string, any> = {}) => ({
      id: 'cs_1',
      client_reference_id: 'u1',
      customer: 'cus_1',
      subscription: 'sub_1',
      metadata: sku === undefined ? {} : { sku },
      ...over,
    });

    it('credits points via the sku map and emails the buyer', async () => {
      fs.seed('users/u1', { points: 50 });
      stubEvent(checkoutEvent(skuSession('points_300')));

      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);

      expect(fs.dump('users/u1')!.points).toBe(350); // 50 + 300
      const ev = fs.dump('stripeEvents/evt_1')!;
      expect(ev.pointsAdded).toBe(300);
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('grants premium and stamps a fresh renewal one year out', async () => {
      const before = Date.now();
      fs.seed('users/u1', { points: 0 });
      stubEvent(checkoutEvent(skuSession('premium_yearly')));

      await svc.handle(RAW, 'sig');

      const user = fs.dump('users/u1')!;
      expect(user.isPremium).toBe(true);
      expect(user.premiumProvider).toBe('stripe');
      expect(user.membershipAutoRenew).toBe(true);
      expect(user.stripeCustomerId).toBe('cus_1');
      expect(user.stripeSubscriptionId).toBe('sub_1');
      // ~1 year out from now.
      const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      expect(user.premiumRenewalAt).toBeGreaterThanOrEqual(before + YEAR_MS - 1000);
    });

    it('does not clobber an existing premiumRenewalAt', async () => {
      const existing = 99999999999;
      fs.seed('users/u1', { premiumRenewalAt: existing });
      stubEvent(checkoutEvent(skuSession('premium_yearly')));

      await svc.handle(RAW, 'sig');

      expect(fs.dump('users/u1')!.premiumRenewalAt).toBe(existing);
    });

    it('grants a coupon via the sku map', async () => {
      fs.seed('users/u1', {});
      stubEvent(checkoutEvent(skuSession('coupon_500')));

      await svc.handle(RAW, 'sig');

      const coupons = fs.dump('users/u1')!.coupons as any[];
      expect(coupons).toHaveLength(1);
      expect(coupons[0].value).toBe(5); // coupon_500 -> $5
      expect(coupons[0].used).toBe(false);
      expect(coupons[0].id).toBe('buy_cs_1');
    });

    it('skips with 200 on an unknown sku (no credit)', async () => {
      fs.seed('users/u1', { points: 10 });
      stubEvent(checkoutEvent(skuSession('mystery_box')));

      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/unknown sku/i);
      expect(fs.dump('users/u1')!.points).toBe(10);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips with 200 when metadata.sku is missing', async () => {
      fs.seed('users/u1', {});
      stubEvent(checkoutEvent(skuSession(undefined)));
      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/missing metadata.sku/i);
    });

    it('skips with 200 when client_reference_id is missing', async () => {
      stubEvent(
        checkoutEvent({ id: 'cs_1', client_reference_id: undefined, metadata: { sku: 'points_100' } }),
      );
      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(res.body).toMatch(/missing client_reference_id/i);
    });

    it('is a replay no-op when the event already exists (no double credit, no email)', async () => {
      fs.seed('users/u1', { points: 100 });
      fs.seed('stripeEvents/evt_1', { uid: 'u1', sku: 'points_300' });
      stubEvent(checkoutEvent(skuSession('points_300')));

      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(200);
      expect(fs.dump('users/u1')!.points).toBe(100); // unchanged
      expect(email.send).not.toHaveBeenCalled();
    });

    it('returns 500 when the credited user does not exist', async () => {
      // no users/u1 seeded -> transaction throws -> caught -> 500.
      stubEvent(checkoutEvent(skuSession('points_100')));
      const res = await svc.handle(RAW, 'sig');
      expect(res.status).toBe(500);
      expect(res.body).toMatch(/processing error/i);
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
