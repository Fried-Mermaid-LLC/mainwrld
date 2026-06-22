import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getAuth } from 'firebase-admin/auth'
import { logger } from 'firebase-functions/v2'
import { RESEND_API_KEY, sendEmail, emailLayout } from './email.js'

// Branded "forgot password" email.
//
// The client (ForgotPasswordView) calls this instead of Firebase Auth's
// built-in sendPasswordResetEmail so the message matches the rest of our
// transactional mail. We mint the real reset link server-side with the Admin
// SDK (generatePasswordResetLink) — it carries the same oobCode the app's
// ResetPasswordView already handles (?mode=resetPassword&oobCode=…) — and
// deliver it through Resend.
//
// Caller is unauthenticated by nature (they can't sign in). To avoid leaking
// which addresses have accounts — and to avoid becoming a spam relay — we only
// send when generatePasswordResetLink resolves a real user, and always return
// { success: true } regardless so the response is identical either way.

interface ResetArgs {
  email?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const sendPasswordReset = onCall<ResetArgs>(
  { region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (req) => {
    const email = (req.data?.email ?? '').trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      throw new HttpsError('invalid-argument', 'A valid email is required.')
    }

    let link: string
    try {
      // Generates the same action link Firebase would email, pointed at the
      // project's configured action handler (the app's ResetPasswordView).
      link = await getAuth().generatePasswordResetLink(email)
    } catch (err: any) {
      // No account for this address (or auth is briefly unavailable): say
      // nothing about it — respond as if we sent the email.
      if (err?.code === 'auth/user-not-found') {
        logger.info('[MainWRLD] password reset for unknown email (no-op)')
        return { success: true }
      }
      logger.error('[MainWRLD] generatePasswordResetLink failed', { err })
      // Still don't reveal internal state to the caller.
      return { success: true }
    }

    const html = emailLayout({
      preheader: 'Reset your MainWRLD password — this link expires soon.',
      heading: 'Reset your password',
      bodyHtml: `
        <p style="margin:0 0 14px">We got a request to reset the password for
          your MainWRLD account.</p>
        <p style="margin:0">Tap the button below to choose a new password. For
          your security, this link expires after a short while.</p>
      `,
      cta: { label: 'Reset password', url: link },
      footnote:
        "Didn't request this? You can safely ignore this email — your password won't change.",
    })

    const result = await sendEmail(email, 'Reset your MainWRLD password', html)
    if (!result.ok) {
      logger.error('[MainWRLD] password reset email failed', { ...result })
      throw new HttpsError('internal', 'Failed to send the reset email.')
    }
    return { success: true }
  }
)
