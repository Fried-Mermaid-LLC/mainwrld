import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// App Store guideline 5.1.1(v) — apps that let users create accounts
// must let them delete the account in-app. This function does the
// server-side teardown: scrub their content + revoke auth.
//
// Triggered by the client calling `httpsCallable(...)('deleteAccount')`
// from a confirmed action in Settings. Returns `{ deletedUid }`.
//
// Scrub list:
//   1. users/{uid}
//   2. usernames/{username}
//   3. books authored by uid
//   4. comments authored by uid
//   5. chatMessages where from == username OR to == username
//   6. relationships where admirer == username OR target == username
//   7. notifications where recipient == username
//   8. reports where reportedBy == username
//   9. auth().deleteUser(uid)
//
// We DO NOT delete content authored by others that the deleted user
// commented on or admired — only the deleted user's own outputs.

export const deleteAccount = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.')
  }
  const uid = req.auth.uid
  const db = getFirestore()
  const auth = getAuth()

  // 1. Look up the username so we can scrub username-keyed records.
  let username: string | null = null
  try {
    const snap = await db.collection('users').doc(uid).get()
    if (snap.exists) {
      username = (snap.data()?.username as string | undefined) ?? null
    }
  } catch (err) {
    logger.warn('deleteAccount: failed to read user doc', { uid, err })
  }

  // Helper: batched deletion of a query (firestore batches max 500).
  const deleteByQuery = async (
    label: string,
    query: FirebaseFirestore.Query
  ): Promise<number> => {
    let deleted = 0
    while (true) {
      const snap = await query.limit(400).get()
      if (snap.empty) break
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      deleted += snap.size
      if (snap.size < 400) break
    }
    logger.info(`deleteAccount: deleted ${deleted} ${label}`, { uid })
    return deleted
  }

  // 2. Username lookup doc.
  if (username) {
    try {
      await db.collection('usernames').doc(username.toLowerCase()).delete()
    } catch (err) {
      logger.warn('deleteAccount: usernames doc delete failed', { username, err })
    }
  }

  // 3-8. User-authored content.
  await deleteByQuery('books', db.collection('books').where('authorUid', '==', uid))
  await deleteByQuery('comments', db.collection('comments').where('authorUid', '==', uid))

  if (username) {
    await deleteByQuery('chatMessages.from', db.collection('chatMessages').where('from', '==', username))
    await deleteByQuery('chatMessages.to', db.collection('chatMessages').where('to', '==', username))
    await deleteByQuery('relationships.admirer', db.collection('relationships').where('admirer', '==', username))
    await deleteByQuery('relationships.target', db.collection('relationships').where('target', '==', username))
    await deleteByQuery('notifications.recipient', db.collection('notifications').where('recipient', '==', username))
    await deleteByQuery('reports.reportedBy', db.collection('reports').where('reportedBy', '==', username))
  }

  // 9. The profile document itself.
  try {
    await db.collection('users').doc(uid).delete()
  } catch (err) {
    logger.warn('deleteAccount: users doc delete failed', { uid, err })
  }

  // 10. Revoke + delete the Auth user. After this, the client's ID
  // token is no longer valid; the client should sign out immediately.
  await auth.deleteUser(uid)
  logger.info('deleteAccount: complete', { uid, username })
  return { deletedUid: uid }
})
