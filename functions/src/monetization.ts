import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
  RESEND_API_KEY,
  sendEmail,
  emailLayout,
  escapeHtml,
  userContact,
} from './email.js'

const SITE_URL = 'https://mainwrld-f7acf.web.app'

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
      const author = await userContact(db, after.authorUid)
      if (author.email) {
        await sendEmail(
          author.email,
          'Your monetization request has been accepted',
          emailLayout({
            preheader: `"${title}" is approved for sale on MainWRLD.`,
            heading: 'Your monetization request was accepted',
            bodyHtml: `
              <p style="margin:0 0 14px">Hi ${escapeHtml(author.displayName)},</p>
              <p style="margin:0 0 14px">Good news — your request to monetize
                <strong>"${escapeHtml(title)}"</strong> has been accepted.
                Readers can now purchase it, and you'll earn 80% of every sale.</p>
              <p style="margin:0">You can track sales and payouts from your
                earnings settings.</p>
            `,
            cta: { label: 'View your book', url: SITE_URL },
          })
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
      const author = await userContact(db, after.authorUid)
      if (author.email) {
        await sendEmail(
          author.email,
          'Your monetization request has been denied',
          emailLayout({
            preheader: `An update on your request to monetize "${title}".`,
            heading: 'Your monetization request was denied',
            bodyHtml: `
              <p style="margin:0 0 14px">Hi ${escapeHtml(author.displayName)},</p>
              <p style="margin:0 0 14px">Your request to monetize
                <strong>"${escapeHtml(title)}"</strong> was denied because of:
                <strong>${escapeHtml(reason)}</strong>.</p>
              <p style="margin:0">If you think this was a mistake or you've
                addressed the issue, you may be able to submit again from the
                book's menu.</p>
            `,
            cta: { label: 'Open MainWRLD', url: SITE_URL },
          })
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
