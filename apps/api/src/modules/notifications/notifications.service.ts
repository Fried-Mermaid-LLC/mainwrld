import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { isChapterPublished } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIREBASE_MESSAGING,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import type { CreateNotificationDto } from './dto/create-notification.dto';

export type NotificationDoc = Record<string, unknown> & { id: string };

// Minimal per-chapter shape the publish-announce planner reads (looser than
// ChapterMeta so legacy docs missing `published`/`title` still type-check).
type AnnounceMeta = { id?: string; published?: boolean };

// The follower notification to fire once a book/chapter becomes published.
export interface PublicationAnnounce {
  title: string;
  message: string;
  icon: string;
  includeLibraryOwners?: boolean;
}

// Book fields planPublicationAnnounce reads. Every field is optional — legacy
// docs may omit any of them.
export interface PublishAnnounceInput {
  isDraft?: boolean;
  publishAnnounced?: boolean;
  announcedChapterIds?: string[];
  chapterMeta?: AnnounceMeta[];
  chaptersCount?: number;
  authorUsername?: string;
  authorDisplayName?: string;
  title?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_MESSAGING) private readonly messaging: Messaging,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.notifications);
  }

  async listForRecipient(username: string): Promise<NotificationDoc[]> {
    const snap = await this.col.where('recipient', '==', username).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async create(
    sender: string | undefined,
    dto: CreateNotificationDto,
  ): Promise<{ id: string }> {
    const ref = this.col.doc();
    const notif = Object.fromEntries(
      Object.entries({
        id: ref.id,
        title: dto.title,
        message: dto.message,
        icon: dto.icon,
        timestamp: new Date().toISOString(),
        recipient: dto.recipient,
        sender: dto.sender ?? sender,
        read: false,
        targetId: dto.targetId,
        targetChapterIndex: dto.targetChapterIndex,
        commentId: dto.commentId,
        category: dto.category,
      }).filter(([, v]) => v !== undefined),
    );
    await ref.set(notif);
    // Inline push fan-out (replaces sendPushOnNotification trigger). Best-effort.
    await this.pushFanout(notif).catch((err) =>
      this.logger.error('pushFanout failed', err as Error),
    );
    return { id: ref.id };
  }

  // APNs/FCM push to the recipient's devices. Honors notificationPrefs
  // (per-category + master push), skips system/self, prunes stale tokens.
  private async pushFanout(n: Record<string, unknown>): Promise<void> {
    const category = n.category as string | undefined;
    if (!category || category === 'system') return;
    const recipient = n.recipient as string;
    if (n.sender && n.sender === recipient) return;

    const unameDoc = await this.db
      .collection(COLLECTIONS.usernames)
      .doc(String(recipient).toLowerCase())
      .get();
    const uid = unameDoc.data()?.uid as string | undefined;
    if (!uid) return;
    const userDoc = await this.db.collection(COLLECTIONS.users).doc(uid).get();
    const u = userDoc.data();
    if (!u) return;

    const prefs = (u.notificationPrefs as Record<string, unknown>) ?? {
      newAdmirers: true,
      bookLikes: true,
      comments: true,
      appUpdates: true,
    };
    if (prefs.push === false) return;
    if (category !== 'messages' && prefs[category] === false) return;

    const tokens: string[] = Array.isArray(u.fcmTokens)
      ? (u.fcmTokens as string[])
      : [];
    if (tokens.length === 0) return;

    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: n.title as string, body: n.message as string },
      data: {
        category,
        targetId: String(n.targetId ?? ''),
        targetChapterIndex: String(n.targetChapterIndex ?? ''),
        commentId: String(n.commentId ?? ''),
        sender: String(n.sender ?? ''),
        title: String(n.title ?? ''),
      },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        !r.success &&
        (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token')
      ) {
        stale.push(tokens[i]);
      }
    });
    if (stale.length) {
      await this.db
        .collection(COLLECTIONS.users)
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...stale) });
    }
  }

  // Fan out a "new book" / "new chapter" notification to everyone who admires
  // (follows) the author, plus — for a new chapter — the book's library owners.
  // Server-authoritative replacement for the old client-side fan-out in
  // useReading, which only reached mutuals and only fired from the publishing
  // device. Best-effort: never throws into the publish path.
  async notifyFollowersOfPublication(params: {
    authorUsername: string;
    title: string;
    message: string;
    icon: string;
    bookId: string;
    includeLibraryOwners?: boolean;
  }): Promise<void> {
    const { authorUsername, title, message, icon, bookId } = params;
    if (!authorUsername) return;
    try {
      const recipients = new Set<string>();
      // Followers = every admirer edge pointing at the author.
      const admirerSnap = await this.db
        .collection(COLLECTIONS.relationships)
        .where('target', '==', authorUsername)
        .get();
      for (const d of admirerSnap.docs) {
        const admirer = d.data()?.admirer as string | undefined;
        if (admirer) recipients.add(admirer);
      }
      // Library owners (new-chapter case): users who saved this book so they
      // keep getting new-chapter pings even if they don't follow the author.
      if (params.includeLibraryOwners) {
        const ownerSnap = await this.db
          .collection(COLLECTIONS.users)
          .where('ownedBookIds', 'array-contains', bookId)
          .get();
        for (const d of ownerSnap.docs) {
          const uname = d.data()?.username as string | undefined;
          if (uname) recipients.add(uname);
        }
      }
      recipients.delete(authorUsername);
      if (recipients.size === 0) return;
      await Promise.all(
        Array.from(recipients).map((recipient) =>
          this.create(authorUsername, {
            recipient,
            title,
            message,
            icon,
            targetId: bookId,
            category: 'appUpdates',
          }).catch((err) =>
            this.logger.error('publication notify failed', err as Error),
          ),
        ),
      );
    } catch (err) {
      this.logger.error('notifyFollowersOfPublication failed', err as Error);
    }
  }

  // Absolute ids of the currently-published chapters, honoring the legacy
  // published-prefix fallback (an entry without an explicit `published` flag is
  // published iff its order < chaptersCount — see isChapterPublished).
  publishedChapterIds(
    meta: AnnounceMeta[] | undefined,
    chaptersCount: number | undefined,
  ): string[] {
    if (!Array.isArray(meta)) return [];
    const ids: string[] = [];
    for (let i = 0; i < meta.length; i++) {
      const id = meta[i]?.id;
      if (
        typeof id === 'string' &&
        isChapterPublished(meta, i, chaptersCount)
      ) {
        ids.push(id);
      }
    }
    return ids;
  }

  // Decide whether a book/chapter becoming published should ping the author's
  // followers, and what durable "already announced" state to persist so it never
  // fires twice. PURE: the caller merges the returned `stamp` into the SAME write
  // that publishes, commits, then (best-effort, after commit) fires `announce` via
  // notifyFollowersOfPublication. Keying off durable per-book state
  // (`publishAnnounced` + `announcedChapterIds`, which only grows) rather than an
  // isDraft transition or a derived count is what keeps unpublish→republish — and
  // ordinary edits of legacy already-published books — from re-announcing.
  planPublicationAnnounce(input: {
    book: PublishAnnounceInput;
    resultingIsDraft?: boolean;
    resultingChapterMeta?: AnnounceMeta[];
    resultingChaptersCount?: number;
  }): { stamp: Record<string, unknown>; announce: PublicationAnnounce | null } {
    const { book } = input;
    const publishedNow = (input.resultingIsDraft ?? book.isDraft) === false;
    const authorUsername = book.authorUsername;
    // Nothing to do (and nothing to stamp) unless the resulting state is a
    // published book with an author to attribute the fan-out to.
    if (!publishedNow || !authorUsername) return { stamp: {}, announce: null };

    const already = Array.isArray(book.announcedChapterIds)
      ? book.announcedChapterIds
      : [];
    const prevPublished = this.publishedChapterIds(
      book.chapterMeta,
      book.chaptersCount,
    );
    const nowPublished = this.publishedChapterIds(
      input.resultingChapterMeta ?? book.chapterMeta,
      input.resultingChaptersCount ?? book.chaptersCount,
    );
    // The announced set only ever grows: any chapter already announced, already
    // published in the stored doc, or published in this write is recorded, so a
    // later unpublish→republish of the same chapter can never re-announce.
    const announcedChapterIds = Array.from(
      new Set([...already, ...prevPublished, ...nowPublished]),
    );
    const stamp: Record<string, unknown> = {
      publishAnnounced: true,
      announcedChapterIds,
    };

    // A genuine draft→published transition announces the whole book once. Gate on
    // the STORED isDraft: a book already published (isDraft===false) never
    // re-announces on an edit, which also protects legacy books that predate the
    // `publishAnnounced` field from mass-firing on their next write.
    const wasDraft = book.isDraft !== false;
    if (wasDraft && book.publishAnnounced !== true) {
      return {
        stamp,
        announce: {
          title: 'New Book',
          message: `${book.authorDisplayName ?? authorUsername} published a new book: "${book.title ?? ''}"`,
          icon: 'auto_stories',
        },
      };
    }

    // Already-published book: a chapter that becomes published for the FIRST time
    // (not previously announced and not already published in the stored doc) pings
    // followers + library owners once.
    const seen = new Set([...already, ...prevPublished]);
    const newlyPublished = nowPublished.filter((id) => !seen.has(id));
    if (newlyPublished.length > 0) {
      return {
        stamp,
        announce: {
          title: 'New Chapter',
          message: `"${book.title ?? ''}" has a new chapter!`,
          icon: 'menu_book',
          includeLibraryOwners: true,
        },
      };
    }
    return { stamp, announce: null };
  }

  async markAllRead(username: string): Promise<void> {
    const snap = await this.col.where('recipient', '==', username).get();
    const batch = this.db.batch();
    let n = 0;
    for (const d of snap.docs) {
      if (!d.data().read) {
        batch.update(d.ref, { read: true });
        n++;
      }
    }
    if (n) await batch.commit();
  }

  async markRead(id: string): Promise<void> {
    try {
      await this.col.doc(id).update({ read: true });
    } catch {
      // Non-fatal — mirrors the client's swallow-on-missing behavior.
    }
  }
}
