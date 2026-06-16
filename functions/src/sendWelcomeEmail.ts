import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'

// Welcome email sent right after sign-up. Migrated from the standalone
// Express server (server.js) so it runs as a deployed callable Cloud Function
// instead of a separately-hosted backend the web build pointed at via
// VITE_API_BASE_URL (which defaulted to http://localhost:3001 in production).
//
// Set the Resend API key before the first deploy:
//   firebase functions:secrets:set RESEND_API_KEY
const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

// Resend's shared sender works without domain verification. Once the
// mainwrld.com domain is verified in Resend, switch this to
// 'MainWRLD <welcome@mainwrld.com>'.
const FROM = 'MainWRLD <onboarding@resend.dev>'

interface WelcomeArgs {
  displayName?: string
  username?: string
  email?: string
}

export const sendWelcomeEmail = onCall<WelcomeArgs>(
  { region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }

    const displayName = (req.data?.displayName ?? '').trim()
    const username = (req.data?.username ?? '').trim()
    // Only ever email the signed-in user's own verified address (falling back
    // to the address supplied at sign-up). Never an arbitrary client-supplied
    // recipient — so this can't be abused as an open email relay.
    const to = req.auth.token.email ?? req.data?.email

    if (!to || !displayName || !username) {
      throw new HttpsError(
        'invalid-argument',
        'Missing recipient email, displayName, or username.'
      )
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY.value()}`
        },
        body: JSON.stringify({
          from: FROM,
          to,
          subject: `Welcome to MainWRLD, ${displayName}`,
          html: `
            <p>Hi ${displayName},</p>
            <p>Welcome to MainWRLD! Your username is <strong>@${username}</strong>.</p>
            <p>Jump in and start building your world.</p>
          `
        })
      })

      if (!response.ok) {
        const detail = await response.text()
        logger.error('[MainWRLD] Resend returned an error', {
          status: response.status,
          detail
        })
        throw new HttpsError('internal', 'Email provider returned an error.')
      }

      logger.info('[MainWRLD] Welcome email sent', { to })
      return { success: true }
    } catch (err) {
      if (err instanceof HttpsError) throw err
      logger.error('[MainWRLD] Welcome email failed', err as Error)
      throw new HttpsError('internal', 'Failed to send welcome email.')
    }
  }
)
