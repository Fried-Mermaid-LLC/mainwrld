import {
  Inject,
  Injectable,
  Logger,
  PreconditionFailedException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIREBASE_AUTH,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

const STRIKE_LIMIT = 3;

// Admin moderation authority (ported from userClaims.setAdmin + banUser).
// Ban DISABLES + RETAINS the account (reversible via unban) — no content scrub.
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  private get users() {
    return this.db.collection(COLLECTIONS.users);
  }

  async setAdmin(
    callerUid: string,
    targetUid: string,
    admin: boolean,
  ): Promise<{ uid: string; admin: boolean }> {
    // No self-targeting: revoking your own admin is an irreversible lockout
    // (every admin route then rejects you), and self-promotion is meaningless.
    if (targetUid === callerUid) {
      throw new PreconditionFailedException(
        'You cannot change your own admin status.',
      );
    }
    const existing = (await this.auth.getUser(targetUid)).customClaims ?? {};
    await this.auth.setCustomUserClaims(targetUid, { ...existing, admin });
    // Mirror onto the profile so lists can show an admin badge.
    await this.users.doc(targetUid).set({ isAdmin: admin }, { merge: true });
    this.logger.log(`setAdmin ${targetUid} -> ${admin}`);
    return { uid: targetUid, admin };
  }

  // Core ban routine (idempotent, never bans an admin).
  private async performBan(targetUid: string, reason: string): Promise<void> {
    const snap = await this.users.doc(targetUid).get();
    const data = snap.exists ? snap.data() : undefined;
    const username = (data?.username as string | undefined) ?? null;

    if (data?.isAdmin === true) {
      this.logger.warn(`performBan: refusing to ban admin ${targetUid}`);
      return;
    }
    if (data?.isBanned === true) {
      await this.auth.updateUser(targetUid, { disabled: true }).catch(() => {});
      return;
    }

    await this.users.doc(targetUid).set(
      {
        isBanned: true,
        bannedAt: new Date().toISOString(),
        banReason: reason,
      },
      { merge: true },
    );

    const existing = (await this.auth.getUser(targetUid)).customClaims ?? {};
    await this.auth.setCustomUserClaims(targetUid, {
      ...existing,
      banned: true,
    });
    await this.auth.revokeRefreshTokens(targetUid);
    await this.auth.updateUser(targetUid, { disabled: true });

    // Resolve open User-type reports for this username.
    if (username) {
      const reps = await this.db
        .collection(COLLECTIONS.reports)
        .where('targetId', '==', username)
        .where('type', '==', 'User')
        .get();
      if (!reps.empty) {
        const batch = this.db.batch();
        reps.docs.forEach((d) => {
          if (d.data().status === 'pending') {
            batch.update(d.ref, { status: 'resolved' });
          }
        });
        await batch.commit();
      }
    }
    this.logger.log(`performBan complete: ${targetUid} (${reason})`);
  }

  async ban(
    adminUid: string,
    targetUid: string,
  ): Promise<{ bannedUid: string }> {
    if (targetUid === adminUid) {
      throw new PreconditionFailedException('You cannot ban yourself.');
    }
    await this.performBan(targetUid, 'manual ban');
    return { bannedUid: targetUid };
  }

  async unban(targetUid: string): Promise<{ unbannedUid: string }> {
    await this.users.doc(targetUid).set(
      {
        isBanned: false,
        strikes: 0,
        struckByReportIds: [],
        bannedAt: FieldValue.delete(),
        banReason: FieldValue.delete(),
      },
      { merge: true },
    );
    const claims = { ...((await this.auth.getUser(targetUid)).customClaims ?? {}) };
    delete claims.banned;
    await this.auth.setCustomUserClaims(targetUid, claims);
    await this.auth.updateUser(targetUid, { disabled: false });
    this.logger.log(`unban complete: ${targetUid}`);
    return { unbannedUid: targetUid };
  }

  // Increment strikes + auto-ban at 3 (replaces client addStrikeToUser +
  // the strikeWatch trigger, now that all strike writes go through the API).
  async addStrike(
    callerUid: string,
    targetUid: string,
    reportId?: string,
  ): Promise<{ strikes: number; banned: boolean }> {
    // A moderator can't strike themselves (corrupts their own moderation
    // counters and is a latent auto-ban once isAdmin is later removed).
    if (targetUid === callerUid) {
      throw new PreconditionFailedException('You cannot strike yourself.');
    }
    const ref = this.users.doc(targetUid);
    await ref.update({
      strikes: FieldValue.increment(1),
      lastStrikeAt: new Date().toISOString(),
      ...(reportId ? { struckByReportIds: FieldValue.arrayUnion(reportId) } : {}),
    });
    const data = (await ref.get()).data() ?? {};
    const strikes = (data.strikes as number) || 0;
    let banned = false;
    if (
      strikes >= STRIKE_LIMIT &&
      data.isBanned !== true &&
      data.isAdmin !== true
    ) {
      await this.performBan(targetUid, '3 strikes');
      banned = true;
    }
    return { strikes, banned };
  }
}
