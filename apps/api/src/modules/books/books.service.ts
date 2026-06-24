import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIREBASE_STORAGE,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';
import { RewardsService } from '../rewards/rewards.service';
import type { CreateBookDto } from './dto/create-book.dto';
import type { UpdateBookDto } from './dto/update-book.dto';

// Raw Firestore book document. The client converts this into the richer `Book`
// shape (nested author object, isFavorite, …); we keep the wire shape raw so
// that conversion layer in the hooks is untouched.
export type BookDoc = Record<string, unknown> & {
  id: string;
  authorUid?: string;
  authorUsername?: string;
  isDraft?: boolean;
  title?: string;
};

@Injectable()
export class BooksService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_STORAGE) private readonly storage: Storage,
    private readonly moderation: ModerationService,
    private readonly rewards: RewardsService,
  ) {}

  private get col() {
    return this.db.collection(COLLECTIONS.books);
  }

  // Books the user may read: every published book + the user's own (including
  // drafts), merged by id (own copy wins). Mirrors the client's two-listener
  // merge that the security rules require.
  async listForUser(uid: string): Promise<BookDoc[]> {
    const [published, mine] = await Promise.all([
      this.col.where('isDraft', '==', false).get(),
      this.col.where('authorUid', '==', uid).get(),
    ]);
    const byId = new Map<string, BookDoc>();
    for (const d of published.docs)
      byId.set(d.id, { id: d.id, ...d.data() } as BookDoc);
    for (const d of mine.docs)
      byId.set(d.id, { id: d.id, ...d.data() } as BookDoc);
    return Array.from(byId.values());
  }

  async getForUser(id: string, user: AuthUser): Promise<BookDoc> {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) throw new NotFoundException('Book not found');
    const data = { id: snap.id, ...snap.data() } as BookDoc;
    // Drafts are visible only to the author or an admin.
    if (data.isDraft && data.authorUid !== user.uid && !user.admin) {
      throw new NotFoundException('Book not found');
    }
    return data;
  }

  // The ValidationPipe (whitelist) has already dropped any field not on the DTO
  // — including server-managed ones (authorUid, monetization*, sellerUid, …) —
  // so `dto` carries only author-writable fields. authorUid is stamped here.
  async create(user: AuthUser, dto: CreateBookDto): Promise<BookDoc> {
    await this.screenMetadata(dto.title, dto.tagline, !!dto.isMature);
    // Per-chapter `likes` is a reader-driven aggregate, never author-authored.
    // An author seeding it would self-inflate the count that gates monetization
    // (100+ likes/chapter) and the spotlight ranking. Strip it on the author
    // path (admins may still seed/repair counts).
    this.stripLikesUnlessAdmin(user, dto);
    // Accept a caller-supplied id (so a cover can be uploaded before the doc
    // exists); otherwise allocate one.
    const id =
      dto.id && /^[A-Za-z0-9_-]{1,128}$/.test(dto.id) ? dto.id : this.col.doc().id;
    const { id: _ignored, ...rest } = dto;
    // The ValidationPipe (transform: true) hydrates nested @Type() fields like
    // `chapterMeta` into class instances (ChapterMetaDto). Firestore rejects
    // objects with a custom prototype, so strip prototypes back to plain
    // objects before writing.
    const data = {
      ...instanceToPlain(rest),
      id,
      authorUid: user.uid,
      authorUsername: user.username ?? dto.authorUsername ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await this.col.doc(id).set(data);
    const snap = await this.col.doc(id).get();
    return { id, ...snap.data() } as BookDoc;
  }

  async update(
    id: string,
    user: AuthUser,
    dto: UpdateBookDto,
  ): Promise<BookDoc> {
    const ref = this.col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Book not found');
    const existing = snap.data() as BookDoc;
    if (existing.authorUid !== user.uid && !user.admin) {
      throw new ForbiddenException('Not the book author');
    }
    // An author may not write their own book's per-chapter `likes` — that would
    // self-inflate the monetization/spotlight signal (readers' likes never reach
    // this author-only endpoint anyway). Admins may still adjust counts.
    this.stripLikesUnlessAdmin(user, dto);
    // Mature flag for moderation: the incoming change if present, else the
    // stored value (legacy docs fall back to isExplicit).
    const ex = existing as { isMature?: boolean; isExplicit?: boolean };
    const mature = (dto.isMature ?? ex.isMature ?? ex.isExplicit) === true;
    await this.screenMetadata(dto.title, dto.tagline, mature);
    // See create(): nested @Type() fields arrive as class instances; Firestore
    // only serializes plain objects.
    await ref.update({
      ...instanceToPlain(dto),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const after = await ref.get();
    return { id, ...after.data() } as BookDoc;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const ref = this.col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() as BookDoc;
    if (data.authorUid !== user.uid && !user.admin) {
      throw new ForbiddenException('Not the book author');
    }
    // Admin SDK recursive delete removes the book + its chapters subcollection
    // (the client SDK had to batch this manually).
    await this.db.recursiveDelete(ref);
  }

  // `likes` is a server-managed reader aggregate. Non-admin callers (i.e. the
  // book's own author — the only non-admin who clears the ownership check) must
  // never write it via the generic update, or they could like their own book and
  // forge the monetization/spotlight signal. Reader likes go through likeChapter,
  // which derives the count from a per-chapter likedBy set. Mutates the dto.
  private stripLikesUnlessAdmin(
    user: AuthUser,
    dto: { likes?: number[] },
  ): void {
    if (!user.admin) delete dto.likes;
  }

  // Server-authoritative per-chapter like toggle (the only path that mutates a
  // book's reader `likes`). The truth is `chapterLikedBy.{i}` — a set of
  // usernames — so a user can like a chapter at most once and authors can't like
  // their own book. `likes[i]` is kept in sync as that set's size. On a NEW like
  // that crosses a multiple of 10, the author is awarded points + notified
  // (RewardsService, best-effort outside the transaction). Returns the toggled
  // state + the chapter's new count for optimistic client reconciliation.
  async likeChapter(
    id: string,
    user: AuthUser,
    chapterIndex: number,
  ): Promise<{ liked: boolean; likes: number }> {
    const username = user.username;
    if (!username) throw new ForbiddenException('No username on account');
    const ref = this.col.doc(id);

    const outcome = await this.db.runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) throw new NotFoundException('Book not found');
      const book = snap.data() as BookDoc;
      if (book.authorUid === user.uid) {
        throw new ForbiddenException('Cannot like your own book');
      }
      const key = String(chapterIndex);
      const likedByMap =
        (book.chapterLikedBy as Record<string, string[]> | undefined) ?? {};
      const arr = Array.isArray(likedByMap[key]) ? likedByMap[key] : [];
      const likesArr = Array.isArray(book.likes)
        ? (book.likes as number[]).slice()
        : [];
      while (likesArr.length <= chapterIndex) likesArr.push(0);

      const oldCount = likesArr[chapterIndex] || 0;
      const has = arr.includes(username);
      const nextArr = has
        ? arr.filter((u) => u !== username)
        : [...arr, username];
      const newCount = nextArr.length;
      likesArr[chapterIndex] = newCount;

      t.update(ref, {
        [`chapterLikedBy.${key}`]: nextArr,
        likes: likesArr,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { liked: !has, oldCount, newCount, book };
    });

    if (outcome.liked) {
      await this.rewards.onChapterLikeChanged(
        {
          id,
          authorUid: outcome.book.authorUid,
          authorUsername: outcome.book.authorUsername,
          chapterMeta: outcome.book.chapterMeta as
            | Array<{ title?: string }>
            | undefined,
        },
        chapterIndex,
        outcome.oldCount,
        outcome.newCount,
      );
    }
    return { liked: outcome.liked, likes: outcome.newCount };
  }

  // Per-book favorites counter feeding the spotlight ranking. Best-effort; the
  // client owns the per-user favorite list, this is just the aggregate signal.
  async adjustFavorite(id: string, delta: 1 | -1): Promise<void> {
    const ref = this.col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.update({ favoritesTotal: FieldValue.increment(delta) });
  }

  // Upload a base64 data-URL cover to Storage and return its public download
  // URL + path. Path embeds the author uid so storage rules can enforce write
  // ownership; the firebaseStorageDownloadTokens metadata yields a public URL
  // identical in shape to the client SDK's getDownloadURL.
  async uploadCover(
    authorUid: string,
    bookId: string,
    dataUrl: string,
  ): Promise<{ url: string; path: string }> {
    const match = /^data:(.+?);base64,(.*)$/s.exec(dataUrl);
    if (!match) throw new UnprocessableEntityException('Invalid cover data URL');
    const [, contentType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');
    const token = randomUUID();
    const path = `book-covers/${authorUid}/${bookId}/${randomUUID()}.jpg`;
    const bucket = this.storage.bucket();
    await bucket.file(path).save(buffer, {
      contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      path,
    )}?alt=media&token=${token}`;
    return { url, path };
  }

  async deleteCover(path: string): Promise<void> {
    try {
      await this.storage.bucket().file(path).delete();
    } catch {
      // Best-effort — a missing/old cover must never block the flow.
    }
  }

  // Pre-moderation for public-facing metadata (title + tagline/synopsis). A
  // flagged write is rejected (422) and recorded for the admin audit trail,
  // replacing the old post-write moderateBookOnWrite trigger.
  private async screenMetadata(
    title?: string,
    tagline?: string,
    mature = false,
  ): Promise<void> {
    for (const text of [title, tagline]) {
      if (!text) continue;
      const verdict = await this.moderation.screen(text, true, mature);
      if (verdict.flagged) {
        throw new UnprocessableEntityException({
          code: 'moderation-flagged',
          message: 'Content violates community guidelines',
        });
      }
    }
  }
}
