import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { RESEND_API_KEY, sendEmail, emailLayout, escapeHtml } from './email.js'

// Welcome email sent right after sign-up. Callable Cloud Function; the
// recipient comes from the caller's auth token server-side (never an arbitrary
// client-supplied address, so this can't be abused as an open email relay).

const SITE_URL = 'https://mainwrld-f7acf.web.app'

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
    // to the address supplied at sign-up).
    const to = req.auth.token.email ?? req.data?.email

    if (!to || !displayName || !username) {
      throw new HttpsError(
        'invalid-argument',
        'Missing recipient email, displayName, or username.'
      )
    }

    const html = emailLayout({
      preheader: 'Your MainWRLD account is ready — jump in and start building.',
      heading: `Welcome to MainWRLD, ${escapeHtml(displayName)}!`,
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${escapeHtml(displayName)},</p>
        <p style="margin:0 0 14px">Your account is live and your username is
          <strong>@${escapeHtml(username)}</strong>.</p>
        <p style="margin:0">Read stories from creators everywhere, write your own,
          and build out your world. We're glad you're here.</p>
      `,
      cta: { label: 'Open MainWRLD', url: SITE_URL },
    })

    const result = await sendEmail(to, `Welcome to MainWRLD, ${displayName}`, html)
    if (!result.ok) {
      logger.error('[MainWRLD] Welcome email failed', { to, ...result })
      throw new HttpsError('internal', 'Failed to send welcome email.')
    }
    return { success: true }
  }
)
