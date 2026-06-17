import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  ProductType,
} from '@apple/app-store-server-library'

// MainWRLD App Store receipt verification (Stage 3c).
//
// The client-side iap.ts (Stage 3a) calls this function after Apple
// approves a StoreKit transaction. Apple's signed-JWS transaction is
// fetched from the App Store Server API, decoded + cryptographically
// verified, and the user is credited inside a Firestore transaction.
// Each transactionId is recorded so a replay (or a legitimate restore)
// does not double-credit points.
//
// Required Firebase secrets — set them once before deploy:
//
//   firebase functions:secrets:set APPLE_ISSUER_ID
//   firebase functions:secrets:set APPLE_KEY_ID
//   firebase functions:secrets:set APPLE_BUNDLE_ID
//   firebase functions:secrets:set APPLE_PRIVATE_KEY
//   firebase functions:secrets:set APPLE_ENV          # "Sandbox" or "Production"
//
// Apple credentials come from App Store Connect → Users and Access →
// Integrations → In-App Purchase. The private key is the .p8 file
// contents (including BEGIN/END PRIVATE KEY lines). APPLE_BUNDLE_ID
// is the bundle ID, e.g. com.mochamattel.mainwrld once the placeholder
// is replaced.

const APPLE_ISSUER_ID = defineSecret('APPLE_ISSUER_ID')
const APPLE_KEY_ID = defineSecret('APPLE_KEY_ID')
const APPLE_BUNDLE_ID = defineSecret('APPLE_BUNDLE_ID')
const APPLE_PRIVATE_KEY = defineSecret('APPLE_PRIVATE_KEY')
const APPLE_ENV = defineSecret('APPLE_ENV')

// Maps the product IDs that we register in App Store Connect to the
// points credit they should grant. Must stay in sync with
// app/iap.ts IAP_PRODUCTS.
const POINTS_BY_PRODUCT: Record<string, number> = {
  'mainwrld.points_100': 100,
  'mainwrld.points_300': 300,
  'mainwrld.points_500': 500,
  'mainwrld.points_1000': 1000,
}

const PREMIUM_PRODUCT_IDS = new Set(['mainwrld.premium_yearly'])

// Coupon shop. Maps the Apple product id to the coupon's USD face value;
// buying one appends a Coupon {id,value,used} to the user's `coupons`
// array. Keep in sync with iap.ts IAP_PRODUCTS and the stripeWebhook map.
const COUPON_VALUE_BY_PRODUCT: Record<string, number> = {
  'mainwrld.coupon_100': 1,
  'mainwrld.coupon_300': 3,
  'mainwrld.coupon_500': 5,
  'mainwrld.coupon_1000': 10,
}

type VerifyArgs = {
  productId: string
  transactionId: string
  appStoreReceipt: string
}

type VerifyResult = {
  credited: boolean
  pointsAdded?: number
  isPremium?: boolean
  // The coupon granted by a coupon purchase, echoed back so the client can
  // drop it straight into local state (same object the server stored).
  couponAdded?: { id: string; value: number; used: boolean }
}

