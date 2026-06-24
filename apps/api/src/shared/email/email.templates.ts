// Branded, email-client-safe (table-based, inline styles) MainWRLD layout +
// reusable transactional templates. Ported verbatim from functions/src/email.ts
// so the Stripe and Apple rails keep sending identical mail.

// Brand tokens (mirrors src/config/constants.ts ACCENT_COLOR + tailwind accent).
const ACCENT = '#eb6871';
const INK = '#2b1d17';
const MUTED = '#9b8579';
const CANVAS = '#f7efe8';
const CARD = '#ffffff';
const WORDMARK_URL = 'https://mainwrld.com/wordlogo.png';
const SITE_URL = 'https://mainwrld.com';

const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Escape arbitrary user-supplied text (display names, book titles, denial
// reasons) before interpolating it into email HTML.
export const escapeHtml = esc;

export interface EmailLayoutOptions {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

export function emailLayout(opts: EmailLayoutOptions): string {
  const { preheader, heading, bodyHtml, cta, footnote } = opts;
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS}">${esc(
        preheader,
      )}</div>`
    : '';
  const ctaBlock = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 4px">
         <tr><td style="border-radius:14px;background:${ACCENT}">
           <a href="${esc(cta.url)}"
              style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:14px">
             ${esc(cta.label)}
           </a>
         </td></tr>
       </table>`
    : '';
  const footnoteBlock = footnote
    ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED}">${footnote}</p>`
    : '';

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
          heading,
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
</html>`;
}

export interface BuiltEmail {
  subject: string;
  html: string;
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
  };
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
  };
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
  };
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
          bookTitle,
        )}"</strong> — it's now permanently yours and will stay in your
          library even if you remove it.</p>
        <p style="margin:0">Happy reading!</p>
      `,
      cta: { label: 'Start reading', url: SITE_URL },
    }),
  };
}

export function welcomeEmail(displayName: string, username: string): BuiltEmail {
  return {
    subject: `Welcome to MainWRLD, ${displayName}`,
    html: emailLayout({
      preheader: 'Your MainWRLD account is ready — jump in and start building.',
      heading: `Welcome to MainWRLD, ${esc(displayName)}!`,
      bodyHtml: `
        <p style="margin:0 0 14px">Hi ${esc(displayName)},</p>
        <p style="margin:0 0 14px">Your account is live and your username is
          <strong>@${esc(username)}</strong>.</p>
        <p style="margin:0">Read stories from creators everywhere, write your own,
          and build out your world. We're glad you're here.</p>
      `,
      cta: { label: 'Open MainWRLD', url: SITE_URL },
    }),
  };
}

// `link` is the Admin-SDK-minted reset action link (carries the oobCode the
// app's ResetPasswordView handles).
export function passwordResetEmail(link: string): BuiltEmail {
  return {
    subject: 'Reset your MainWRLD password',
    html: emailLayout({
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
    }),
  };
}

export function renewalReminderEmail(
  displayName: string,
  renewalDateLabel: string,
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
  };
}
