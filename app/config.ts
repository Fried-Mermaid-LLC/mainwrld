export const BASE = import.meta.env.BASE_URL

// Stripe is used on the web. On iOS the equivalent flow will be Apple IAP
// (Stage 3), so the iOS bundle can ship with an empty STRIPE_PUBLISHABLE_KEY.
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''

declare const Stripe: any
export const getStripe = () => {
  if (!STRIPE_PUBLISHABLE_KEY) return null
  if (typeof Stripe !== 'undefined') {
    return Stripe(STRIPE_PUBLISHABLE_KEY)
  }
  return null
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'
export const RESEND_FROM_EMAIL = 'welcome@mainwrld.com'
export const RESEND_SUBJECT = 'Welcome to MainWRLD!'

export const sendWelcomeEmail = async (
  email: string,
  displayName: string,
  username: string
) => {
  try {
    const res = await fetch(`${API_BASE_URL}/send-welcome-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, username })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
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
