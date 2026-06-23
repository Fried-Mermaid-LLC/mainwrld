import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'

// Shared MainWRLD transactional-email module.
//
// Every customer-facing email (welcome, password reset, membership thank-you,
// purchase receipts, monetization accept/deny, renewal reminder) goes through
// sendEmail() so they share one Resend integration and one branded HTML layout.
//
// Set the Resend API key once before the first deploy (the value lives in
// .env.local for the web app — copy the same key here):
//   firebase functions:secrets:set RESEND_API_KEY
export const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

// Resend's shared sender works without domain verification. Once mainwrld.com
// is verified in Resend, the local part can become role-specific (welcome@,
// receipts@…) — keep the display name as "MainWRLD".
const FROM = 'MainWRLD <noreply@mainwrld.com>'

// Brand tokens (mirrors src/config/constants.ts ACCENT_COLOR + tailwind accent).
const ACCENT = '#eb6871'
const INK = '#2b1d17'
const MUTED = '#9b8579'
const CANVAS = '#f7efe8'
const CARD = '#ffffff'
const WORDMARK_URL = 'https://mainwrld-f7acf.web.app/wordlogo.png'
const SITE_URL = 'https://mainwrld-f7acf.web.app'

export interface EmailLayoutOptions {
  // Short summary shown in the inbox preview line (hidden in the body).
  preheader?: string
  // Big title at the top of the card.
  heading: string
  // Inner body HTML — typically a few <p>…</p> blocks.
  bodyHtml: string
  // Optional primary action button.
  cta?: { label: string; url: string }
  // Optional small print under the button (e.g. "didn't request this?").
  footnote?: string
}

const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Escape arbitrary user-supplied text (display names, book titles, denial
// reasons) before interpolating it into email HTML.
export const escapeHtml = esc

// Wraps body content in the shared, email-client-safe (table-based, inline
// styles) MainWRLD layout. Returns a full HTML document string.
export function emailLayout(opts: EmailLayoutOptions): string {
  const { preheader, heading, bodyHtml, cta, footnote } = opts
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS}">${esc(
        preheader
      )}</div>`
    : ''
  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px">
         <tr><td style="border-radius:14px;background:${ACCENT}">
           <a href="${esc(cta.url)}"
              style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px">
             ${esc(cta.label)}
           </a>
         </td></tr>
       </table>`
    : ''
  const footnoteBlock = footnote
    ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">${footnote}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS}">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td align="center" style="padding:0 0 24px">
        <a href="${SITE_URL}" style="text-decoration:none">
          <img src="${WORDMARK_URL}" alt="MainWRLD" width="160"
               style="display:block;border:0;outline:none;max-width:160px;height:auto">
        </a>
      </td></tr>
      <tr><td style="background:${CARD};border-radius:22px;padding:36px 36px 32px;box-shadow:0 8px 30px rgba(43,29,23,0.08)">
        <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${INK}">${esc(
    heading
  )}</h1>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${INK}">
          ${bodyHtml}
        </div>
        ${ctaBlock}
        ${footnoteBlock}
      </td></tr>
      <tr><td align="center" style="padding:24px 8px 0">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">
          You're receiving this because you have a MainWRLD account.<br>
          &copy; MainWRLD &middot; <a href="${SITE_URL}" style="color:${MUTED}">mainwrld.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export interface SendResult {
  ok: boolean
  status?: number
  error?: string
}

// Best-effort send via Resend. Never throws — returns {ok:false,…} on any
// failure so callers can decide whether a miss should block their flow
// (only the welcome callable does; everything else is fire-and-forget).
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<SendResult> {
  const key = RESEND_API_KEY.value()
  if (!key || !to) {
    logger.info('[MainWRLD] email skipped (no key/recipient)', { hasKey: !!key, hasTo: !!to })
    return { ok: false, error: 'missing key or recipient' }
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
      const detail = await res.text().catch(() => '')
      logger.warn('[MainWRLD] Resend non-2xx', { status: res.status, detail, subject })
      return { ok: false, status: res.status, error: detail }
    }
    logger.info('[MainWRLD] email sent', { to, subject })
    return { ok: true, status: res.status }
  } catch (err) {
    logger.error('[MainWRLD] email failed', { subject, err })
    return { ok: false, error: (err as Error)?.message }
  }
}

