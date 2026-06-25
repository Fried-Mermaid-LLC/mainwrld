import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret, defineString } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

// "Renews in 7 days" membership reminder (F05) scheduler.
//
// The reminder LOGIC lives in the NestJS API (it needs the Resend email service
// + the renewal email template), exposed as the CronGuard-protected endpoint
// POST /api/v1/internal/cron/renewal-reminders. This function is the in-repo
// scheduler that drives it: a thin DAILY trigger that POSTs to that endpoint
// with the shared secret. It deliberately re-implements nothing — duplicating
// the email stack here is exactly what moving it to the API avoided.
//
// The API job is idempotent (it stamps renewalReminderSentForAt once per renewal
// period), so a retry — or an additional external Cloud Scheduler hitting the
// same endpoint — only ever yields skips, never a duplicate email. Daily cadence
// matches the API's 6–7-day (24h-wide) selection window so every renewal is
// caught exactly once.

// The NestJS API origin WITHOUT a trailing slash and WITHOUT the /api/v1 prefix
// (e.g. https://mainwrld-api-xxxxxx.uc.run.app). Set it per project before
// deploy — add a line to functions/.env (see functions/.env.example):
//   RENEWAL_API_ORIGIN="https://<your-cloud-run-api-host>"
// A default of '' keeps `firebase deploy --non-interactive` from HARD-FAILING
// when no value is supplied (a bare defineString with no default aborts the
// deploy: "In non-interactive mode but have no value for ..."). In CI the real
// value is injected via functions/.env (see firebase-hosting.yml). If it ever
// goes unset the run below degrades to a logged skip, never a broken deploy.
const RENEWAL_API_ORIGIN = defineString('RENEWAL_API_ORIGIN', { default: '' })

// The SAME shared secret the API's CronGuard checks in the x-cron-secret header
// (the API's INTERNAL_CRON_SECRET env var). Store it in Secret Manager so it is
// never committed:
//   firebase functions:secrets:set INTERNAL_CRON_SECRET
const INTERNAL_CRON_SECRET = defineSecret('INTERNAL_CRON_SECRET')

export const sendRenewalReminders = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'America/New_York',
    region: 'us-central1',
    secrets: [INTERNAL_CRON_SECRET],
  },
  async () => {
    const origin = RENEWAL_API_ORIGIN.value().replace(/\/+$/, '')
    const secret = INTERNAL_CRON_SECRET.value()
    if (!origin || !secret) {
      logger.error(
        'sendRenewalReminders: RENEWAL_API_ORIGIN or INTERNAL_CRON_SECRET is not set; skipping run'
      )
      return
    }

    const url = `${origin}/api/v1/internal/cron/renewal-reminders`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // Throwing marks this run failed (surfaced in Cloud Functions logs /
      // monitoring) and lets the scheduler retry — safe because the endpoint is
      // idempotent.
      throw new Error(
        `renewal-reminders API returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`
      )
    }

    const summary = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    logger.info('sendRenewalReminders triggered', summary)
  }
)
