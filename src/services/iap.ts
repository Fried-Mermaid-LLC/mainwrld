import { Capacitor } from '@capacitor/core'

// MainWRLD In-App Purchases (Stage 3)
//
// Replaces the web Stripe Payment Link flow on iOS. On Capacitor's
// `web` platform the existing Stripe flow keeps working untouched
// (cart checkout via @stripe/stripe-js, see app/config.ts). On `ios`
// every paid path routes through Apple StoreKit via the
// cordova-plugin-purchase bridge.
//
// Apple App Review Guideline 3.1.1 forbids redirecting the user to
// an external payment processor for digital content consumed inside
// the app — exactly what `window.location.href = "https://buy.stripe.
// com/..."` does today. This module is the App Store-compliant
// replacement.

// Product IDs configured in App Store Connect → My App →
// In-App Purchases. The same identifier strings must be created there
// or `store.register(...)` will mark them invalid.
export const IAP_PRODUCTS = {
  points_100: { id: 'mainwrld.points_100', kind: 'consumable', points: 100 },
  points_300: { id: 'mainwrld.points_300', kind: 'consumable', points: 300 },
  points_500: { id: 'mainwrld.points_500', kind: 'consumable', points: 500 },
  points_1000: { id: 'mainwrld.points_1000', kind: 'consumable', points: 1000 },
  premium_yearly: { id: 'mainwrld.premium_yearly', kind: 'subscription' },
} as const

export type IapSku = keyof typeof IAP_PRODUCTS

export const isNativeIAPAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

// We lazy-load the cordova plugin so the web bundle never even loads
// the StoreKit shim. The plugin attaches itself as window.CdvPurchase
// once `import 'cordova-plugin-purchase'` is evaluated.
let storeReady: Promise<any> | null = null

const ensureStore = async (): Promise<any | null> => {
  if (!isNativeIAPAvailable()) return null
  if (storeReady) return storeReady
  storeReady = (async () => {
    // The plugin declares its API as a global namespace, not an ES
    // module, so the import is for side-effects only. Loading it on
    // web (Capacitor.getPlatform() === 'web') would also work — there
    // is no native bridge so calls become no-ops — but we still skip
    // it above to keep web bundle size down.
    await import('cordova-plugin-purchase' as any)
    const w = window as any
    const CdvPurchase = w.CdvPurchase
    if (!CdvPurchase) {
      console.error('[MainWRLD IAP] CdvPurchase missing after import')
      return null
    }
    const store = CdvPurchase.store
    const platform = CdvPurchase.Platform.APPLE_APPSTORE
    const types = CdvPurchase.ProductType

    // Register all products. Each iOS product must exist in App Store
    // Connect with a matching identifier before this resolves; otherwise
    // the store reports INVALID_PRODUCT_ID for that SKU and that SKU's
    // buy button shows an error at purchase time.
    store.register([
      { id: IAP_PRODUCTS.points_100.id, type: types.CONSUMABLE, platform },
      { id: IAP_PRODUCTS.points_300.id, type: types.CONSUMABLE, platform },
      { id: IAP_PRODUCTS.points_500.id, type: types.CONSUMABLE, platform },
      { id: IAP_PRODUCTS.points_1000.id, type: types.CONSUMABLE, platform },
      {
        id: IAP_PRODUCTS.premium_yearly.id,
        type: types.PAID_SUBSCRIPTION,
        platform,
      },
    ])

    // Verification handler is wired by the caller via `onApproved`.
    // Initialize must be called exactly once.
    await store.initialize([platform])
    return store
  })()
  return storeReady
}

export type ApprovedTransaction = {
  productId: string
  transactionId: string
  // Apple StoreKit raw receipt (base64). Sent to our Cloud Function
  // verifyAppleReceipt for App Store Server API validation.
  appStoreReceipt: string
}

// Caller-supplied callback that performs server-side verification +
// credit. Should resolve true if the transaction was credited (so the
// plugin can mark it finished) or false if it must be retried.
export type VerifyCallback = (tx: ApprovedTransaction) => Promise<boolean>

let registeredVerifyCallback: VerifyCallback | null = null

export const setVerifyCallback = async (cb: VerifyCallback) => {
  registeredVerifyCallback = cb
  const store = await ensureStore()
  if (!store) return
  // Avoid double-wiring on hot reload.
  if ((store as any).__mainwrldWired) return
  ;(store as any).__mainwrldWired = true
  const CdvPurchase = (window as any).CdvPurchase

  store.when().approved(async (tx: any) => {
    try {
      const productId: string = tx.products?.[0]?.id || ''
      // Apple receipt is on the appStoreReceipt field of the
      // verifyer-store; fall back to tx.transactionId-only payload if
      // unavailable so the function still runs and can fail fast.
      const receipt =
        store.localReceipts?.[0]?.nativeData?.appStoreReceipt ||
        tx.nativeData?.appStoreReceipt ||
        ''
      const credited = await registeredVerifyCallback?.({
        productId,
        transactionId: tx.transactionId,
        appStoreReceipt: receipt,
      })
      if (credited) {
        await tx.finish()
      } else {
        console.warn('[MainWRLD IAP] verification rejected for', productId)
      }
    } catch (err) {
      console.error('[MainWRLD IAP] approved handler failed:', err)
    }
  })

  store.error((err: any) => {
    if (err?.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return
    console.error('[MainWRLD IAP] store error:', err)
  })
}

// Trigger a purchase. Resolves once the user has dismissed the StoreKit
// sheet (success OR cancel). Actual credit happens asynchronously via
// the approved handler set in setVerifyCallback.
export const purchase = async (sku: IapSku): Promise<void> => {
  const store = await ensureStore()
  if (!store) {
    throw new Error('IAP is only available on iOS.')
  }
  const product = store.get(IAP_PRODUCTS[sku].id)
  if (!product) {
    throw new Error(`Product ${IAP_PRODUCTS[sku].id} is not available.`)
  }
  const offer = product.getOffer()
  if (!offer) {
    throw new Error(`No purchasable offer for ${IAP_PRODUCTS[sku].id}.`)
  }
  await store.order(offer)
}

// Apple requires a "Restore Purchases" entry point. Calls the plugin's
// restore method which re-fetches and re-emits any prior approved
// transactions through the approved handler.
export const restorePurchases = async (): Promise<void> => {
  const store = await ensureStore()
  if (!store) return
  await store.restorePurchases()
}

// Convenience: display price for a SKU in the user's locale. Returns
// null until the store has loaded product metadata.
export const getPrice = async (sku: IapSku): Promise<string | null> => {
  const store = await ensureStore()
  if (!store) return null
  const product = store.get(IAP_PRODUCTS[sku].id)
  return product?.pricing?.price ?? null
}
