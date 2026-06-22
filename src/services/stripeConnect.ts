import { getFunctions, httpsCallable } from 'firebase/functions'
import * as iap from '@/services/iap'

// Opens a Stripe-hosted URL (onboarding / checkout / dashboard). On web we
// navigate the tab so Stripe can redirect back to our return/success URL. On
// iOS a full `window.location.href` to connect.stripe.com can break the
// Capacitor app shell, so we open it in an in-app browser instead and rely on
// the return_url + account.updated webhook to re-sync state when the user
// comes back. @capacitor/browser is imported lazily so it never bloats the web
// bundle.
export const openStripeUrl = async (url: string): Promise<void> => {
  if (iap.isNativeIAPAvailable()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }
  window.location.href = url
}

// Thin client wrappers around the monetization Cloud Functions
// (functions/src/stripeConnect.ts). Mirrors the httpsCallable pattern in
// firebaseService.ts (deleteCurrentAccount / verifyAppleReceipt).
//
// Stripe Connect mode is controlled EXPLICITLY by VITE_STRIPE_MODE, not by the
// build type. iOS bundles are always `vite build` (PROD=true), so tying mode to
// PROD forced the device into live mode and made test-mode testing impossible —
// onboarding (created in test) then mismatched the live checkout key ("No such
// destination … exists in test mode"). Default to TEST so testing is safe;
// set VITE_STRIPE_MODE=live in the production build env to go live. We pass the
// mode + browser origin to the function so it picks the matching secret key and
// builds correct return/success URLs for whichever host we're on.
const MODE: 'live' | 'test' =
  import.meta.env.VITE_STRIPE_MODE === 'live' ? 'live' : 'test'
const origin = () =>
  typeof window !== 'undefined' ? window.location.origin : ''

const call = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctions(), name)

export interface AccountStatus {
  stripeAccountId?: string
  payoutsEnabled: boolean
  chargesEnabled: boolean
  detailsSubmitted: boolean
}

// ---- Seller onboarding & payouts (F02) ----

// Creates (or reuses) the seller's Express account and returns a fresh
// Stripe-hosted onboarding link (bank details + identity/KYC + tax form).
export const createOnboardingLink = async (): Promise<{ url: string }> => {
  const fn = call<{ mode: string; origin: string }, { url: string }>(
    'createStripeAccountLink'
  )
  const res = await fn({ mode: MODE, origin: origin() })
  return res.data
}

// Pulls the live account state from Stripe and mirrors it onto the user doc.
export const getAccountStatus = async (): Promise<AccountStatus> => {
  const fn = call<{ mode: string }, AccountStatus>('syncStripeAccountStatus')
  const res = await fn({ mode: MODE })
  return res.data
}

// Express dashboard login link (Stripe owns the balance + withdraw UI).
export const getDashboardLink = async (): Promise<{ url: string }> => {
  const fn = call<{ mode: string }, { url: string }>(
    'createStripeDashboardLink'
  )
  const res = await fn({ mode: MODE })
  return res.data
}

// Available + pending balance (USD), read live from Stripe so it can't be forged.
export const getBalance = async (): Promise<{
  availableUsd: number
  pendingUsd: number
}> => {
  const fn = call<{ mode: string }, { availableUsd: number; pendingUsd: number }>(
    'getSellerBalance'
  )
  const res = await fn({ mode: MODE })
  return res.data
}

// ---- Monetization request lifecycle ----

// Submits a monetization request for a book the caller owns. Server re-checks
// eligibility, requires payouts to be enabled, validates the price tier, and
// stamps the seller identity onto the book. Throws failed-precondition with
// code 'payouts-required' (in message) when the payout account isn't ready.
export const submitMonetizationRequest = async (
  bookId: string,
  priceUsd: number
): Promise<{ ok: boolean }> => {
  const fn = call<{ bookId: string; priceUsd: number }, { ok: boolean }>(
    'submitMonetizationRequest'
  )
  const res = await fn({ bookId, priceUsd })
  return res.data
}

// Admin-only accept/deny. decision 'approve' monetizes at the requested price;
// 'deny' records the reason and leaves the book unmonetized.
export const reviewMonetization = async (
  bookId: string,
  decision: 'approve' | 'deny',
  reason?: string
): Promise<{ ok: boolean }> => {
  const fn = call<
    { bookId: string; decision: 'approve' | 'deny'; reason?: string },
    { ok: boolean }
  >('reviewMonetization')
  const res = await fn({ bookId, decision, reason })
  return res.data
}

// ---- Reader checkout ----

// Cash purchase — the ONLY way to buy a book (web + iOS). Returns a Stripe
// Checkout URL with the 80/20 split baked in (application_fee_amount +
// transfer_data.destination); an optional in-app coupon is applied as a
// one-time Stripe discount. On web the tab navigates to it; on iOS it opens in
// an in-app browser (openStripeUrl). Books are NOT purchasable with points.
export const createBookCheckout = async (
  bookId: string,
  couponId?: string
): Promise<{ url: string }> => {
  const fn = call<
    {
      bookId: string
      mode: string
      origin: string
      couponId?: string
      nativeReturn?: boolean
    },
    { url: string }
  >('createBookCheckoutSession')
  const res = await fn({
    bookId,
    mode: MODE,
    origin: origin(),
    couponId,
    // On iOS the return must deep-link back into the app (Variant B); the
    // server then points success/cancel at the mainwrld:// bounce page.
    nativeReturn: iap.isNativeIAPAvailable(),
  })
  return res.data
}
