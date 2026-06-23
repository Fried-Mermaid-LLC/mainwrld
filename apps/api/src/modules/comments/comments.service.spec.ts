import { CommentsService } from './comments.service';
import {
  FakeFirestore,
  createFakeModeration,
  makeAuthUser,
} from '../../testing/test-utils';

describe('CommentsService', () => {
  let fs: FakeFirestore;
  let moderation: ReturnType<typeof createFakeModeration>;
  let svc: CommentsService;

  const build = (flagged = false) => {
    fs = new FakeFirestore();
    moderation = createFakeModeration(flagged);
    svc = new CommentsService(fs as any, moderation as any);
  };

  const validDto = (over: Record<string, unknown> = {}) => ({
    bookId: 'b1',
    chapterIndex: 0,
    author: 'Alice',
    text: 'nice chapter',
    ...over,
  });

  beforeEach(() => build(false));

  describe('create', () => {
    it('writes a comment stamped with authorUsername from the token, likes 0', async () => {
      const { id } = await svc.create(makeAuthUser(), validDto() as any);
      expect(typeof id).toBe('string');
      const doc = fs.dump(`comments/${id}`)!;
      expect(doc.id).toBe(id);
      expect(doc.bookId).toBe('b1');
      expect(doc.chapterIndex).toBe(0);
      expect(doc.author).toBe('Alice');
      // authorUsername comes from the token claim, not the dto.
      expect(doc.authorUsername).toBe('alice');
      expect(doc.text).toBe('nice chapter');
      expect(doc.likes).toBe(0);
      expect(doc.likedBy).toEqual([]);
      expect(typeof doc.timestamp).toBe('string');
    });

    it('defaults chapterIndex to null when omitted', async () => {
      const dto = validDto();
      delete (dto as any).chapterIndex;
      const { id } = await svc.create(makeAuthUser(), dto as any);
      expect(fs.dump(`comments/${id}`)!.chapterIndex).toBeNull();
    });

    it('stamps authorUsername null when the token has no username', async () => {
      const { id } = await svc.create(
        makeAuthUser({ username: undefined }) as any,
        validDto() as any,
      );
      expect(fs.dump(`comments/${id}`)!.authorUsername).toBeNull();
    });

    it('rejects flagged content with 422 and logs the flag', async () => {
      build(true);
      await expect(
        svc.create(makeAuthUser(), validDto() as any),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'moderation-flagged' },
      });
      expect(moderation.logFlag).toHaveBeenCalledWith(
        'Comment',
        'rejected-on-write',
        'alice',
        'profanity',
        undefined,
      );
      // nothing should have been persisted
      expect(fs.all().size).toBe(0);
    });
  });

  describe('update', () => {
    const seedComment = (over: Record<string, unknown> = {}) => {
      const data = {
        id: 'cmt1',
        bookId: 'b1',
        author: 'Alice',
        authorUsername: 'alice',
        text: 'original',
        likes: 1,
        likedBy: ['bob'],
        timestamp: 't',
        ...over,
      };
      fs.seed('comments/cmt1', data);
      return data;
    };

    it('throws NotFound when the comment does not exist', async () => {
      await expect(
        svc.update('missing', makeAuthUser(), { text: 'x' } as any),
      ).rejects.toThrow('Comment not found');
    });

    it('lets the author edit the text after re-moderation', async () => {
      seedComment();
      await svc.update('cmt1', makeAuthUser(), { text: 'edited' } as any);
      expect(moderation.screen).toHaveBeenCalledWith('edited');
      expect(fs.dump('comments/cmt1')!.text).toBe('edited');
    });

    it('forbids a non-author non-admin from editing the text', async () => {
      seedComment();
      await expect(
        svc.update(
          'cmt1',
          makeAuthUser({ username: 'mallory' }),
          { text: 'hijack' } as any,
        ),
      ).rejects.toThrow('Not the comment author');
      // unchanged + moderation never ran for an unauthorized edit
      expect(fs.dump('comments/cmt1')!.text).toBe('original');
      expect(moderation.screen).not.toHaveBeenCalled();
    });

    it('lets an admin edit text authored by someone else', async () => {
      seedComment();
      await svc.update(
        'cmt1',
        makeAuthUser({ username: 'admin', admin: true }),
        { text: 'mod-edit' } as any,
      );
      expect(fs.dump('comments/cmt1')!.text).toBe('mod-edit');
    });

    it('rejects a flagged edit with 422 and leaves the text untouched', async () => {
      build(true);
      seedComment();
      await expect(
        svc.update('cmt1', makeAuthUser(), { text: 'profane' } as any),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'moderation-flagged' },
      });
      expect(fs.dump('comments/cmt1')!.text).toBe('original');
    });

    it('allows any authed user to toggle likes/likedBy collaboratively', async () => {
      seedComment({ authorUsername: 'someoneElse' });
      await svc.update(
        'cmt1',
        makeAuthUser({ username: 'bystander' }),
        { likes: 2, likedBy: ['bob', 'bystander'] } as any,
      );
      const doc = fs.dump('comments/cmt1')!;
      expect(doc.likes).toBe(2);
      expect(doc.likedBy).toEqual(['bob', 'bystander']);
      // a likes-only edit never invokes moderation or the authorship gate
      expect(moderation.screen).not.toHaveBeenCalled();
    });

    it('does NOT let the author like their own comment (drops likes/likedBy)', async () => {
      seedComment({ authorUsername: 'alice', likes: 1, likedBy: ['bob'] });
      await svc.update(
        'cmt1',
        makeAuthUser({ username: 'alice' }),
        { likes: 2, likedBy: ['bob', 'alice'] } as any,
      );
      const doc = fs.dump('comments/cmt1')!;
      // self-like stripped: count + membership unchanged
      expect(doc.likes).toBe(1);
      expect(doc.likedBy).toEqual(['bob']);
    });

    it('still lets the author edit their own comment text (likes untouched)', async () => {
      seedComment({ authorUsername: 'alice', likes: 3, likedBy: ['bob'] });
      await svc.update('cmt1', makeAuthUser({ username: 'alice' }), {
        text: 'edited',
      } as any);
      const doc = fs.dump('comments/cmt1')!;
      expect(doc.text).toBe('edited');
      expect(doc.likes).toBe(3);
    });

    it('no-ops when the dto carries no recognized fields', async () => {
      seedComment();
      await svc.update('cmt1', makeAuthUser(), {} as any);
      expect(fs.dump('comments/cmt1')!.text).toBe('original');
    });
  });

  describe('remove', () => {
    const seedComment = (over: Record<string, unknown> = {}) => {
      fs.seed('comments/cmt1', {
        id: 'cmt1',
        authorUsername: 'alice',
        text: 'bye',
        ...over,
      });
    };

    it('lets the author delete their comment', async () => {
      seedComment();
      await svc.remove('cmt1', makeAuthUser());
      expect(fs.dump('comments/cmt1')).toBeUndefined();
    });

    it('lets an admin delete any comment', async () => {
      seedComment({ authorUsername: 'someoneElse' });
      await svc.remove('cmt1', makeAuthUser({ admin: true }));
      expect(fs.dump('comments/cmt1')).toBeUndefined();
    });

    it('forbids a non-author non-admin from deleting', async () => {
      seedComment();
      await expect(
        svc.remove('cmt1', makeAuthUser({ username: 'mallory' })),
      ).rejects.toThrow('Not the comment author');
      expect(fs.dump('comments/cmt1')).toBeDefined();
    });

    it('silently no-ops when the comment is already gone', async () => {
      await expect(
        svc.remove('missing', makeAuthUser()),
      ).resolves.toBeUndefined();
    });
  });

  describe('resolveRef', () => {
    it('resolves by document id directly', async () => {
      fs.seed('comments/docId1', { id: 'docId1', authorUsername: 'alice' });
      await svc.remove('docId1', makeAuthUser());
      expect(fs.dump('comments/docId1')).toBeUndefined();
    });

    it('falls back to the legacy `id` field when docId differs', async () => {
      // legacy doc: stored under one docId but carries a different `id` field
      fs.seed('comments/legacyDocId', {
        id: 'legacyId',
        authorUsername: 'alice',
        text: 'old',
      });
      // addressing by the legacy id field must still resolve + delete it
      await svc.remove('legacyId', makeAuthUser());
      expect(fs.dump('comments/legacyDocId')).toBeUndefined();
    });

    it('resolves the legacy `id` field for updates too', async () => {
      fs.seed('comments/legacyDocId', {
        id: 'legacyId',
        authorUsername: 'alice',
        text: 'old',
      });
      await svc.update('legacyId', makeAuthUser(), { text: 'new' } as any);
      expect(fs.dump('comments/legacyDocId')!.text).toBe('new');
    });
  });

  describe('list', () => {
    it('returns all comments mapped with docId + id, normalized', async () => {
      fs.seed('comments/a', { id: 'a', bookId: 'b1', text: 'one' });
      // legacy doc whose id field differs from its docId
      fs.seed('comments/legacyDoc', { id: 'legacyId', bookId: 'b2', text: 'two' });
      const all = await svc.list();
      expect(all).toHaveLength(2);
      const legacy = all.find((c) => c.docId === 'legacyDoc')!;
      expect(legacy.id).toBe('legacyId');
    });

    it('filters by bookId when provided', async () => {
      fs.seed('comments/a', { id: 'a', bookId: 'b1' });
      fs.seed('comments/b', { id: 'b', bookId: 'b2' });
      const res = await svc.list('b1');
      expect(res.map((c) => c.docId)).toEqual(['a']);
    });

    it('falls back to docId when a doc has no id field', async () => {
      fs.seed('comments/noField', { bookId: 'b1' });
      const [c] = await svc.list('b1');
      expect(c.id).toBe('noField');
    });
  });
});
