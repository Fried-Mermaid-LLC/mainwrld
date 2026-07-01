import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { firstPublishedOrder, isChapterPublished } from '@mainwrld/types';
import type { ChapterMeta } from '@mainwrld/types';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { PublishAnnounceInput } from '../notifications/notifications.service';
import type { CommitChapterDto } from './dto/commit-chapter.dto';

export type ChapterDoc = Record<string, unknown> & { id: string };

// Book metadata the client must not write through the chapter-commit path.
// `likes`/`chapterLikedBy` are server-managed reader aggregates (only likeChapter
// mutates them, and only via reader action): an author could otherwise pass an
// inflated likes array here and forge the monetization signal. commitWrite pads
// likes server-side instead; commitDelete splices it.
const BOOK_PROTECTED = new Set<string>([
  'authorUid',
  'likes',
  'chapterLikedBy',
  'favoritesTotal',
  'isMonetized',
  'wasMonetizedBefore',
  'monetizationStatus',
  'requestedPrice',
  'monetizationRequestedAt',
  'monetizationReviewedAt',
  'monetizationReviewedBy',
  'monetizationDenialReason',
  'permanentlyDemonetized',
  'sellerUid',
  'sellerStripeAccountId',
  'takenDown',
  // Server-managed follower-notification bookkeeping (stamped by
  // planPublicationAnnounce); a client must never forge the "already announced"
  // state to suppress or spoof a fan-out.
  'publishAnnounced',
  'announcedChapterIds',
]);