// Send via a Resend-hosted template (subject + HTML live in the Resend
// dashboard, not in this codebase). Same fail-soft contract as sendEmail().
export async function sendTemplateEmail(
  to: string,
  templateId: string,
  variables?: Record<string, string | number>
): Promise<SendResult> {
  const key = RESEND_API_KEY.value()
  if (!key || !to) {
    logger.info('[MainWRLD] template email skipped (no key/recipient)', {
      hasKey: !!key,
      hasTo: !!to,
    })
    return { ok: false, error: 'missing key or recipient' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: FROM,
        to,
        template: variables ? { id: templateId, variables } : { id: templateId },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      logger.warn('[MainWRLD] Resend template non-2xx', {
        status: res.status,
        detail,
        templateId,
      })
      return { ok: false, status: res.status, error: detail }
    }
    logger.info('[MainWRLD] template email sent', { to, templateId })
    return { ok: true, status: res.status }
  } catch (err) {
    logger.error('[MainWRLD] template email failed', { templateId, err })
    return { ok: false, error: (err as Error)?.message }
  }
}

// ============================================================
// Reusable templates (shared by Stripe + Apple purchase paths so the two
// rails send identical mail). Each returns { subject, html }.
// ============================================================

export interface BuiltEmail {
  subject: string
  html: string
}

export function membershipWelcomeEmail(displayName: string): BuiltEmail {
  return {
    subject: 'Thank you for becoming a MainWRLD+ member',
    html: emailLayout({
      preheader: 'Your MainWRLD+ membership is active. Here’s what you unlocked.',
      heading: 'Welcome to MainWRLD+',
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">Thank you for becoming a
          <strong>MainWRLD+</strong> member — your support keeps creators
          writing and the worlds growing.</p>
        <p style="margin:0">Your member perks are active on your account right
          now. Enjoy!</p>
      `,
      cta: { label: 'Open MainWRLD', url: SITE_URL },
    }),
  }
}

export function pointsPurchaseEmail(displayName: string, points: number): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD purchase',
    html: emailLayout({
      preheader: `${points} points have been added to your account.`,
      heading: 'Thanks for your purchase',
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">We've added <strong>${points} points</strong>
          to your MainWRLD account.</p>
        <p style="margin:0">Spend them on books, coupons, and more.</p>
      `,
      cta: { label: 'Go to MainWRLD', url: SITE_URL },
    }),
  }
}

export function couponPurchaseEmail(displayName: string, value: number): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD purchase',
    html: emailLayout({
      preheader: `Your $${value} coupon is ready to use.`,
      heading: 'Thanks for your purchase',
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">Your <strong>$${value} coupon</strong> has
          been added to your account.</p>
        <p style="margin:0">Apply it at checkout the next time you buy a book.</p>
      `,
      cta: { label: 'Go to MainWRLD', url: SITE_URL },
    }),
  }
}

export function bookPurchaseEmail(displayName: string, bookTitle: string): BuiltEmail {
  return {
    subject: 'Thanks for your MainWRLD book purchase',
    html: emailLayout({
      preheader: `"${bookTitle}" is now permanently in your library.`,
      heading: 'Thanks for your purchase',
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">You bought <strong>"${esc(
          bookTitle
        )}"</strong> — it's now permanently yours and will stay in your
          library even if you remove it.</p>
        <p style="margin:0">Happy reading!</p>
      `,
      cta: { label: 'Start reading', url: SITE_URL },
    }),
  }
}

export function renewalReminderEmail(
  displayName: string,
  renewalDateLabel: string
): BuiltEmail {
  return {
    subject: 'Your MainWRLD+ membership renews in 7 days',
    html: emailLayout({
      preheader: `Your membership renews on ${renewalDateLabel}.`,
      heading: 'Your membership renews soon',
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">This is a friendly reminder that your
          <strong>MainWRLD+</strong> membership will renew on
          <strong>${esc(renewalDateLabel)}</strong> — about 7 days from now.</p>
        <p style="margin:0">No action is needed to stay a member. If you'd like
          to make changes, you can manage your membership in Settings.</p>
      `,
      cta: { label: 'Manage membership', url: SITE_URL },
    }),
  }
}

// Resolve a user's email + display name from their Firestore profile, server-
// side. Never trust a client-supplied recipient — this keeps every email
// locked to the account owner's own address.
export async function userContact(
  db: FirebaseFirestore.Firestore,
  uid: string | undefined | null
): Promise<{ email: string | null; displayName: string; username: string }> {
  if (!uid) return { email: null, displayName: 'there', username: '' }
  try {
    const snap = await db.collection('users').doc(uid).get()
    const data = (snap.data() as any) || {}
    return {
      email: (data.email as string) || null,
      displayName: (data.displayName as string) || (data.username as string) || 'there',
      username: (data.username as string) || '',
    }
  } catch {
    return { email: null, displayName: 'there', username: '' }
  }
}
