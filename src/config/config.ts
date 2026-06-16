import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { getFunctions, httpsCallable } from 'firebase/functions'

export const BASE = import.meta.env.BASE_URL

// Stripe is used on the web. On iOS the equivalent flow will be Apple IAP
// (Stage 3), so the iOS bundle can ship with an empty STRIPE_PUBLISHABLE_KEY.
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''

// loadStripe lazily fetches the SDK on first call and caches the Promise,
// so this won't trigger a network request unless the checkout path is used.
let stripePromise: Promise<Stripe | null> | null = null
export const getStripe = (): Promise<Stripe | null> => {
  if (!STRIPE_PUBLISHABLE_KEY) return Promise.resolve(null)
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)
  }
  return stripePromise
}

export const STRIPE_PRICE_IDS: Record<string, string> = {
  points_100: 'price_1SxGd02Urthc1FwfJ02cf6Sk',
  points_300: 'price_1SxGdI2Urthc1Fwfk1qYWoUs',
  points_500: 'price_1SxGdb2Urthc1Fwf7Bi8D5Pd',
  points_1000: 'price_1SxGdq2Urthc1FwfPCXOdLMJ'
}

export const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  points_100: 'https://buy.stripe.com/test_eVq14g1gU4qR2oQ6REdwc03',
  points_300: 'https://buy.stripe.com/test_9B6aEQe3G8H7gfGb7Udwc02',
  points_500: 'https://buy.stripe.com/test_28E9AMcZC9Lb1kM8ZMdwc00',
  points_1000: 'https://buy.stripe.com/test_3cI9AMcZC9Lb1kM8ZMdwc00'
}

export const STRIPE_PREMIUM_PAYMENT_LINK = 'https://buy.stripe.com/test_premium'
export const STRIPE_PREMIUM_PRICE_ID = ''
export const STRIPE_BOOK_PRICE_ID = ''

export const RESEND_FROM_EMAIL = 'welcome@mainwrld.com'
export const RESEND_SUBJECT = 'Welcome to MainWRLD!'

// Sends the post-signup welcome email via the `sendWelcomeEmail` callable
// Cloud Function (Resend lives server-side). Migrated off the old Express
// server (server.js) so it no longer needs a separately-hosted backend or
// VITE_API_BASE_URL. Best-effort: failures are logged, never thrown, so a
// mail hiccup never blocks sign-up. The recipient is taken from the caller's
// auth token server-side; `email` is sent only as a fallback.
export const sendWelcomeEmail = async (
  email: string,
  displayName: string,
  username: string
) => {
  try {
    const fn = httpsCallable<
      { email: string; displayName: string; username: string },
      { success: boolean }
    >(getFunctions(), 'sendWelcomeEmail')
    await fn({ email, displayName, username })
    console.log('[MainWRLD] Welcome email sent')
  } catch (err) {
    console.error('[MainWRLD] Welcome email failed:', err)
  }
}

export default {
  BASE,
  STRIPE_PUBLISHABLE_KEY,
  getStripe,
  STRIPE_PRICE_IDS,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_BOOK_PRICE_ID,
  RESEND_FROM_EMAIL,
  RESEND_SUBJECT,
  sendWelcomeEmail
}
