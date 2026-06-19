import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import {
  getFirestore,
  FieldValue,
  type DocumentReference,
} from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import Stripe from 'stripe'

// MainWRLD Stripe Connect + monetization callables (Phase 2 / F02 + F03).
//
// Two real-money flows the client drives through these callables:
//   • Seller payouts — Express onboarding (bank + KYC + tax form, all held by
//     Stripe), account-status sync, balance, dashboard login link.
//   • Reader cash checkout — a destination charge that automatically splits
//     80% to the seller's connected account / 20% MainWRLD application fee.
// Plus the request lifecycle (submit / admin review) and the in-app POINTS
// purchase rail (pays the author 80% in points, no cash leaves the economy).
//
// Required secrets (set both before deploy — see docs/features/F02 §7):
//   firebase functions:secrets:set STRIPE_SECRET_KEY        # live mode key
//   firebase functions:secrets:set STRIPE_TEST_SECRET_KEY   # test mode key
// The client passes mode ('live' in prod builds, 'test' in dev) so we pick the
// matching key — exactly the test/live split already used for the Payment Links.

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_TEST_SECRET_KEY = defineSecret('STRIPE_TEST_SECRET_KEY')

const REGION = 'us-central1'
const PLATFORM_FEE_RATE = 0.2
const DEFAULT_ORIGIN = 'https://mainwrld-f7acf.web.app'

// ---- price-tier table (duplicated from src/config/constants.ts because the
// functions package can't import from src/) ----
const PRICE_TIERS = [9.99, 14.99, 19.99, 24.99, 29.99]
function allowedPriceTiers(chaptersCount: number): number[] {
  if (chaptersCount >= 25) return PRICE_TIERS.slice(0, 5)
  if (chaptersCount >= 20) return PRICE_TIERS.slice(0, 4)
  if (chaptersCount >= 12) return PRICE_TIERS.slice(0, 3)
  if (chaptersCount >= 8) return PRICE_TIERS.slice(0, 2)
  if (chaptersCount >= 5) return PRICE_TIERS.slice(0, 1)
  return []
}
function minLikesPerPublishedChapter(book: any): number {
  const count = (book?.chaptersCount as number) || 0
  if (count <= 0) return 0
  const arr: number[] = Array.isArray(book?.likes)
    ? book.likes
    : [typeof book?.likes === 'number' ? book.likes : 0]
  const published: number[] = []
  for (let i = 0; i < count; i++) published.push(arr[i] || 0)
  return published.length ? Math.min(...published) : 0
}
function canMonetize(book: any): boolean {
  return !book?.permanentlyDemonetized && !book?.wasMonetizedBefore
}

// ---- helpers ----

function stripeFor(mode: unknown): Stripe {
  const key =
    mode === 'live' ? STRIPE_SECRET_KEY.value() : STRIPE_TEST_SECRET_KEY.value()
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe is not configured. Set STRIPE_SECRET_KEY / STRIPE_TEST_SECRET_KEY.'
    )
  }
  return new Stripe(key)
}

// Only accept an http(s) origin from the client; otherwise fall back to the
// canonical hosting origin so Stripe always gets a valid return/success URL.
function safeOrigin(origin: unknown): string {
  if (typeof origin === 'string' && /^https?:\/\/[^\s]+$/.test(origin)) {
    return origin.replace(/\/+$/, '')
  }
  return DEFAULT_ORIGIN
}

// Books are stored one doc per book keyed by an internal `id` field
// (createBook writes id = doc id, but updateBook queries the field defensively,
// so we mirror that here).
async function findBookByIdField(
  db: FirebaseFirestore.Firestore,
  bookId: string
): Promise<{ ref: DocumentReference; data: any } | null> {
  const snap = await db
    .collection('books')
    .where('id', '==', bookId)
    .limit(1)
    .get()
  if (snap.empty) return null
  return { ref: snap.docs[0].ref, data: snap.docs[0].data() }
}

const usd = (cents: number) => Math.round(cents) / 100

// ============================================================
// 1. Seller onboarding & payouts
// ============================================================

interface AccountStatus {
  stripeAccountId?: string
  payoutsEnabled: boolean
  chargesEnabled: boolean
  detailsSubmitted: boolean
}

export const createStripeAccountLink = onCall<
  { mode?: string; origin?: string },
  Promise<{ url: string }>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
    const uid = req.auth.uid
    const stripe = stripeFor(req.data?.mode)
    const origin = safeOrigin(req.data?.origin)
    const db = getFirestore()
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (!userSnap.exists) throw new HttpsError('not-found', 'User profile missing.')
    const data = userSnap.data() as any

    let accountId: string | undefined = data.stripeAccountId
    if (!accountId) {
      // Express onboarding collects bank info + identity (KYC) + the tax form
      // (W-9 / 1099 setup) — Stripe holds all of it; MainWRLD never sees it.
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: data.email || req.auth.token.email || undefined,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        metadata: { uid },
      })
      accountId = account.id
      await userRef.set({ stripeAccountId: accountId }, { merge: true })
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: `${origin}/?connect_return=true`,
      refresh_url: `${origin}/?connect_refresh=true`,
    })
    return { url: link.url }
  }
)

