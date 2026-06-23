import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIREBASE_AUTH,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import { welcomeEmail } from '../../shared/email/email.templates';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import type { CreateProfileDto } from './dto/create-profile.dto';

export type UserDoc = Record<string, unknown> & { uid: string };

// COPPA: keep in sync with the client signup guard.
const MIN_SIGNUP_AGE = 13;

function ageFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Fields the client must never write directly (moderation, payment, admin and
// permanence state). Server-managed only — mirrors firestore.rules. Everything
// else on the profile (avatarConfig, notificationPrefs, reading state, library
// metadata, daily counters, …) is client-writable via PATCH /users/me.
const PROTECTED_FIELDS = new Set<string>([
  'uid',
  'username',
  'email',
  'createdAt',
  'strikes',
  'isBanned',
  'bannedAt',
  'banReason',
  'lastStrikeAt',
  'struckByReportIds',
  'isPremium',
  'premiumSince',
  'premiumProvider',
  'premiumRenewalAt',
  'premiumCancelAtPeriodEnd',
  'renewalReminderSentForAt',
  'membershipAutoRenew',
  'membershipCancelledAt',
  'stripeCustomerId',
  'stripeSubscriptionId',
  'stripeAccountId',
  'payoutsEnabled',
  'chargesEnabled',
  'detailsSubmitted',
  'stripeAccountUpdatedAt',
  'isAdmin',
  'purchasedBookIds',
]);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    private readonly email: EmailService,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.users);
  }

  private get usernames() {
    return this.db.collection(COLLECTIONS.usernames);
  }

  // Signup profile creation (replaces the client's direct setDoc + the
  // setUsernameClaim/blockUnderageSignup triggers). The Auth account already
  // exists (client created it); we stamp the profile, the username index, and
  // the username claim atomically — and tear the Auth account down if underage.
  async createProfile(user: AuthUser, dto: CreateProfileDto): Promise<UserDoc> {
    // COPPA hard block — enforced before the profile is written, so an underage
    // account never persists. Tear down the just-created Auth record.
    const age = ageFromBirthDate(dto.birthDate);
    if (age === null || age < MIN_SIGNUP_AGE) {
      await this.auth.deleteUser(user.uid).catch(() => {});
      throw new BadRequestException({
        code: 'failed-precondition',
        message: 'You must be at least 13 to use MainWRLD.',
      });
    }

    const unameRef = this.usernames.doc(dto.username.toLowerCase());
    if ((await unameRef.get()).exists) {
      throw new ConflictException({
        code: 'already-exists',
        message: 'That username is taken.',
      });
    }

    const email = user.email ?? null;
    await this.col.doc(user.uid).set({
      uid: user.uid,
      username: dto.username,
      displayName: dto.displayName,
      email,
      birthDate: dto.birthDate,
      points: 50,
      admirersCount: 0,
      mutualsCount: 0,
      admiringCount: 0,
      strikes: 0,
      isOnline: false,
      activity: 'Idle',
      isPremium: false,
      premiumSince: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    await unameRef.set({ uid: user.uid, email });

    // Mirror the username into the token (preserve any existing claims).
    try {
      const existing = (await this.auth.getUser(user.uid)).customClaims ?? {};
      await this.auth.setCustomUserClaims(user.uid, {
        ...existing,
        username: dto.username,
      });
    } catch (err) {
      this.logger.error(`setUsernameClaim failed for ${user.uid}`, err as Error);
    }

    const snap = await this.col.doc(user.uid).get();
    return { uid: user.uid, ...snap.data() } as UserDoc;
  }

  // Welcome email — recipient is the signed-in user's own address (never
  // client-supplied), so this can't be abused as an open relay.
  async sendWelcomeEmail(user: AuthUser): Promise<{ success: boolean }> {
    const snap = await this.col.doc(user.uid).get();
    const data = (snap.data() as Record<string, unknown>) || {};
    const to = user.email ?? (data.email as string | undefined);
    const displayName = (data.displayName as string) || 'there';
    const username = (data.username as string) || '';
    if (!to || !username) {
      throw new BadRequestException('Missing recipient or username.');
    }
    const { subject, html } = welcomeEmail(displayName, username);
    const result = await this.email.send(to, subject, html);
    return { success: result.ok };
  }

  // App Store guideline 5.1.1(v): server-side account teardown. Scrubs the
  // user's own content + revokes Auth. Ported from functions/deleteAccount.ts.
  async deleteAccount(uid: string): Promise<{ deletedUid: string }> {
    let username: string | null = null;
    try {
      const snap = await this.col.doc(uid).get();
      if (snap.exists)
        username = (snap.data()?.username as string | undefined) ?? null;
    } catch (err) {
      this.logger.warn(`deleteAccount: read user doc failed for ${uid}`);
    }

    if (username) {
      await this.usernames
        .doc(username.toLowerCase())
        .delete()
        .catch(() => {});
    }

    await this.deleteByQuery(
      this.db.collection(COLLECTIONS.books).where('authorUid', '==', uid),
    );
    await this.deleteByQuery(
      this.db.collection(COLLECTIONS.comments).where('authorUid', '==', uid),
    );
    if (username) {
      await this.deleteByQuery(
        this.db.collection(COLLECTIONS.chatMessages).where('from', '==', username),
      );
      await this.deleteByQuery(
        this.db.collection(COLLECTIONS.chatMessages).where('to', '==', username),
      );
      await this.deleteByQuery(
        this.db
          .collection(COLLECTIONS.relationships)
          .where('admirer', '==', username),
      );
      await this.deleteByQuery(
        this.db
          .collection(COLLECTIONS.relationships)
          .where('target', '==', username),
      );
      await this.deleteByQuery(
        this.db
          .collection(COLLECTIONS.notifications)
          .where('recipient', '==', username),
      );
      await this.deleteByQuery(
        this.db
          .collection(COLLECTIONS.reports)
          .where('reportedBy', '==', username),
      );
    }

    await this.col.doc(uid).delete().catch(() => {});
    await this.auth.deleteUser(uid);
    this.logger.log(`deleteAccount complete for ${uid}`);
    return { deletedUid: uid };
  }

  // Batched deletion of a query (Firestore batches max 500).
  private async deleteByQuery(query: Query): Promise<number> {
    let deleted = 0;
    for (;;) {
      const snap = await query.limit(400).get();
      if (snap.empty) break;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) break;
    }
    return deleted;
  }

  async list(): Promise<UserDoc[]> {
    const snap = await this.col.get();
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserDoc);
  }

  // Own profile. Ban gate (defense-in-depth): block a banned user before any
  // home-screen state loads.
  async getMe(uid: string): Promise<UserDoc> {
    const snap = await this.col.doc(uid).get();
    if (!snap.exists) throw new NotFoundException('User profile not found');
    const data = { uid, ...snap.data() } as UserDoc;
    if (data.isBanned === true) {
      throw new ForbiddenException({
        code: 'banned',
        message:
          'This account has been suspended for repeated community guideline violations.',
      });
    }
    return data;
  }

  async getById(uid: string): Promise<UserDoc> {
    const snap = await this.col.doc(uid).get();
    if (!snap.exists) throw new NotFoundException('User not found');
    return { uid, ...snap.data() } as UserDoc;
  }

  async getByUsername(username: string): Promise<UserDoc | null> {
    const u = await this.usernames.doc(username.toLowerCase()).get();
    if (!u.exists) return null;
    const uid = u.data()?.uid as string | undefined;
    if (!uid) return null;
    const snap = await this.col.doc(uid).get();
    return snap.exists ? ({ uid, ...snap.data() } as UserDoc) : null;
  }

  async usernameAvailable(username: string): Promise<boolean> {
    const snap = await this.usernames.doc(username.toLowerCase()).get();
    return !snap.exists;
  }

  async updateMe(uid: string, data: Record<string, unknown>): Promise<void> {
    const clean = Object.fromEntries(
      Object.entries(data).filter(
        ([k, v]) => !PROTECTED_FIELDS.has(k) && v !== undefined,
      ),
    );
    if (Object.keys(clean).length) await this.col.doc(uid).update(clean);
  }

  async addFcmToken(uid: string, token: string): Promise<void> {
    await this.col.doc(uid).update({ fcmTokens: FieldValue.arrayUnion(token) });
  }

  async removeFcmToken(uid: string, token: string): Promise<void> {
    await this.col
      .doc(uid)
      .update({ fcmTokens: FieldValue.arrayRemove(token) });
  }

  // ownedBookIds is the savable library set. purchasedBookIds (permanent) is
  // append-only and server-managed — never touched here.
  async addToLibrary(uid: string, bookId: string): Promise<void> {
    await this.col
      .doc(uid)
      .update({ ownedBookIds: FieldValue.arrayUnion(bookId) });
  }

  async removeFromLibrary(uid: string, bookId: string): Promise<void> {
    await this.col
      .doc(uid)
      .update({ ownedBookIds: FieldValue.arrayRemove(bookId) });
  }

  async getPurchases(uid: string): Promise<Record<string, unknown>[]> {
    const snap = await this.db
      .collection(COLLECTIONS.bookPurchases)
      .where('buyerUid', '==', uid)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}
