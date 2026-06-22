import { onValueWritten } from 'firebase-functions/v2/database'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// Presence mirror (X06). The client writes RTDB /status/{uid} and arms an
// onDisconnect that flips it offline server-side when the socket drops. This
// trigger mirrors that truth into Firestore users/{uid} so the rest of the app
// keeps reading presence from the existing users subscription. Runs with admin
// privileges (bypasses rules) and is the authoritative writer of isOnline /
// activity / currentBookId / lastOnline.
//
// NOTE: the `region` here must match the RTDB instance's region (set in the
// Firebase console when Realtime Database is enabled).
export const mirrorPresence = onValueWritten(
  { ref: '/status/{uid}', region: 'us-central1' },
  async (event) => {
    const after = event.data.after.val()
    const uid = event.params.uid
    try {
      await getFirestore()
        .doc(`users/${uid}`)
        .set(
          {
            isOnline: after?.state === 'online',
            activity: after?.activity ?? 'Idle',
            currentBookId: after?.currentBookId ?? null,
            lastOnline: new Date().toISOString(),
          },
          { merge: true }
        )
    } catch (err) {
      logger.error('mirrorPresence failed', { uid, err })
    }
  }
)