export const syncStripeAccountStatus = onCall<
  { mode?: string },
  Promise<AccountStatus>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
    const uid = req.auth.uid
    const db = getFirestore()
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    const data = userSnap.exists ? (userSnap.data() as any) : {}
    const accountId: string | undefined = data.stripeAccountId
    if (!accountId) {
      return {
        payoutsEnabled: false,
        chargesEnabled: false,
        detailsSubmitted: false,
      }
    }
    const stripe = stripeFor(req.data?.mode)
    const account = await stripe.accounts.retrieve(accountId)
    const status: AccountStatus = {
      stripeAccountId: accountId,
      payoutsEnabled: !!account.payouts_enabled,
      chargesEnabled: !!account.charges_enabled,
      detailsSubmitted: !!account.details_submitted,
    }
    await userRef.set(
      {
        payoutsEnabled: status.payoutsEnabled,
        chargesEnabled: status.chargesEnabled,
        detailsSubmitted: status.detailsSubmitted,
        stripeAccountUpdatedAt: Date.now(),
      },
      { merge: true }
    )
    return status
  }
)

export const createStripeDashboardLink = onCall<
  { mode?: string },
  Promise<{ url: string }>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
    const db = getFirestore()
    const userSnap = await db.collection('users').doc(req.auth.uid).get()
    const accountId = (userSnap.data() as any)?.stripeAccountId
    if (!accountId) {
      throw new HttpsError('failed-precondition', 'No connected payout account.')
    }
    const stripe = stripeFor(req.data?.mode)
    const link = await stripe.accounts.createLoginLink(accountId)
    return { url: link.url }
  }
)

export const getSellerBalance = onCall<
  { mode?: string },
  Promise<{ availableUsd: number; pendingUsd: number }>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
    const db = getFirestore()
    const userSnap = await db.collection('users').doc(req.auth.uid).get()
    const accountId = (userSnap.data() as any)?.stripeAccountId
    if (!accountId) return { availableUsd: 0, pendingUsd: 0 }
    const stripe = stripeFor(req.data?.mode)
    // The connected account is targeted via the Stripe-Account request header
    // (second arg), not a body param.
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId })
    const sumUsd = (entries: Array<{ amount: number; currency: string }>) =>
      usd(
        entries
          .filter((e) => e.currency === 'usd')
          .reduce((acc, e) => acc + e.amount, 0)
      )
    return {
      availableUsd: sumUsd(balance.available || []),
      pendingUsd: sumUsd(balance.pending || []),
    }
  }
)

// ============================================================
// 2. Monetization request lifecycle
// ============================================================

export const submitMonetizationRequest = onCall<
  { bookId: string; priceUsd: number },
  Promise<{ ok: boolean }>
