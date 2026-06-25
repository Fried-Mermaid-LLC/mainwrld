import { AdminService } from './admin.service';
import { FakeFirestore, createFakeAuth } from '../../testing/test-utils';

describe('AdminService', () => {
  let fs: FakeFirestore;
  let auth: ReturnType<typeof createFakeAuth>;
  let svc: AdminService;
  let notifications: { create: jest.Mock };

  beforeEach(() => {
    fs = new FakeFirestore();
    auth = createFakeAuth();
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    svc = new AdminService(fs as any, auth as any, notifications as any);
  });

  describe('setAdmin', () => {
    it('sets the admin claim (preserving existing claims) and mirrors isAdmin onto the profile', async () => {
      auth._store['t1'] = { customClaims: { username: 'bob' } };
      fs.seed('users/t1', { username: 'bob' });

      const res = await svc.setAdmin('admin1', 't1',true);

      expect(res).toEqual({ uid: 't1', admin: true });
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('t1', {
        username: 'bob',
        admin: true,
      });
      expect(fs.dump('users/t1')!.isAdmin).toBe(true);
    });

    it('can revoke admin (admin=false) and mirror isAdmin=false', async () => {
      auth._store['t1'] = { customClaims: { admin: true } };
      fs.seed('users/t1', { isAdmin: true });

      const res = await svc.setAdmin('admin1', 't1',false);

      expect(res.admin).toBe(false);
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('t1', {
        admin: false,
      });
      expect(fs.dump('users/t1')!.isAdmin).toBe(false);
    });

    it('refuses to change your own admin status (no self-lockout)', async () => {
      auth._store['admin1'] = { customClaims: { admin: true } };
      fs.seed('users/admin1', { isAdmin: true });
      await expect(svc.setAdmin('admin1', 'admin1', false)).rejects.toThrow(
        'You cannot change your own admin status.',
      );
      // claim + profile untouched
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(fs.dump('users/admin1')!.isAdmin).toBe(true);
    });
  });

  describe('ban', () => {
    it('bans a target: sets isBanned, banned claim, disables, revokes tokens', async () => {
      fs.seed('users/t1', { username: 'victim' });
      auth._store['t1'] = { customClaims: {} };

      const res = await svc.ban('admin1', 't1');

      expect(res).toEqual({ bannedUid: 't1' });
      const data = fs.dump('users/t1')!;
      expect(data.isBanned).toBe(true);
      expect(data.banReason).toBe('manual ban');
      expect(typeof data.bannedAt).toBe('string');
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('t1', {
        banned: true,
      });
      expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('t1');
      expect(auth.updateUser).toHaveBeenCalledWith('t1', { disabled: true });
    });

    it('refuses to ban yourself (precondition)', async () => {
      fs.seed('users/admin1', { username: 'admin' });
      await expect(svc.ban('admin1', 'admin1')).rejects.toThrow(
        'You cannot ban yourself.',
      );
      // nothing written / no auth mutation
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(fs.dump('users/admin1')!.isBanned).toBeUndefined();
    });

    it('never bans an admin (no-op, no claim change, no disable)', async () => {
      fs.seed('users/t1', { username: 'mod', isAdmin: true });
      auth._store['t1'] = { customClaims: { admin: true } };

      const res = await svc.ban('admin1', 't1');

      expect(res).toEqual({ bannedUid: 't1' });
      // performBan bailed out early: profile untouched, no banned claim
      expect(fs.dump('users/t1')!.isBanned).toBeUndefined();
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
      expect(auth.updateUser).not.toHaveBeenCalled();
    });

    it('is idempotent: a second ban only re-disables, no duplicate claim/revoke', async () => {
      fs.seed('users/t1', { username: 'victim' });
      auth._store['t1'] = { customClaims: {} };

      await svc.ban('admin1', 't1');
      auth.setCustomUserClaims.mockClear();
      auth.revokeRefreshTokens.mockClear();
      auth.updateUser.mockClear();

      const res = await svc.ban('admin1', 't1');

      expect(res).toEqual({ bannedUid: 't1' });
      // already banned -> only updateUser({disabled:true}), no claim/revoke
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
      expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
      expect(auth.updateUser).toHaveBeenCalledWith('t1', { disabled: true });
      expect(fs.dump('users/t1')!.isBanned).toBe(true);
    });

    it('resolves pending User-type reports for the banned username', async () => {
      fs.seed('users/t1', { username: 'victim' });
      auth._store['t1'] = { customClaims: {} };
      fs.seed('reports/r1', {
        targetId: 'victim',
        type: 'User',
        status: 'pending',
      });
      fs.seed('reports/r2', {
        targetId: 'victim',
        type: 'User',
        status: 'resolved',
      });
      fs.seed('reports/r3', {
        targetId: 'other',
        type: 'User',
        status: 'pending',
      });

      await svc.ban('admin1', 't1');

      expect(fs.dump('reports/r1')!.status).toBe('resolved');
      // already-resolved stays resolved, unrelated target untouched
      expect(fs.dump('reports/r2')!.status).toBe('resolved');
      expect(fs.dump('reports/r3')!.status).toBe('pending');
    });
  });

  describe('unban', () => {
    it('resets strikes/isBanned, drops the banned claim, and re-enables the account', async () => {
      fs.seed('users/t1', {
        username: 'victim',
        isBanned: true,
        strikes: 5,
        struckByReportIds: ['r1', 'r2'],
        bannedAt: '2026-01-01T00:00:00.000Z',
        banReason: '3 strikes',
      });
      auth._store['t1'] = { customClaims: { banned: true, username: 'victim' } };

      const res = await svc.unban('t1');

      expect(res).toEqual({ unbannedUid: 't1' });
      const data = fs.dump('users/t1')!;
      expect(data.isBanned).toBe(false);
      expect(data.strikes).toBe(0);
      expect(data.struckByReportIds).toEqual([]);
      // FieldValue.delete() removed these keys
      expect(data.bannedAt).toBeUndefined();
      expect(data.banReason).toBeUndefined();
      // banned claim dropped, other claims preserved
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('t1', {
        username: 'victim',
      });
      expect(auth.updateUser).toHaveBeenCalledWith('t1', { disabled: false });
    });
  });

  describe('addStrike', () => {
    it('increments strikes and records the report id without banning under the limit', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 0 });
      auth._store['t1'] = { customClaims: {} };

      const res = await svc.addStrike('admin1', 't1','rep-1');

      expect(res).toEqual({ strikes: 1, banned: false });
      const data = fs.dump('users/t1')!;
      expect(data.strikes).toBe(1);
      expect(data.struckByReportIds).toEqual(['rep-1']);
      expect(typeof data.lastStrikeAt).toBe('string');
      // no ban side-effects
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('auto-bans once strikes reach the limit (>=3)', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 2 });
      auth._store['t1'] = { customClaims: {} };

      const res = await svc.addStrike('admin1', 't1','rep-3');

      expect(res).toEqual({ strikes: 3, banned: true });
      const data = fs.dump('users/t1')!;
      expect(data.strikes).toBe(3);
      expect(data.isBanned).toBe(true);
      expect(data.banReason).toBe('3 strikes');
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('t1', {
        banned: true,
      });
      expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('t1');
      expect(auth.updateUser).toHaveBeenCalledWith('t1', { disabled: true });
    });

    it('does not ban an admin even past the strike limit', async () => {
      fs.seed('users/t1', { username: 'mod', strikes: 2, isAdmin: true });
      auth._store['t1'] = { customClaims: { admin: true } };

      const res = await svc.addStrike('admin1', 't1','rep-3');

      expect(res).toEqual({ strikes: 3, banned: false });
      expect(fs.dump('users/t1')!.isBanned).toBeUndefined();
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('does not re-ban an already-banned user (banned=false in result)', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 5, isBanned: true });
      auth._store['t1'] = { customClaims: { banned: true } };

      const res = await svc.addStrike('admin1', 't1','rep-x');

      expect(res.banned).toBe(false);
      expect(res.strikes).toBe(6);
      // already banned -> performBan not invoked from addStrike
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('works without a reportId (no struckByReportIds write)', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 0 });
      auth._store['t1'] = { customClaims: {} };

      const res = await svc.addStrike('admin1', 't1');

      expect(res).toEqual({ strikes: 1, banned: false });
      expect(fs.dump('users/t1')!.struckByReportIds).toBeUndefined();
    });

    it('refuses to strike yourself (precondition)', async () => {
      fs.seed('users/admin1', { username: 'admin', strikes: 0 });
      await expect(svc.addStrike('admin1', 'admin1', 'rep-self')).rejects.toThrow(
        'You cannot strike yourself.',
      );
      // no strike written
      expect(fs.dump('users/admin1')!.strikes).toBe(0);
    });
  });

  describe('removeStrike', () => {
    it('decrements the strike count by one', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 2 });

      const res = await svc.removeStrike('t1');

      expect(res).toEqual({ strikes: 1 });
      expect(fs.dump('users/t1')!.strikes).toBe(1);
    });

    it('clamps at zero (never negative)', async () => {
      fs.seed('users/t1', { username: 'victim', strikes: 0 });

      const res = await svc.removeStrike('t1');

      expect(res).toEqual({ strikes: 0 });
      expect(fs.dump('users/t1')!.strikes).toBe(0);
    });

    it('throws NotFound for a missing user (no write)', async () => {
      await expect(svc.removeStrike('ghost')).rejects.toThrow('User not found');
      expect(fs.dump('users/ghost')).toBeUndefined();
    });
  });

  describe('takeDownBook', () => {
    it('stamps the server-managed take-down flags the author DTO drops', async () => {
      fs.seed('books/b1', {
        title: 'Guide',
        isDraft: false,
        isFree: true,
        isMonetized: true,
      });

      const res = await svc.takeDownBook('b1');

      expect(res).toEqual({ bookId: 'b1' });
      const after = fs.dump('books/b1')!;
      expect(after.takenDown).toBe(true);
      expect(typeof after.takenDownAt).toBe('string');
      expect(after.isMonetized).toBe(false);
      expect(after.isFree).toBe(false);
      expect(after.isDraft).toBe(true);
    });

    it('throws NotFound for a missing book (no write)', async () => {
      await expect(svc.takeDownBook('ghost')).rejects.toThrow('Book not found');
      expect(fs.dump('books/ghost')).toBeUndefined();
    });
  });
});
