import { ModerationService } from './moderation.service';
import { ProfanityService } from '../../shared/profanity/profanity.service';
import { FakeFirestore, fakeConfig } from '../../testing/test-utils';

describe('ModerationService', () => {
  let fs: FakeFirestore;
  let profanity: ProfanityService;
  let svc: ModerationService;

  beforeEach(() => {
    fs = new FakeFirestore();
    profanity = new ProfanityService();
    // openaiApiKey is empty in fakeConfig -> OpenAI layer is a no-op.
    svc = new ModerationService(fakeConfig() as any, profanity, fs as any);
  });

  describe('screen', () => {
    it('flags profanity via the curated filter', async () => {
      const verdict = await svc.screen('you are a fucking idiot');
      expect(verdict.flagged).toBe(true);
      expect(verdict.topCategory).toBe('profanity');
    });

    it('does not flag clean text when no OpenAI key is configured', async () => {
      const verdict = await svc.screen('A perfectly pleasant sentence.');
      expect(verdict.flagged).toBe(false);
      expect(verdict.topCategory).toBeUndefined();
    });

    it('skips the profanity layer when checkProfanity=false', async () => {
      // Same profane text, but with the profanity layer disabled and no OpenAI
      // key, nothing flags it (legitimate swearing in chapter prose).
      const verdict = await svc.screen('you are a fucking idiot', false);
      expect(verdict.flagged).toBe(false);
      expect(verdict.topCategory).toBeUndefined();
    });

    it('returns clean for empty input', async () => {
      const verdict = await svc.screen('');
      expect(verdict.flagged).toBe(false);
    });
  });

  describe('logFlag', () => {
    it('writes an auto-moderated reports doc', async () => {
      await svc.logFlag('Comment', 'target-1', 'alice', 'profanity', undefined);

      const reports = fs.all();
      const entry = [...reports.entries()].find(([p]) =>
        p.startsWith('reports/'),
      );
      expect(entry).toBeDefined();
      const [, doc] = entry!;

      expect(doc.autoModerated).toBe(true);
      expect(doc.type).toBe('Comment');
      expect(doc.targetId).toBe('target-1');
      expect(doc.reportedBy).toBe('system');
      expect(doc.authorUsername).toBe('alice');
      expect(doc.status).toBe('resolved');
      expect(doc.reason).toBe('auto-moderation: profanity');
      expect(typeof doc.id).toBe('string');
      expect(doc.id).toMatch(/^auto-/);
      // serverTimestamp() sentinel is resolved to a concrete value on write.
      expect(doc.createdAt).toBeDefined();
      expect(typeof doc.timestamp).toBe('string');
    });

    it('appends the score to the reason when provided', async () => {
      await svc.logFlag('Book', 'b1', undefined, 'sexual', 0.987654);

      const entry = [...fs.all().entries()].find(([p]) =>
        p.startsWith('reports/'),
      )!;
      const [, doc] = entry;
      expect(doc.type).toBe('Book');
      // null author when undefined username passed.
      expect(doc.authorUsername).toBeNull();
      // score formatted to 3 decimals, in parens.
      expect(doc.reason).toBe('auto-moderation: sexual (0.988)');
    });

    it('does not append a score parenthetical for a zero/undefined score', async () => {
      await svc.logFlag('Chat', 'c1', 'bob', 'harassment', 0);
      const entry = [...fs.all().entries()].find(([p]) =>
        p.startsWith('reports/'),
      )!;
      const [, doc] = entry;
      expect(doc.reason).toBe('auto-moderation: harassment');
    });
  });
});
