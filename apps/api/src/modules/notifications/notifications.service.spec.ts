import { NotificationsService } from './notifications.service';
import { FakeFirestore, createFakeMessaging } from '../../testing/test-utils';

describe('NotificationsService', () => {
  let fs: FakeFirestore;
  let messaging: ReturnType<typeof createFakeMessaging>;
  let svc: NotificationsService;

  // Seed usernames/{recipient.toLowerCase()} -> uid -> users/{uid}.
  const seedRecipient = (
    username: string,
    uid: string,
    over: {
      fcmTokens?: string[];
      notificationPrefs?: Record<string, unknown>;
    } = {},
  ) => {
    fs.seed(`usernames/${username.toLowerCase()}`, { uid });
    fs.seed(`users/${uid}`, {
      fcmTokens: over.fcmTokens ?? ['tok_a', 'tok_b'],
      ...(over.notificationPrefs !== undefined
        ? { notificationPrefs: over.notificationPrefs }
        : {}),
    });
  };

  beforeEach(() => {
    fs = new FakeFirestore();
    messaging = createFakeMessaging();
    svc = new NotificationsService(fs as any, messaging as any);
  });

  // The single notification doc the service just wrote (only one collection used).
  const onlyNotif = () => {
    for (const [path, doc] of fs.all().entries()) {
      if (path.startsWith('notifications/')) return doc;
    }
    return undefined;
  };

  describe('create', () => {
    it('writes a notification and filters out undefined fields', async () => {
      seedRecipient('bob', 'u2');
      const res = await svc.create('alice', {
        recipient: 'bob',
        title: 'New comment',
        message: 'Someone replied',
        icon: 'comment-icon',
        category: 'comments',
        // targetId / targetChapterIndex / commentId left undefined
      } as any);

      expect(res.id).toBeDefined();
      const notif = fs.dump(`notifications/${res.id}`)!;
      expect(notif.id).toBe(res.id);
      expect(notif.title).toBe('New comment');
      expect(notif.message).toBe('Someone replied');
      expect(notif.icon).toBe('comment-icon');
      expect(notif.recipient).toBe('bob');
      expect(notif.sender).toBe('alice');
      expect(notif.read).toBe(false);
      expect(notif.category).toBe('comments');
      expect(notif.timestamp).toBeDefined();
      // undefined optionals must be filtered out, not stored as undefined keys.
      expect('targetId' in notif).toBe(false);
      expect('targetChapterIndex' in notif).toBe(false);
      expect('commentId' in notif).toBe(false);
    });

    it('prefers dto.sender over the fallback sender argument', async () => {
      seedRecipient('bob', 'u2');
      const res = await svc.create('fallback', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        sender: 'explicit',
        category: 'comments',
      } as any);
      expect(fs.dump(`notifications/${res.id}`)!.sender).toBe('explicit');
    });

    it('runs pushFanout and sends via messaging on a happy path', async () => {
      seedRecipient('bob', 'u2', { fcmTokens: ['tok_a', 'tok_b'] });
      await svc.create('alice', {
        recipient: 'bob',
        title: 'Title',
        message: 'Body',
        icon: 'i',
        category: 'comments',
        targetId: 'b1',
        targetChapterIndex: 3,
        commentId: 'c9',
      } as any);

      expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
      const arg = messaging.sendEachForMulticast.mock.calls[0]![0];
      expect(arg.tokens).toEqual(['tok_a', 'tok_b']);
      expect(arg.notification).toEqual({ title: 'Title', body: 'Body' });
      expect(arg.data).toEqual({
        category: 'comments',
        targetId: 'b1',
        targetChapterIndex: '3',
        commentId: 'c9',
        sender: 'alice',
        title: 'Title',
      });
      expect(arg.apns).toEqual({ payload: { aps: { sound: 'default' } } });
    });

    it('does not throw if pushFanout fails (best-effort)', async () => {
      seedRecipient('bob', 'u2');
      messaging.sendEachForMulticast.mockRejectedValueOnce(new Error('boom'));
      const res = await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      // create still resolves and the doc is written despite the push failure.
      expect(fs.dump(`notifications/${res.id}`)).toBeDefined();
    });
  });

  describe('pushFanout (via create)', () => {
    it('skips when category is system', async () => {
      seedRecipient('bob', 'u2');
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'system',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('skips when there is no category', async () => {
      seedRecipient('bob', 'u2');
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('skips when sender === recipient', async () => {
      seedRecipient('bob', 'u2');
      await svc.create('bob', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('skips when the username doc has no uid', async () => {
      fs.seed('usernames/bob', {}); // no uid
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('skips when the user doc is missing', async () => {
      fs.seed('usernames/bob', { uid: 'u2' }); // no users/u2 doc
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('resolves the recipient username case-insensitively', async () => {
      // usernames doc is keyed lowercase; recipient supplied with mixed case.
      fs.seed('usernames/bob', { uid: 'u2' });
      fs.seed('users/u2', { fcmTokens: ['tok_a'] });
      await svc.create('alice', {
        recipient: 'BoB',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    it('does not send when master push pref is false', async () => {
      seedRecipient('bob', 'u2', {
        notificationPrefs: { push: false, comments: true },
      });
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('does not send when the per-category pref is off', async () => {
      seedRecipient('bob', 'u2', {
        notificationPrefs: { comments: false },
      });
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('always sends messages even when no messages pref is set', async () => {
      // messages category is exempt from per-category gating.
      seedRecipient('bob', 'u2', {
        notificationPrefs: { comments: false, bookLikes: false },
      });
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'messages',
      } as any);
      expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    it('uses the default prefs (all on) when notificationPrefs is absent', async () => {
      seedRecipient('bob', 'u2'); // no notificationPrefs seeded
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'bookLikes',
      } as any);
      expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    it('does not send when there are no tokens', async () => {
      seedRecipient('bob', 'u2', { fcmTokens: [] });
      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);
      expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('prunes a stale token when messaging reports not-registered', async () => {
      seedRecipient('bob', 'u2', { fcmTokens: ['tok_good', 'tok_stale'] });
      messaging.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
        ],
      } as any);

      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);

      expect(fs.dump('users/u2')!.fcmTokens).toEqual(['tok_good']);
    });

    it('prunes an invalid-registration-token too', async () => {
      seedRecipient('bob', 'u2', { fcmTokens: ['tok_good', 'tok_bad'] });
      messaging.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token' },
          },
        ],
      } as any);

      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);

      expect(fs.dump('users/u2')!.fcmTokens).toEqual(['tok_good']);
    });

    it('does not prune tokens for unrelated send failures', async () => {
      seedRecipient('bob', 'u2', { fcmTokens: ['tok_a', 'tok_b'] });
      messaging.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      } as any);

      await svc.create('alice', {
        recipient: 'bob',
        title: 't',
        message: 'm',
        icon: 'i',
        category: 'comments',
      } as any);

      expect(fs.dump('users/u2')!.fcmTokens).toEqual(['tok_a', 'tok_b']);
    });
  });

  describe('listForRecipient', () => {
    it('returns only the recipient’s notifications with their id', async () => {
      fs.seed('notifications/n1', { recipient: 'bob', title: 'A', read: false });
      fs.seed('notifications/n2', { recipient: 'bob', title: 'B', read: true });
      fs.seed('notifications/n3', { recipient: 'carol', title: 'C' });
      const out = await svc.listForRecipient('bob');
      expect(out.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
      expect(out.every((n) => n.recipient === 'bob')).toBe(true);
    });
  });

  describe('markAllRead', () => {
    it('flips only unread notifications for the recipient', async () => {
      fs.seed('notifications/n1', { recipient: 'bob', read: false });
      fs.seed('notifications/n2', { recipient: 'bob', read: true });
      fs.seed('notifications/n3', { recipient: 'carol', read: false });
      await svc.markAllRead('bob');
      expect(fs.dump('notifications/n1')!.read).toBe(true);
      expect(fs.dump('notifications/n2')!.read).toBe(true);
      // a different recipient is untouched.
      expect(fs.dump('notifications/n3')!.read).toBe(false);
    });

    it('is a no-op when there is nothing unread', async () => {
      fs.seed('notifications/n1', { recipient: 'bob', read: true });
      await expect(svc.markAllRead('bob')).resolves.toBeUndefined();
      expect(fs.dump('notifications/n1')!.read).toBe(true);
    });
  });

  describe('markRead', () => {
    it('marks a single notification read', async () => {
      fs.seed('notifications/n1', { recipient: 'bob', read: false });
      await svc.markRead('n1');
      expect(fs.dump('notifications/n1')!.read).toBe(true);
    });

    it('swallows the error for a missing notification', async () => {
      await expect(svc.markRead('does-not-exist')).resolves.toBeUndefined();
    });
  });

  describe('notifyFollowersOfPublication', () => {
    const allNotifs = () =>
      Array.from(fs.all().entries())
        .filter(([p]) => p.startsWith('notifications/'))
        .map(([, d]) => d);

    it('fans out to the author’s followers (admirers), excluding the author', async () => {
      // Followers of alice: bob, carol. dave admires someone else.
      fs.seed('relationships/e_bob:alice', { admirer: 'bob', target: 'alice' });
      fs.seed('relationships/e_carol:alice', {
        admirer: 'carol',
        target: 'alice',
      });
      fs.seed('relationships/e_dave:zed', { admirer: 'dave', target: 'zed' });
      // an edge FROM alice must not turn alice into her own recipient.
      fs.seed('relationships/e_alice:bob', { admirer: 'alice', target: 'bob' });

      await svc.notifyFollowersOfPublication({
        authorUsername: 'alice',
        title: 'New Book',
        message: 'alice published a new book: "X"',
        icon: 'auto_stories',
        bookId: 'b1',
      });

      const notifs = allNotifs();
      expect(notifs.map((n) => n.recipient).sort()).toEqual(['bob', 'carol']);
      expect(notifs.every((n) => n.category === 'appUpdates')).toBe(true);
      expect(notifs.every((n) => n.sender === 'alice')).toBe(true);
      expect(notifs.every((n) => n.targetId === 'b1')).toBe(true);
    });

    it('adds library owners when includeLibraryOwners is set (deduped, author excluded)', async () => {
      fs.seed('relationships/e_bob:alice', { admirer: 'bob', target: 'alice' });
      // carol owns b1 but does not follow alice.
      fs.seed('users/uc', { username: 'carol', ownedBookIds: ['b1', 'b2'] });
      // bob both follows AND owns — must not be notified twice.
      fs.seed('users/ub', { username: 'bob', ownedBookIds: ['b1'] });
      // the author owns their own book — must be excluded.
      fs.seed('users/ua', { username: 'alice', ownedBookIds: ['b1'] });

      await svc.notifyFollowersOfPublication({
        authorUsername: 'alice',
        title: 'New Chapter',
        message: '"X" has a new chapter!',
        icon: 'menu_book',
        bookId: 'b1',
        includeLibraryOwners: true,
      });

      expect(allNotifs().map((n) => n.recipient).sort()).toEqual([
        'bob',
        'carol',
      ]);
    });

    it('does not query owners (or notify anyone) without followers or includeLibraryOwners', async () => {
      // b1 is in carol’s library, but this is the new-book path (no library
      // fan-out) and alice has no followers → nothing is written.
      fs.seed('users/uc', { username: 'carol', ownedBookIds: ['b1'] });
      await svc.notifyFollowersOfPublication({
        authorUsername: 'alice',
        title: 'New Book',
        message: 'm',
        icon: 'auto_stories',
        bookId: 'b1',
      });
      expect(allNotifs()).toHaveLength(0);
    });
  });

  it('unused import guard', () => {
    expect(onlyNotif).toBeDefined();
  });
});