>({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const uid = req.auth.uid
  const { bookId, priceUsd } = req.data || ({} as any)
  if (!bookId || typeof priceUsd !== 'number') {
    throw new HttpsError('invalid-argument', 'bookId and priceUsd required.')
  }
  const db = getFirestore()
  const found = await findBookByIdField(db, bookId)
  if (!found) throw new HttpsError('not-found', 'Book not found.')
  const book = found.data
  if (book.authorUid !== uid) {
    throw new HttpsError('permission-denied', 'Not your book.')
  }

  // Re-verify eligibility server-side (the client UI gates too, but never trust
  // it). Mirrors MonetizationRequestView's eligibility memo.
  if (!book.isCompleted) {
    throw new HttpsError('failed-precondition', 'Book must be completed.')
  }
  if ((book.chaptersCount || 0) < 5) {
    throw new HttpsError('failed-precondition', 'Need at least 5 chapters.')
  }
  if (minLikesPerPublishedChapter(book) < 100) {
    throw new HttpsError('failed-precondition', 'Need 100+ likes per chapter.')
  }
  const published = new Date(book.publishedDate)
  const days = Math.ceil(
    Math.abs(Date.now() - published.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (days < 21) {
    throw new HttpsError('failed-precondition', 'Must be published 21+ days.')
  }
  if (!canMonetize(book)) {
    throw new HttpsError('failed-precondition', 'This book can’t be monetized again.')
  }
  if ((book.monetizationAttempts || 0) >= 2) {
    throw new HttpsError('failed-precondition', 'Maximum 2 attempts reached.')
  }
  if (book.monetizationStatus === 'pending') {
    throw new HttpsError('failed-precondition', 'A request is already pending.')
  }
  if (!allowedPriceTiers(book.chaptersCount || 0).includes(priceUsd)) {
    throw new HttpsError(
      'failed-precondition',
      'Price not allowed for this chapter count.'
    )
  }

  // Payout gate: a connected, payout-enabled account is required (the "one
  // more step" popup). The mirror booleans are written only by Cloud
  // Functions, so they're trustworthy.
  const userSnap = await db.collection('users').doc(uid).get()
  const userData = (userSnap.data() as any) || {}
  if (userData.payoutsEnabled !== true || !userData.stripeAccountId) {
    throw new HttpsError(
      'failed-precondition',
      'Set up your payout account first (payouts not enabled).'
    )
  }

  await found.ref.update({
    monetizationStatus: 'pending',
    requestedPrice: priceUsd,
    monetizationRequestedAt: new Date().toISOString(),
    monetizationAttempts: (book.monetizationAttempts || 0) + 1,
    sellerUid: uid,
    sellerStripeAccountId: userData.stripeAccountId,
    monetizationDenialReason: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  logger.info('submitMonetizationRequest', { uid, bookId, priceUsd })
  return { ok: true }
})

export const reviewMonetization = onCall<
  { bookId: string; decision: 'approve' | 'deny'; reason?: string },
  Promise<{ ok: boolean }>
>({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  if (req.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admins only.')
  }
  const adminUsername = (req.auth.token.username as string) || 'admin'
  const { bookId, decision, reason } = req.data || ({} as any)
  if (!bookId || (decision !== 'approve' && decision !== 'deny')) {
    throw new HttpsError('invalid-argument', 'bookId and decision required.')
  }
  const db = getFirestore()
  const found = await findBookByIdField(db, bookId)
  if (!found) throw new HttpsError('not-found', 'Book not found.')
  const book = found.data
  const nowIso = new Date().toISOString()

  if (decision === 'approve') {
    const price = book.requestedPrice
    if (typeof price !== 'number' || price <= 0) {
      throw new HttpsError('failed-precondition', 'No requested price on this book.')
    }
    if (!allowedPriceTiers(book.chaptersCount || 0).includes(price)) {
      throw new HttpsError(
        'failed-precondition',
        'Requested price no longer valid for the chapter count.'
      )
    }
    if (!book.sellerStripeAccountId) {
      throw new HttpsError(
        'failed-precondition',
        'Seller has no connected payout account.'
      )
    }
    await found.ref.update({
      monetizationStatus: 'approved',
      isMonetized: true,
      isFree: false,
      price,
      monetizationReviewedAt: nowIso,
      monetizationReviewedBy: adminUsername,
      updatedAt: FieldValue.serverTimestamp(),
    })
    logger.info('reviewMonetization: approved', { bookId, price, by: adminUsername })
    return { ok: true }
  }

  // deny — reason required; leave monetization state untouched (still unsold).
  const trimmed = String(reason || '').trim()
  if (!trimmed) {
    throw new HttpsError('invalid-argument', 'A denial reason is required.')
  }
  await found.ref.update({
    monetizationStatus: 'denied',
    monetizationDenialReason: trimmed,
    monetizationReviewedAt: nowIso,
    monetizationReviewedBy: adminUsername,
    updatedAt: FieldValue.serverTimestamp(),
  })
  logger.info('reviewMonetization: denied', { bookId, by: adminUsername })
  return { ok: true }
})

// ============================================================
// 3. Reader cash checkout (web) — 80/20 destination charge
// ============================================================

export const createBookCheckoutSession = onCall<
  { bookId: string; mode?: string; origin?: string },
  Promise<{ url: string }>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
    const buyerUid = req.auth.uid
    const { bookId } = req.data || ({} as any)
    if (!bookId) throw new HttpsError('invalid-argument', 'bookId required.')
    const db = getFirestore()
    const found = await findBookByIdField(db, bookId)
    if (!found) throw new HttpsError('not-found', 'Book not found.')
    const book = found.data
    if (!book.isMonetized || book.isFree) {
      throw new HttpsError('failed-precondition', 'Book is not for sale.')
    }
    const sellerUid = book.sellerUid || book.authorUid
    const destination = book.sellerStripeAccountId
    if (!destination) {
      throw new HttpsError('failed-precondition', 'Seller payout account missing.')
    }
    if (sellerUid === buyerUid) {
      throw new HttpsError('failed-precondition', 'You can’t buy your own book.')
    }
    // Already owns it? (purchasedBookIds is permanent.)
    const buyerSnap = await db.collection('users').doc(buyerUid).get()
    const purchased: string[] = (buyerSnap.data() as any)?.purchasedBookIds || []
    if (purchased.includes(bookId)) {
      throw new HttpsError('already-exists', 'You already own this book.')
    }

    const stripe = stripeFor(req.data?.mode)
    const origin = safeOrigin(req.data?.origin)
    const unitAmount = Math.round((book.price || 9.99) * 100)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: book.title || 'MainWRLD book' },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: Math.round(unitAmount * PLATFORM_FEE_RATE),
        transfer_data: { destination },
      },
      client_reference_id: buyerUid,
      metadata: { bookId, sellerUid, buyerUid, kind: 'book_purchase' },
      success_url: `${origin}/?book_purchase_success=true&bookId=${encodeURIComponent(
        bookId
      )}`,
      cancel_url: `${origin}/?payment_cancelled=true`,
    })
    if (!session.url) {
      throw new HttpsError('internal', 'Stripe did not return a checkout URL.')
    }
    return { url: session.url }
  }
)

