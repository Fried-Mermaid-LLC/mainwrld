import { PublicService } from './public.service';
import { FakeFirestore } from '../../testing/test-utils';

describe('PublicService', () => {
  let fs: FakeFirestore;
  let svc: PublicService;

  beforeEach(() => {
    fs = new FakeFirestore();
    svc = new PublicService(fs as any);
  });

  it('loadBook resolves by docId', async () => {
    fs.seed('books/b1', { id: 'b1', title: 'X' });
    expect((await svc.loadBook('b1'))?.title).toBe('X');
  });

  it('loadBook falls back to the id field', async () => {
    fs.seed('books/docX', { id: 'b1', title: 'Y' });
    expect((await svc.loadBook('b1'))?.title).toBe('Y');
  });

  it('loadBook returns null when missing', async () => {
    expect(await svc.loadBook('nope')).toBeNull();
  });

  it('isPublic is false for missing/draft/unshareable, true otherwise', () => {
    expect(svc.isPublic(null)).toBe(false);
    expect(svc.isPublic({ isDraft: true })).toBe(false);
    expect(svc.isPublic({ isShareable: false })).toBe(false);
    expect(svc.isPublic({ title: 'x' })).toBe(true);
  });

  it('toPreview sums the likes array and allow-lists fields', () => {
    const p = svc.toPreview('b1', {
      title: 'T',
      likes: [1, 2, 3],
      authorUsername: 'al',
      authorDisplayName: 'Al',
    });
    expect(p.totalLikes).toBe(6);
    expect(p.id).toBe('b1');
    expect(p.authorUsername).toBe('al');
  });

  it('renders OG tags for preview and unavailable HTML', () => {
    const p = svc.toPreview('b1', { title: 'T' });
    expect(svc.previewHtml(p)).toContain('og:title');
    expect(svc.unavailableHtml()).toContain('og:title');
  });
});