export const verifyAppleReceipt = onCall<VerifyArgs, Promise<VerifyResult>>(
  {
    region: 'us-central1',
    secrets: [
      APPLE_ISSUER_ID,
      APPLE_KEY_ID,
      APPLE_BUNDLE_ID,
      APPLE_PRIVATE_KEY,
      APPLE_ENV,
    ],
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const uid = req.auth.uid
    const { productId, transactionId } = req.data || ({} as VerifyArgs)
    if (!productId || !transactionId) {
      throw new HttpsError('invalid-argument', 'productId and transactionId required.')
    }

    const issuerId = APPLE_ISSUER_ID.value()
    const keyId = APPLE_KEY_ID.value()
    const bundleId = APPLE_BUNDLE_ID.value()
    const privateKey = APPLE_PRIVATE_KEY.value()
    const envRaw = APPLE_ENV.value() || 'Sandbox'
    if (!issuerId || !keyId || !bundleId || !privateKey) {
      throw new HttpsError(
        'failed-precondition',
        'Apple credentials are not configured.'
      )
    }
    const env =
      envRaw.toLowerCase() === 'production'
        ? Environment.PRODUCTION
        : Environment.SANDBOX

    // ---- 1. Fetch the signed transaction from Apple. ----
    const client = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      bundleId,
      env
    )
    let signedTx: string
    try {
      const info = await client.getTransactionInfo(transactionId)
      signedTx = info.signedTransactionInfo ?? ''
      if (!signedTx) {
        throw new HttpsError('not-found', 'Transaction not found at Apple.')
      }
    } catch (err) {
      logger.error('verifyAppleReceipt: getTransactionInfo failed', { uid, err })
      throw new HttpsError(
        'unavailable',
        'Could not reach Apple to verify the receipt.'
      )
    }

    // ---- 2. Verify the signature + decode. ----
    // The library needs Apple's root certificates (loaded internally)
    // plus our bundle/env to validate audience/issuer. The empty
    // appAppleId is fine for sandbox; production needs the numeric
    // App Apple ID — pull it from a secret if needed later.
    const verifier = new SignedDataVerifier(
      [],
      true,
      env,
      bundleId,
      undefined
    )
    let payload: any
    try {
      payload = await verifier.verifyAndDecodeTransaction(signedTx)
    } catch (err) {
      logger.error('verifyAppleReceipt: signature verification failed', { uid, err })
      throw new HttpsError('permission-denied', 'Receipt signature invalid.')
    }

    // ---- 3. Sanity checks. ----
    if (payload.transactionId !== transactionId) {
      throw new HttpsError('permission-denied', 'Transaction ID mismatch.')
    }
    if (payload.productId !== productId) {
      throw new HttpsError('permission-denied', 'Product ID mismatch.')
    }
    if (payload.bundleId && payload.bundleId !== bundleId) {
      throw new HttpsError('permission-denied', 'Bundle ID mismatch.')
    }
    // Subscriptions can expire — credit only if still active.
    if (payload.productType === ProductType.AUTO_RENEWABLE) {
      const exp = (payload.expiresDate as number | undefined) ?? 0
      if (exp > 0 && exp < Date.now()) {
        return { credited: false }
      }
    }

    // ---- 4. Idempotent credit. ----
    const db = getFirestore()
    const txRef = db.collection('iapTransactions').doc(transactionId)
    const userRef = db.collection('users').doc(uid)

    return db.runTransaction(async (t) => {
      const existing = await t.get(txRef)
      if (existing.exists) {
        // Already credited — treat restore as success without re-adding.
        return { credited: true, pointsAdded: 0 }
      }
      const userSnap = await t.get(userRef)
      if (!userSnap.exists) {
        throw new HttpsError('not-found', 'User profile missing.')
      }

      const points = POINTS_BY_PRODUCT[productId]
      const isPremiumProduct = PREMIUM_PRODUCT_IDS.has(productId)
      const couponValue = COUPON_VALUE_BY_PRODUCT[productId]
      const result: VerifyResult = { credited: true }

      if (points) {
        t.update(userRef, { points: FieldValue.increment(points) })
        result.pointsAdded = points
      }
      if (isPremiumProduct) {
        t.update(userRef, {
          isPremium: true,
          premiumSince: new Date().toISOString(),
          membershipStartDate: Date.now(),
        })
        result.isPremium = true
      }
      if (couponValue) {
        // Guarded by the iapTransactions/transactionId doc above, so a
        // replay/restore returns early and never re-grants the coupon.
        const coupon = {
          id: `buy_${transactionId}`,
          value: couponValue,
          used: false,
        }
        t.update(userRef, { coupons: FieldValue.arrayUnion(coupon) })
        result.couponAdded = coupon
      }
      t.set(txRef, {
        uid,
        productId,
        transactionId,
        pointsAdded: result.pointsAdded ?? 0,
        isPremium: !!isPremiumProduct,
        couponValue: couponValue ?? 0,
        createdAt: FieldValue.serverTimestamp(),
        env: envRaw,
      })
      logger.info('verifyAppleReceipt: credited', { uid, productId, transactionId, ...result })
      return result
    })
  }
)
