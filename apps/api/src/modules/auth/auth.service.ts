import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIREBASE_AUTH,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import { passwordResetEmail } from '../../shared/email/email.templates';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
    private readonly email: EmailService,
  ) {}

  // Backfill the username custom claim for the signed-in user (ported from
  // ensureUsernameClaim). Idempotent. The client refreshes its token after.
  async ensureUsernameClaim(uid: string): Promise<{
    ok: boolean;
    changed: boolean;
    username?: string;
    reason?: string;
  }> {
    const snap = await this.db.collection(COLLECTIONS.users).doc(uid).get();
    const username = snap.exists
      ? (snap.data()?.username as string | undefined)
      : undefined;
    if (!username) return { ok: false, reason: 'no-username', changed: false };
    const existing = (await this.auth.getUser(uid)).customClaims ?? {};
    if (existing.username === username) {
      return { ok: true, changed: false, username };
    }
    await this.auth.setCustomUserClaims(uid, { ...existing, username });
    this.logger.log(`ensureUsernameClaim backfilled for ${uid}`);
    return { ok: true, changed: true, username };
  }

  // username -> email for login. NOTE(security): this exposes the email behind
  // a username to any unauthenticated caller — it preserves the legacy public
  // `usernames` lookup the client did directly.
  //
  // Resolve the LIVE Auth email by uid rather than trusting the cached `email`
  // on the (rules-immutable) username doc. After a verifyBeforeUpdateEmail
  // change the cached value goes stale, and since login-by-username happens
  // before any session exists, a stale value would lock the user out (they'd
  // sign in with the old address against an account that no longer has it). The
  // Auth record is always current, so this keeps username login working the
  // moment the change lands. Fall back to the cached field if the uid is absent
  // (legacy docs) or the lookup fails.
  async resolveUsername(username: string): Promise<{ email: string | null }> {
    const snap = await this.db
      .collection(COLLECTIONS.usernames)
      .doc(username.toLowerCase())
      .get();
    if (!snap.exists) return { email: null };
    const data = snap.data() ?? {};
    const uid = data.uid as string | undefined;
    if (uid) {
      try {
        const authUser = await this.auth.getUser(uid);
        if (authUser.email) return { email: authUser.email };
      } catch (err) {
        this.logger.warn(
          `resolveUsername: live email lookup failed for ${uid}`,
          err as Error,
        );
      }
    }
    return { email: (data.email as string) ?? null };
  }

  // Branded password reset (ported from sendPasswordReset). Always returns
  // success so the response never reveals whether an account exists.
  async sendPasswordReset(email: string): Promise<{ success: boolean }> {
    let link: string;
    try {
      link = await this.auth.generatePasswordResetLink(email);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/user-not-found') {
        this.logger.error('generatePasswordResetLink failed', err as Error);
      }
      return { success: true };
    }
    const { subject, html } = passwordResetEmail(link);
    await this.email.send(email, subject, html);
    return { success: true };
  }
}
