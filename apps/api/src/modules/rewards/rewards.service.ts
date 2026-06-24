import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { NotificationsService } from '../notifications/notifications.service';

// Points economy (server-authoritative). Every points mutation goes through this
// service so the balance is owned by the server (atomic FieldValue.increment),
// never by the client's debounced profile autosave — which would otherwise
// clobber server-side awards whenever the author is online. Mirrors the values
// the client used to apply locally (see the old apps/app useRewards.ts).
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;
const MEMBERSHIP_REWARD_AFTER_MS = 25 * 60 * 60 * 1000;

const MAX_DAILY_EARNED_POINTS = 25; // keep in sync with the client constant
const CHAPTER_LIKES_THRESHOLD = 10;
const COMMENT_LIKES_THRESHOLD = 50;
const CHAPTER_LIKE_POINTS = 2;
const COMMENT_LIKE_POINTS = 1;
const DAILY_CLAIM_POINTS = 3;
const DAILY_CLAIM_POINTS_PREMIUM = 6;
const SPIN_COST = 150;
const MEMBERSHIP_BONUS = 200;

type UserData = Record<string, unknown>;

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly notifications: NotificationsService,
  ) {}

  private get users() {
    return this.db.collection(COLLECTIONS.users);
  }

  // Pure cap computation, shared by every earned-points path. Returns the amount
  // actually creditable today (≤ MAX_DAILY_EARNED_POINTS) plus the Firestore
  // field patch that applies it. `now` is passed in so the caller controls the
  // clock inside a transaction retry.
  private capEarned(
    u: UserData,
    amount: number,
    now: number,
  ): { finalAmount: number; fields: Record<string, unknown> } {
    const lastReset = (u.lastPointsReset as number) || 0;
    const isNewDay = !lastReset || now - lastReset > DAY_MS;
    const currentDaily = isNewDay ? 0 : (u.dailyEarnedPoints as number) || 0;
    if (currentDaily >= MAX_DAILY_EARNED_POINTS) {
      return { finalAmount: 0, fields: {} };
    }
    const finalAmount = Math.min(amount, MAX_DAILY_EARNED_POINTS - currentDaily);
    if (finalAmount <= 0) return { finalAmount: 0, fields: {} };
    return {
      finalAmount,
      fields: {
        points: FieldValue.increment(finalAmount),
        dailyEarnedPoints: isNewDay
          ? finalAmount
          : FieldValue.increment(finalAmount),
        lastPointsReset: isNewDay ? now : lastReset,
      },
    };
  }

  // Credit `amount` earned points to a user, honoring the 25/day cap. Returns
  // how many points were actually awarded (0 if the cap was already hit).
  async awardEarnedPoints(uid: string, amount: number): Promise<number> {
    const ref = this.users.doc(uid);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return 0;
      const { finalAmount, fields } = this.capEarned(
        snap.data() as UserData,
        amount,
        Date.now(),
      );
      if (finalAmount > 0) t.update(ref, fields);
      return finalAmount;
    });
  }

  private async resolveUid(username: string): Promise<string | null> {
    const snap = await this.db
      .collection(COLLECTIONS.usernames)
      .doc(username.toLowerCase())
      .get();
    return (snap.data()?.uid as string | undefined) ?? null;
  }

  // ---- Like milestones (called from books/comments update endpoints) ----

  // A chapter's like count crossed from `oldCount` to `newCount` (a single
  // reader liked it; the count is server-aggregated from likedBy). Award the
  // author CHAPTER_LIKE_POINTS for every multiple of 10 newly crossed, and
  // notify them. Awarding is by milestone, not by liker, so it works for likes
  // from ANY user. Best-effort: never throws (the like itself already committed).
  async onChapterLikeChanged(
    book: {
      id: string;
      authorUid?: string;
      authorUsername?: string;
      chapterMeta?: Array<{ title?: string }>;
    },
    chapterIndex: number,
    oldCount: number,
    newCount: number,
  ): Promise<void> {
    try {
      const authorUid = book.authorUid;
      if (!authorUid) return;
      if (newCount <= oldCount) return;
      const crossed =
        Math.floor(newCount / CHAPTER_LIKES_THRESHOLD) -
        Math.floor(oldCount / CHAPTER_LIKES_THRESHOLD);
      if (crossed <= 0) return;
      const awarded = await this.awardEarnedPoints(
        authorUid,
        CHAPTER_LIKE_POINTS * crossed,
      );
      if (!book.authorUsername) return;
      const milestone =
        Math.floor(newCount / CHAPTER_LIKES_THRESHOLD) * CHAPTER_LIKES_THRESHOLD;
      const chapterTitle =
        book.chapterMeta?.[chapterIndex]?.title || `Chapter ${chapterIndex + 1}`;
      await this.notifications.create('MainWRLD', {
        recipient: book.authorUsername,
        title: 'Points Earned',
        message:
          awarded > 0
            ? `Your chapter "${chapterTitle}" hit ${milestone} likes — you earned ${awarded} point${awarded === 1 ? '' : 's'}!`
            : `Your chapter "${chapterTitle}" hit ${milestone} likes!`,
        icon: 'stars',
        category: 'bookLikes',
        targetId: book.id,
        targetChapterIndex: chapterIndex,
      });
    } catch (err) {
      this.logger.error('onChapterLikeChanged failed', err as Error);
    }
  }

  // A comment's like count changed. Award the author COMMENT_LIKE_POINTS for
  // every multiple of 50 newly crossed, and notify them. Best-effort.
  async onCommentLikesChanged(
    comment: {
      id: string;
      authorUsername?: string;
      bookId?: string;
      chapterIndex?: number | null;
    },
    oldLikes: number,
    newLikes: number,
  ): Promise<void> {
    try {
      if (newLikes <= oldLikes) return;
      const crossed =
        Math.floor(newLikes / COMMENT_LIKES_THRESHOLD) -
        Math.floor(oldLikes / COMMENT_LIKES_THRESHOLD);
      if (crossed <= 0) return;
      const authorUsername = comment.authorUsername;
      if (!authorUsername) return;
      const uid = await this.resolveUid(authorUsername);
      if (!uid) return;
      const awarded = await this.awardEarnedPoints(
        uid,
        COMMENT_LIKE_POINTS * crossed,
      );
      const milestone =
        Math.floor(newLikes / COMMENT_LIKES_THRESHOLD) * COMMENT_LIKES_THRESHOLD;
      await this.notifications.create('MainWRLD', {
        recipient: authorUsername,
        title: 'Points Earned',
        message:
          awarded > 0
            ? `Your comment hit ${milestone} likes — you earned ${awarded} point${awarded === 1 ? '' : 's'}!`
            : `Your comment hit ${milestone} likes!`,
        icon: 'stars',
        category: 'comments',
        targetId: comment.bookId,
        targetChapterIndex: comment.chapterIndex ?? undefined,
        commentId: comment.id,
      });
    } catch (err) {
      this.logger.error('onCommentLikesChanged failed', err as Error);
    }
  }

  // ---- Explicit user actions (called from the users controller) ----

  // Daily claim: 3 pts (6 for premium), at most once per 24h, counted against
  // the 25/day earned cap. `lastClaimedPoints` is stamped even when the cap
  // swallows the award — mirroring the old client behavior. Returns the cooldown
  // outcome plus the points actually awarded.
  async claimDaily(uid: string): Promise<{
    claimed: boolean;
    awarded: number;
    nextAvailableAt: number | null;
  }> {
    const ref = this.users.doc(uid);
    const now = Date.now();
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return { claimed: false, awarded: 0, nextAvailableAt: null };
      const u = snap.data() as UserData;
      const last = (u.lastClaimedPoints as number) || 0;
      if (last && now - last < DAY_MS) {
        return { claimed: false, awarded: 0, nextAvailableAt: last + DAY_MS };
      }
      const amount = u.isPremium
        ? DAILY_CLAIM_POINTS_PREMIUM
        : DAILY_CLAIM_POINTS;
      const { finalAmount, fields } = this.capEarned(u, amount, now);
      t.update(ref, { ...fields, lastClaimedPoints: now });
      return { claimed: true, awarded: finalAmount, nextAvailableAt: now + DAY_MS };
    });
  }

  // Spend SPIN_COST points for a coupon-wheel spin. Points are server-owned, but
  // the coupon itself is still generated/evicted client-side (the coupon list
  // stays client-managed). Returns whether the spend succeeded.
  async spendForSpin(uid: string): Promise<{ ok: boolean; points: number }> {
    const ref = this.users.doc(uid);
    return this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return { ok: false, points: 0 };
      const points = (snap.data()?.points as number) || 0;
      if (points < SPIN_COST) return { ok: false, points };
      t.update(ref, { points: FieldValue.increment(-SPIN_COST) });
      return { ok: true, points: points - SPIN_COST };
    });
  }

  // Membership reward: 200 pts once 25h after the membership starts, then yearly.
  // Called best-effort from getMe so it lands without a client timer. NOT subject
  // to the daily earned cap (matches the old awardMembershipBonus).
  async applyMembershipReward(uid: string): Promise<void> {
    try {
      const ref = this.users.doc(uid);
      const now = Date.now();
      await this.db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return;
        const u = snap.data() as UserData;
        if (!u.isPremium || !u.membershipStartDate) return;
        const start = u.membershipStartDate as number;
        const lastReward = u.lastMembershipRewardDate as number | undefined;
        const due = lastReward
          ? now - lastReward >= YEAR_MS
          : now - start >= MEMBERSHIP_REWARD_AFTER_MS;
        if (!due) return;
        t.update(ref, {
          points: FieldValue.increment(MEMBERSHIP_BONUS),
          lastMembershipRewardDate: now,
        });
      });
    } catch (err) {
      this.logger.error('applyMembershipReward failed', err as Error);
    }
  }
}
