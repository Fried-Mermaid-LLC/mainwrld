import { PresenceService } from './presence.service';
import { FakeFirestore } from '../../testing/test-utils';

describe('PresenceService', () => {
  it('heartbeat marks the user online with activity + book', async () => {
    const fs = new FakeFirestore();
    const svc = new PresenceService(fs as any);
    await svc.heartbeat('u1', 'Reading', 'b1');
    const u = fs.dump('users/u1')!;
    expect(u.isOnline).toBe(true);
    expect(u.activity).toBe('Reading');
    expect(u.currentBookId).toBe('b1');
    expect(u.lastOnline).toBeDefined();
  });

  it('heartbeat defaults activity to Idle and book to null', async () => {
    const fs = new FakeFirestore();
    const svc = new PresenceService(fs as any);
    await svc.heartbeat('u1');
    const u = fs.dump('users/u1')!;
    expect(u.activity).toBe('Idle');
    expect(u.currentBookId).toBeNull();
  });

  it('offline marks the user offline (merge keeps other fields)', async () => {
    const fs = new FakeFirestore();
    fs.seed('users/u1', { isOnline: true, displayName: 'Al' });
    const svc = new PresenceService(fs as any);
    await svc.offline('u1');
    const u = fs.dump('users/u1')!;
    expect(u.isOnline).toBe(false);
    expect(u.displayName).toBe('Al');
  });
});
