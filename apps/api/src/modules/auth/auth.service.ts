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
  // `usernames` lookup the client did directly. Candidate for a follow-up
  // (e.g. let Firebase Auth resolve it, or require the email at login).
  async resolveUsername(username: string): Promise<{ email: string | null }> {
    const snap = await this.db
      .collection(COLLECTIONS.usernames)
      .doc(username.toLowerCase())
      .get();
    if (!snap.exists) return { email: null };
    return { email: (snap.data()?.email as string) ?? null };
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
