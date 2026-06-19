import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import Stripe from 'stripe'

// MainWRLD Stripe webhook handler.
//
// Closes the trust hole in the previous flow where the client read
// ?points_success=true from the redirect URL and credited points
// itself — that broke if the user closed the tab before redirect, and
// nothing prevented a forged URL. Stripe now POSTs every
// checkout.session.completed to this endpoint; we verify the signature,
// dedupe by event.id, and credit the user inside a Firestore
// transaction. Mirror of verifyAppleReceipt.ts (Apple IAP).
//
// Required Firebase secrets — set them once before deploy:
//
//   firebase functions:secrets:set STRIPE_LIVE_WEBHOOK_SECRET
//   firebase functions:secrets:set STRIPE_TEST_WEBHOOK_SECRET
//
// Webhook secrets come from Stripe Dashboard → Developers → Webhooks →
// (your endpoint) → Reveal signing secret. Register TWO endpoints in
// Stripe pointing to the same Cloud Function URL: one in test mode,
// one in live mode, each with its own signing secret. The function
// tries both secrets on each request — whichever verifies wins, and
// event.livemode tells us which mode it was. No Stripe API key is
// needed: webhooks.constructEvent is a pure HMAC check that ignores
// the API key passed to the Stripe constructor.

const STRIPE_LIVE_WEBHOOK_SECRET = defineSecret('STRIPE_LIVE_WEBHOOK_SECRET')
const STRIPE_TEST_WEBHOOK_SECRET = defineSecret('STRIPE_TEST_WEBHOOK_SECRET')

// Must match metadata.sku set on each Stripe Price / Payment Link.
// (Created via stripe products create + stripe prices create with
// -d "metadata[sku]=points_100" etc.)
const POINTS_BY_SKU: Record<string, number> = {
  points_100: 100,
  points_300: 300,
  points_500: 500,
  points_1000: 1000,
}

const PREMIUM_SKUS = new Set(['premium_yearly'])

// Coupon shop. Maps the Stripe sku to the coupon's USD face value; buying
// one appends a Coupon {id,value,used} to the user's `coupons` array (same
// shape the spin wheel grants). Keep in sync with COUPON_PRODUCTS in
// src/config/config.ts and verifyAppleReceipt's COUPON_BY_PRODUCT.
const COUPON_VALUE_BY_SKU: Record<string, number> = {
  coupon_100: 1,
  coupon_300: 3,
  coupon_500: 5,
  coupon_1000: 10,
}

