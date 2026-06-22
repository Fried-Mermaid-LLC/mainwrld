import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// Membership-aware DM retention (F08).
//
// Members keep their messages forever; non-members' messages are deleted ~1
// year after they were sent. Membership is a point-in-time snapshot: each
// chatMessages doc carries `senderIsPremium` (written by sendChatMessage at
// send time), so we never read the sender's user doc here. A member who later
// cancels keeps the messages they sent while a member.
//
// This replaces the old client-side mass-delete (which expired EVERY user's
// messages at 1 year and scanned the whole collection on each app load).
//
// IMPORTANT — one-time backfill before relying on this:
// Firestore equality (`senderIsPremium == false`) does NOT match docs that lack
// the field, so all pre-F08 messages are retained forever until backfilled. Run
// a one-time script to set `senderIsPremium` on every existing chatMessages doc
// (false by default, or true for docs whose sender is currently premium).
//
// Requires the composite index chatMessages(senderIsPremium ASC, timestamp ASC).

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const BATCH_SIZE = 500 // Firestore writeBatch hard limit

export const pruneExpiredMessages = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'America/New_York',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore()
    const cutoffIso = new Date(Date.now() - YEAR_MS).toISOString()
    let totalDeleted = 0

    // Delete in bounded batches until the query is dry. Each pass re-queries
    // from the start because deleting removes the matched docs.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const expired = await db
        .collection('chatMessages')
        .where('senderIsPremium', '==', false)
        .where('timestamp', '<', cutoffIso)
        .limit(BATCH_SIZE)
        .get()
      if (expired.empty) break

      const batch = db.batch()
      for (const doc of expired.docs) batch.delete(doc.ref)
      await batch.commit()
      totalDeleted += expired.size

      if (expired.size < BATCH_SIZE) break
    }

    logger.info('pruneExpiredMessages complete', { totalDeleted, cutoffIso })
  }
)
