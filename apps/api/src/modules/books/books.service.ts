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
import type { ChapterMeta } from '@mainwrld/types';
import type { Storage } from 'firebase-admin/storage';
import type { AuthUser } from '../../infra/auth/auth-user.interface';
import {
  COLLECTIONS,
  FIREBASE_STORAGE,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notifications: NotificationsService,
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
    // Resolve by doc key first (app-created books key the doc by their `id`
    // field), then fall back to a `where('id','==',id)` query so legacy/seeded
    // docs whose key differs from their id field still resolve. Without this
    // fallback a shared `/book/<id>` link's preview (public.loadBook DOES have
    // the fallback) loads, but the post-auth upgrade to the full book-detail
    // page — which routes through here via getBook — fails and the visitor is
    // stranded on the preview (F09). Keep this in lockstep with
    // PublicBookService.loadBook so both paths resolve the same set of books.
    let snap = await this.col.doc(id).get();
    if (!snap.exists) {
      const q = await this.col.where('id', '==', id).limit(1).get();
      if (q.empty) throw new NotFoundException('Book not found');
      snap = q.docs[0];
    }
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
    const created = { id, ...snap.data() } as BookDoc & {
      authorDisplayName?: string;
    };
    // A brand-new published book pings the author's followers. Best-effort —
    // notifyFollowersOfPublication swallows its own errors, never the publish.
    if (created.isDraft === false && created.authorUsername) {
      await this.notifications.notifyFollowersOfPublication({
        authorUsername: created.authorUsername,
        title: 'New Book',
        message: `${created.authorDisplayName ?? created.authorUsername} published a new book: "${created.title ?? ''}"`,
        icon: 'auto_stories',
        bookId: id,
      });
    }
    return created;
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
    // Completion lock: a book the author marked completed is read-only. The one
    // mutation still allowed is reopening it (isCompleted -> false), which the
    // demonetize lock below turns into a permanent un-monetize. Admins keep edit
    // access for moderation/takedown paths. This is the server-authoritative
    // mirror of the editor lock in the client's WriteView.
    const isReopen =
      (dto as { isCompleted?: boolean }).isCompleted === false;
    if (
      (existing as { isCompleted?: boolean }).isCompleted === true &&
      !isReopen &&
      !user.admin
    ) {
      throw new ForbiddenException(
        'This book is completed and can no longer be edited. Reopen it first.',
      );
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
    // chaptersCount is the server-derived count of published chapters. When the
    // update carries chapterMeta with per-chapter `published` flags, recompute it
    // here so it always mirrors the authoritative flags (and the client can't
    // forge the monetization/pricing signal). Unpublishing a chapter now only
    // flips its flag — it does NOT move chapter positions, so `likes`/
    // `chapterLikedBy` (indexed by absolute order) stay valid and are left
    // untouched. A republished chapter is the same doc at the same order, so it
    // legitimately keeps its own reader likes; brand-new chapters append at a
    // fresh order with zero likes, closing the old shrink→republish forgery.
    const deriveCount = this.deriveChaptersCount(dto);
    // Un-monetize permanence (terminal lock). The monetization flags are
    // server-managed (NOT on UpdateBookDto), so the client's isMonetized:false /
    // wasMonetizedBefore:true sent on an unpublish/reopen are silently dropped by
    // the whitelist. Re-derive the demonetization here from author-writable
    // signals and stamp it authoritatively.
    const demonetize = this.demonetizePatch(existing, dto);
    // See create(): nested @Type() fields arrive as class instances; Firestore
    // only serializes plain objects.
    await ref.update({
      ...instanceToPlain(dto),
      ...deriveCount,
      ...demonetize,
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

  // Terminal un-monetize lock. A monetized book that the author unpublishes
  // (isDraft -> true) or reopens (isCompleted -> false) is being un-monetized;
  // the doc says an un-monetized book can never be monetized again (mirrors the
  // admin-takedown lock). Because isMonetized/wasMonetizedBefore/
  // permanentlyDemonetized are server-managed (off the DTO, dropped by the
  // whitelist), this is the authoritative server stamp — the client cannot write
  // these flags itself. Returns {} for any update that doesn't un-monetize, so
  // normal edits to a monetized book are untouched. canMonetize() in
  // MonetizationService blocks every future request once the permanence flags
  // are set, exactly as the takedown path does via takenDown.
  private demonetizePatch(
    existing: BookDoc,
    dto: { isDraft?: boolean; isCompleted?: boolean },
  ): Record<string, unknown> {
    if (existing.isMonetized !== true) return {};
    const becomesDraft = (dto.isDraft ?? existing.isDraft) === true;
    const becomesIncomplete =
      (dto.isCompleted ??
        (existing as { isCompleted?: boolean }).isCompleted) === false;
    if (!becomesDraft && !becomesIncomplete) return {};
    return {
      isMonetized: false,
      isFree: true,
      price: 0,
      monetizationStatus: 'demonetized',
      permanentlyDemonetized: true,
      wasMonetizedBefore: true,
    };
  }

  // chaptersCount is the count of published chapters, derived server-side from
  // the per-chapter `published` flags on the incoming chapterMeta. Returns {}
  // when the update doesn't carry flagged chapterMeta, so edits that don't touch
  // chapter visibility leave the stored count alone. This replaces the legacy
  // published-prefix accounting (and its like-pruning): visibility is now a flag,
  // not a count, and unpublishing never moves a chapter's position.
  private deriveChaptersCount(dto: {
    chapterMeta?: ChapterMeta[];
  }): { chaptersCount?: number } {
    const meta = dto.chapterMeta;
    if (!Array.isArray(meta)) return {};
    if (!meta.some((m) => typeof m.published === 'boolean')) return {};
    return { chaptersCount: meta.filter((m) => m.published === true).length };
  }

  // Server-authoritative per-chapter like toggle (the only path that mutates a
  // book's reader `likes`). The truth is `chapterLikedBy.{i}` — a set of
  // usernames — so a user can like a chapter at most once. Authors MAY like
  // their own book, but a self-like never awards points or fires a milestone
  // notification (that would let an author farm their own economy) and is
  // excluded from the monetization gate. `likes[i]` is kept in sync as that
  // set's size. On a NEW like by someone OTHER than the author that crosses a
  // multiple of 10, the author is awarded points + notified (RewardsService,
  // best-effort outside the transaction). Returns the toggled state + the
  // chapter's new count for optimistic client reconciliation.
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
      // Does the author sit in this chapter's like set? A standing self-like
      // must be stripped from the reader-milestone math below (a reader's like
      // never changes the author's membership, so this holds for old + new).
      const authorName = book.authorUsername;
      const authorSelfLiked =
        typeof authorName === 'string' && nextArr.includes(authorName);
      return { liked: !has, oldCount, newCount, authorSelfLiked, book };
    });

    // A self-like never feeds the author's own point/milestone economy: the
    // self-like event itself awards nothing (author == caller, skipped here),
    // and the author's standing self-like is stripped from the counts a later
    // reader like reports, so milestones fire on genuine reader demand rather
    // than one reader early (or a real milestone getting swallowed).
    if (outcome.liked && outcome.book.authorUid !== user.uid) {
      const selfLike = outcome.authorSelfLiked ? 1 : 0;
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
        Math.max(0, outcome.oldCount - selfLike),
        Math.max(0, outcome.newCount - selfLike),
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
