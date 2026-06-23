import { SpotlightService } from './spotlight.service';
import { FakeFirestore } from '../../testing/test-utils';

describe('SpotlightService', () => {
  let fs: FakeFirestore;
  let svc: SpotlightService;

  const seedBook = (id: string, over: Record<string, unknown> = {}) => {
    fs.seed(`books/${id}`, {
      id,
      isDraft: false,
      likes: [],
      favoritesTotal: 0,
      publishedDate: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      ...over,
    });
  };

  beforeEach(() => {
    fs = new FakeFirestore();
  });

  describe('get', () => {
    it('reads appConfig/spotlight when present', async () => {
      svc = new SpotlightService(fs as any);
      fs.seed('appConfig/spotlight', { spotlightBookId: 'b7', score: 42 });
      const doc = await svc.get();
      expect(doc).toEqual({ spotlightBookId: 'b7', score: 42 });
    });

    it('returns null when the doc is absent', async () => {
      svc = new SpotlightService(fs as any);
      expect(await svc.get()).toBeNull();
    });
  });

  describe('rotate', () => {
    beforeEach(() => {
      svc = new SpotlightService(fs as any);
    });

    it('picks the highest score (sum of likes array + favoritesTotal)', async () => {
      // b1 -> 10 + 5 = 15
      seedBook('b1', { likes: [1, 2, 3, 4], favoritesTotal: 5 }); // 10 + 5 = 15
      // b2 -> 20 + 0 = 20 (winner)
      seedBook('b2', { likes: [10, 10], favoritesTotal: 0 });
      // b3 -> 0 + 3 = 3
      seedBook('b3', { likes: [], favoritesTotal: 3 });

      const res = await svc.rotate();
      expect(res).toEqual({ ok: true, bookId: 'b2' });

      const cfg = fs.dump('appConfig/spotlight')!;
      expect(cfg.spotlightBookId).toBe('b2');
      expect(cfg.score).toBe(20);
      expect(cfg.source).toBe('scheduled-fn');
      expect(cfg.chosenIds).toEqual(['b2']);
      expect(typeof cfg.weekEpoch).toBe('number');
    });

    it('supports a scalar likes field (not just arrays)', async () => {
      seedBook('b1', { likes: 7, favoritesTotal: 1 }); // 7 + 1 = 8
      seedBook('b2', { likes: 3, favoritesTotal: 2 }); // 3 + 2 = 5
      const res = await svc.rotate();
      expect(res.bookId).toBe('b1');
      expect(fs.dump('appConfig/spotlight')!.score).toBe(8);
    });

    it('excludes drafts from selection', async () => {
      // The draft has the highest raw score but must be ignored.
      seedBook('draft', { isDraft: true, likes: [1000], favoritesTotal: 1000 });
      seedBook('b2', { likes: [5], favoritesTotal: 0 });
      const res = await svc.rotate();
      expect(res.bookId).toBe('b2');
      expect(fs.dump('appConfig/spotlight')!.spotlightBookId).toBe('b2');
    });

    it('returns ok with no bookId when there are no candidates', async () => {
      // Only a draft exists -> no eligible candidates.
      seedBook('draft', { isDraft: true, likes: [5] });
      const res = await svc.rotate();
      expect(res).toEqual({ ok: true });
      expect(fs.dump('appConfig/spotlight')).toBeUndefined();
    });

    it('breaks score ties by newer publishedDate, then by id', async () => {
      // Same score (10). b-old older, b-new newer -> b-new wins.
      seedBook('b-old', {
        likes: [10],
        favoritesTotal: 0,
        publishedDate: '2025-01-01T00:00:00.000Z',
      });
      seedBook('b-new', {
        likes: [10],
        favoritesTotal: 0,
        publishedDate: '2026-06-01T00:00:00.000Z',
      });
      const res = await svc.rotate();
      expect(res.bookId).toBe('b-new');
    });

    it('breaks a full tie (same score + same date) by id ascending', async () => {
      seedBook('zzz', { likes: [10], publishedDate: '2026-01-01T00:00:00.000Z' });
      seedBook('aaa', { likes: [10], publishedDate: '2026-01-01T00:00:00.000Z' });
      const res = await svc.rotate();
      expect(res.bookId).toBe('aaa');
    });

    it('round-robins: skips an already-featured top book to give variety', async () => {
      seedBook('top', { likes: [100], favoritesTotal: 0 }); // 100
      seedBook('mid', { likes: [50], favoritesTotal: 0 }); // 50

      // First rotation -> top wins and is recorded in chosenIds.
      const r1 = await svc.rotate();
      expect(r1.bookId).toBe('top');
      expect(fs.dump('appConfig/spotlight')!.chosenIds).toEqual(['top']);

      // Second rotation -> top already chosen, so the next-best (mid) is picked.
      const r2 = await svc.rotate();
      expect(r2.bookId).toBe('mid');
      expect(fs.dump('appConfig/spotlight')!.chosenIds).toEqual(['top', 'mid']);
    });

    it('resets chosenIds once every candidate has been featured', async () => {
      seedBook('top', { likes: [100] });
      seedBook('mid', { likes: [50] });

      await svc.rotate(); // -> top, chosenIds = [top]
      await svc.rotate(); // -> mid, chosenIds = [top, mid]

      // All seen now -> reset and pick the top again, chosenIds restarts at [top].
      const r3 = await svc.rotate();
      expect(r3.bookId).toBe('top');
      expect(fs.dump('appConfig/spotlight')!.chosenIds).toEqual(['top']);
    });

    it('drops stale chosenIds that no longer correspond to a candidate', async () => {
      seedBook('b1', { likes: [10] });
      // Pre-seed a chosenIds list referencing a now-deleted book plus nothing real.
      fs.seed('appConfig/spotlight', { chosenIds: ['ghost'] });

      const res = await svc.rotate();
      // ghost is filtered out, so b1 is freely pickable; list becomes just [b1].
      expect(res.bookId).toBe('b1');
      expect(fs.dump('appConfig/spotlight')!.chosenIds).toEqual(['b1']);
    });

    it('falls back to a doc id when the book has no id field', async () => {
      // Seeded without an explicit `id` -> service uses the document id.
      fs.seed('books/docid1', { isDraft: false, likes: [3], favoritesTotal: 0 });
      const res = await svc.rotate();
      expect(res.bookId).toBe('docid1');
    });

    it('is deterministic across repeated runs from the same seed state', async () => {
      seedBook('b1', { likes: [10], favoritesTotal: 0 });
      seedBook('b2', { likes: [20], favoritesTotal: 0 });

      const first = await svc.rotate();
      // Reset config to simulate a fresh week with no prior chosenIds.
      fs.seed('appConfig/spotlight', {});
      const second = await svc.rotate();
      expect(second.bookId).toBe(first.bookId);
      expect(first.bookId).toBe('b2');
    });
  });
});
