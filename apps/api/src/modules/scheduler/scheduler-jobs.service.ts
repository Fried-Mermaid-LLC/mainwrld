import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import { renewalReminderEmail } from '../../shared/email/email.templates';
import { SpotlightService } from '../spotlight/spotlight.service';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;

// Cron job bodies (ported from the scheduled Cloud Functions). Invoked by Cloud
// Scheduler via the protected /internal/cron/* endpoints; idempotent so a retry
// is safe.
@Injectable()
export class SchedulerJobsService {
  private readonly logger = new Logger(SchedulerJobsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly spotlight: SpotlightService,
    private readonly email: EmailService,
  ) {}

  rotateSpotlight() {
    return this.spotlight.rotate();
  }

  // Membership-aware DM retention: non-members' messages deleted ~1 year after
  // they were sent (members keep forever via senderIsPremium snapshot).
  async pruneExpiredMessages(): Promise<{ totalDeleted: number }> {
    const cutoffIso = new Date(Date.now() - YEAR_MS).toISOString();
    let totalDeleted = 0;
    for (;;) {
      const expired = await this.db
        .collection(COLLECTIONS.chatMessages)
        .where('senderIsPremium', '==', false)
        .where('timestamp', '<', cutoffIso)
        .limit(BATCH_SIZE)
        .get();
      if (expired.empty) break;
      const batch = this.db.batch();
      for (const doc of expired.docs) batch.delete(doc.ref);
      await batch.commit();
      totalDeleted += expired.size;
      if (expired.size < BATCH_SIZE) break;
    }
    this.logger.log(`pruneExpiredMessages complete: ${totalDeleted}`);
    return { totalDeleted };
  }

  // "Renews in 7 days" reminder; at most once per renewal period.
  async sendRenewalReminders(): Promise<{
    candidates: number;
    sent: number;
    skipped: number;
  }> {
    const now = Date.now();
    const windowStart = now + 6 * DAY_MS;
    const windowEnd = now + 7 * DAY_MS;
    const snap = await this.db
      .collection(COLLECTIONS.users)
      .where('premiumRenewalAt', '>=', windowStart)
      .where('premiumRenewalAt', '<=', windowEnd)
      .get();

    let sent = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
      const u = doc.data() as Record<string, unknown>;
      const renewalAt = u.premiumRenewalAt as number;
      if (u.isPremium !== true) {
        skipped++;
        continue;
      }
      if (
        u.premiumCancelAtPeriodEnd === true ||
        u.membershipAutoRenew === false
      ) {
        skipped++;
        continue;
      }
      if (u.renewalReminderSentForAt === renewalAt) {
        skipped++;
        continue;
      }
      const email = u.email as string | undefined;
      if (!email) {
        skipped++;
        continue;
      }
      const displayName =
        (u.displayName as string) || (u.username as string) || 'there';
      const dateLabel = new Date(renewalAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
      });
      const mail = renewalReminderEmail(displayName, dateLabel);
      const result = await this.email.send(email, mail.subject, mail.html);
      if (result.ok) {
        await doc.ref.set(
          { renewalReminderSentForAt: renewalAt },
          { merge: true },
        );
        sent++;
      } else {
        skipped++;
      }
    }
    this.logger.log(
      `sendRenewalReminders complete: candidates=${snap.size} sent=${sent} skipped=${skipped}`,
    );
    return { candidates: snap.size, sent, skipped };
  }
}
