import { ReportsService } from './reports.service';
import { FakeFirestore } from '../../testing/test-utils';

describe('ReportsService', () => {
  let fs: FakeFirestore;
  let svc: ReportsService;

  beforeEach(() => {
    fs = new FakeFirestore();
    svc = new ReportsService(fs as any);
  });

  it('create stamps reportedBy + pending status', async () => {
    const res = await svc.create('alice', { type: 'Book', targetId: 'b1' });
    expect(res.id).toBeDefined();
    const r = fs.dump(`reports/${res.id}`)!;
    expect(r.reportedBy).toBe('alice');
    expect(r.status).toBe('pending');
    expect(r.type).toBe('Book');
  });

  it('list returns all reports', async () => {
    fs.seed('reports/r1', { id: 'r1', type: 'Book' });
    fs.seed('reports/r2', { id: 'r2', type: 'User' });
    expect((await svc.list()).length).toBe(2);
  });

  it('updateStatus resolves by docId', async () => {
    fs.seed('reports/r1', { id: 'r1', status: 'pending' });
    await svc.updateStatus('r1', 'resolved');
    expect(fs.dump('reports/r1')!.status).toBe('resolved');
  });

  it('updateStatus falls back to the id field', async () => {
    fs.seed('reports/docX', { id: 'rep1', status: 'pending' });
    await svc.updateStatus('rep1', 'dismissed');
    expect(fs.dump('reports/docX')!.status).toBe('dismissed');
  });
});
