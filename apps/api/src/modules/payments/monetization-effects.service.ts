import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { EmailService } from '../../shared/email/email.service';
import {
  emailLayout,
  escapeHtml,
} from '../../shared/email/email.templates';

const SITE_URL = 'https://mainwrld.com';

// Monetization side-effects (ported from the onBookMonetized trigger). Now that
// all book writes go through the API, these run INLINE from the monetization
// review endpoint (approve/deny) and the un-monetize path. Emails + fan-out are
// best-effort and never block the status change.
@Injectable()
export class MonetizationEffectsService {
  private readonly logger = new Logger(MonetizationEffectsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly email: EmailService,
  ) {}

  // isMonetized false->true: grandfather library owners into purchasedBookIds,
  // fan out "Book Monetized" notifications, notify + email the author.
  async onApproved(
    bookId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    const title = (after.title as string) || 'A book';
    const authorUsername = after.authorUsername as string | undefined;
    const authorUid = after.authorUid as string | undefined;
    try {
      const owners = await this.db
        .collection(COLLECTIONS.users)
        .where('ownedBookIds', 'array-contains', bookId)
        .get();
      const writes: Promise<unknown>[] = [];
      owners.forEach((doc) => {
        const u = doc.data() as Record<string, unknown>;
        if (doc.id === authorUid) return;
        writes.push(
          doc.ref.update({
            purchasedBookIds: FieldValue.arrayUnion(bookId),
          }),
        );
        if (!u.username || u.username === authorUsername) return;
        writes.push(
          this.db.collection(COLLECTIONS.notifications).add({
            title: 'Book Monetized',
            message: `"${title}" is now a paid book.`,
            icon: 'paid',
            recipient: u.username,
            sender: authorUsername || 'MainWRLD',
            targetId: bookId,
            read: false,
            timestamp: new Date().toISOString(),
          }),
        );
      });
      if (authorUsername) {
        writes.push(
          this.db.collection(COLLECTIONS.notifications).add({
            title: 'Monetization Approved',
            message: 'Your monetization request has been accepted.',
            icon: 'paid',
            recipient: authorUsername,
            sender: 'MainWRLD',
            targetId: bookId,
            read: false,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      await Promise.all(writes);
      this.logger.log(`onApproved fan-out complete: ${bookId} (${owners.size})`);
    } catch (err) {
      this.logger.error(`onApproved fan-out failed: ${bookId}`, err as Error);
    }

    const author = await this.email.userContact(authorUid);
    if (author.email) {
      await this.email.send(
        author.email,
        'Your monetization request has been accepted',
        emailLayout({
          preheader: `"${title}" is approved for sale on MainWRLD.`,
          heading: 'Your monetization request was accepted',
          bodyHtml: `
            <p style="margin:0 0 14px">Hi ${escapeHtml(author.displayName)},</p>
            <p style="margin:0 0 14px">Good news — your request to monetize
              <strong>"${escapeHtml(title)}"</strong> has been accepted.
              Readers can now purchase it, and you'll earn 80% of every sale.</p>
            <p style="margin:0">You can track sales and payouts from your
              earnings settings.</p>
          `,
          cta: { label: 'View your book', url: SITE_URL },
        }),
      );
    }
  }

  // monetizationStatus -> 'denied': notify + email the author with the reason.
  async onDenied(
    bookId: string,
    after: Record<string, unknown>,
    reason: string,
  ): Promise<void> {
    const title = (after.title as string) || 'A book';
    const authorUsername = after.authorUsername as string | undefined;
    if (!authorUsername) return;
    const reasonText = reason || 'a policy review';
    try {
      await this.db.collection(COLLECTIONS.notifications).add({
        title: 'Monetization Denied',
        message: `Your monetization request was denied: ${reasonText}`,
        icon: 'money_off',
        recipient: authorUsername,
        sender: 'MainWRLD',
        targetId: bookId,
        read: false,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(`onDenied notification failed: ${bookId}`, err as Error);
    }
    const author = await this.email.userContact(
      after.authorUid as string | undefined,
    );
    if (author.email) {
      await this.email.send(
        author.email,
        'Your monetization request has been denied',
        emailLayout({
          preheader: `An update on your request to monetize "${title}".`,
          heading: 'Your monetization request was denied',
          bodyHtml: `
            <p style="margin:0 0 14px">Hi ${escapeHtml(author.displayName)},</p>
            <p style="margin:0 0 14px">Your request to monetize
              <strong>"${escapeHtml(title)}"</strong> was denied because of:
              <strong>${escapeHtml(reasonText)}</strong>.</p>
            <p style="margin:0">If you think this was a mistake or you've
              addressed the issue, you may be able to submit again from the
              book's menu.</p>
          `,
          cta: { label: 'Open MainWRLD', url: SITE_URL },
        }),
      );
    }
  }

  // isMonetized true->false: stamp the terminal permanence flags so the block is
  // authoritative regardless of which path demonetized.
  async onDemonetized(ref: DocumentReference): Promise<void> {
    try {
      await ref.update({
        permanentlyDemonetized: true,
        wasMonetizedBefore: true,
      });
    } catch (err) {
      this.logger.error('onDemonetized permanence stamp failed', err as Error);
    }
  }
}
