import { AuthService } from './auth.service';
import {
  FakeFirestore,
  createFakeAuth,
  createFakeEmail,
} from '../../testing/test-utils';
import { passwordResetEmail } from '../../shared/email/email.templates';

describe('AuthService', () => {
  let fs: FakeFirestore;
  let auth: ReturnType<typeof createFakeAuth>;
  let email: ReturnType<typeof createFakeEmail>;
  let svc: AuthService;

  beforeEach(() => {
    fs = new FakeFirestore();
    auth = createFakeAuth();
    email = createFakeEmail();
    svc = new AuthService(fs as any, auth as any, email as any);
  });

  describe('ensureUsernameClaim', () => {
    it('returns no-username when the profile is missing', async () => {
      const res = await svc.ensureUsernameClaim('u1');
      expect(res).toEqual({ ok: false, reason: 'no-username', changed: false });
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('returns no-username when the profile exists but has no username', async () => {
      fs.seed('users/u1', { email: 'u1@test.com' });
      const res = await svc.ensureUsernameClaim('u1');
      expect(res).toEqual({ ok: false, reason: 'no-username', changed: false });
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('does not write when the claim already equals the username', async () => {
      fs.seed('users/u1', { username: 'alice' });
      auth = createFakeAuth({ u1: { customClaims: { username: 'alice' } } });
      svc = new AuthService(fs as any, auth as any, email as any);

      const res = await svc.ensureUsernameClaim('u1');
      expect(res).toEqual({ ok: true, changed: false, username: 'alice' });
      expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('sets the claim when there is no existing claim', async () => {
      fs.seed('users/u1', { username: 'alice' });
      const res = await svc.ensureUsernameClaim('u1');
      expect(res).toEqual({ ok: true, changed: true, username: 'alice' });
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        username: 'alice',
      });
    });

    it('merges with existing claims when the username differs', async () => {
      fs.seed('users/u1', { username: 'alice' });
      auth = createFakeAuth({
        u1: { customClaims: { admin: true, username: 'old-name' } },
      });
      svc = new AuthService(fs as any, auth as any, email as any);

      const res = await svc.ensureUsernameClaim('u1');
      expect(res).toEqual({ ok: true, changed: true, username: 'alice' });
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        admin: true,
        username: 'alice',
      });
      // persisted claims keep the admin flag and the new username
      expect(auth._store.u1.customClaims).toEqual({
        admin: true,
        username: 'alice',
      });
    });
  });

  describe('resolveUsername', () => {
    it('maps a username to its email', async () => {
      fs.seed('usernames/alice', { email: 'alice@test.com' });
      const res = await svc.resolveUsername('alice');
      expect(res).toEqual({ email: 'alice@test.com' });
    });

    it('resolves the live Auth email by uid, ignoring a stale cached value', async () => {
      auth = createFakeAuth({ u1: { email: 'new@test.com' } });
      svc = new AuthService(fs as any, auth as any, email as any);
      fs.seed('usernames/alice', { uid: 'u1', email: 'old@test.com' });
      const res = await svc.resolveUsername('alice');
      expect(res).toEqual({ email: 'new@test.com' });
    });

    it('falls back to the cached email when the live lookup fails', async () => {
      fs.seed('usernames/alice', { uid: 'u1', email: 'cached@test.com' });
      auth.getUser.mockRejectedValueOnce(new Error('boom'));
      const res = await svc.resolveUsername('alice');
      expect(res).toEqual({ email: 'cached@test.com' });
    });

    it('lowercases the username before lookup', async () => {
      fs.seed('usernames/alice', { email: 'alice@test.com' });
      const res = await svc.resolveUsername('ALICE');
      expect(res).toEqual({ email: 'alice@test.com' });
    });

    it('returns null when no mapping exists', async () => {
      const res = await svc.resolveUsername('ghost');
      expect(res).toEqual({ email: null });
    });

    it('returns null when the mapping doc lacks an email field', async () => {
      fs.seed('usernames/alice', { uid: 'u1' });
      const res = await svc.resolveUsername('alice');
      expect(res).toEqual({ email: null });
    });
  });

  describe('sendPasswordReset', () => {
    it('sends the branded reset email on success', async () => {
      auth.generatePasswordResetLink.mockResolvedValueOnce(
        'https://reset.link/abc',
      );
      const res = await svc.sendPasswordReset('alice@test.com');
      expect(res).toEqual({ success: true });

      const { subject, html } = passwordResetEmail('https://reset.link/abc');
      expect(email.send).toHaveBeenCalledWith(
        'alice@test.com',
        subject,
        html,
      );
    });

    it('still returns success and sends no email when the user is not found', async () => {
      auth.generatePasswordResetLink.mockRejectedValueOnce({
        code: 'auth/user-not-found',
      });
      const res = await svc.sendPasswordReset('ghost@test.com');
      expect(res).toEqual({ success: true });
      expect(email.send).not.toHaveBeenCalled();
    });

    it('still returns success and sends no email on an unexpected error', async () => {
      auth.generatePasswordResetLink.mockRejectedValueOnce(
        new Error('network down'),
      );
      const res = await svc.sendPasswordReset('alice@test.com');
      expect(res).toEqual({ success: true });
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
