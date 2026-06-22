import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { logger } from 'firebase-functions/v2'

// Push fan-out (X01). Fires when a notification doc is created and sends an
// APNs/FCM push to the recipient's registered devices. This is the AUTHORITATIVE
// push gate: it honors the recipient's notificationPrefs (per-category + master
// `push`), skips system/self notifications, and prunes stale tokens. The client
// only handles the in-app list filter; both read the same notificationPrefs.
export const sendPushOnNotification = onDocumentCreated(
  { region: 'us-central1', document: 'notifications/{notifId}' },
  async (event) => {
    const n = event.data?.data()
    if (!n) return
    const category = n.category as string | undefined
    if (!category || category === 'system') return // never push system/unclassifiable
    const recipient = n.recipient as string
    if (n.sender && n.sender === recipient) return // don't push self-notifications

    const db = getFirestore()
    // username -> uid via usernames/{lowercase}
    const unameDoc = await db
      .collection('usernames')
      .doc(String(recipient).toLowerCase())
      .get()
    const uid = unameDoc.data()?.uid
    if (!uid) return
    const userDoc = await db.collection('users').doc(uid).get()
    const u = userDoc.data()
    if (!u) return

    const prefs = u.notificationPrefs ?? {
      newAdmirers: true,
      bookLikes: true,
      comments: true,
      appUpdates: true,
    }
    if (prefs.push === false) return // master push off
    // Per-category gate (messages is always-on; it has no settings row).
    if (category !== 'messages' && prefs[category] === false) return

    const tokens: string[] = Array.isArray(u.fcmTokens) ? u.fcmTokens : []
    if (tokens.length === 0) return

    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: n.title, body: n.message },
      data: {
        // Mirror routing fields as strings for routeFromPushData().
        category,
        targetId: String(n.targetId ?? ''),
        targetChapterIndex: String(n.targetChapterIndex ?? ''),
        commentId: String(n.commentId ?? ''),
        sender: String(n.sender ?? ''),
        title: String(n.title ?? ''),
      },
      apns: { payload: { aps: { sound: 'default' } } },
    })

    // Prune invalid tokens.
    const stale: string[] = []
    res.responses.forEach((r, i) => {
      const code = r.error?.code
      if (
        !r.success &&
        (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token')
      )
        stale.push(tokens[i])
    })
    if (stale.length)
      await db
        .collection('users')
        .doc(uid)
        .update({ fcmTokens: FieldValue.arrayRemove(...stale) })

    logger.info('sendPushOnNotification', {
      recipient,
      category,
      sent: res.successCount,
      pruned: stale.length,
    })
  }
)
