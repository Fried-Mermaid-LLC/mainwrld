import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// F04 — Strike system: ban / unban / server-side auto-ban-at-3.
//
// Strikes accrue from admin moderation actions (handled client-side in
// useAdmin.applyStrike via the increment() write). The BAN itself must run
// server-side: only the Admin SDK can disable a Firebase Auth record and set
// a custom claim. This file owns that authority. Per product decision the ban
// DISABLES + RETAINS the account (no content scrub) so it stays reversible via
// unbanUser — unlike deleteAccount.ts, which scrubs and deletes.

const REGION = 'us-central1'
const STRIKE_LIMIT = 3

function assertAdmin(req: CallableRequest): void {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  if (req.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can moderate accounts.')
  }
}

// Core ban routine, shared by the `banUser` callable and the `strikeWatch`
// trigger. Idempotent: a second call on an already-banned account just
// re-asserts the Auth disable and returns. Never bans an admin.
async function performBan(targetUid: string, reason: string): Promise<void> {
  const db = getFirestore()
  const auth = getAuth()

  const snap = await db.collection('users').doc(targetUid).get()
  const data = snap.exists ? snap.data() : undefined
  const username = (data?.username as string | undefined) ?? null

  if (data?.isAdmin === true) {
    logger.warn('performBan: refusing to ban an admin', { targetUid })
    return
  }
  if (data?.isBanned === true) {
    // Already banned — keep the Auth side consistent and bail (idempotency
    // for the callable + strikeWatch both firing on a 3rd strike).
    await auth.updateUser(targetUid, { disabled: true }).catch(() => {})
    return
  }

  // 1. Profile mirror (read at the session edge by useAuthActions + logIn).
  await db.collection('users').doc(targetUid).set(
    {
      isBanned: true,
      bannedAt: new Date().toISOString(),
      banReason: reason,
    },
    { merge: true }
  )

  // 2. Auth: set the `banned` claim (preserve username/admin), revoke tokens,
  //    disable the record. Disabling guarantees no NEW sign-in; revoking +
  //    the firestore.rules !isBanned() guard close the stale-token window.
  const existing = (await auth.getUser(targetUid)).customClaims ?? {}
  await auth.setCustomUserClaims(targetUid, { ...existing, banned: true })
  await auth.revokeRefreshTokens(targetUid)
  await auth.updateUser(targetUid, { disabled: true })

  // 3. Resolve open User-type reports for this username so the admin queue
  //    clears (the strike/content paths already resolve Book/Comment reports).
  if (username) {
    const reps = await db
      .collection('reports')
      .where('targetId', '==', username)
      .where('type', '==', 'User')
      .get()
    if (!reps.empty) {
      const batch = db.batch()
      reps.docs.forEach((d) => {
        if (d.data().status === 'pending') {
          batch.update(d.ref, { status: 'resolved' })
        }
      })
      await batch.commit()
    }
  }

  logger.info('performBan: complete', { targetUid, username, reason })
}

// ---- banUser (callable, admin-only) ----
// Manual immediate ban from the admin "Ban User" button.
export const banUser = onCall<{ targetUid: string }>(
  { region: REGION },
  async (req) => {
    assertAdmin(req)
    const targetUid = req.data?.targetUid
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'Expected { targetUid: string }.')
    }
    if (targetUid === req.auth!.uid) {
      throw new HttpsError('failed-precondition', 'You cannot ban yourself.')
    }
    await performBan(targetUid, 'manual ban')
    return { bannedUid: targetUid }
  }
)

// ---- unbanUser (callable, admin-only) ----
// Reverse a ban: re-enable Auth, drop the `banned` claim, reset strike state.
// Content was never scrubbed, so the account returns intact.
export const unbanUser = onCall<{ targetUid: string }>(
  { region: REGION },
  async (req) => {
    assertAdmin(req)
    const targetUid = req.data?.targetUid
    if (!targetUid || typeof targetUid !== 'string') {
      throw new HttpsError('invalid-argument', 'Expected { targetUid: string }.')
    }
    const db = getFirestore()
    const auth = getAuth()

    await db.collection('users').doc(targetUid).set(
      {
        isBanned: false,
        strikes: 0,
        struckByReportIds: [],
        bannedAt: FieldValue.delete(),
        banReason: FieldValue.delete(),
      },
      { merge: true }
    )

    const claims = { ...((await auth.getUser(targetUid)).customClaims ?? {}) }
    delete claims.banned
    await auth.setCustomUserClaims(targetUid, claims)
    await auth.updateUser(targetUid, { disabled: false })

    logger.info('unbanUser: complete', { targetUid, by: req.auth!.uid })
    return { unbannedUid: targetUid }
  }
)

// ---- strikeWatch (trigger, belt-and-suspenders auto-ban) ----
// Fires the ban server-side the moment a user's strike count crosses 3,
// independent of the client calling banUser. Guarantees the auto-ban even if
// a strike is written by a path that forgets to ban, or edited straight into
// Firestore. Race-safe: keyed on `after.strikes` crossing the threshold, and
// performBan is idempotent so a concurrent client ban can't double-apply.
export const strikeWatch = onDocumentUpdated(
  { region: REGION, document: 'users/{uid}' },
  async (event) => {
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!after) return
    const beforeStrikes = (before?.strikes as number) || 0
    const afterStrikes = (after.strikes as number) || 0
    if (
      afterStrikes >= STRIKE_LIMIT &&
      beforeStrikes < STRIKE_LIMIT &&
      after.isBanned !== true &&
      after.isAdmin !== true
    ) {
      await performBan(event.params.uid, '3 strikes')
    }
  }
)
