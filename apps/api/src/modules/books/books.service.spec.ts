import { BooksService } from './books.service';
import {
  FakeFirestore,
  createFakeModeration,
  createFakeRewards,
  createFakeStorage,
  makeAuthUser,
} from '../../testing/test-utils';

describe('BooksService', () => {
  let fs: FakeFirestore;
  let storage: ReturnType<typeof createFakeStorage>;
  let moderation: ReturnType<typeof createFakeModeration>;
  let rewards: ReturnType<typeof createFakeRewards>;
  let svc: BooksService;

  const build = (flagged = false) => {
    fs = new FakeFirestore();
    storage = createFakeStorage();
    moderation = createFakeModeration(flagged);
    rewards = createFakeRewards();
    svc = new BooksService(
      fs as any,
      storage as any,
      moderation as any,
      rewards as any,
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
      fs.seed('books/b1', { id: 'b1', authorUid: 'owner', title: 'old', likes: [1] });
      await svc.update('b1', makeAuthUser({ uid: 'admin1', admin: true }), {
        likes: [5],
      } as any);
      expect(fs.dump('books/b1')!.likes).toEqual([5]);
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
      await expect(
        svc.uploadCover('a', 'b', 'not-a-data-url'),
      ).rejects.toThrow('Invalid cover data URL');
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
});