@Injectable()
export class ChaptersService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
  ) {}

  private booksCol() {
    return this.db.collection(COLLECTIONS.books);
  }

  private chaptersCol(bookId: string) {
    return this.booksCol().doc(bookId).collection(COLLECTIONS.chapters);
  }

  // Author/admin: list all chapter docs (incl. drafts), ordered.
  async list(bookId: string, user: AuthUser): Promise<ChapterDoc[]> {
    await this.assertAuthor(bookId, user);
    const snap = await this.chaptersCol(bookId).orderBy('order').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async getOne(
    bookId: string,
    chapterId: string,
    user: AuthUser,
  ): Promise<ChapterDoc> {
    await this.assertAuthor(bookId, user);
    const snap = await this.chaptersCol(bookId).doc(chapterId).get();
    if (!snap.exists) throw new NotFoundException('Chapter not found');
    return { id: snap.id, ...snap.data() };
  }

  // Reader gateway with paywall (ported from functions/src/chapters.ts).
  async getContent(
    bookId: string,
    chapterId: string,
    user: AuthUser,
  ): Promise<{ title: string; content: string }> {
    const bookSnap = await this.booksCol().doc(bookId).get();
    if (!bookSnap.exists) throw new NotFoundException('Book not found');
    const book = bookSnap.data() as Record<string, unknown>;

    const chapterSnap = await this.chaptersCol(bookId).doc(chapterId).get();
    if (!chapterSnap.exists) throw new NotFoundException('Chapter not found');
    const chapter = chapterSnap.data() as Record<string, unknown>;

    const isAdmin = user.admin;
    const isAuthor = book.authorUid === user.uid;

    if (book.takenDown === true && !isAuthor && !isAdmin) {
      throw new ForbiddenException('This book is no longer available.');
    }

    const meta = (book.chapterMeta as ChapterMeta[]) || [];
    const order = meta.findIndex((m) => m.id === chapterId);
    const chaptersCount = (book.chaptersCount as number) || 0;

    // Per-chapter visibility: a chapter is readable by non-authors only if its
    // meta entry is published (legacy docs fall back to the published prefix).
    if (
      !isAuthor &&
      !isAdmin &&
      !isChapterPublished(meta, order, chaptersCount)
    ) {
      throw new ForbiddenException('Chapter not available.');
    }

    if (!isAuthor && !isAdmin) {
      const isFreeOrUnmonetized =
        book.isFree === true || book.isMonetized !== true;
      // The free preview is the first published chapter (no longer hard-wired to
      // order 0, since the author may unpublish the opening chapter).
      const isPreview = order === firstPublishedOrder(meta, chaptersCount);
      let owns = false;
      if (!isFreeOrUnmonetized && !isPreview) {
        const userSnap = await this.db
          .collection(COLLECTIONS.users)
          .doc(user.uid)
          .get();
        const u = (userSnap.data() as Record<string, unknown>) || {};
        // Paid access keys ONLY off purchasedBookIds (server-granted), never
        // ownedBookIds (client-writable library membership).
        owns = ((u.purchasedBookIds as string[]) || []).includes(bookId);
      }
      if (!isFreeOrUnmonetized && !isPreview && !owns) {
        throw new ForbiddenException({
          code: 'permission-denied',
          message: 'Purchase required to read this chapter.',
        });
      }
    }

    return {
      title: String(chapter.title ?? ''),
      content: String(chapter.content ?? ''),
    };
  }

  // Author write: chapter body + parent book metadata, atomic. Strips legacy
  // heavy fields and stamps schemaVersion 2 (forward-migrates on edit).
  async commitWrite(
    bookId: string,
    chapterId: string,
    user: AuthUser,
    dto: CommitChapterDto,
  ): Promise<void> {
    const book = await this.assertAuthor(bookId, user);
    this.assertEditable(book, user);
    // Mature flag: the incoming book update if present, else the stored value
    // (legacy docs fall back to isExplicit). Relaxes the OpenAI layer to permit
    // sexual/violent themes in Mature works while still blocking CSAM/illegal/etc.
    const bu = dto.bookUpdates as
      | { isMature?: boolean; isExplicit?: boolean }
      | undefined;
    const bk = book as { isMature?: boolean; isExplicit?: boolean };
    const mature = (bu?.isMature ?? bk.isMature ?? bk.isExplicit) === true;
    // Body prose: OpenAI only. Title: profanity + OpenAI.
    if (dto.content) await this.assertClean(dto.content, false, mature);
    if (dto.title) await this.assertClean(dto.title, true, mature);

    const bookUpdates = this.sanitizeBookUpdates(dto.bookUpdates);
    // chaptersCount is a server-derived count of published chapters, not a
    // client-trusted value: whenever the write carries chapterMeta, recompute it
    // from the per-chapter `published` flags so the monetization/pricing signal
    // can't be forged through the chapter-commit path.
    const incomingMeta = bookUpdates.chapterMeta as ChapterMeta[] | undefined;
    if (
      Array.isArray(incomingMeta) &&
      incomingMeta.some((m) => typeof m.published === 'boolean')
    ) {
      bookUpdates.chaptersCount = incomingMeta.filter(
        (m) => m.published === true,
      ).length;
    }
    // Client-sent `likes` is stripped by BOOK_PROTECTED; publishing a chapter
    // can only grow the position-indexed array, so we pad it with zeros to cover
    // the new chapter set server-side, preserving the real reader counts.
    const likesPatch = this.padLikesForWrite(book, dto.bookUpdates);
    // Decide the follower fan-out and persist the durable "already announced"
    // state in the SAME batch as the publish, so a failed/retried notify can
    // never re-announce. Replaces the old chapterMeta-length proxy, which both
    // missed a first publish (length unchanged) and mis-fired when a new *draft*
    // chapter was appended (length grew, chapter still unpublished).
    const plan = this.notifications.planPublicationAnnounce({
      book: book,
      resultingIsDraft: bookUpdates.isDraft as boolean | undefined,
      resultingChapterMeta: incomingMeta,
      resultingChaptersCount:
        (bookUpdates.chaptersCount as number | undefined) ??
        (book as { chaptersCount?: number }).chaptersCount,
    });
    Object.assign(bookUpdates, plan.stamp);
    const batch = this.db.batch();
    batch.set(
      this.chaptersCol(bookId).doc(chapterId),
      {
        content: dto.content,
        order: dto.order,
        title: dto.title,
        authorUsername: user.username ?? dto.authorUsername ?? null,
        ...(dto.isDraft !== undefined ? { isDraft: dto.isDraft } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batch.update(this.booksCol().doc(bookId), {
      ...bookUpdates,
      ...likesPatch,
      chapters: FieldValue.delete(),
      content: FieldValue.delete(),
      schemaVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    // Best-effort follower fan-out AFTER the commit — the "already announced"
    // state was durably stamped into the batch above, so this never double-fires.
    // notifyFollowersOfPublication swallows its own errors, never the publish.
    if (plan.announce) {
      await this.notifications.notifyFollowersOfPublication({
        authorUsername: (book as { authorUsername?: string }).authorUsername!,
        bookId,
        ...plan.announce,
      });
    }
  }

  async commitDelete(
    bookId: string,
    chapterId: string,
    user: AuthUser,
    bookUpdates?: Record<string, unknown>,
  ): Promise<void> {
    const book = await this.assertAuthor(bookId, user);
    this.assertEditable(book, user);
    // The client sends the new chapterMeta/chaptersCount, but `likes` and
    // `chapterLikedBy` are server-managed reader aggregates the author can't
    // write. They're indexed by chapter position, so removing a chapter must
    // splice its slot out and shift every later slot down — computed here from
    // the stored doc and applied after the client updates so they win.
    const splice = this.spliceLikesForDelete(book, chapterId);
    const batch = this.db.batch();
    batch.delete(this.chaptersCol(bookId).doc(chapterId));
    batch.update(this.booksCol().doc(bookId), {
      ...this.sanitizeBookUpdates(bookUpdates),
      ...splice,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  // Remove the deleted chapter's slot from the position-indexed reader-like
  // state. `likes[i]` is dropped and later counts shift down one; `chapterLikedBy`
  // (the username-set map likeChapter rebuilds counts from) is re-keyed the same
  // way. Without this, counts stay pinned to old positions and bleed onto the
  // chapters that shift up — the same staleness that let unpublish+republish
  // forge the "100 likes/chapter" monetization gate. Returns {} when the chapter
  // isn't in the stored chapterMeta (no position to splice).
  private spliceLikesForDelete(
    book: Record<string, unknown>,
    chapterId: string,
  ): { likes?: number[]; chapterLikedBy?: Record<string, string[]> } {
    const meta = (book.chapterMeta as Array<{ id: string }>) || [];
    const idx = meta.findIndex((m) => m.id === chapterId);
    if (idx < 0) return {};
    const out: {
      likes?: number[];
      chapterLikedBy?: Record<string, string[]>;
    } = {};
    if (Array.isArray(book.likes)) {
      const likes = (book.likes as number[]).slice();
      likes.splice(idx, 1);
      out.likes = likes;
    }
    const likedBy = (book as { chapterLikedBy?: Record<string, string[]> })
      .chapterLikedBy;
    if (likedBy && typeof likedBy === 'object') {
      const shifted: Record<string, string[]> = {};
      for (const key of Object.keys(likedBy)) {
        const k = Number(key);
        if (!Number.isInteger(k) || k < 0 || k === idx) continue;
        shifted[k < idx ? key : String(k - 1)] = likedBy[key];
      }
      out.chapterLikedBy = shifted;
    }
    return out;
  }

  // Grow the position-indexed `likes` array to cover every chapter after a
  // write, padding new slots with 0 and keeping existing reader counts. Target
  // length is the larger of the incoming chapterMeta length / chaptersCount —
  // never shrinks (unpublish/delete own that). Returns {} when no padding is
  // needed so unrelated edits don't rewrite the array.
  private padLikesForWrite(
    book: Record<string, unknown>,
    bookUpdates?: Record<string, unknown>,
  ): { likes?: number[] } {
    const existing = Array.isArray(book.likes)
      ? (book.likes as number[]).slice()
      : [];
    let target = existing.length;
    const meta = bookUpdates?.chapterMeta;
    if (Array.isArray(meta)) target = Math.max(target, meta.length);
    const newCount = bookUpdates?.chaptersCount;
    if (typeof newCount === 'number') target = Math.max(target, newCount);
    if (target <= existing.length) return {};
    while (existing.length < target) existing.push(0);
    return { likes: existing };
  }

  private async assertAuthor(
    bookId: string,
    user: AuthUser,
  ): Promise<Record<string, unknown>> {
    const snap = await this.booksCol().doc(bookId).get();
    if (!snap.exists) throw new NotFoundException('Book not found');
    const data = snap.data() as Record<string, unknown>;
    if (data.authorUid !== user.uid && !user.admin) {
      throw new ForbiddenException('Not the book author');
    }
    return data;
  }

  // Completion lock for the chapter-write paths: a book marked completed is
  // read-only, so its chapters can be neither written nor deleted (mirrors the
  // book-level lock in BooksService.update and the client's WriteView editor
  // lock). Admins keep edit access for moderation. Reading paths (list/getOne/
  // getContent) intentionally do NOT call this — a completed book is still read.
  private assertEditable(book: Record<string, unknown>, user: AuthUser): void {
    if (
      (book as { isCompleted?: boolean }).isCompleted === true &&
      !user.admin
    ) {
      throw new ForbiddenException(
        'This book is completed and can no longer be edited.',
      );
    }
  }

  private async assertClean(
    text: string,
    checkProfanity: boolean,
    mature = false,
  ): Promise<void> {
    const verdict = await this.moderation.screen(text, checkProfanity, mature);
    if (verdict.flagged) {
      throw new UnprocessableEntityException({
        code: 'moderation-flagged',
        message: 'Content violates community guidelines',
      });
    }
  }

  private sanitizeBookUpdates(
    updates?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!updates) return {};
    return Object.fromEntries(
      Object.entries(updates).filter(
        ([k, v]) => !BOOK_PROTECTED.has(k) && v !== undefined,
      ),
    );
  }
}
