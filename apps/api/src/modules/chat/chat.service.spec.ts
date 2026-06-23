import { HttpStatus } from '@nestjs/common';
import { ChatService } from './chat.service';
import { FakeFirestore, createFakeModeration } from '../../testing/test-utils';

// Read all docs currently in the chatMessages collection.
async function allMessages(fs: FakeFirestore) {
  const snap = await fs.collection('chatMessages').get();
  return snap.docs.map((d) => d.data());
}

describe('ChatService', () => {
  let fs: FakeFirestore;
  let moderation: ReturnType<typeof createFakeModeration>;
  let svc: ChatService;

  const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();

  beforeEach(() => {
    fs = new FakeFirestore();
    moderation = createFakeModeration(false);
    svc = new ChatService(fs as any, moderation as any);
    // Default sender profile (non-premium unless overridden).
    fs.seed('users/u1', { isPremium: false });
  });

  describe('send', () => {
    it('persists a message on the happy path and stamps defaults', async () => {
      const msg = await svc.send('alice', 'u1', 'bob', 'hi there');
      expect(msg.from).toBe('alice');
      expect(msg.to).toBe('bob');
      expect(msg.text).toBe('hi there');
      expect(msg.read).toBe(false);
      expect(msg.senderIsPremium).toBe(false);
      expect(typeof msg.id).toBe('string');

      const docs = await allMessages(fs);
      expect(docs).toHaveLength(1);
      expect(docs[0]).toMatchObject({ from: 'alice', to: 'bob', text: 'hi there' });
      expect(moderation.screen).toHaveBeenCalledWith('hi there');
    });

    it('rejects messaging yourself (from === to) before moderation', async () => {
      await expect(
        svc.send('alice', 'u1', 'alice', 'hi me'),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(await allMessages(fs)).toHaveLength(0);
      expect(moderation.screen).not.toHaveBeenCalled();
    });

    it('rejects flagged content with 422 and logs the flag', async () => {
      moderation = createFakeModeration(true);
      moderation.screen = jest.fn(async () => ({
        flagged: true,
        topCategory: 'profanity',
        score: 0.97,
      }));
      svc = new ChatService(fs as any, moderation as any);

      await expect(svc.send('alice', 'u1', 'bob', 'bad words')).rejects.toMatchObject({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
      });
      expect(moderation.logFlag).toHaveBeenCalledWith(
        'Chat',
        'rejected-on-write',
        'alice',
        'profanity',
        0.97,
      );
      // Nothing was written.
      expect(await allMessages(fs)).toHaveLength(0);
    });

    it('falls back to "unknown" category when the verdict omits topCategory', async () => {
      moderation.screen = jest.fn(async () => ({ flagged: true }));
      await expect(svc.send('alice', 'u1', 'bob', 'x')).rejects.toThrow();
      expect(moderation.logFlag).toHaveBeenCalledWith(
        'Chat',
        'rejected-on-write',
        'alice',
        'unknown',
        undefined,
      );
    });

    it('rejects with 429 resource-exhausted when 25+ messages from->to in 24h', async () => {
      // Seed 25 recent (within 24h) messages from alice -> bob.
      for (let i = 0; i < 25; i++) {
        fs.seed(`chatMessages/m${i}`, {
          id: `m${i}`,
          from: 'alice',
          to: 'bob',
          text: 'hello',
          timestamp: iso(i * 1000), // all within the last few seconds
          read: false,
        });
      }

      await expect(svc.send('alice', 'u1', 'bob', 'one more')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      // No new message appended (still 25).
      expect(await allMessages(fs)).toHaveLength(25);
    });

    it('does not count messages older than 24h toward the rate limit', async () => {
      // 25 OLD messages (just over 24h ago) should not block a new send.
      for (let i = 0; i < 25; i++) {
        fs.seed(`chatMessages/old${i}`, {
          id: `old${i}`,
          from: 'alice',
          to: 'bob',
          text: 'hello',
          timestamp: iso(25 * 60 * 60 * 1000 + i * 1000), // ~25h ago
          read: false,
        });
      }
      const msg = await svc.send('alice', 'u1', 'bob', 'fresh');
      expect(msg.text).toBe('fresh');
      expect(await allMessages(fs)).toHaveLength(26);
    });

    it('does not count messages to a different recipient toward the limit', async () => {
      for (let i = 0; i < 25; i++) {
        fs.seed(`chatMessages/c${i}`, {
          id: `c${i}`,
          from: 'alice',
          to: 'carol', // different recipient
          text: 'hello',
          timestamp: iso(i * 1000),
          read: false,
        });
      }
      const msg = await svc.send('alice', 'u1', 'bob', 'to bob');
      expect(msg.to).toBe('bob');
    });

    it('reads senderIsPremium from users/{fromUid}.isPremium', async () => {
      fs.seed('users/u1', { isPremium: true });
      const msg = await svc.send('alice', 'u1', 'bob', 'premium hi');
      expect(msg.senderIsPremium).toBe(true);
      expect((await allMessages(fs))[0].senderIsPremium).toBe(true);
    });

    it('defaults senderIsPremium to false when the user doc is missing', async () => {
      const msg = await svc.send('alice', 'ghost-uid', 'bob', 'hi');
      expect(msg.senderIsPremium).toBe(false);
    });

    it('caps the text at 500 characters', async () => {
      const long = 'x'.repeat(600);
      const msg = await svc.send('alice', 'u1', 'bob', long);
      expect(msg.text).toHaveLength(500);
      expect((await allMessages(fs))[0].text).toHaveLength(500);
    });
  });

  describe('listForUser', () => {
    it('merges sent and received messages, de-duplicating by id', async () => {
      fs.seed('chatMessages/s1', {
        id: 'msg-sent',
        from: 'alice',
        to: 'bob',
        text: 'out',
        timestamp: iso(1000),
        read: false,
      });
      fs.seed('chatMessages/r1', {
        id: 'msg-recv',
        from: 'carol',
        to: 'alice',
        text: 'in',
        timestamp: iso(2000),
        read: false,
      });
      // A message that is both addressed-from and resolved twice would collapse
      // by id — seed an overlap to prove the Map de-dup.
      fs.seed('chatMessages/dup', {
        id: 'msg-self',
        from: 'alice',
        to: 'alice',
        text: 'self',
        timestamp: iso(3000),
        read: false,
      });

      const list = await svc.listForUser('alice');
      const ids = list.map((m) => m.id).sort();
      expect(ids).toEqual(['msg-recv', 'msg-self', 'msg-sent']);
      // msg-self appears in BOTH queries but only once in the result.
      expect(list.filter((m) => m.id === 'msg-self')).toHaveLength(1);
    });

    it('returns empty when the user has no messages', async () => {
      expect(await svc.listForUser('nobody')).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('marks peer->me unread messages as read, leaving others untouched', async () => {
      // bob -> alice, unread (should be flipped).
      fs.seed('chatMessages/a', {
        id: 'a',
        from: 'bob',
        to: 'alice',
        text: '1',
        timestamp: iso(1000),
        read: false,
      });
      // bob -> alice, already read (no write needed, stays read).
      fs.seed('chatMessages/b', {
        id: 'b',
        from: 'bob',
        to: 'alice',
        text: '2',
        timestamp: iso(2000),
        read: true,
      });
      // alice -> bob, my own outgoing (should NOT be touched).
      fs.seed('chatMessages/c', {
        id: 'c',
        from: 'alice',
        to: 'bob',
        text: '3',
        timestamp: iso(3000),
        read: false,
      });
      // carol -> alice, different peer (should NOT be touched).
      fs.seed('chatMessages/d', {
        id: 'd',
        from: 'carol',
        to: 'alice',
        text: '4',
        timestamp: iso(4000),
        read: false,
      });

      await svc.markRead('bob', 'alice');

      expect(fs.dump('chatMessages/a')!.read).toBe(true);
      expect(fs.dump('chatMessages/b')!.read).toBe(true);
      expect(fs.dump('chatMessages/c')!.read).toBe(false);
      expect(fs.dump('chatMessages/d')!.read).toBe(false);
    });

    it('is a no-op when there are no unread peer->me messages', async () => {
      fs.seed('chatMessages/a', {
        id: 'a',
        from: 'bob',
        to: 'alice',
        text: '1',
        timestamp: iso(1000),
        read: true,
      });
      await expect(svc.markRead('bob', 'alice')).resolves.toBeUndefined();
      expect(fs.dump('chatMessages/a')!.read).toBe(true);
    });
  });
});
