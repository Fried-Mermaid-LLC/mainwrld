import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// MainWRLD monetization side-effects (F01 + F03).
//
// Fires on every books/{bookId} update and reacts to monetization-state
// transitions:
//   • isMonetized false→true (admin approved): fan out a "Book Monetized"
//     notification to every user who has the book in their library, notify the
//     author of the approval, and email the author ("accepted"). [F01 + F03]
//   • monetizationStatus → 'denied': notify + email the author with the reason.
//   • isMonetized true→false (un-monetize / unpublish / admin take-down): stamp
//     permanentlyDemonetized + wasMonetizedBefore so the terminal block is
//     authoritative regardless of which client demonetized. [F01]
//
// Emails are best-effort (deferred F05 email system): a missing/failed email
// never blocks the status change. Recipient is resolved server-side from the
// author's user doc — never a client-supplied address.

const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
const FROM = 'MainWRLD <noreply@mainwrld.com>'

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const key = RESEND_API_KEY.value()
  if (!key || !to) {
    logger.info('monetization email skipped (no key/recipient)')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })
    if (!res.ok) {
      logger.warn('monetization email non-2xx', { status: res.status })
    }
  } catch (err) {
    logger.warn('monetization email failed', { err })
  }
}

async function authorEmail(
  db: FirebaseFirestore.Firestore,
  authorUid: string | undefined
): Promise<string | null> {
  if (!authorUid) return null
  try {
    const snap = await db.collection('users').doc(authorUid).get()
    return ((snap.data() as any)?.email as string) || null
  } catch {
    return null
  }
}

export const onBookMonetized = onDocumentUpdated(
  { region: 'us-central1', document: 'books/{bookId}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data() as any
    const after = event.data?.after.data() as any
    if (!after) return

    const db = getFirestore()
    const bookId: string = after.id || event.params.bookId
    const title: string = after.title || 'A book'
    const authorUsername: string | undefined = after.authorUsername

    const becameMonetized =
      before?.isMonetized !== true && after.isMonetized === true
    const becameDenied =
      before?.monetizationStatus !== 'denied' &&
      after.monetizationStatus === 'denied'
    const becameDemonetized =
      before?.isMonetized === true && after.isMonetized === false

    // ---- Approved: fan out to library owners + notify/email author ----
    if (becameMonetized) {
      try {
        const owners = await db
          .collection('users')
          .where('ownedBookIds', 'array-contains', bookId)
          .get()
        const writes: Promise<unknown>[] = []
        owners.forEach((doc) => {
          const u = doc.data() as any
          if (!u.username || u.username === authorUsername) return
          writes.push(
            db.collection('notifications').add({
              title: 'Book Monetized',
              message: `"${title}" is now a paid book.`,
              icon: 'paid',
              recipient: u.username,
              sender: authorUsername || 'MainWRLD',
              targetId: bookId,
              read: false,
              timestamp: new Date().toISOString(),
            })
          )
        })
        // Author "approved" notification.
        if (authorUsername) {
          writes.push(
            db.collection('notifications').add({
              title: 'Monetization Approved',
              message: 'Your monetization request has been accepted.',
              icon: 'paid',
              recipient: authorUsername,
              sender: 'MainWRLD',
              targetId: bookId,
              read: false,
              timestamp: new Date().toISOString(),
            })
          )
        }
        await Promise.all(writes)
        logger.info('onBookMonetized: fan-out complete', {
          bookId,
          owners: owners.size,
        })
      } catch (err) {
        logger.error('onBookMonetized: fan-out failed', { bookId, err })
      }
      // Accept email (best-effort).
      const to = await authorEmail(db, after.authorUid)
      if (to) {
        await sendEmail(
          to,
          'Your monetization request has been accepted',
          `<p>Good news — your request to monetize <strong>"${title}"</strong> has been accepted. Readers can now buy it.</p>`
        )
      }
    }

    // ---- Denied: notify + email author with the reason ----
    if (becameDenied && authorUsername) {
      const reason = after.monetizationDenialReason || 'a policy review'
      try {
        await db.collection('notifications').add({
          title: 'Monetization Denied',
          message: `Your monetization request was denied: ${reason}`,
          icon: 'money_off',
          recipient: authorUsername,
          sender: 'MainWRLD',
          targetId: bookId,
          read: false,
          timestamp: new Date().toISOString(),
        })
      } catch (err) {
        logger.error('onBookMonetized: deny notification failed', { bookId, err })
      }
      const to = await authorEmail(db, after.authorUid)
      if (to) {
        await sendEmail(
          to,
          'Your monetization request has been denied',
          `<p>Your request to monetize <strong>"${title}"</strong> was denied because of: ${reason}.</p>`
        )
      }
    }

    // ---- Demonetized: stamp the terminal permanence flags ----
    if (becameDemonetized && after.permanentlyDemonetized !== true) {
      try {
        await event.data!.after.ref.update({
          permanentlyDemonetized: true,
          wasMonetizedBefore: true,
        })
        logger.info('onBookMonetized: permanence stamped', { bookId })
      } catch (err) {
        logger.error('onBookMonetized: permanence stamp failed', { bookId, err })
      }
    }
  }
)
