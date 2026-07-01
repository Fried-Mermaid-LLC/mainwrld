import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import {
  FakeFirestore,
  createFakeModeration,
  createFakeNotifications,
  makeAuthUser,
} from '../../testing/test-utils';

describe('ChaptersService', () => {
  let fs: FakeFirestore;
  let moderation: ReturnType<typeof createFakeModeration>;
  let notifications: ReturnType<typeof createFakeNotifications>;
  let svc: ChaptersService;

  // Seed a 3-chapter book. By default it is monetized & paid (isFree=false),
  // so chapters beyond the preview are behind the paywall.
  const seedBook = (over: Record<string, unknown> = {}) => {
    fs.seed('books/b1', {
      id: 'b1',
      authorUid: 'u1',
      isMonetized: true,
      isFree: false,
      takenDown: false,
      chaptersCount: 3,
      chapterMeta: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }],
      ...over,
    });
    fs.seed('books/b1/chapters/c0', {
      order: 0,
      title: 'Chapter Zero',
      content: 'preview body',
    });
    fs.seed('books/b1/chapters/c1', {
      order: 1,
      title: 'Chapter One',
      content: 'paid body',
    });
    fs.seed('books/b1/chapters/c2', {
      order: 2,
      title: 'Chapter Two',
      content: 'paid body two',
    });
  };

  beforeEach(() => {
    fs = new FakeFirestore();
    moderation = createFakeModeration();
    notifications = createFakeNotifications();
    svc = new ChaptersService(fs as any, moderation as any, notifications as any);
  });

  describe('getContent paywall', () => {
    it('author gets full content for a paid chapter', async () => {
      seedBook();
      const res = await svc.getContent('b1', 'c1', makeAuthUser({ uid: 'u1' }));
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('admin gets full content for a paid chapter (not the author)', async () => {
      seedBook({ authorUid: 'someone-else' });
      const res = await svc.getContent(
        'b1',
        'c1',
        makeAuthUser({ uid: 'reader', admin: true }),
      );
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('free book grants full content to anyone', async () => {
      seedBook({ authorUid: 'someone-else', isFree: true });
      const res = await svc.getContent(
        'b1',
        'c1',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('unmonetized book grants full content to anyone', async () => {
      seedBook({ authorUid: 'someone-else', isMonetized: false });
      const res = await svc.getContent(
        'b1',
        'c1',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('preview chapter (order 0 via chapterMeta) is free to non-owners', async () => {
      seedBook({ authorUid: 'someone-else' });
      const res = await svc.getContent(
        'b1',
        'c0',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter Zero', content: 'preview body' });
    });

    it('a middle chapter unpublished via its flag is forbidden for readers (despite being within the old prefix)', async () => {
      // c1 is at order 1 (< chaptersCount 3) but explicitly unpublished — the
      // per-chapter flag, not the prefix, decides visibility.
      seedBook({
        authorUid: 'someone-else',
        chapterMeta: [
          { id: 'c0', published: true },
          { id: 'c1', published: false },
          { id: 'c2', published: true },
        ],
      });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow('Chapter not available.');
    });

    it('the free preview is the FIRST published chapter when the opening chapter is unpublished', async () => {
      // c0 is unpublished → the preview shifts to c1, which becomes free to
      // non-owners even though the book is paid/monetized.
      seedBook({
        authorUid: 'someone-else',
        chapterMeta: [
          { id: 'c0', published: false },
          { id: 'c1', published: true },
          { id: 'c2', published: true },
        ],
      });
      fs.seed('users/reader', { purchasedBookIds: [] });
      const res = await svc.getContent(
        'b1',
        'c1',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('a chapter flagged published is readable even past the legacy prefix', async () => {
      // chaptersCount 1 (legacy prefix would hide c2), but c2 is flagged
      // published → the flag wins and a free book serves it.
      seedBook({
        authorUid: 'someone-else',
        isFree: true,
        chaptersCount: 1,
        chapterMeta: [
          { id: 'c0', published: true },
          { id: 'c1', published: false },
          { id: 'c2', published: true },
        ],
      });
      const res = await svc.getContent(
        'b1',
        'c2',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter Two', content: 'paid body two' });
    });

    it('non-owner of a paid monetized book is denied (permission-denied)', async () => {
      seedBook({ authorUid: 'someone-else' });
      fs.seed('users/reader', { purchasedBookIds: [] });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('attaches the permission-denied code on the paywall rejection', async () => {
      seedBook({ authorUid: 'someone-else' });
      fs.seed('users/reader', { purchasedBookIds: [] });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'permission-denied' }),
      });
    });

    it('owner via purchasedBookIds gets full content', async () => {
      seedBook({ authorUid: 'someone-else' });
      fs.seed('users/reader', { purchasedBookIds: ['b1'] });
      const res = await svc.getContent(
        'b1',
        'c1',
        makeAuthUser({ uid: 'reader' }),
      );
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('does NOT grant access off ownedBookIds (client-writable)', async () => {
      seedBook({ authorUid: 'someone-else' });
      fs.seed('users/reader', { ownedBookIds: ['b1'], purchasedBookIds: [] });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow(ForbiddenException);
    });

    it('taken-down book is forbidden for a non-author/non-admin', async () => {
      seedBook({ authorUid: 'someone-else', takenDown: true });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow('This book is no longer available.');
    });

    it('taken-down book is still readable by its author', async () => {
      seedBook({ takenDown: true });
      const res = await svc.getContent('b1', 'c1', makeAuthUser({ uid: 'u1' }));
      expect(res).toEqual({ title: 'Chapter One', content: 'paid body' });
    });

    it('chapter beyond chaptersCount is forbidden for non-author/non-admin', async () => {
      // order 2 exists in meta but chaptersCount is trimmed to 2 (so order 2 >= 2)
      seedBook({ authorUid: 'someone-else', chaptersCount: 2 });
      await expect(
        svc.getContent('b1', 'c2', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow('Chapter not available.');
    });

    it('chapter missing from chapterMeta (order < 0) is forbidden for readers', async () => {
      seedBook({ authorUid: 'someone-else', chapterMeta: [{ id: 'c0' }] });
      await expect(
        svc.getContent('b1', 'c1', makeAuthUser({ uid: 'reader' })),
      ).rejects.toThrow('Chapter not available.');
    });

    it('throws NotFound when the book does not exist', async () => {
      await expect(
        svc.getContent('missing', 'c1', makeAuthUser()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the chapter does not exist', async () => {
      seedBook();
      await expect(
        svc.getContent('b1', 'cX', makeAuthUser({ uid: 'u1' })),
      ).rejects.toThrow('Chapter not found');
    });
  });

  describe('commitWrite', () => {
    const dto = (over: Record<string, unknown> = {}) => ({
      content: 'new body',
      order: 1,
      title: 'New Title',
      ...over,
    });

    it('writes the chapter and stamps the book (happy path)', async () => {
      seedBook();
      await svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto());
      const chap = fs.dump('books/b1/chapters/c1')!;
      expect(chap.content).toBe('new body');
      expect(chap.title).toBe('New Title');
      expect(chap.authorUsername).toBe('alice');
      const book = fs.dump('books/b1')!;
      expect(book.schemaVersion).toBe(2);
    });

    it('fans out a new-chapter notification when chapterMeta grows on a published book', async () => {
      seedBook({ authorUsername: 'alice', isDraft: false });
      await svc.commitWrite(
        'b1',
        'c3',
        makeAuthUser({ uid: 'u1', username: 'alice' }),
        dto({
          order: 3,
          bookUpdates: {
            isDraft: false,
            chapterMeta: [
              { id: 'c0', published: true },
              { id: 'c1', published: true },
              { id: 'c2', published: true },
              { id: 'c3', published: true },
            ],
          },
        }),
      );
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledTimes(1);
      expect(notifications.notifyFollowersOfPublication).toHaveBeenCalledWith(
        expect.objectContaining({
          authorUsername: 'alice',
          title: 'New Chapter',
          bookId: 'b1',
          includeLibraryOwners: true,
        }),
      );
    });

    it('does NOT fan out when no new chapter is added (chapterMeta length unchanged)', async () => {
      seedBook({ authorUsername: 'alice', isDraft: false });
      await svc.commitWrite(
        'b1',
        'c1',
        makeAuthUser({ uid: 'u1', username: 'alice' }),
        dto({
          bookUpdates: {
            isDraft: false,
            chapterMeta: [
              { id: 'c0', published: true },
              { id: 'c1', published: true },
              { id: 'c2', published: true },
            ],
          },
        }),
      );
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
    });

    it('does NOT fan out when the book is still a draft', async () => {
      seedBook({ authorUsername: 'alice' });
      await svc.commitWrite(
        'b1',
        'c3',
        makeAuthUser({ uid: 'u1', username: 'alice' }),
        dto({
          order: 3,
          bookUpdates: {
            isDraft: true,
            chapterMeta: [
              { id: 'c0' },
              { id: 'c1' },
              { id: 'c2' },
              { id: 'c3' },
            ],
          },
        }),
      );
      expect(notifications.notifyFollowersOfPublication).not.toHaveBeenCalled();
    });

    it('forbids a non-author', async () => {
      seedBook({ authorUid: 'someone-else' });
      await expect(
        svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto()),
      ).rejects.toThrow('Not the book author');
    });

    it('forbids writing a chapter on a completed (locked) book', async () => {
      seedBook({ isCompleted: true });
      await expect(
        svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto()),
      ).rejects.toThrow('completed');
      // The chapter body is untouched.
      expect(fs.dump('books/b1/chapters/c1')!.content).toBe('paid body');
    });

    it('lets an admin write a chapter on a completed book', async () => {
      seedBook({ isCompleted: true });
      await svc.commitWrite(
        'b1',
        'c1',
        makeAuthUser({ uid: 'admin1', admin: true }),
        dto(),
      );
      expect(fs.dump('books/b1/chapters/c1')!.content).toBe('new body');
    });

    it('rejects flagged content with a 422', async () => {
      moderation = createFakeModeration(true);
      svc = new ChaptersService(fs as any, moderation as any, notifications as any);
      seedBook();
      await expect(
        svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto()),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('sanitizes server-managed book fields out of bookUpdates', async () => {
      seedBook();
      await svc.commitWrite(
        'b1',
        'c1',
        makeAuthUser({ uid: 'u1' }),
        dto({
          bookUpdates: {
            title: 'Edited Book Title', // allowed passthrough
            authorUid: 'attacker', // protected
            isMonetized: true, // protected
            takenDown: true, // protected
            price: undefined, // dropped (undefined)
          },
        }),
      );
      const book = fs.dump('books/b1')!;
      expect(book.title).toBe('Edited Book Title');
      // protected fields keep their seeded values, are NOT overwritten
      expect(book.authorUid).toBe('u1');
      expect(book.takenDown).toBe(false);
      expect(book.isMonetized).toBe(true); // seeded true; not from attacker write
      expect('price' in book).toBe(false);
    });

    it('drops legacy heavy fields and stamps schemaVersion 2', async () => {
      seedBook({ chapters: ['legacy'], content: 'legacy inline body' });
      await svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto());
      const book = fs.dump('books/b1')!;
      expect('chapters' in book).toBe(false);
      expect('content' in book).toBe(false);
      expect(book.schemaVersion).toBe(2);
    });

    it('admin may commit even when not the author', async () => {
      seedBook({ authorUid: 'someone-else' });
      await svc.commitWrite(
        'b1',
        'c1',
        makeAuthUser({ uid: 'admin', admin: true, username: 'adminuser' }),
        dto(),
      );
      expect(fs.dump('books/b1/chapters/c1')!.content).toBe('new body');
    });

    it('ignores a client-supplied likes array and pads server-side', async () => {
      // Author tries to forge 100 likes/chapter through the publish path; the
      // server strips it and keeps the real (zero-padded) counts.
      seedBook({ likes: [5, 0, 0] });
      await svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
        content: 'b',
        order: 3,
        title: 'New',
        bookUpdates: {
          chapterMeta: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
          chaptersCount: 4,
          likes: [100, 100, 100, 100],
        },
      });
      const book = fs.dump('books/b1')!;
      // existing reader counts preserved, new slot padded with 0 — NOT 100
      expect(book.likes).toEqual([5, 0, 0, 0]);
    });

    it('also strips a client-supplied chapterLikedBy write', async () => {
      seedBook({ chapterLikedBy: { '0': ['real'] } });
      await svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
        content: 'b',
        order: 1,
        title: 'New',
        bookUpdates: { chapterLikedBy: { '0': ['x', 'y', 'z'] } },
      });
      expect(fs.dump('books/b1')!.chapterLikedBy).toEqual({ '0': ['real'] });
    });

    it('does not rewrite likes when the chapter set has not grown', async () => {
      seedBook({ likes: [5, 6, 7] });
      await svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
        content: 'edit',
        order: 1,
        title: 'Edited',
        bookUpdates: { chaptersCount: 3 },
      });
      expect(fs.dump('books/b1')!.likes).toEqual([5, 6, 7]);
    });
  });

  describe('commitDelete', () => {
    it('splices the deleted slot out of likes + re-keys chapterLikedBy', async () => {
      // Delete the middle chapter (c1, index 1): c2's likes must shift down to
      // index 1, not stay pinned to index 2 where a future chapter would inherit
      // them.
      seedBook({
        likes: [10, 20, 30],
        chapterLikedBy: { '0': ['a'], '1': ['b', 'c'], '2': ['d'] },
      });
      await svc.commitDelete('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [{ id: 'c0' }, { id: 'c2' }],
        chaptersCount: 2,
      });
      const book = fs.dump('books/b1')!;
      expect(book.likes).toEqual([10, 30]);
      expect(book.chapterLikedBy).toEqual({ '0': ['a'], '1': ['d'] });
      expect(book.chaptersCount).toBe(2);
    });

    it('drops the tail slot when the last chapter is deleted', async () => {
      seedBook({
        likes: [10, 20, 30],
        chapterLikedBy: { '0': ['a'], '1': ['b'], '2': ['c'] },
      });
      await svc.commitDelete('b1', 'c2', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [{ id: 'c0' }, { id: 'c1' }],
        chaptersCount: 2,
      });
      const book = fs.dump('books/b1')!;
      expect(book.likes).toEqual([10, 20]);
      expect(book.chapterLikedBy).toEqual({ '0': ['a'], '1': ['b'] });
    });

    it('ignores client-supplied likes — splice is server-authoritative', async () => {
      // An author can't forge the reader signal through the delete path: even if
      // they send an inflated likes array, the server overwrites it with the
      // spliced stored value.
      seedBook({ likes: [10, 20, 30] });
      await svc.commitDelete('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
        chapterMeta: [{ id: 'c0' }, { id: 'c2' }],
        chaptersCount: 2,
        likes: [999, 999],
      });
      expect(fs.dump('books/b1')!.likes).toEqual([10, 30]);
    });

    it('leaves likes untouched when the chapter is not in chapterMeta', async () => {
      seedBook({ likes: [10, 20, 30] });
      await svc.commitDelete('b1', 'ghost', makeAuthUser({ uid: 'u1' }), {
        chaptersCount: 3,
      });
      expect(fs.dump('books/b1')!.likes).toEqual([10, 20, 30]);
    });

    it('forbids a non-author non-admin', async () => {
      seedBook({ authorUid: 'someone-else' });
      await expect(
        svc.commitDelete('b1', 'c1', makeAuthUser({ uid: 'intruder' }), {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids deleting a chapter on a completed (locked) book', async () => {
      seedBook({ isCompleted: true, likes: [10, 20, 30] });
      await expect(
        svc.commitDelete('b1', 'c1', makeAuthUser({ uid: 'u1' }), {
          chapterMeta: [{ id: 'c0' }, { id: 'c2' }],
          chaptersCount: 2,
        }),
      ).rejects.toThrow('completed');
      // The chapter still exists and likes are untouched.
      expect(fs.dump('books/b1/chapters/c1')).toBeTruthy();
      expect(fs.dump('books/b1')!.likes).toEqual([10, 20, 30]);
    });
  });
});
