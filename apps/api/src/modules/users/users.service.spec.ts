import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  FakeFirestore,
  createFakeAuth,
  createFakeEmail,
  createFakeRewards,
  makeAuthUser,
} from '../../testing/test-utils';

// A birthDate that is comfortably over 13 (well past COPPA) and one under it.
const ADULT_BIRTH = '1990-01-01';
function birthDateForAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  // Pull a few days back so a same-day boundary never flips the computed age.
  d.setDate(d.getDate() - 5);
  return d.toISOString().slice(0, 10);
}

describe('UsersService', () => {
  let fs: FakeFirestore;
  let auth: ReturnType<typeof createFakeAuth>;
  let email: ReturnType<typeof createFakeEmail>;
  let rewards: ReturnType<typeof createFakeRewards>;
  let svc: UsersService;

  beforeEach(() => {
    fs = new FakeFirestore();
    auth = createFakeAuth();
    email = createFakeEmail();
    rewards = createFakeRewards();
    svc = new UsersService(
      fs as any,
      auth as any,
      email as any,
      rewards as any,
    );
  });

  describe('createProfile', () => {
    const dto = {
      username: 'Alice',
      displayName: 'Alice A',
      birthDate: ADULT_BIRTH,
    };

    it('seeds users/{uid} + usernames/{name} and sets the username claim', async () => {
      const user = makeAuthUser({ uid: 'u1', email: 'u1@test.com' });
      const res = await svc.createProfile(user, dto);

      const userDoc = fs.dump('users/u1')!;
      expect(userDoc).toBeDefined();
      expect(userDoc.username).toBe('Alice');
      expect(userDoc.displayName).toBe('Alice A');
      expect(userDoc.email).toBe('u1@test.com');
      expect(userDoc.points).toBe(50);
      expect(userDoc.strikes).toBe(0);
      expect(userDoc.isPremium).toBe(false);

      // username index keyed by the lowercased username.
      const unameDoc = fs.dump('usernames/alice')!;
      expect(unameDoc).toEqual({ uid: 'u1', email: 'u1@test.com' });

      // claim mirrored onto the token, preserving any existing claims.
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        username: 'Alice',
      });

      expect(res.uid).toBe('u1');
      expect(res.username).toBe('Alice');
    });

    it('preserves existing custom claims when stamping the username', async () => {
      auth = createFakeAuth({ u1: { customClaims: { admin: true } } });
      svc = new UsersService(fs as any, auth as any, email as any);
      await svc.createProfile(makeAuthUser({ uid: 'u1' }), dto);
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        admin: true,
        username: 'Alice',
      });
    });

    it('writes null email when the token carries none', async () => {
      const user = makeAuthUser({ uid: 'u1', email: undefined });
      await svc.createProfile(user, dto);
      expect(fs.dump('users/u1')!.email).toBeNull();
      expect(fs.dump('usernames/alice')!.email).toBeNull();
    });

    it('blocks under-13 signup: deletes the Auth account and throws BadRequest', async () => {
      const user = makeAuthUser({ uid: 'u1' });
      await expect(
        svc.createProfile(user, { ...dto, birthDate: birthDateForAge(10) }),
      ).rejects.toThrow(BadRequestException);
      expect(auth.deleteUser).toHaveBeenCalledWith('u1');
      // nothing persisted.
      expect(fs.dump('users/u1')).toBeUndefined();
      expect(fs.dump('usernames/alice')).toBeUndefined();
    });

    it('blocks signup with an unparseable birthDate (age === null)', async () => {
      const user = makeAuthUser({ uid: 'u1' });
      await expect(
        svc.createProfile(user, { ...dto, birthDate: 'not-a-date' }),
      ).rejects.toThrow(BadRequestException);
      expect(auth.deleteUser).toHaveBeenCalledWith('u1');
    });

    it('rejects a taken username with Conflict and does not overwrite', async () => {
      fs.seed('usernames/alice', { uid: 'other', email: 'other@test.com' });
      const user = makeAuthUser({ uid: 'u1' });
      await expect(svc.createProfile(user, dto)).rejects.toThrow(
        ConflictException,
      );
      // existing index untouched, no profile written.
      expect(fs.dump('usernames/alice')).toEqual({
        uid: 'other',
        email: 'other@test.com',
      });
      expect(fs.dump('users/u1')).toBeUndefined();
    });

    it('still succeeds when setting the username claim fails (logged, not thrown)', async () => {
      auth.setCustomUserClaims.mockRejectedValueOnce(new Error('claim boom'));
      const res = await svc.createProfile(makeAuthUser({ uid: 'u1' }), dto);
      // profile + index were written before the claim step.
      expect(fs.dump('users/u1')).toBeDefined();
      expect(res.uid).toBe('u1');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('sends to the token email and reports success', async () => {
      fs.seed('users/u1', { username: 'alice', displayName: 'Alice' });
      const res = await svc.sendWelcomeEmail(
        makeAuthUser({ uid: 'u1', email: 'u1@test.com' }),
      );
      expect(res.success).toBe(true);
      expect(email.send).toHaveBeenCalledTimes(1);
      const [to, subject, html] = email.send.mock.calls[0];
      expect(to).toBe('u1@test.com');
      expect(typeof subject).toBe('string');
      expect(typeof html).toBe('string');
    });

    it('falls back to the stored email when the token has none', async () => {
      fs.seed('users/u1', {
        username: 'alice',
        displayName: 'Alice',
        email: 'stored@test.com',
      });
      await svc.sendWelcomeEmail(makeAuthUser({ uid: 'u1', email: undefined }));
      expect(email.send.mock.calls[0]![0]).toBe('stored@test.com');
    });

    it('throws when there is no recipient or username', async () => {
      fs.seed('users/u1', { displayName: 'Alice' }); // no username
      await expect(
        svc.sendWelcomeEmail(makeAuthUser({ uid: 'u1', email: 'u1@test.com' })),
      ).rejects.toThrow(BadRequestException);
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('returns the profile for a non-banned user', async () => {
      fs.seed('users/u1', { username: 'alice', isBanned: false });
      const me = await svc.getMe('u1');
      expect(me.uid).toBe('u1');
      expect(me.username).toBe('alice');
    });

    it('throws NotFound when the profile is missing', async () => {
      await expect(svc.getMe('nope')).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden banned when isBanned === true', async () => {
      fs.seed('users/u1', { username: 'alice', isBanned: true });
      await expect(svc.getMe('u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMe', () => {
    beforeEach(() => {
      fs.seed('users/u1', {
        username: 'alice',
        strikes: 0,
        isPremium: false,
        bio: 'old',
      });
    });

    it('writes allowed fields', async () => {
      await svc.updateMe('u1', { bio: 'new bio', activity: 'Reading' });
      const doc = fs.dump('users/u1')!;
      expect(doc.bio).toBe('new bio');
      expect(doc.activity).toBe('Reading');
    });

    it('strips protected fields (strikes, isPremium, purchasedBookIds, isAdmin)', async () => {
      await svc.updateMe('u1', {
        bio: 'changed',
        strikes: 99,
        isPremium: true,
        purchasedBookIds: ['hacked'],
        isAdmin: true,
      });
      const doc = fs.dump('users/u1')!;
      expect(doc.bio).toBe('changed');
      // protected values are unchanged / never introduced.
      expect(doc.strikes).toBe(0);
      expect(doc.isPremium).toBe(false);
      expect(doc.purchasedBookIds).toBeUndefined();
      expect(doc.isAdmin).toBeUndefined();
    });

    it('drops undefined values and no-ops when nothing remains', async () => {
      await svc.updateMe('u1', { isAdmin: true, strikes: 5, foo: undefined });
      const doc = fs.dump('users/u1')!;
      expect(doc.foo).toBeUndefined();
      expect(doc.strikes).toBe(0);
      // bio left intact (a bare update with empty payload would not run).
      expect(doc.bio).toBe('old');
    });

    it('strips the caller’s own username from blockedUsers (no self-block)', async () => {
      await svc.updateMe(
        'u1',
        { blockedUsers: ['bob', 'Alice', 'carol'] },
        'alice',
      );
      // own username removed (case-insensitive), others kept
      expect(fs.dump('users/u1')!.blockedUsers).toEqual(['bob', 'carol']);
    });
  });

  describe('deleteAccount', () => {
    beforeEach(() => {
      fs.seed('users/u1', { username: 'Alice' });
      // authored content keyed by uid.
      fs.seed('books/b1', { authorUid: 'u1', title: 'mine' });
      fs.seed('books/b2', { authorUid: 'someone-else', title: 'theirs' });
      fs.seed('comments/cm1', { authorUid: 'u1', text: 'mine' });
      fs.seed('comments/cm2', { authorUid: 'u1', text: 'mine2' });
      // username-keyed records (lowercase mismatch deliberately tests case in queries).
      fs.seed('chatMessages/m1', { from: 'Alice', to: 'bob' });
      fs.seed('chatMessages/m2', { from: 'bob', to: 'Alice' });
      fs.seed('relationships/r1', { admirer: 'Alice', target: 'bob' });
      fs.seed('relationships/r2', { admirer: 'carol', target: 'Alice' });
      fs.seed('notifications/n1', { recipient: 'Alice' });
      fs.seed('reports/rep1', { reportedBy: 'Alice' });
      // a username index doc keyed lowercased.
      fs.seed('usernames/alice', { uid: 'u1' });
    });

    it('scrubs the profile, authored content, username-keyed records and revokes Auth', async () => {
      const res = await svc.deleteAccount('u1');
      expect(res).toEqual({ deletedUid: 'u1' });

      // user doc + username index gone.
      expect(fs.dump('users/u1')).toBeUndefined();
      expect(fs.dump('usernames/alice')).toBeUndefined();

      // authored content removed; other users' content untouched.
      expect(fs.dump('books/b1')).toBeUndefined();
      expect(fs.dump('books/b2')).toBeDefined();
      expect(fs.dump('comments/cm1')).toBeUndefined();
      expect(fs.dump('comments/cm2')).toBeUndefined();

      // username-keyed records on both directions removed.
      expect(fs.dump('chatMessages/m1')).toBeUndefined();
      expect(fs.dump('chatMessages/m2')).toBeUndefined();
      expect(fs.dump('relationships/r1')).toBeUndefined();
      expect(fs.dump('relationships/r2')).toBeUndefined();
      expect(fs.dump('notifications/n1')).toBeUndefined();
      expect(fs.dump('reports/rep1')).toBeUndefined();

      // Auth account revoked.
      expect(auth.deleteUser).toHaveBeenCalledWith('u1');
    });

    it('still revokes Auth and deletes the user doc when no profile/username exists', async () => {
      // wipe everything username-derived; only the auth deletion path remains.
      fs = new FakeFirestore();
      svc = new UsersService(fs as any, auth as any, email as any);
      const res = await svc.deleteAccount('ghost');
      expect(res).toEqual({ deletedUid: 'ghost' });
      expect(auth.deleteUser).toHaveBeenCalledWith('ghost');
    });
  });
});
