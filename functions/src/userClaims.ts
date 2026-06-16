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
