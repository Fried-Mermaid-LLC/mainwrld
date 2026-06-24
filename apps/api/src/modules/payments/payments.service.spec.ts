import { PaymentsService } from './payments.service';
import { FakeFirestore, makeAuthUser } from '../../testing/test-utils';

// Build a fake StripeService whose forMode() returns a single stripe mock with
// jest.fn() spies for every method the service touches. The mock is rebuilt per
// test so call assertions are isolated.
function makeStripe() {
  const stripeMock = {
    accounts: {
      create: jest.fn(async () => ({ id: 'acct_new' })),
      retrieve: jest.fn(async () => ({
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
      })),
      createLoginLink: jest.fn(async () => ({ url: 'https://dash.link' })),
    },
    accountLinks: {
      create: jest.fn(async () => ({ url: 'https://onboard.link' })),
    },
    balance: {
      retrieve: jest.fn(async () => ({ available: [], pending: [] })),
    },
    checkout: {
      sessions: {
        create: jest.fn(async () => ({ url: 'https://checkout.url' })),
      },
    },
    coupons: {
      create: jest.fn(async () => ({ id: 'coupon_x' })),
    },
  };
  const stripeService = { forMode: jest.fn(() => stripeMock) };
  return { stripeService, stripeMock };
}

describe('PaymentsService', () => {
  let fs: FakeFirestore;
  let stripeService: { forMode: jest.Mock };
  let stripeMock: ReturnType<typeof makeStripe>['stripeMock'];
  let svc: PaymentsService;

  const seedBook = (over: Record<string, unknown> = {}) => {
    const data = {
      id: 'b1',
      title: 'My Book',
      authorUid: 'seller1',
      sellerUid: 'seller1',
      isMonetized: true,
      isFree: false,
      price: 9.99,
      sellerStripeAccountId: 'acct_seller',
      ...over,
    };
    fs.seed('books/b1', data);
    return data;
  };

  beforeEach(() => {
    fs = new FakeFirestore();
    ({ stripeService, stripeMock } = makeStripe());
    svc = new PaymentsService(fs as any, stripeService as any);
  });

  describe('createBookCheckout', () => {
    it('throws NotFound when the book does not exist', async () => {
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'missing' } as any),
      ).rejects.toThrow('Book not found.');
    });

    it('throws precondition for a non-monetized book', async () => {
      seedBook({ isMonetized: false });
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'b1' } as any),
      ).rejects.toThrow('not for sale');
    });

    it('throws precondition for a free book', async () => {
      seedBook({ isFree: true });
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'b1' } as any),
      ).rejects.toThrow('not for sale');
    });

    it('throws precondition when the seller payout account is missing', async () => {
      seedBook({ sellerStripeAccountId: undefined });
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'b1' } as any),
      ).rejects.toThrow('Seller payout account missing');
    });

    it('throws precondition when buying your own book', async () => {
      seedBook();
      await expect(
        svc.createBookCheckout('seller1', { bookId: 'b1' } as any),
      ).rejects.toThrow('your own book');
    });

    it('throws conflict already-exists when the book is already owned', async () => {
      seedBook();
      fs.seed('users/buyer1', { purchasedBookIds: ['b1'] });
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'b1' } as any),
      ).rejects.toMatchObject({
        response: { code: 'already-exists' },
      });
    });

    it('happy path returns {url} with 80% seller transfer + tax enabled', async () => {
      seedBook({ price: 9.99 });
      const res = await svc.createBookCheckout('buyer1', {
        bookId: 'b1',
      } as any);
      expect(res).toEqual({ url: 'https://checkout.url' });
      const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
      // unitAmount = 999, no coupon -> chargedAmount = 999, seller transfer =
      // round(999*0.8)=799 (the platform keeps the 200 fee + any sales tax).
      expect(args.line_items[0].price_data.unit_amount).toBe(999);
      expect(args.line_items[0].price_data.tax_behavior).toBe('exclusive');
      expect(args.automatic_tax.enabled).toBe(true);
      expect(args.payment_intent_data.application_fee_amount).toBeUndefined();
      expect(args.payment_intent_data.transfer_data.destination).toBe(
        'acct_seller',
      );
      expect(args.payment_intent_data.transfer_data.amount).toBe(799);
      expect(args.client_reference_id).toBe('buyer1');
      expect(args.discounts).toBeUndefined();
      expect(stripeMock.coupons.create).not.toHaveBeenCalled();
    });

    it('falls back to authorUid when sellerUid is absent', async () => {
      seedBook({ sellerUid: undefined, authorUid: 'seller1' });
      // buyer == authorUid should still be rejected as own-book
      await expect(
        svc.createBookCheckout('seller1', { bookId: 'b1' } as any),
      ).rejects.toThrow('your own book');
    });

    it('applies a coupon and computes the fee on the discounted amount', async () => {
      seedBook({ price: 9.99 });
      fs.seed('users/buyer1', {
        coupons: [{ id: 'c1', value: 5, used: false }],
      });
      const res = await svc.createBookCheckout('buyer1', {
        bookId: 'b1',
        couponId: 'c1',
      } as any);
      expect(res).toEqual({ url: 'https://checkout.url' });
      // discount = min(500, 999-50=949) = 500, charged = 499, seller transfer = round(499*0.8)=399
      expect(stripeMock.coupons.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount_off: 500, currency: 'usd' }),
      );
      const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
      expect(args.discounts).toEqual([{ coupon: 'coupon_x' }]);
      expect(args.payment_intent_data.transfer_data.amount).toBe(399);
      expect(args.metadata.couponId).toBe('c1');
    });

    it('caps the coupon discount at unitAmount - 50', async () => {
      seedBook({ price: 9.99 }); // unitAmount 999
      fs.seed('users/buyer1', {
        // value 20 -> 2000 cents, must cap at 999-50 = 949
        coupons: [{ id: 'big', value: 20, used: false }],
      });
      await svc.createBookCheckout('buyer1', {
        bookId: 'b1',
        couponId: 'big',
      } as any);
      expect(stripeMock.coupons.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount_off: 949 }),
      );
      const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
      // charged = 999 - 949 = 50, seller transfer = round(50*0.8) = 40
      expect(args.payment_intent_data.transfer_data.amount).toBe(40);
    });

    it('ignores an already-used coupon (no discount, no stripe coupon)', async () => {
      seedBook({ price: 9.99 });
      fs.seed('users/buyer1', {
        coupons: [{ id: 'c1', value: 5, used: true }],
      });
      await svc.createBookCheckout('buyer1', {
        bookId: 'b1',
        couponId: 'c1',
      } as any);
      expect(stripeMock.coupons.create).not.toHaveBeenCalled();
      const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
      expect(args.discounts).toBeUndefined();
      expect(args.payment_intent_data.transfer_data.amount).toBe(799);
      expect(args.metadata.couponId).toBe('');
    });

    it('uses native return URLs when nativeReturn is true', async () => {
      seedBook();
      await svc.createBookCheckout('buyer1', {
        bookId: 'b1',
        nativeReturn: true,
        origin: 'https://app.example.com',
      } as any);
      const args = stripeMock.checkout.sessions.create.mock.calls[0]![0];
      expect(args.success_url).toContain(
        'https://app.example.com/checkout-complete.html',
      );
      expect(args.cancel_url).toContain('cancelled=true');
    });

    it('throws when Stripe returns no checkout URL', async () => {
      seedBook();
      stripeMock.checkout.sessions.create.mockResolvedValueOnce({
        url: undefined,
      } as any);
      await expect(
        svc.createBookCheckout('buyer1', { bookId: 'b1' } as any),
      ).rejects.toThrow('did not return a checkout URL');
    });
  });

  // Mimics a stripe-node StripeInvalidRequestError for a missing account.
  const accountGoneError = () =>
    Object.assign(new Error("No such account: 'acct_old'"), {
      code: 'resource_missing',
      param: 'account',
    });

  describe('createAccountLink', () => {
    it('reuses the stored account when it is valid', async () => {
      fs.seed('users/u1', { stripeAccountId: 'acct_existing' });
      const { url } = await svc.createAccountLink('u1', undefined, 'live');
      expect(url).toBe('https://onboard.link');
      expect(stripeMock.accounts.create).not.toHaveBeenCalled();
      expect(stripeMock.accountLinks.create.mock.calls[0]![0].account).toBe(
        'acct_existing',
      );
    });

    it('re-onboards when the stored account is gone for this key', async () => {
      fs.seed('users/u1', { stripeAccountId: 'acct_old' });
      stripeMock.accountLinks.create.mockRejectedValueOnce(accountGoneError());
      const { url } = await svc.createAccountLink('u1', 'me@example.com', 'live');
      expect(url).toBe('https://onboard.link');
      expect(stripeMock.accounts.create).toHaveBeenCalledTimes(1);
      expect(fs.dump('users/u1')!.stripeAccountId).toBe('acct_new');
      // the retry targets the freshly created account
      expect(stripeMock.accountLinks.create.mock.calls[1]![0].account).toBe(
        'acct_new',
      );
    });
  });

  describe('syncAccountStatus', () => {
    it('forgets the stored account and reports not-connected when it is gone', async () => {
      fs.seed('users/u1', {
        stripeAccountId: 'acct_old',
        payoutsEnabled: true,
      });
      stripeMock.accounts.retrieve.mockRejectedValueOnce(accountGoneError());
      const status = await svc.syncAccountStatus('u1', 'live');
      expect(status).toEqual({
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
      const user = fs.dump('users/u1')!;
      expect(user.stripeAccountId).toBeUndefined();
      expect(user.payoutsEnabled).toBe(false);
    });

    it('returns all-false and writes nothing when no connected account', async () => {
      fs.seed('users/u1', { username: 'alice' });
      const status = await svc.syncAccountStatus('u1');
      expect(status).toEqual({
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      });
      expect(stripeService.forMode).not.toHaveBeenCalled();
      expect(fs.dump('users/u1')!.payoutsEnabled).toBeUndefined();
    });

    it('mirrors Stripe account flags onto the users doc', async () => {
      fs.seed('users/u1', { stripeAccountId: 'acct_1' });
      stripeMock.accounts.retrieve.mockResolvedValueOnce({
        payouts_enabled: true,
        charges_enabled: false,
        details_submitted: true,
      } as any);
      const status = await svc.syncAccountStatus('u1');
      expect(status).toEqual({
        stripeAccountId: 'acct_1',
        payoutsEnabled: true,
        chargesEnabled: false,
        detailsSubmitted: true,
      });
      const user = fs.dump('users/u1')!;
      expect(user.payoutsEnabled).toBe(true);
      expect(user.chargesEnabled).toBe(false);
      expect(user.detailsSubmitted).toBe(true);
      expect(typeof user.stripeAccountUpdatedAt).toBe('number');
      expect(stripeMock.accounts.retrieve).toHaveBeenCalledWith('acct_1');
    });
  });

  describe('getSellerBalance', () => {
    it('returns zero when there is no connected account', async () => {
      fs.seed('users/u1', { username: 'alice' });
      const bal = await svc.getSellerBalance('u1');
      expect(bal).toEqual({ availableUsd: 0, pendingUsd: 0 });
      expect(stripeMock.balance.retrieve).not.toHaveBeenCalled();
    });

    it('sums only usd entries and converts cents to dollars', async () => {
      fs.seed('users/u1', { stripeAccountId: 'acct_1' });
      stripeMock.balance.retrieve.mockResolvedValueOnce({
        available: [
          { amount: 1234, currency: 'usd' },
          { amount: 500, currency: 'usd' },
          { amount: 9999, currency: 'eur' },
        ],
        pending: [{ amount: 250, currency: 'usd' }],
      } as any);
      const bal = await svc.getSellerBalance('u1');
      // available usd = 1234 + 500 = 1734 cents -> 17.34; pending = 250 -> 2.5
      expect(bal).toEqual({ availableUsd: 17.34, pendingUsd: 2.5 });
      expect(stripeMock.balance.retrieve).toHaveBeenCalledWith(
        {},
        { stripeAccount: 'acct_1' },
      );
    });
  });

  it('unused import guard', () => {
    expect(makeAuthUser).toBeDefined();
  });
});
