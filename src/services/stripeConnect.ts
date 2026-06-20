import { getFunctions, httpsCallable } from 'firebase/functions'
import * as iap from '@/services/iap'
import type { Coupon } from '@/types'

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
// Stripe runs in TEST mode in dev and LIVE in production. Vite sets
// import.meta.env.PROD true only for `vite build`, matching the test/live
// split already used for the Payment Links in src/config/config.ts. We pass
// the mode + browser origin to the function so it picks the right secret key
// and builds correct return/success URLs for whichever host we're on.
const MODE: 'live' | 'test' = import.meta.env.PROD ? 'live' : 'test'
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

// Cash purchase (web only). Returns a Stripe Checkout URL with the 80/20
// split baked in (application_fee_amount + transfer_data.destination). An
// optional in-app coupon is applied as a one-time Stripe discount.
export const createBookCheckout = async (
  bookId: string,
  couponId?: string
): Promise<{ url: string }> => {
  const fn = call<
    { bookId: string; mode: string; origin: string; couponId?: string },
    { url: string }
  >('createBookCheckoutSession')
  const res = await fn({ bookId, mode: MODE, origin: origin(), couponId })
  return res.data
}

// Points purchase (web + iOS). Atomic server transaction: deducts the buyer's
// points, credits each author 80% of their book's points, consumes the coupon,
// grants permanent ownership, and records the sale. Returns the authoritative
// post-purchase state so the client can adopt it (avoids forging / clobbering).
export const purchaseBooksWithPoints = async (
  bookIds: string[],
  couponId?: string
): Promise<{
  points: number
  ownedBookIds: string[]
  purchasedBookIds: string[]
  coupons: Coupon[]
}> => {
  const fn = call<
    { bookIds: string[]; couponId?: string },
    {
      points: number
      ownedBookIds: string[]
      purchasedBookIds: string[]
      coupons: Coupon[]
    }
  >('purchaseBooksWithPoints')
  const res = await fn({ bookIds, couponId })
  return res.data
}