export const stripeWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: [STRIPE_LIVE_WEBHOOK_SECRET, STRIPE_TEST_WEBHOOK_SECRET],
  },
  async (req, res) => {
    const sig = req.headers['stripe-signature']
    if (!sig || typeof sig !== 'string') {
      res.status(400).send('Missing stripe-signature header')
      return
    }

    // Stripe(apiKey) requires a string but webhooks.constructEvent is
    // pure HMAC over (rawBody, sig, secret) — it never touches the key.
    const stripe = new Stripe('sk_dummy_unused_for_webhook_only')

    // Try live secret first, then test. Stripe webhook signing secrets
    // differ per mode; whichever passes wins. event.livemode then tells
    // us which mode the event came from.
    let event: Stripe.Event | null = null
    let detectedMode: 'live' | 'test' = 'live'
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_LIVE_WEBHOOK_SECRET.value()
      )
    } catch {
      try {
        event = stripe.webhooks.constructEvent(
          req.rawBody,
          sig,
          STRIPE_TEST_WEBHOOK_SECRET.value()
        )
        detectedMode = 'test'
      } catch (err) {
        logger.warn('Webhook signature verification failed', { err })
        res.status(400).send('Signature verification failed')
        return
      }
    }
    if (!event) {
      res.status(400).send('Could not parse event')
      return
    }

    // ---- Connect: account.updated keeps the payout mirror in sync (F02) ----
    // Enable "Listen to events on Connected accounts" on the same webhook
    // endpoint so these arrive signed with the existing secret. We read the
    // account state straight off the event payload (no API call needed).
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account
      const db = getFirestore()
      let uid = account.metadata?.uid as string | undefined
      if (!uid) {
        const q = await db
          .collection('users')
          .where('stripeAccountId', '==', account.id)
          .limit(1)
          .get()
        if (!q.empty) uid = q.docs[0].id
      }
      if (!uid) {
        res.status(200).send('skipped: account has no linked user')
        return
      }
      const eventRef = db.collection('stripeEvents').doc(event.id)
      const userRef = db.collection('users').doc(uid)
      try {
        await db.runTransaction(async (t) => {
          const existing = await t.get(eventRef)
          if (existing.exists) return
          t.set(
            userRef,
            {
              payoutsEnabled: !!account.payouts_enabled,
              chargesEnabled: !!account.charges_enabled,
              detailsSubmitted: !!account.details_submitted,
              stripeAccountUpdatedAt: Date.now(),
            },
            { merge: true }
          )
          t.set(eventRef, {
            uid,
            eventType: 'account.updated',
            accountId: account.id,
            livemode: event!.livemode,
            processedAt: FieldValue.serverTimestamp(),
          })
        })
        res.status(200).send('ok')
      } catch (err) {
        logger.error('account.updated processing failed', { err, eventId: event.id })
        res.status(500).send('processing error')
      }
      return
    }

    if (event.type !== 'checkout.session.completed') {
      logger.info('Skipping unhandled Stripe event', {
        type: event.type,
        id: event.id,
      })
      res.status(200).send('skipped: unhandled type')
      return
    }

    const session = event.data.object as Stripe.Checkout.Session
    const uid = session.client_reference_id
    const sku = session.metadata?.sku
    if (!uid) {
      logger.warn('Stripe session missing client_reference_id', {
        sessionId: session.id,
        detectedMode,
      })
      res.status(200).send('skipped: missing client_reference_id')
      return
    }

    // ---- Book purchase (Stripe Connect destination charge, F02) ----
    // Branches BEFORE the points/premium/coupon SKU map: a book purchase has
    // metadata.kind='book_purchase' and no `sku`. Grants the buyer permanent
    // ownership and writes the bookPurchases audit row, idempotently.
    if (session.metadata?.kind === 'book_purchase') {
      const bookId = session.metadata.bookId
      const sellerUid = session.metadata.sellerUid || null
      const paymentIntentId =
        (typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id) || session.id
      const amountTotal = session.amount_total ?? 0
      if (!bookId) {
        res.status(200).send('skipped: book_purchase missing bookId')
        return
      }
      const db = getFirestore()
      const eventRef = db.collection('stripeEvents').doc(event.id)
      const purchaseRef = db.collection('bookPurchases').doc(paymentIntentId)
      const userRef = db.collection('users').doc(uid)
      try {
        await db.runTransaction(async (t) => {
          const existing = await t.get(eventRef)
          if (existing.exists) {
            logger.info('book_purchase replay no-op', { eventId: event!.id })
            return
          }
          const platformFee = Math.round(amountTotal * 0.2)
          // Permanent ownership: both arrays (purchasedBookIds is never removed).
          t.update(userRef, {
            ownedBookIds: FieldValue.arrayUnion(bookId),
            purchasedBookIds: FieldValue.arrayUnion(bookId),
          })
          t.set(purchaseRef, {
            buyerUid: uid,
            sellerUid,
            bookId,
            rail: 'cash',
            priceUsd: amountTotal / 100,
            platformFeeUsd: platformFee / 100,
            sellerNetUsd: (amountTotal - platformFee) / 100,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            livemode: event!.livemode,
            createdAt: FieldValue.serverTimestamp(),
          })
          t.set(eventRef, {
            uid,
            eventType: 'book_purchase',
            bookId,
            sellerUid,
            sessionId: session.id,
            paymentIntentId,
            livemode: event!.livemode,
            processedAt: FieldValue.serverTimestamp(),
          })
        })
        logger.info('Book purchase granted', { uid, bookId, eventId: event.id })
        res.status(200).send('ok')
      } catch (err) {
        logger.error('Failed to grant book purchase', {
          err,
          eventId: event.id,
          sessionId: session.id,
          uid,
        })
        res.status(500).send('processing error')
      }
      return
    }

    if (!sku) {
      logger.warn('Stripe session missing metadata.sku', {
        sessionId: session.id,
        detectedMode,
      })
      res.status(200).send('skipped: missing metadata.sku')
      return
    }

    const points = POINTS_BY_SKU[sku] ?? 0
    const isPremium = PREMIUM_SKUS.has(sku)
    const couponValue = COUPON_VALUE_BY_SKU[sku] ?? 0
    if (!points && !isPremium && !couponValue) {
      logger.warn('Unknown Stripe sku — no credit applied', {
        sku,
        sessionId: session.id,
      })
      res.status(200).send('skipped: unknown sku')
      return
    }

    const db = getFirestore()
    const eventRef = db.collection('stripeEvents').doc(event.id)
    const userRef = db.collection('users').doc(uid)

    try {
      await db.runTransaction(async (t) => {
        const existing = await t.get(eventRef)
        if (existing.exists) {
          // Stripe retries failed deliveries with the same event.id;
          // we credit at most once per event.
          logger.info('Event already processed — replay no-op', {
            eventId: event!.id,
          })
          return
        }
        const userSnap = await t.get(userRef)
        if (!userSnap.exists) {
          throw new Error(
            `User ${uid} not found for Stripe session ${session.id}`
          )
        }

        if (points) {
          t.update(userRef, { points: FieldValue.increment(points) })
        }
        if (isPremium) {
          t.update(userRef, {
            isPremium: true,
            premiumSince: new Date().toISOString(),
            membershipStartDate: Date.now(),
          })
        }
        if (couponValue) {
          // Same shape the spin wheel produces. The whole block runs at
          // most once (guarded by the stripeEvents/event.id doc above), so
          // arrayUnion never double-grants; the sessionId keeps the id
          // unique and stable on a Stripe redelivery.
          t.update(userRef, {
            coupons: FieldValue.arrayUnion({
              id: `buy_${session.id}`,
              value: couponValue,
              used: false,
            }),
          })
        }
        t.set(eventRef, {
          uid,
          sku,
          sessionId: session.id,
          livemode: event!.livemode,
          pointsAdded: points,
          isPremium,
          couponValue,
          processedAt: FieldValue.serverTimestamp(),
        })
      })
      logger.info('Stripe credit applied', {
        uid,
        sku,
        points,
        isPremium,
        couponValue,
        eventId: event.id,
        livemode: event.livemode,
      })
      res.status(200).send('ok')
    } catch (err) {
      logger.error('Failed to apply Stripe credit', {
        err,
        eventId: event.id,
        sessionId: session.id,
        uid,
      })
      // Return 500 so Stripe retries the delivery.
      res.status(500).send('processing error')
    }
  }
)
