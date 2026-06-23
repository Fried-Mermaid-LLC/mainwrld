import { BadRequestException } from '@nestjs/common';
import { SocialService } from './social.service';
import { FakeFirestore } from '../../testing/test-utils';

const COL = 'relationships';

describe('SocialService', () => {
  let fs: FakeFirestore;
  let svc: SocialService;

  beforeEach(() => {
    fs = new FakeFirestore();
    svc = new SocialService(fs as any);
  });

  // Find a relationship doc in the relationships collection by predicate.
  const findEdge = (pred: (d: any) => boolean) =>
    [...fs.all().entries()].find(
      ([path, data]) =>
        path.startsWith(`${COL}/`) &&
        !path.slice(COL.length + 1).includes('/') &&
        pred(data),
    );

  const edgeCount = () =>
    [...fs.all().keys()].filter(
      (path) =>
        path.startsWith(`${COL}/`) && !path.slice(COL.length + 1).includes('/'),
    ).length;

  describe('add', () => {
    it('rejects admiring yourself with BadRequest', async () => {
      await expect(svc.add('alice', 'alice')).rejects.toThrow(
        BadRequestException,
      );
      await expect(svc.add('alice', 'alice')).rejects.toThrow(
        'Cannot admire yourself',
      );
      expect(edgeCount()).toBe(0);
    });

    it('writes admirer/target/timestamp for a new edge', async () => {
      await svc.add('alice', 'bob');
      const found = findEdge((d) => d.admirer === 'alice' && d.target === 'bob');
      expect(found).toBeDefined();
      const data = found![1];
      expect(data.admirer).toBe('alice');
      expect(data.target).toBe('bob');
      expect(typeof data.timestamp).toBe('string');
      // Timestamp is an ISO string.
      expect(Number.isNaN(Date.parse(data.timestamp))).toBe(false);
      expect(edgeCount()).toBe(1);
    });

    it('is idempotent: an existing edge is not duplicated', async () => {
      await svc.add('alice', 'bob');
      await svc.add('alice', 'bob');
      expect(edgeCount()).toBe(1);
    });

    it('treats reverse direction as a distinct edge', async () => {
      await svc.add('alice', 'bob');
      await svc.add('bob', 'alice');
      expect(edgeCount()).toBe(2);
      expect(
        findEdge((d) => d.admirer === 'bob' && d.target === 'alice'),
      ).toBeDefined();
    });
  });

  describe('remove', () => {
    it('deletes the matching edge', async () => {
      await svc.add('alice', 'bob');
      expect(edgeCount()).toBe(1);
      await svc.remove('alice', 'bob');
      expect(edgeCount()).toBe(0);
      expect(
        findEdge((d) => d.admirer === 'alice' && d.target === 'bob'),
      ).toBeUndefined();
    });

    it('deletes all matching edges and leaves others intact', async () => {
      // Seed two duplicate edges directly (service add() prevents dupes).
      fs.seed(`${COL}/e1`, { admirer: 'alice', target: 'bob', timestamp: 't' });
      fs.seed(`${COL}/e2`, { admirer: 'alice', target: 'bob', timestamp: 't' });
      fs.seed(`${COL}/e3`, { admirer: 'alice', target: 'carol', timestamp: 't' });
      expect(edgeCount()).toBe(3);
      await svc.remove('alice', 'bob');
      expect(edgeCount()).toBe(1);
      expect(
        findEdge((d) => d.admirer === 'alice' && d.target === 'carol'),
      ).toBeDefined();
      expect(
        findEdge((d) => d.admirer === 'alice' && d.target === 'bob'),
      ).toBeUndefined();
    });

    it('is a no-op when no matching edge exists', async () => {
      await svc.add('alice', 'bob');
      await expect(svc.remove('alice', 'nobody')).resolves.toBeUndefined();
      expect(edgeCount()).toBe(1);
    });
  });

  describe('exists', () => {
    it('reflects presence of an edge', async () => {
      expect(await svc.exists('alice', 'bob')).toBe(false);
      await svc.add('alice', 'bob');
      expect(await svc.exists('alice', 'bob')).toBe(true);
    });

    it('is direction-sensitive', async () => {
      await svc.add('alice', 'bob');
      expect(await svc.exists('alice', 'bob')).toBe(true);
      expect(await svc.exists('bob', 'alice')).toBe(false);
    });

    it('reflects absence after removal', async () => {
      await svc.add('alice', 'bob');
      await svc.remove('alice', 'bob');
      expect(await svc.exists('alice', 'bob')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns an empty array when there are no edges', async () => {
      await expect(svc.list()).resolves.toEqual([]);
    });

    it('returns all edges, each carrying its doc id', async () => {
      await svc.add('alice', 'bob');
      await svc.add('alice', 'carol');
      await svc.add('bob', 'alice');
      const all = await svc.list();
      expect(all).toHaveLength(3);
      for (const edge of all) {
        expect(typeof edge.id).toBe('string');
        expect(edge.id.length).toBeGreaterThan(0);
      }
      const pairs = all.map((e) => `${e.admirer}->${e.target}`).sort();
      expect(pairs).toEqual([
        'alice->bob',
        'alice->carol',
        'bob->alice',
      ]);
    });
  });
});
