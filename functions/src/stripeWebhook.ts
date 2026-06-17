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
    if (!points && !isPremium) {
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
        t.set(eventRef, {
          uid,
          sku,
          sessionId: session.id,
          livemode: event!.livemode,
          pointsAdded: points,
          isPremium,
          processedAt: FieldValue.serverTimestamp(),
        })
      })
      logger.info('Stripe credit applied', {
        uid,
        sku,
        points,
        isPremium,
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
