import { RewardsService } from './rewards.service';
import { FakeFirestore } from '../../testing/test-utils';

function createFakeNotifications() {
  return { create: jest.fn(async () => ({ id: 'n1' })) };
}

describe('RewardsService', () => {
  let fs: FakeFirestore;
  let notifications: ReturnType<typeof createFakeNotifications>;
  let svc: RewardsService;

  beforeEach(() => {
    fs = new FakeFirestore();
    notifications = createFakeNotifications();
    svc = new RewardsService(fs as any, notifications as any);
  });

  describe('awardEarnedPoints', () => {
    it('credits points + dailyEarnedPoints and stamps the reset', async () => {
      fs.seed('users/u1', { uid: 'u1', points: 10 });
      const awarded = await svc.awardEarnedPoints('u1', 2);
      expect(awarded).toBe(2);
      const u = fs.dump('users/u1')!;
      expect(u.points).toBe(12);
      expect(u.dailyEarnedPoints).toBe(2);
      expect(typeof u.lastPointsReset).toBe('number');
    });

    it('clamps to the 25/day cap', async () => {
      fs.seed('users/u1', {
        uid: 'u1',
        points: 100,
        dailyEarnedPoints: 24,
        lastPointsReset: Date.now(),
      });
      const awarded = await svc.awardEarnedPoints('u1', 5);
      expect(awarded).toBe(1); // only 1 left before the 25 cap
      expect(fs.dump('users/u1')!.points).toBe(101);
    });

    it('awards nothing once the cap is reached', async () => {
      fs.seed('users/u1', {
        uid: 'u1',
        points: 100,
        dailyEarnedPoints: 25,
        lastPointsReset: Date.now(),
      });
      expect(await svc.awardEarnedPoints('u1', 2)).toBe(0);
      expect(fs.dump('users/u1')!.points).toBe(100);
    });

    it('resets the daily counter after 24h', async () => {
      fs.seed('users/u1', {
        uid: 'u1',
        points: 100,
        dailyEarnedPoints: 25,
        lastPointsReset: Date.now() - 25 * 60 * 60 * 1000,
      });
      expect(await svc.awardEarnedPoints('u1', 2)).toBe(2);
      const u = fs.dump('users/u1')!;
      expect(u.points).toBe(102);
      expect(u.dailyEarnedPoints).toBe(2);
    });
  });

  describe('onChapterLikeChanged', () => {
    const book = {
      id: 'b1',
      authorUid: 'author',
      authorUsername: 'bob',
      chapterMeta: [{ title: 'Ch1' }],
    };

    it('awards 2 + notifies when crossing a multiple of 10', async () => {
      fs.seed('users/author', { uid: 'author', points: 0 });
      await svc.onChapterLikeChanged(book, 0, 9, 10);
      expect(fs.dump('users/author')!.points).toBe(2);
      expect(notifications.create).toHaveBeenCalledTimes(1);
      const [, dto] = notifications.create.mock.calls[0];
      expect(dto.recipient).toBe('bob');
      expect(dto.category).toBe('bookLikes');
    });

    it('does nothing when no multiple of 10 is crossed', async () => {
      fs.seed('users/author', { uid: 'author', points: 0 });
      await svc.onChapterLikeChanged(book, 0, 8, 9);
      expect(fs.dump('users/author')!.points).toBe(0);
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('onCommentLikesChanged', () => {
    it('awards 1 + notifies when crossing 50, resolving author via usernames', async () => {
      fs.seed('usernames/bob', { uid: 'author' });
      fs.seed('users/author', { uid: 'author', points: 0 });
      await svc.onCommentLikesChanged(
        { id: 'c1', authorUsername: 'bob', bookId: 'b1', chapterIndex: 0 },
        49,
        50,
      );
      expect(fs.dump('users/author')!.points).toBe(1);
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('does nothing below the threshold', async () => {
      fs.seed('usernames/bob', { uid: 'author' });
      fs.seed('users/author', { uid: 'author', points: 0 });
      await svc.onCommentLikesChanged(
        { id: 'c1', authorUsername: 'bob' },
        10,
        11,
      );
      expect(fs.dump('users/author')!.points).toBe(0);
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('claimDaily', () => {
    it('awards 3 the first time and refuses within 24h', async () => {
      fs.seed('users/u1', { uid: 'u1', points: 0 });
      const first = await svc.claimDaily('u1');
      expect(first.claimed).toBe(true);
      expect(first.awarded).toBe(3);
      expect(fs.dump('users/u1')!.points).toBe(3);

      const second = await svc.claimDaily('u1');
      expect(second.claimed).toBe(false);
      expect(second.nextAvailableAt).toBeGreaterThan(Date.now());
    });

    it('awards 6 for premium members', async () => {
      fs.seed('users/u1', { uid: 'u1', points: 0, isPremium: true });
      const r = await svc.claimDaily('u1');
      expect(r.awarded).toBe(6);
    });
  });

  describe('spendForSpin', () => {
    it('debits 150 when affordable', async () => {
      fs.seed('users/u1', { uid: 'u1', points: 200 });
      const r = await svc.spendForSpin('u1');
      expect(r.ok).toBe(true);
      expect(r.points).toBe(50);
      expect(fs.dump('users/u1')!.points).toBe(50);
    });

    it('refuses when below 150', async () => {
      fs.seed('users/u1', { uid: 'u1', points: 100 });
      const r = await svc.spendForSpin('u1');
      expect(r.ok).toBe(false);
      expect(fs.dump('users/u1')!.points).toBe(100);
    });
  });

  describe('applyMembershipReward', () => {
    it('grants 200 after 25h for a premium member with no prior reward', async () => {
      fs.seed('users/u1', {
        uid: 'u1',
        points: 0,
        isPremium: true,
        membershipStartDate: Date.now() - 26 * 60 * 60 * 1000,
      });
      await svc.applyMembershipReward('u1');
      const u = fs.dump('users/u1')!;
      expect(u.points).toBe(200);
      expect(typeof u.lastMembershipRewardDate).toBe('number');
    });

    it('does nothing for a non-premium user', async () => {
      fs.seed('users/u1', {
        uid: 'u1',
        points: 0,
        membershipStartDate: Date.now() - 26 * 60 * 60 * 1000,
      });
      await svc.applyMembershipReward('u1');
      expect(fs.dump('users/u1')!.points).toBe(0);
    });
  });
});
