import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// ---- setUsernameClaim ----
//
// Fires when a new user profile lands in Firestore (signUp() in
// firebaseService.ts writes `users/{uid}` after createUserWithEmail...).
// Mirrors the username into the Auth token as a custom claim so that
// firestore.rules can authorize username-keyed records (chatMessages,
// relationships, notifications) without an extra lookup.
//
// After this fires the client must call `await user.getIdToken(true)`
// once to refresh the token; signUp() in firebaseService should do
// this immediately after the createUserWithEmailAndPassword call.

export const setUsernameClaim = onDocumentCreated(
  { region: 'us-central1', document: 'users/{uid}' },
  async (event) => {
    const uid = event.params.uid
    const data = event.data?.data()
    const username = data?.username as string | undefined
    if (!username) {
      logger.warn('setUsernameClaim: no username on doc', { uid })
      return
    }
    try {
      // Preserve any existing claims (e.g. admin) when adding username.
      const existing = (await getAuth().getUser(uid)).customClaims ?? {}
      await getAuth().setCustomUserClaims(uid, { ...existing, username })
      logger.info('setUsernameClaim: claim set', { uid, username })
    } catch (err) {
      logger.error('setUsernameClaim: failed', { uid, username, err })
    }
  }
)

// ---- setAdmin ----
//
// Replaces the previous client-side ADMIN_USERNAMES check in
// App.tsx:249. An admin can grant or revoke admin to another user
// via a callable invocation. The first admin (bootstrap) must be set
// manually one time via the Firebase Admin SDK or the
// `firebase functions:shell` REPL — see audit.md for the exact line.

export const setAdmin = onCall<{ uid: string; admin: boolean }>(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    if (req.auth.token.admin !== true) {
      throw new HttpsError(
        'permission-denied',
        'Only admins can grant admin.'
      )
    }
    const { uid, admin } = req.data || ({} as { uid: string; admin: boolean })
    if (!uid || typeof admin !== 'boolean') {
      throw new HttpsError(
        'invalid-argument',
        'Expected { uid: string, admin: boolean }.'
      )
    }
    // No self-targeting: revoking your own admin is an irreversible lockout.
    if (uid === req.auth.uid) {
      throw new HttpsError(
        'failed-precondition',
        'You cannot change your own admin status.'
      )
    }
    const existing = (await getAuth().getUser(uid)).customClaims ?? {}
    await getAuth().setCustomUserClaims(uid, { ...existing, admin })
    // Mirror the claim onto the user profile so other clients can show
    // an admin badge in lists without each reading other users' tokens.
    await getFirestore()
      .collection('users')
      .doc(uid)
      .set({ isAdmin: admin }, { merge: true })
    logger.info('setAdmin: claim updated', { uid, admin, by: req.auth.uid })
    return { uid, admin }
  }
)

// ---- ensureUsernameClaim ----
//
// Backfill for the username custom claim. setUsernameClaim only fires on
// users/{uid} CREATE, so every account that existed before that trigger
// shipped never got the claim — and token rotation does NOT re-run an
// onCreate trigger. Without the claim, firestore.rules that authorize
// username-keyed records (chatMessages.from/to, notifications.recipient,
// relationships.admirer) reject the user's own reads/writes.
//
// The client calls this once after sign-in, then refreshes its ID token
// (getIdToken(true)) so the rules can see the claim. Idempotent: if the
// claim is already present and current it does nothing.
export const ensureUsernameClaim = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const uid = req.auth.uid
    const snap = await getFirestore().collection('users').doc(uid).get()
    const username = snap.exists
      ? (snap.data()?.username as string | undefined)
      : undefined
    if (!username) {
      // No profile doc yet (e.g. mid-signup race). Nothing to mirror.
      return { ok: false, reason: 'no-username' as const, changed: false }
    }
    const existing = (await getAuth().getUser(uid)).customClaims ?? {}
    if (existing.username === username) {
      return { ok: true, changed: false, username }
    }
    // Preserve other claims (e.g. admin) when stamping the username.
    await getAuth().setCustomUserClaims(uid, { ...existing, username })
    logger.info('ensureUsernameClaim: claim backfilled', { uid, username })
    return { ok: true, changed: true, username }
  }
)
