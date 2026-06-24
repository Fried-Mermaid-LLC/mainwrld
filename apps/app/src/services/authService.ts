import { auth } from '@/lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User as FirebaseUser,
  type Unsubscribe,
} from 'firebase/auth';
import { api } from '@/lib/apiClient';

// Pure Firebase Auth wrappers (login/signup/session/reset stay client-side) plus
// the API-backed claim/reset helpers. Firestore profile creation moved to the
// API (usersApi.createProfile).

export const signUpAuth = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logInAuth = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const logOut = () => signOut(auth);

export const onAuthChange = (
  callback: (user: FirebaseUser | null) => void
): Unsubscribe => onAuthStateChanged(auth, callback);

export const getCurrentFirebaseUser = (): FirebaseUser | null =>
  auth.currentUser;

// Re-authenticate with the current password before updating it. Firebase
// requires a fresh credential for security-sensitive mutations, and proving
// knowledge of the old password closes the "walk-up to an unlocked session and
// silently change the password" hole.
export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  if (!user.email) throw new Error('No email on account');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
};

export const verifyResetCode = (oobCode: string): Promise<string> =>
  verifyPasswordResetCode(auth, oobCode);

export const completePasswordReset = (
  oobCode: string,
  newPassword: string
): Promise<void> => confirmPasswordReset(auth, oobCode, newPassword);

// Backfill the username claim via the API, then refresh the ID token so
// username-scoped requests are authorized. Bounded + fail-soft (a hung call
// must not strand the launch splash) — mirrors the legacy ensureUsernameClaim.
export const ensureUsernameClaim = async (): Promise<void> => {
  const current = auth.currentUser;
  if (!current) return;
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('ensureUsernameClaim timeout')), ms)
      ),
    ]);
  try {
    const res = await withTimeout(
      api.post<{ ok: boolean; changed?: boolean }>('/auth/ensure-claim'),
      6000
    );
    if (res?.ok) {
      await withTimeout(current.getIdToken(true), 3000);
    }
  } catch (err) {
    console.error('[claims] ensureUsernameClaim failed', err);
  }
};

// username -> email for login (public). Returns null email when unknown.
export const resolveUsernameEmail = async (
  username: string
): Promise<string | null> => {
  try {
    const res = await api.get<{ email: string | null }>(
      `/auth/resolve-username/${encodeURIComponent(username)}`
    );
    return res?.email ?? null;
  } catch {
    return null;
  }
};

// Branded password reset (always succeeds server-side; no account-existence leak).
export const sendPasswordReset = (email: string): Promise<{ success: boolean }> =>
  api.post<{ success: boolean }>('/auth/password-reset', { email });

// Pre-signup moderation. Fail-open: any error returns false so it never blocks signup.
export const moderateUsername = async (
  username: string,
  displayName: string
): Promise<boolean> => {
  try {
    const res = await api.post<{ flagged: boolean }>('/moderation/username', {
      username,
      displayName,
    });
    return !!res?.flagged;
  } catch {
    return false;
  }
};