// ============================================================
// 4. Reader points checkout — author earns 80% in points
// ============================================================

export const purchaseBooksWithPoints = onCall<
  { bookIds: string[]; couponId?: string },
  Promise<{
    points: number
    ownedBookIds: string[]
    purchasedBookIds: string[]
    coupons: Array<{ id: string; value: number; used: boolean }>
  }>
>({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const buyerUid = req.auth.uid
  const bookIds: string[] = Array.isArray(req.data?.bookIds) ? req.data.bookIds : []
  const couponId: string | undefined = req.data?.couponId
  if (bookIds.length === 0) {
    throw new HttpsError('invalid-argument', 'No books to purchase.')
  }
  const db = getFirestore()

  // Pre-fetch the book docs (transactions can't run queries). doc id == id
  // field for createBook books, but query defensively to match updateBook.
  const found = await Promise.all(bookIds.map((id) => findBookByIdField(db, id)))
  const books = found.map((f, i) => {
    if (!f) throw new HttpsError('not-found', `Book ${bookIds[i]} not found.`)
    return f
  })

  const buyerRef = db.collection('users').doc(buyerUid)

  const result = await db.runTransaction(async (t) => {
    const buyerSnap = await t.get(buyerRef)
    if (!buyerSnap.exists) throw new HttpsError('not-found', 'User profile missing.')
    const buyer = buyerSnap.data() as any
    const owned: string[] = buyer.ownedBookIds || []
    const purchased: string[] = buyer.purchasedBookIds || []
    const coupons: Array<{ id: string; value: number; used: boolean }> =
      buyer.coupons || []

    // Only charge for monetized, non-free books the buyer doesn't already own.
    const toBuy = books.filter(
      (b) =>
        b.data.isMonetized &&
        !b.data.isFree &&
        b.data.authorUid !== buyerUid &&
        !purchased.includes(b.data.id)
    )
    // Free / already-owned books just get added to the library (no charge).

    const subtotal = toBuy.reduce(
      (acc, b) => acc + Math.round((b.data.price || 9.99) * 100),
      0
    )
    let discount = 0
    const coupon = couponId ? coupons.find((c) => c.id === couponId && !c.used) : undefined
    if (coupon) discount = (coupon.value || 0) * 100
    const total = Math.max(0, subtotal - discount)

    if ((buyer.points || 0) < total) {
      throw new HttpsError(
        'failed-precondition',
        'Not enough points for this purchase.'
      )
    }

    // Credit each author 80% of their book's points (the coupon discount is
    // funded by the platform, not deducted from the author's share).
    for (const b of toBuy) {
      const bookPoints = Math.round((b.data.price || 9.99) * 100)
      const authorShare = Math.round(bookPoints * (1 - PLATFORM_FEE_RATE))
      const authorUid = b.data.sellerUid || b.data.authorUid
      if (authorUid && authorUid !== buyerUid) {
        t.update(db.collection('users').doc(authorUid), {
          points: FieldValue.increment(authorShare),
        })
      }
      // Idempotent sale record (points rail).
      t.set(
        db.collection('bookPurchases').doc(`pts_${buyerUid}_${b.data.id}`),
        {
          buyerUid,
          sellerUid: authorUid || null,
          bookId: b.data.id,
          rail: 'points',
          priceUsd: b.data.price || 9.99,
          pointsPaid: bookPoints,
          sellerNetPoints: authorShare,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    // Grant permanent ownership for every book in the cart (incl. free ones).
    const allIds = books.map((b) => b.data.id)
    const newOwned = Array.from(new Set([...owned, ...allIds]))
    const newPurchased = Array.from(new Set([...purchased, ...allIds]))
    const newCoupons = coupon
      ? coupons.filter((c) => c.id !== coupon.id)
      : coupons
    const newPoints = (buyer.points || 0) - total

    t.update(buyerRef, {
      points: newPoints,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased,
      coupons: newCoupons,
    })

    return {
      points: newPoints,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased,
      coupons: newCoupons,
    }
  })

  logger.info('purchaseBooksWithPoints', {
    buyerUid,
    bookIds,
    points: result.points,
  })
  return result
})
