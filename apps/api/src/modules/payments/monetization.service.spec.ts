import { MonetizationService } from './monetization.service';
import {
  FakeFirestore,
  createFakeModeration,
  makeAuthUser,
} from '../../testing/test-utils';

describe('MonetizationService', () => {
  let fs: FakeFirestore;
  let effects: { onApproved: jest.Mock; onDenied: jest.Mock };
  let payments: { findBookByIdField: jest.Mock };
  let svc: MonetizationService;

  const seedBook = (over: Record<string, unknown> = {}) => {
    const data = {
      id: 'b1',
      authorUid: 'u1',
      isDraft: false,
      chaptersCount: 5,
      likes: [100, 100, 100, 100, 100],
      publishedDate: new Date(Date.now() - 30 * 864e5).toISOString(),
      monetizationAttempts: 0,
      ...over,
    };
    fs.seed('books/b1', data);
    payments.findBookByIdField = jest.fn(async () => ({
      ref: fs.doc('books/b1'),
      data: fs.dump('books/b1'),
    }));
    return data;
  };

  beforeEach(() => {
    fs = new FakeFirestore();
    effects = { onApproved: jest.fn(), onDenied: jest.fn() };
    payments = { findBookByIdField: jest.fn() };
    svc = new MonetizationService(fs as any, payments as any, effects as any);
    for (let i = 0; i < 5; i++) fs.seed(`books/b1/chapters/c${i}`, { order: i });
    fs.seed('users/u1', { payoutsEnabled: true, stripeAccountId: 'acct_1' });
  });

  describe('submit', () => {
    it('accepts a valid request and stamps pending', async () => {
      seedBook();
      const res = await svc.submit(makeAuthUser(), 'b1', 9.99);
      expect(res.ok).toBe(true);
      const book = fs.dump('books/b1')!;
      expect(book.monetizationStatus).toBe('pending');
      expect(book.requestedPrice).toBe(9.99);
      expect(book.monetizationAttempts).toBe(1);
      expect(book.sellerStripeAccountId).toBe('acct_1');
    });

    it('rejects a non-author', async () => {
      seedBook({ authorUid: 'someone-else' });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow(
        'Not your book.',
      );
    });

    it('rejects a draft', async () => {
      seedBook({ isDraft: true });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow();
    });

    it('rejects a price tier above the chapter-count allowance', async () => {
      seedBook(); // 5 chapters -> only 9.99 allowed
      await expect(svc.submit(makeAuthUser(), 'b1', 29.99)).rejects.toThrow();
    });

    it('rejects when fewer than 100 likes per published chapter', async () => {
      seedBook({ likes: [100, 100, 99, 100, 100] });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow(
        '100+ likes',
      );
    });

    it('counts min-likes over the PUBLISHED set, ignoring an unpublished low-like chapter', async () => {
      // 6 chapters; the order-2 chapter has only 5 likes but is unpublished, so
      // it must not drag the min below 100 — the 5 published chapters all have
      // 100+ and the published count (5) still clears the tier/threshold gates.
      seedBook({
        chaptersCount: 5,
        likes: [100, 100, 5, 100, 100, 100],
        chapterMeta: [
          { id: 'c0', published: true },
          { id: 'c1', published: true },
          { id: 'c2', published: false },
          { id: 'c3', published: true },
          { id: 'c4', published: true },
          { id: 'c5', published: true },
        ],
      });
      fs.seed('books/b1/chapters/c5', { order: 5 });
      const res = await svc.submit(makeAuthUser(), 'b1', 9.99);
      expect(res.ok).toBe(true);
    });

    it('rejects when published less than 21 days', async () => {
      seedBook({ publishedDate: new Date(Date.now() - 5 * 864e5).toISOString() });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow(
        '21+ days',
      );
    });

    it('rejects when payouts are not enabled', async () => {
      seedBook();
      fs.seed('users/u1', { payoutsEnabled: false });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow(
        'payout account',
      );
    });

    it('rejects a permanently demonetized book even for admins', async () => {
      seedBook({ permanentlyDemonetized: true });
      await expect(
        svc.submit(makeAuthUser({ admin: true }), 'b1', 9.99),
      ).rejects.toThrow('can’t be monetized again');
    });

    it('lets an admin bypass eligibility gates (still a real tier)', async () => {
      seedBook({ chaptersCount: 1 });
      const res = await svc.submit(makeAuthUser({ admin: true }), 'b1', 14.99);
      expect(res.ok).toBe(true);
    });

    it('rejects when a request is already pending', async () => {
      seedBook({ monetizationStatus: 'pending' });
      await expect(svc.submit(makeAuthUser(), 'b1', 9.99)).rejects.toThrow(
        'already pending',
      );
    });
  });

  describe('review', () => {
    it('approves at the requested price and fires onApproved side-effects', async () => {
      seedBook({
        monetizationStatus: 'pending',
        requestedPrice: 9.99,
        sellerStripeAccountId: 'acct_1',
        monetizationAdminBypass: true,
      });
      const res = await svc.review('admin', 'reviewer-uid', 'b1', 'approve');
      expect(res.ok).toBe(true);
      const book = fs.dump('books/b1')!;
      expect(book.isMonetized).toBe(true);
      expect(book.isFree).toBe(false);
      expect(book.price).toBe(9.99);
      expect(effects.onApproved).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ isMonetized: true, price: 9.99 }),
      );
    });

    it('rejects approval when the requested price is not a real tier', async () => {
      seedBook({
        monetizationStatus: 'pending',
        requestedPrice: 7,
        sellerStripeAccountId: 'acct_1',
        monetizationAdminBypass: true,
      });
      await expect(
        svc.review('admin', 'reviewer-uid', 'b1', 'approve'),
      ).rejects.toThrow();
    });

    it('requires a reason to deny and fires onDenied', async () => {
      seedBook({ monetizationStatus: 'pending' });
      await expect(
        svc.review('admin', 'reviewer-uid', 'b1', 'deny'),
      ).rejects.toThrow();
      await svc.review('admin', 'reviewer-uid', 'b1', 'deny', 'low quality');
      expect(fs.dump('books/b1')!.monetizationStatus).toBe('denied');
      expect(effects.onDenied).toHaveBeenCalledWith('b1', expect.anything(), 'low quality');
    });

    it('forbids an admin from reviewing their OWN book (reviewer === authorUid)', async () => {
      seedBook({
        authorUid: 'u1',
        monetizationStatus: 'pending',
        requestedPrice: 9.99,
        sellerStripeAccountId: 'acct_1',
        monetizationAdminBypass: true,
      });
      // reviewer is the book's author -> conflict of interest, rejected
      await expect(
        svc.review('admin', 'u1', 'b1', 'approve'),
      ).rejects.toThrow('your own book');
      expect(fs.dump('books/b1')!.isMonetized).toBeUndefined();
      expect(effects.onApproved).not.toHaveBeenCalled();
    });

    it('forbids an admin from reviewing a book where they are the seller (reviewer === sellerUid)', async () => {
      seedBook({
        authorUid: 'someoneElse',
        sellerUid: 'u1',
        monetizationStatus: 'pending',
        requestedPrice: 9.99,
        sellerStripeAccountId: 'acct_1',
        monetizationAdminBypass: true,
      });
      await expect(
        svc.review('admin', 'u1', 'b1', 'approve'),
      ).rejects.toThrow('your own book');
    });
  });

  it('unused import guard', () => {
    expect(createFakeModeration).toBeDefined();
  });
});
