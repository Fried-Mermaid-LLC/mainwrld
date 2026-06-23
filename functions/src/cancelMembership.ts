import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import Stripe from 'stripe'

// Cancel-membership (F06). Turns off auto-renew for the caller's MainWRLD+
// subscription. On the Stripe (web) rail we set cancel_at_period_end on the
// Stripe subscription, so the member keeps access until the paid period ends;
// the customer.subscription.updated webhook then mirrors premiumCancelAtPeriodEnd
// back onto the user doc. Apple (iOS) subscriptions can ONLY be cancelled by the
// user in the App Store — the client routes there instead and never calls this.
//
// Required secrets (already set for the other Stripe callables):
//   firebase functions:secrets:set STRIPE_SECRET_KEY        # live mode key
//   firebase functions:secrets:set STRIPE_TEST_SECRET_KEY   # test mode key

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_TEST_SECRET_KEY = defineSecret('STRIPE_TEST_SECRET_KEY')
const REGION = 'us-central1'

export const cancelMembership = onCall<
  { mode?: string },
  Promise<{ ok: boolean; cancelAtPeriodEnd: boolean }>
>(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_TEST_SECRET_KEY] },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to manage your membership.')
    }

    const db = getFirestore()
    const userRef = db.collection('users').doc(uid)
    const snap = await userRef.get()
    if (!snap.exists) throw new HttpsError('not-found', 'User not found.')
    const data = snap.data() as any

    if (data.isPremium !== true) {
      throw new HttpsError(
        'failed-precondition',
        'You do not have an active membership.'
      )
    }
    // Apple-managed subscriptions are cancelled in the App Store, not here.
    if (data.premiumProvider === 'apple') {
      throw new HttpsError(
        'failed-precondition',
        'Manage your Apple subscription from the App Store.'
      )
    }

    // Tell Stripe to stop auto-renewing; the member keeps access until the
    // current paid period ends. Best-effort — even if the Stripe call fails we
    // still record the cancel intent below (auto-renew off + reminder
    // suppressed); the subscription.updated webhook reconciles
    // premiumCancelAtPeriodEnd when it arrives.
    let cancelAtPeriodEnd = false
    const subId = data.stripeSubscriptionId as string | undefined
    if (subId) {
      try {
        const key =
          req.data?.mode === 'live'
            ? STRIPE_SECRET_KEY.value()
            : STRIPE_TEST_SECRET_KEY.value()
        if (key) {
          const stripe = new Stripe(key)
          const sub = await stripe.subscriptions.update(subId, {
            cancel_at_period_end: true,
          })
          cancelAtPeriodEnd = !!sub.cancel_at_period_end
        }
      } catch (err) {
        logger.error('cancelMembership: Stripe update failed', { err, uid })
      }
    }

    await userRef.set(
      {
        membershipAutoRenew: false,
        membershipCancelledAt: new Date().toISOString(),
        premiumCancelAtPeriodEnd: true,
      },
      { merge: true }
    )
    logger.info('Membership cancelled', {
      uid,
      cancelAtPeriodEnd,
      hadSubscription: !!subId,
    })
    return { ok: true, cancelAtPeriodEnd }
  }
)
