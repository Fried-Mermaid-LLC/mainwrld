import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { RESEND_API_KEY, sendEmail, renewalReminderEmail } from './email.js'

// "Your membership will renew in 7 days" reminder.
//
// Runs once a day and emails every premium member whose accurate next-renewal
// date (premiumRenewalAt, written by the Stripe subscription.* webhook and the
// Apple receipt verifier) falls inside the 7-day window. Members who have
// cancelled (premiumCancelAtPeriodEnd) are skipped — there's nothing to remind
// them about. Each renewal period is reminded at most once: we stamp
// renewalReminderSentForAt with the period we reminded for, so re-runs and the
// next renewal cycle don't re-send.

const DAY_MS = 24 * 60 * 60 * 1000

export const sendRenewalReminders = onSchedule(
  {
    schedule: 'every day 14:00',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    // Fire ~7 days out. A 1-day-wide window (6–7 days) guarantees a daily run
    // catches every member exactly once without needing minute precision.
    const windowStart = now + 6 * DAY_MS
    const windowEnd = now + 7 * DAY_MS

    // Range filter on premiumRenewalAt; the remaining conditions (premium,
    // not cancelled, not already reminded for this period) are checked in code
    // so we don't need extra composite indexes.
    const snap = await db
      .collection('users')
      .where('premiumRenewalAt', '>=', windowStart)
      .where('premiumRenewalAt', '<=', windowEnd)
      .get()

    let sent = 0
    let skipped = 0
    for (const doc of snap.docs) {
      const u = doc.data() as any
      const renewalAt: number = u.premiumRenewalAt
      if (u.isPremium !== true) {
        skipped++
        continue
      }
      if (u.premiumCancelAtPeriodEnd === true || u.membershipAutoRenew === false) {
        skipped++
        continue
      }
      // Already reminded for this exact renewal date.
      if (u.renewalReminderSentForAt === renewalAt) {
        skipped++
        continue
      }
      const email: string | undefined = u.email
      if (!email) {
        skipped++
        continue
      }

      const displayName = u.displayName || u.username || 'there'
      const dateLabel = new Date(renewalAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/New_York',
      })
      const mail = renewalReminderEmail(displayName, dateLabel)
      const result = await sendEmail(email, mail.subject, mail.html)
      if (result.ok) {
        // Stamp only on success so a transient failure retries tomorrow.
        await doc.ref.set({ renewalReminderSentForAt: renewalAt }, { merge: true })
        sent++
      } else {
        skipped++
      }
    }

    logger.info('sendRenewalReminders complete', {
      candidates: snap.size,
      sent,
      skipped,
    })
  }
)
