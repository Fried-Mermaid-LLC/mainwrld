import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';
import type { CommitChapterDto } from './dto/commit-chapter.dto';

export type ChapterDoc = Record<string, unknown> & { id: string };

// Book metadata the client must not write through the chapter-commit path.
const BOOK_PROTECTED = new Set<string>([
  'authorUid',
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
]);

@Injectable()
export class ChaptersService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly moderation: ModerationService,
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
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChapterDoc);
  }

  async getOne(
    bookId: string,
    chapterId: string,
    user: AuthUser,
  ): Promise<ChapterDoc> {
    await this.assertAuthor(bookId, user);
    const snap = await this.chaptersCol(bookId).doc(chapterId).get();
    if (!snap.exists) throw new NotFoundException('Chapter not found');
    return { id: snap.id, ...snap.data() } as ChapterDoc;
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

    const meta = (book.chapterMeta as Array<{ id: string }>) || [];
    const order = meta.findIndex((m) => m.id === chapterId);
    const chaptersCount = (book.chaptersCount as number) || 0;

    if (!isAuthor && !isAdmin && (order < 0 || order >= chaptersCount)) {
      throw new ForbiddenException('Chapter not available.');
    }

    if (!isAuthor && !isAdmin) {
      const isFreeOrUnmonetized =
        book.isFree === true || book.isMonetized !== true;
      const isPreview = order === 0;
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
    await this.assertAuthor(bookId, user);
    // Body prose: OpenAI only. Title: profanity + OpenAI.
    if (dto.content) await this.assertClean(dto.content, false);
    if (dto.title) await this.assertClean(dto.title, true);

    const bookUpdates = this.sanitizeBookUpdates(dto.bookUpdates);
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
      chapters: FieldValue.delete(),
      content: FieldValue.delete(),
      schemaVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  async commitDelete(
    bookId: string,
    chapterId: string,
    user: AuthUser,
    bookUpdates?: Record<string, unknown>,
  ): Promise<void> {
    await this.assertAuthor(bookId, user);
    const batch = this.db.batch();
    batch.delete(this.chaptersCol(bookId).doc(chapterId));
    batch.update(this.booksCol().doc(bookId), {
      ...this.sanitizeBookUpdates(bookUpdates),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  private async assertAuthor(bookId: string, user: AuthUser): Promise<void> {
    const snap = await this.booksCol().doc(bookId).get();
    if (!snap.exists) throw new NotFoundException('Book not found');
    const data = snap.data() as Record<string, unknown>;
    if (data.authorUid !== user.uid && !user.admin) {
      throw new ForbiddenException('Not the book author');
    }
  }

  private async assertClean(text: string, checkProfanity: boolean): Promise<void> {
    const verdict = await this.moderation.screen(text, checkProfanity);
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
