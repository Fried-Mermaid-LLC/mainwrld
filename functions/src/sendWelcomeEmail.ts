import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'
import { RESEND_API_KEY, sendTemplateEmail } from './email.js'

// Welcome email sent right after sign-up. Callable Cloud Function; the
// recipient comes from the caller's auth token server-side (never an arbitrary
// client-supplied address, so this can't be abused as an open email relay).
//
// Subject + body live in a Resend-hosted template (no dynamic variables), so
// this function only resolves the recipient and triggers the send.
const WELCOME_TEMPLATE_ID = '9ff7ce32-5481-43f0-a0fc-8d6cae0e6bb4'

interface WelcomeArgs {
  email?: string
}

export const sendWelcomeEmail = onCall<WelcomeArgs>(
  { region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in.')
    }

    // Only ever email the signed-in user's own verified address (falling back
    // to the address supplied at sign-up).
    const to = req.auth.token.email ?? req.data?.email

    if (!to) {
      throw new HttpsError('invalid-argument', 'Missing recipient email.')
    }

    const result = await sendTemplateEmail(to, WELCOME_TEMPLATE_ID)
    if (!result.ok) {
      logger.error('[MainWRLD] Welcome email failed', { to, ...result })
      throw new HttpsError('internal', 'Failed to send welcome email.')
    }
    return { success: true }
  }
)
