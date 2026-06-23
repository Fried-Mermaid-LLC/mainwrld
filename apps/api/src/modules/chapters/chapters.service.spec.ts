import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import {
  FakeFirestore,
  createFakeModeration,
  makeAuthUser,
} from '../../testing/test-utils';

describe('ChaptersService', () => {
  let fs: FakeFirestore;
  let moderation: ReturnType<typeof createFakeModeration>;
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
    svc = new ChaptersService(fs as any, moderation as any);
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

    it('forbids a non-author', async () => {
      seedBook({ authorUid: 'someone-else' });
      await expect(
        svc.commitWrite('b1', 'c1', makeAuthUser({ uid: 'u1' }), dto()),
      ).rejects.toThrow('Not the book author');
    });

    it('rejects flagged content with a 422', async () => {
      moderation = createFakeModeration(true);
      svc = new ChaptersService(fs as any, moderation as any);
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
  });
});
