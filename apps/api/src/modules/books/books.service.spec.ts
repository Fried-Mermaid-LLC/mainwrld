import { BooksService } from './books.service';
import { ChapterMetaDto } from './dto/create-book.dto';
import {
  FakeFirestore,
  createFakeModeration,
  createFakeNotifications,
  createFakeRewards,
  createFakeStorage,
  makeAuthUser,
} from '../../testing/test-utils';

describe('BooksService', () => {
  let fs: FakeFirestore;
  let storage: ReturnType<typeof createFakeStorage>;
  let moderation: ReturnType<typeof createFakeModeration>;
  let rewards: ReturnType<typeof createFakeRewards>;
  let notifications: ReturnType<typeof createFakeNotifications>;
  let svc: BooksService;

  const build = (flagged = false) => {
    fs = new FakeFirestore();
    storage = createFakeStorage();
    moderation = createFakeModeration(flagged);
    rewards = createFakeRewards();
    notifications = createFakeNotifications();
    svc = new BooksService(
      fs as any,
      storage as any,
      moderation as any,
      rewards as any,
      notifications as any,
    );
  };

  beforeEach(() => build());

  describe('create', () => {
    it('stamps authorUid + authorUsername from the token and persists', async () => {
      const user = makeAuthUser({ uid: 'author1', username: 'bob' });
      const book = await svc.create(user, {
        id: 'b1',
        title: 'My Book',
        tagline: 'A tale',
      } as any);

      expect(book.id).toBe('b1');
      expect(book.authorUid).toBe('author1');
      expect(book.authorUsername).toBe('bob');
      const stored = fs.dump('books/b1')!;
      expect(stored.authorUid).toBe('author1');
      expect(stored.title).toBe('My Book');
      // never trusts a client id field other than the document id
      expect(book.id).toBe('b1');
    });

    it('fans out to followers when the new book is published (isDraft:false)', async () => {
      const user = makeAuthUser({ uid: 'author1', username: 'bob' });
      await svc.create(user, {
        id: 'b1',
        title: 'My Book',
        tagline: 'A tale',
        isDraft: false,
      } as any);
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledTimes(
        1,
      );
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledWith(
        expect.objectContaining({
          authorUsername: 'bob',
          title: 'New Book',
          bookId: 'b1',
        }),
      );
    });

    it('does NOT fan out when the new book is a draft', async () => {
      const user = makeAuthUser({ uid: 'author1', username: 'bob' });
      await svc.create(user, {
        id: 'b1',
        title: 'My Book',
        tagline: 'A tale',
        isDraft: true,
      } as any);
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
    });

    it('stamps publishAnnounced + announcedChapterIds when created published', async () => {
      // Records the create-time first publish so a later unpublish→republish never
      // re-announces and the chapters it shipped with never fire "New Chapter".
      await svc.create(makeAuthUser({ uid: 'author1', username: 'bob' }), {
        id: 'b1',
        title: 'My Book',
        tagline: 'A tale',
        isDraft: false,
        chapterMeta: [
          { id: 'c0', title: 'Chapter 1', published: true },
          { id: 'c1', title: 'Chapter 2', published: false },
        ],
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.publishAnnounced).toBe(true);
      expect(stored.announcedChapterIds).toEqual(['c0']);
    });

    it('does not stamp announce bookkeeping on a draft create', async () => {
      await svc.create(makeAuthUser({ uid: 'u1', username: 'alice' }), {
        id: 'b1',
        title: 'T',
        isDraft: true,
        chapterMeta: [{ id: 'c0', title: 'Chapter 1', published: false }],
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.publishAnnounced).toBeUndefined();
      expect(stored.announcedChapterIds).toBeUndefined();
    });

    it('defaults a new book to unpublished (isDraft:true) when omitted', async () => {
      const user = makeAuthUser({ uid: 'author1', username: 'bob' });
      const book = await svc.create(user, {
        id: 'b1',
        title: 'My Book',
        tagline: 'A tale',
      } as any);
      expect(book.isDraft).toBe(true);
      expect(fs.dump('books/b1')!.isDraft).toBe(true);
      // A default draft never fans out to followers.
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
    });

    it('screens title and tagline (flagged -> 422)', async () => {
      build(true);
      await expect(
        svc.create(makeAuthUser(), { title: 'bad', tagline: 'x' } as any),
      ).rejects.toThrow('Content violates community guidelines');
      expect(moderation.screen).toHaveBeenCalledWith('bad', true, false);
    });

    it('allocates an id when the supplied id is invalid', async () => {
      const book = await svc.create(makeAuthUser(), {
        id: 'not a valid id!!',
        title: 'T',
      } as any);
      expect(book.id).not.toBe('not a valid id!!');
      expect(fs.dump(`books/${book.id}`)).toBeDefined();
    });

    it('falls back to dto.authorUsername then null when token lacks username', async () => {
      const userNoName = makeAuthUser({ username: undefined as any });
      const book = await svc.create(userNoName, {
        id: 'b2',
        title: 'T',
        authorUsername: 'dtoname',
      } as any);
      expect(book.authorUsername).toBe('dtoname');
    });

    it('persists nested chapterMeta DTO instances as plain objects', async () => {
      // The ValidationPipe hydrates chapterMeta into ChapterMetaDto instances;
      // Firestore rejects objects with a custom prototype, so create() must
      // strip them back to plain objects.
      const meta = Object.assign(new ChapterMetaDto(), {
        id: 'c1',
        title: 'Chapter 1',
      });
      const book = await svc.create(makeAuthUser({ uid: 'u1' }), {
        id: 'b1',
        title: 'T',
        chapterMeta: [meta],
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.chapterMeta).toEqual([{ id: 'c1', title: 'Chapter 1' }]);
      expect(Object.getPrototypeOf(stored.chapterMeta[0])).toBe(
        Object.prototype,
      );
      expect(book.chapterMeta).toEqual([{ id: 'c1', title: 'Chapter 1' }]);
    });

    it('drops a client-supplied likes array on create (non-admin)', async () => {
      const book = await svc.create(makeAuthUser({ uid: 'u1' }), {
        id: 'b1',
        title: 'T',
        likes: [50, 50],
      } as any);
      expect(book.likes).toBeUndefined();
    });
  });

  describe('getForUser', () => {
    it('throws NotFound for a missing book', async () => {
      await expect(svc.getForUser('nope', makeAuthUser())).rejects.toThrow(
        'Book not found',
      );
    });

    it('hides a draft from a non-author (NotFound)', async () => {
      fs.seed('books/b1', { id: 'b1', isDraft: true, authorUid: 'someone' });
      await expect(
        svc.getForUser('b1', makeAuthUser({ uid: 'other' })),
      ).rejects.toThrow('Book not found');
    });

    it('lets the author read their own draft', async () => {
      fs.seed('books/b1', { id: 'b1', isDraft: true, authorUid: 'u1' });
      const book = await svc.getForUser('b1', makeAuthUser({ uid: 'u1' }));
      expect(book.id).toBe('b1');
    });

    it('lets an admin read any draft', async () => {
      fs.seed('books/b1', { id: 'b1', isDraft: true, authorUid: 'someone' });
      const book = await svc.getForUser(
        'b1',
        makeAuthUser({ uid: 'other', admin: true }),
      );
      expect(book.id).toBe('b1');
    });

    it('returns a published book to anyone', async () => {
      fs.seed('books/b1', { id: 'b1', isDraft: false, authorUid: 'someone' });
      const book = await svc.getForUser('b1', makeAuthUser({ uid: 'other' }));
      expect(book.id).toBe('b1');
    });
  });

  describe('update', () => {
    it('throws NotFound when the book does not exist', async () => {
      await expect(
        svc.update('nope', makeAuthUser(), { title: 'x' } as any),
      ).rejects.toThrow('Book not found');
    });

    it('forbids a non-author non-admin', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'owner', title: 'old' });
      await expect(
        svc.update('b1', makeAuthUser({ uid: 'intruder' }), {
          title: 'new',
        } as any),
      ).rejects.toThrow('Not the book author');
    });

    it('lets the author update + re-screens metadata', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'u1', title: 'old' });
      const out = await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        title: 'new',
        tagline: 'fresh',
      } as any);
      expect(out.title).toBe('new');
      expect(fs.dump('books/b1')!.title).toBe('new');
      expect(moderation.screen).toHaveBeenCalledWith('new', true, false);
      expect(moderation.screen).toHaveBeenCalledWith('fresh', true, false);
    });

    it('fans out "New Book" on the first whole-book publish (isDraft true→false)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        title: 'My Book',
        isDraft: true,
        chaptersCount: 1,
        chapterMeta: [{ id: 'c0', published: true }],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1', username: 'alice' }), {
        isDraft: false,
        chapterMeta: [{ id: 'c0', published: true }],
      } as any);
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledTimes(
        1,
      );
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledWith(
        expect.objectContaining({
          authorUsername: 'alice',
          title: 'New Book',
          bookId: 'b1',
        }),
      );
      const stored = fs.dump('books/b1')!;
      expect(stored.publishAnnounced).toBe(true);
      expect(stored.announcedChapterIds).toEqual(['c0']);
    });

    it('does NOT re-fire "New Book" when republishing an already-announced book', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        title: 'My Book',
        isDraft: true,
        publishAnnounced: true,
        announcedChapterIds: ['c0'],
        chaptersCount: 1,
        chapterMeta: [{ id: 'c0', published: true }],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1', username: 'alice' }), {
        isDraft: false,
        chapterMeta: [{ id: 'c0', published: true }],
      } as any);
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
    });

    it('fans out "New Chapter" when a draft chapter is published via updateBook{chapterMeta}', async () => {
      // Per-chapter publish (setChapterPublished → updateBook) routes through
      // update(), so a chapter first becoming published here must notify too.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        title: 'My Book',
        isDraft: false,
        publishAnnounced: true,
        announcedChapterIds: ['c0'],
        chaptersCount: 1,
        chapterMeta: [
          { id: 'c0', published: true },
          { id: 'c1', published: false },
        ],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1', username: 'alice' }), {
        chapterMeta: [
          { id: 'c0', published: true },
          { id: 'c1', published: true },
        ],
        chaptersCount: 2,
      } as any);
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledTimes(
        1,
      );
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Chapter',
          bookId: 'b1',
          includeLibraryOwners: true,
        }),
      );
      expect(fs.dump('books/b1')!.announcedChapterIds).toEqual(['c0', 'c1']);
    });

    it('does NOT fire "New Book" when editing a legacy already-published book (no publishAnnounced)', async () => {
      // Regression guard: a book already published before the announce fields
      // existed must not mass-announce on its next edit — it backfills silently.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        title: 'old',
        isDraft: false,
        chaptersCount: 1,
        chapterMeta: [{ id: 'c0', published: true }],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1', username: 'alice' }), {
        title: 'new',
      } as any);
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
      expect(fs.dump('books/b1')!.publishAnnounced).toBe(true);
    });

    it('lets an admin update a book they do not own', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'owner', title: 'old' });
      const out = await svc.update(
        'b1',
        makeAuthUser({ uid: 'admin1', admin: true }),
        { title: 'mod' } as any,
      );
      expect(out.title).toBe('mod');
    });

    it('drops an author-supplied likes write (no self-inflation)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'old',
        likes: [1, 1],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        likes: [999, 999],
      } as any);
      expect(fs.dump('books/b1')!.likes).toEqual([1, 1]);
    });

    it('lets an admin adjust likes', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'owner',
        title: 'old',
        likes: [1],
      });
      await svc.update('b1', makeAuthUser({ uid: 'admin1', admin: true }), {
        likes: [5],
      } as any);
      expect(fs.dump('books/b1')!.likes).toEqual([5]);
    });

    it('unpublishing a middle chapter (flag) leaves likes/chapterLikedBy untouched and re-derives chaptersCount', async () => {
      // 3 published chapters, all with 100 likes. Unpublishing the MIDDLE one
      // flips its per-chapter flag; positions don't move, so the position-indexed
      // likes stay intact (a republish later legitimately keeps its own likes).
      // chaptersCount is re-derived from the flags (3 -> 2).
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'old',
        chaptersCount: 3,
        likes: [100, 100, 100],
        chapterLikedBy: {
          '0': ['a', 'b'],
          '1': ['c'],
          '2': ['d', 'e'],
        },
        chapterMeta: [
          { id: 'c0', title: 'C0', published: true },
          { id: 'c1', title: 'C1', published: true },
          { id: 'c2', title: 'C2', published: true },
        ],
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [
          { id: 'c0', title: 'C0', published: true },
          { id: 'c1', title: 'C1', published: false },
          { id: 'c2', title: 'C2', published: true },
        ],
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.chaptersCount).toBe(2);
      // Likes are NOT pruned — positions are stable.
      expect(stored.likes).toEqual([100, 100, 100]);
      expect(stored.chapterLikedBy).toEqual({
        '0': ['a', 'b'],
        '1': ['c'],
        '2': ['d', 'e'],
      });
    });

    it('derives chaptersCount from chapterMeta published flags', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'old',
        chaptersCount: 1,
        chapterMeta: [{ id: 'c0', title: 'C0', published: true }],
      });
      // Republishing/adding a second published chapter raises the derived count.
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [
          { id: 'c0', title: 'C0', published: true },
          { id: 'c1', title: 'C1', published: true },
        ],
      } as any);
      expect(fs.dump('books/b1')!.chaptersCount).toBe(2);
    });

    it('does not touch chaptersCount when chapterMeta carries no published flags', async () => {
      // Legacy/un-migrated edit (no per-chapter flags) must not zero the count.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'old',
        chaptersCount: 2,
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [
          { id: 'c0', title: 'C0' },
          { id: 'c1', title: 'C1' },
        ],
      } as any);
      expect(fs.dump('books/b1')!.chaptersCount).toBe(2);
    });

    it('permanently demonetizes a monetized book on unpublish (isDraft -> true)', async () => {
      // The client's isMonetized:false / wasMonetizedBefore:true are dropped by
      // the DTO whitelist; the server must re-derive the demonetization from the
      // author-writable isDraft signal and stamp the terminal permanence flags.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'paid',
        isMonetized: true,
        isFree: false,
        price: 14.99,
        isDraft: false,
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        isDraft: true,
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.isMonetized).toBe(false);
      expect(stored.isFree).toBe(true);
      expect(stored.price).toBe(0);
      expect(stored.monetizationStatus).toBe('demonetized');
      expect(stored.permanentlyDemonetized).toBe(true);
      expect(stored.wasMonetizedBefore).toBe(true);
    });

    it('permanently demonetizes a monetized book when reopened (isCompleted -> false)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'paid',
        isMonetized: true,
        isCompleted: true,
        isDraft: false,
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        isCompleted: false,
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.isMonetized).toBe(false);
      expect(stored.permanentlyDemonetized).toBe(true);
      expect(stored.wasMonetizedBefore).toBe(true);
    });

    it('does NOT demonetize a monetized book on an unrelated (admin) edit', async () => {
      // A monetized book is necessarily completed (hence locked for the author),
      // so an unrelated metadata edit can only come from an admin. It must not
      // trip the demonetize patch.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'old',
        isMonetized: true,
        isFree: false,
        price: 9.99,
        isDraft: false,
        isCompleted: true,
      });
      await svc.update('b1', makeAuthUser({ uid: 'admin1', admin: true }), {
        title: 'new',
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.isMonetized).toBe(true);
      expect(stored.price).toBe(9.99);
      expect(stored.permanentlyDemonetized).toBeUndefined();
      expect(stored.wasMonetizedBefore).toBeUndefined();
    });

    it('forbids the author from editing a completed book (locked)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'done',
        isDraft: false,
        isCompleted: true,
      });
      await expect(
        svc.update('b1', makeAuthUser({ uid: 'u1' }), {
          title: 'sneaky edit',
        } as any),
      ).rejects.toThrow('completed');
      // The stored title is untouched.
      expect(fs.dump('books/b1')!.title).toBe('done');
    });

    it('allows the author to reopen a completed book (isCompleted -> false)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'done',
        isDraft: false,
        isCompleted: true,
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        isCompleted: false,
      } as any);
      expect(fs.dump('books/b1')!.isCompleted).toBe(false);
    });

    it('lets an admin edit a completed book (moderation path)', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'done',
        isDraft: false,
        isCompleted: true,
      });
      await svc.update('b1', makeAuthUser({ uid: 'admin1', admin: true }), {
        title: 'moderated',
      } as any);
      expect(fs.dump('books/b1')!.title).toBe('moderated');
    });

    it('does not stamp permanence flags when a non-monetized book is unpublished', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        title: 'free',
        isMonetized: false,
        isDraft: false,
      });
      await svc.update('b1', makeAuthUser({ uid: 'u1' }), {
        isDraft: true,
      } as any);
      const stored = fs.dump('books/b1')!;
      expect(stored.permanentlyDemonetized).toBeUndefined();
      expect(stored.wasMonetizedBefore).toBeUndefined();
    });

    it('rejects a flagged update (422) before writing', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'u1', title: 'old' });
      build(true);
      fs.seed('books/b1', { id: 'b1', authorUid: 'u1', title: 'old' });
      await expect(
        svc.update('b1', makeAuthUser({ uid: 'u1' }), { title: 'bad' } as any),
      ).rejects.toThrow('Content violates community guidelines');
      expect(fs.dump('books/b1')!.title).toBe('old');
    });
  });

  describe('remove', () => {
    it('no-ops on a missing book', async () => {
      await expect(svc.remove('nope', makeAuthUser())).resolves.toBeUndefined();
    });

    it('forbids a non-author non-admin', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'owner' });
      await expect(
        svc.remove('b1', makeAuthUser({ uid: 'intruder' })),
      ).rejects.toThrow('Not the book author');
      expect(fs.dump('books/b1')).toBeDefined();
    });

    it('recursively deletes the book + its chapters for the author', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'u1' });
      fs.seed('books/b1/chapters/c0', { order: 0 });
      fs.seed('books/b1/chapters/c1', { order: 1 });
      await svc.remove('b1', makeAuthUser({ uid: 'u1' }));
      expect(fs.dump('books/b1')).toBeUndefined();
      expect(fs.dump('books/b1/chapters/c0')).toBeUndefined();
      expect(fs.dump('books/b1/chapters/c1')).toBeUndefined();
    });

    it('lets an admin delete a book they do not own', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'owner' });
      await svc.remove('b1', makeAuthUser({ uid: 'admin1', admin: true }));
      expect(fs.dump('books/b1')).toBeUndefined();
    });
  });

  describe('adjustFavorite', () => {
    it('increments favoritesTotal by the delta', async () => {
      fs.seed('books/b1', { id: 'b1', favoritesTotal: 2 });
      await svc.adjustFavorite('b1', 1);
      expect(fs.dump('books/b1')!.favoritesTotal).toBe(3);
      await svc.adjustFavorite('b1', -1);
      expect(fs.dump('books/b1')!.favoritesTotal).toBe(2);
    });

    it('initialises the counter from absent', async () => {
      fs.seed('books/b1', { id: 'b1' });
      await svc.adjustFavorite('b1', 1);
      expect(fs.dump('books/b1')!.favoritesTotal).toBe(1);
    });

    it('no-ops on a missing book', async () => {
      await expect(svc.adjustFavorite('nope', 1)).resolves.toBeUndefined();
    });
  });

  describe('uploadCover', () => {
    it('saves to storage and returns {url, path}', async () => {
      const b64 = Buffer.from('hello').toString('base64');
      const dataUrl = `data:image/jpeg;base64,${b64}`;
      const res = await svc.uploadCover('authorX', 'bookY', dataUrl);

      expect(res.path).toMatch(/^book-covers\/authorX\/bookY\/.+\.jpg$/);
      expect(res.url).toContain(
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/',
      );
      expect(res.url).toContain('alt=media&token=');
      // saved to storage at the returned path
      expect(storage._saved.map((s) => s.path)).toContain(res.path);
      const saved = storage._saved.find((s) => s.path === res.path)!;
      expect(saved.buffer.toString()).toBe('hello');
    });

    it('rejects an invalid data URL (422)', async () => {
      await expect(svc.uploadCover('a', 'b', 'not-a-data-url')).rejects.toThrow(
        'Invalid cover data URL',
      );
    });
  });

  describe('deleteCover', () => {
    it('swallows storage errors (best-effort)', async () => {
      const throwing = createFakeStorage();
      throwing.bucket = jest.fn(() => ({
        name: 'b',
        file: () => ({
          delete: jest.fn(async () => {
            throw new Error('gone');
          }),
        }),
      })) as any;
      const s = new BooksService(fs as any, throwing as any, moderation as any);
      await expect(s.deleteCover('some/path.jpg')).resolves.toBeUndefined();
    });
  });

  describe('listForUser', () => {
    it('merges published books with the user own (own copy wins)', async () => {
      fs.seed('books/pub', {
        id: 'pub',
        isDraft: false,
        authorUid: 'someone',
      });
      fs.seed('books/mine', { id: 'mine', isDraft: true, authorUid: 'u1' });
      // a published book the user also authored — should appear once
      fs.seed('books/both', { id: 'both', isDraft: false, authorUid: 'u1' });
      fs.seed('books/otherDraft', {
        id: 'otherDraft',
        isDraft: true,
        authorUid: 'someone',
      });

      const list = await svc.listForUser('u1');
      const ids = list.map((b) => b.id).sort();
      expect(ids).toEqual(['both', 'mine', 'pub']);
      // someone-else's draft is excluded
      expect(ids).not.toContain('otherDraft');
    });
  });

  describe('likeChapter', () => {
    it('lets an author like their OWN chapter without awarding self points', async () => {
      // 9 genuine reader likes → the author's own like tips it to 10 (a
      // milestone boundary). Authors MAY self-like, but it must never feed the
      // points/milestone economy, so RewardsService is not invoked.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        likes: [9],
        chapterLikedBy: {
          '0': ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
        },
      });
      const res = await svc.likeChapter(
        'b1',
        makeAuthUser({ uid: 'u1', username: 'alice' }),
        0,
      );
      expect(res).toEqual({ liked: true, likes: 10 });
      expect(fs.dump('books/b1')!.likes).toEqual([10]);
      expect(rewards.onChapterLikeChanged).not.toHaveBeenCalled();
    });

    it('awards the author when a NON-author reader likes a chapter', async () => {
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        likes: [0],
        chapterLikedBy: {},
      });
      const res = await svc.likeChapter(
        'b1',
        makeAuthUser({ uid: 'u2', username: 'bob' }),
        0,
      );
      expect(res).toEqual({ liked: true, likes: 1 });
      expect(rewards.onChapterLikeChanged).toHaveBeenCalledTimes(1);
      expect(rewards.onChapterLikeChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'b1',
          authorUid: 'u1',
          authorUsername: 'alice',
        }),
        0,
        0,
        1,
      );
    });

    it('strips the author’s standing self-like from a later reader’s milestone counts', async () => {
      // Chapter shows 1 like, but it is the author’s own self-like. When a
      // reader likes, the milestone math must see genuine-reader demand 0 → 1
      // (not 1 → 2), so a self-like can’t fire a milestone one reader early.
      fs.seed('books/b1', {
        id: 'b1',
        authorUid: 'u1',
        authorUsername: 'alice',
        likes: [1],
        chapterLikedBy: { '0': ['alice'] },
      });
      const res = await svc.likeChapter(
        'b1',
        makeAuthUser({ uid: 'u2', username: 'bob' }),
        0,
      );
      expect(res).toEqual({ liked: true, likes: 2 });
      expect(rewards.onChapterLikeChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'b1' }),
        0,
        0,
        1,
      );
    });

    it('rejects a caller with no username', async () => {
      fs.seed('books/b1', { id: 'b1', authorUid: 'u1', likes: [0] });
      await expect(
        svc.likeChapter(
          'b1',
          makeAuthUser({ uid: 'u2', username: undefined }),
          0,
        ),
      ).rejects.toThrow('No username');
    });
  });
});
