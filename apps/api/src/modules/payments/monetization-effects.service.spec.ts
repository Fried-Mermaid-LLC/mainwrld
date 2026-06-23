import { MonetizationEffectsService } from './monetization-effects.service';
import { FakeFirestore, createFakeEmail } from '../../testing/test-utils';

// Collect every notification doc currently in the notifications collection.
const notifications = (fs: FakeFirestore) =>
  [...fs.all().entries()]
    .filter(([p]) => p.startsWith('notifications/') && !p.slice('notifications/'.length).includes('/'))
    .map(([, d]) => d as Record<string, unknown>);

describe('MonetizationEffectsService', () => {
  let fs: FakeFirestore;
  let email: ReturnType<typeof createFakeEmail>;
  let svc: MonetizationEffectsService;

  const after = (over: Record<string, unknown> = {}) => ({
    title: 'My Book',
    authorUsername: 'alice',
    authorUid: 'author1',
    ...over,
  });

  beforeEach(() => {
    fs = new FakeFirestore();
    email = createFakeEmail();
    svc = new MonetizationEffectsService(fs as any, email as any);
    // Author of the book.
    fs.seed('users/author1', { username: 'alice', ownedBookIds: ['b1'] });
  });

  describe('onApproved', () => {
    it('grandfathers library owners, notifies owners + author, emails author', async () => {
      fs.seed('users/u2', { username: 'bob', ownedBookIds: ['b1'] });
      fs.seed('users/u3', { username: 'carol', ownedBookIds: ['b1'] });

      await svc.onApproved('b1', after());

      // Non-author owners get the book added to purchasedBookIds.
      expect(fs.dump('users/u2')!.purchasedBookIds).toEqual(['b1']);
      expect(fs.dump('users/u3')!.purchasedBookIds).toEqual(['b1']);
      // Author is NOT granted a purchase.
      expect(fs.dump('users/author1')!.purchasedBookIds).toBeUndefined();

      const notifs = notifications(fs);
      const monetized = notifs.filter((n) => n.title === 'Book Monetized');
      expect(monetized.map((n) => n.recipient).sort()).toEqual(['bob', 'carol']);
      expect(monetized[0]).toMatchObject({
        message: '"My Book" is now a paid book.',
        icon: 'paid',
        sender: 'alice',
        targetId: 'b1',
        read: false,
      });

      // Author gets the approval notification.
      const approved = notifs.filter((n) => n.title === 'Monetization Approved');
      expect(approved).toHaveLength(1);
      expect(approved[0]).toMatchObject({
        recipient: 'alice',
        sender: 'MainWRLD',
        targetId: 'b1',
        icon: 'paid',
      });

      // Author email sent.
      expect(email.userContact).toHaveBeenCalledWith('author1');
      expect(email.send).toHaveBeenCalledTimes(1);
      const [to, subject] = email.send.mock.calls[0];
      expect(to).toBe('author1@test.com');
      expect(subject).toBe('Your monetization request has been accepted');
    });

    it('does not grant a purchase or notification to the author owner', async () => {
      // Only the author owns the book.
      await svc.onApproved('b1', after());

      expect(fs.dump('users/author1')!.purchasedBookIds).toBeUndefined();
      // No "Book Monetized" notif (author skipped), only the author approval one.
      const notifs = notifications(fs);
      expect(notifs.filter((n) => n.title === 'Book Monetized')).toHaveLength(0);
      expect(notifs.filter((n) => n.title === 'Monetization Approved')).toHaveLength(1);
    });

    it('grants the purchase but skips the notification for owners with no username', async () => {
      fs.seed('users/u2', { ownedBookIds: ['b1'] }); // no username

      await svc.onApproved('b1', after());

      expect(fs.dump('users/u2')!.purchasedBookIds).toEqual(['b1']);
      expect(notifications(fs).filter((n) => n.title === 'Book Monetized')).toHaveLength(0);
    });

    it('skips the Book Monetized notification for an owner whose username equals the author', async () => {
      // A duplicate account sharing the author's username.
      fs.seed('users/u2', { username: 'alice', ownedBookIds: ['b1'] });

      await svc.onApproved('b1', after());

      // Still grants the purchase (it's not the authorUid)...
      expect(fs.dump('users/u2')!.purchasedBookIds).toEqual(['b1']);
      // ...but no Book Monetized notif because username === authorUsername.
      expect(notifications(fs).filter((n) => n.title === 'Book Monetized')).toHaveLength(0);
    });

    it('falls back to "A book" title and skips author email when no contact email', async () => {
      email.userContact.mockResolvedValueOnce({
        email: null,
        displayName: 'Tester',
        username: 'tester',
      });

      await svc.onApproved('b1', after({ title: undefined }));

      const approved = notifications(fs).find((n) => n.title === 'Monetization Approved');
      expect(approved).toBeDefined();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('skips the author approval notification when authorUsername is missing', async () => {
      fs.seed('users/u2', { username: 'bob', ownedBookIds: ['b1'] });

      await svc.onApproved('b1', after({ authorUsername: undefined }));

      // Owner still gets purchase + book-monetized notif (sender falls back to MainWRLD).
      expect(fs.dump('users/u2')!.purchasedBookIds).toEqual(['b1']);
      const notifs = notifications(fs);
      const monetized = notifs.filter((n) => n.title === 'Book Monetized');
      expect(monetized).toHaveLength(1);
      expect(monetized[0].sender).toBe('MainWRLD');
      // No author approval notif.
      expect(notifs.filter((n) => n.title === 'Monetization Approved')).toHaveLength(0);
    });
  });

  describe('onDenied', () => {
    it('notifies and emails the author with the reason', async () => {
      await svc.onDenied('b1', after(), 'low quality');

      const denied = notifications(fs).filter((n) => n.title === 'Monetization Denied');
      expect(denied).toHaveLength(1);
      expect(denied[0]).toMatchObject({
        message: 'Your monetization request was denied: low quality',
        icon: 'money_off',
        recipient: 'alice',
        sender: 'MainWRLD',
        targetId: 'b1',
        read: false,
      });

      expect(email.userContact).toHaveBeenCalledWith('author1');
      expect(email.send).toHaveBeenCalledTimes(1);
      const [to, subject] = email.send.mock.calls[0];
      expect(to).toBe('author1@test.com');
      expect(subject).toBe('Your monetization request has been denied');
    });

    it('falls back to "a policy review" when no reason is given', async () => {
      await svc.onDenied('b1', after(), '');

      const denied = notifications(fs).find((n) => n.title === 'Monetization Denied');
      expect(denied!.message).toBe(
        'Your monetization request was denied: a policy review',
      );
    });

    it('does nothing when authorUsername is missing', async () => {
      await svc.onDenied('b1', after({ authorUsername: undefined }), 'low quality');

      expect(notifications(fs)).toHaveLength(0);
      expect(email.userContact).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('still notifies but skips email when the author has no contact email', async () => {
      email.userContact.mockResolvedValueOnce({
        email: null,
        displayName: 'Tester',
        username: 'tester',
      });

      await svc.onDenied('b1', after(), 'spam');

      expect(notifications(fs)).toHaveLength(1);
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('onDemonetized', () => {
    it('stamps the permanence flags on the ref', async () => {
      fs.seed('books/b1', { isMonetized: true });

      await svc.onDemonetized(fs.doc('books/b1') as any);

      const book = fs.dump('books/b1')!;
      expect(book.permanentlyDemonetized).toBe(true);
      expect(book.wasMonetizedBefore).toBe(true);
      // Existing fields are preserved (merge update).
      expect(book.isMonetized).toBe(true);
    });

    it('swallows errors when the ref has no document', async () => {
      // update() on a missing doc throws inside, but onDemonetized catches it.
      await expect(
        svc.onDemonetized(fs.doc('books/missing') as any),
      ).resolves.toBeUndefined();
      expect(fs.dump('books/missing')).toBeUndefined();
    });
  });
});
