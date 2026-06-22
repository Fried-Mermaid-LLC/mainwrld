import { useEffect } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import * as fbService from '@/services/firebaseService'
import * as stripeConnect from '@/services/stripeConnect'
import * as iap from '@/services/iap'
import type { User, View, Coupon, BookProgress } from '@/types'

type UserBookDataMap = Record<
  string,
  {
    ownedBookIds: string[]
    purchasedBookIds?: string[]
    bookProgress: Record<string, BookProgress>
  }
>

interface PaymentsDeps {
  view: View
  user: User
  firebaseUid: string | null
  setUser: Dispatch<SetStateAction<User>>
  coupons: Coupon[]
  setCoupons: Dispatch<SetStateAction<Coupon[]>>
  showToast: (message: string, icon?: string) => void
  setUserBookData: Dispatch<SetStateAction<UserBookDataMap>>
  userBookDataRef: MutableRefObject<UserBookDataMap>
}

// Payments domain. The Stripe web flow's source of truth is the
// stripeWebhook Cloud Function: it verifies the Stripe signature,
// dedupes by event.id, and credits Firestore atomically. After the
// browser is redirected back with ?points_success / ?premium_success
// we no longer credit locally — a forged URL would otherwise grant
// free points. Instead we poll the user doc until the webhook lands
// (typically <2s) and copy the fresh values into local state. iOS
// IAP still routes through the onApproved → verifyAppleReceipt
// callable, unchanged.
export function usePayments({
  view,
  user,
  firebaseUid,
  setUser,
  coupons,
  setCoupons,
  showToast,
  setUserBookData,
  userBookDataRef,
}: PaymentsDeps) {
  useEffect(() => {
    if (
      view === 'splash' ||
      view === 'landing' ||
      view === 'login' ||
      view === 'signup'
    )
      return
    const urlParams = new URLSearchParams(window.location.search)
    const pointsRedirect = urlParams.get('points_success') === 'true'
    const premiumRedirect = urlParams.get('premium_success') === 'true'
    const couponRedirect = urlParams.get('coupon_success') === 'true'
    const cancelRedirect = urlParams.get('payment_cancelled') === 'true'
    // Stripe Connect onboarding return (F02) + cash book-purchase return.
    const connectReturn = urlParams.get('connect_return') === 'true'
    const connectRefresh = urlParams.get('connect_refresh') === 'true'
    const bookPurchaseSuccess = urlParams.get('book_purchase_success') === 'true'
    const purchasedBookId = urlParams.get('bookId')

    if (cancelRedirect) {
      showToast('Payment cancelled.', 'info')
      localStorage.removeItem('mainwrld_pending_points')
      localStorage.removeItem('mainwrld_pending_premium')
      localStorage.removeItem('mainwrld_pending_coupon')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    // Returned from Stripe Connect onboarding: re-sync the payout mirror and
    // copy the fresh booleans into local state so the monetize gate updates.
    if (connectReturn || connectRefresh) {
      window.history.replaceState({}, '', window.location.pathname)
      if (!firebaseUid) return
      ;(async () => {
        try {
          const s = await stripeConnect.getAccountStatus()
          setUser((prev) => ({
            ...prev,
            stripeAccountId: s.stripeAccountId ?? prev.stripeAccountId,
            payoutsEnabled: s.payoutsEnabled,
            chargesEnabled: s.chargesEnabled,
            detailsSubmitted: s.detailsSubmitted,
            stripeAccountUpdatedAt: Date.now(),
          }))
          showToast(
            s.payoutsEnabled
              ? 'Payouts enabled — you can now monetize.'
              : 'Setup incomplete — finish the remaining steps.',
            s.payoutsEnabled ? 'check_circle' : 'info'
          )
        } catch {
          showToast('Could not refresh payout status.', 'info')
        }
      })()
      return
    }

    // Returned from a cash book checkout: ownership is granted by the webhook,
    // so poll the user doc until the book lands, then adopt it locally.
    if (bookPurchaseSuccess) {
      window.history.replaceState({}, '', window.location.pathname)
      if (!firebaseUid) return
      showToast('Verifying purchase…', 'sync')
      ;(async () => {
        for (let i = 0; i < 8; i++) {
          const fresh = (await fbService
            .getUserProfile(firebaseUid)
            .catch(() => null)) as any
          const purchased: string[] = fresh?.purchasedBookIds || []
          if (purchasedBookId && purchased.includes(purchasedBookId)) {
            const owned: string[] = fresh?.ownedBookIds || []
            const username = user.username
            const current = userBookDataRef.current[username] || {
              ownedBookIds: [],
              bookProgress: {},
              purchasedBookIds: [],
            }
            const updated = {
              ...current,
              ownedBookIds: owned,
              purchasedBookIds: purchased,
            }
            userBookDataRef.current = {
              ...userBookDataRef.current,
              [username]: updated,
            }
            setUserBookData((prev) => ({ ...prev, [username]: updated }))
            showToast('Purchase complete — enjoy your book!', 'check_circle')
            return
          }
          await new Promise((r) => setTimeout(r, 1000))
        }
        showToast('Payment confirmed. Your book will appear shortly.', 'sync')
      })()
      return
    }

    if (!pointsRedirect && !premiumRedirect && !couponRedirect) return
    if (!firebaseUid) return

    localStorage.removeItem('mainwrld_pending_points')
    localStorage.removeItem('mainwrld_pending_premium')
    localStorage.removeItem('mainwrld_pending_coupon')
    window.history.replaceState({}, '', window.location.pathname)
    showToast('Verifying purchase…', 'sync')

    // Webhook usually lands before the user finishes redirecting, but
    // network variance can flip the order. Poll a few seconds before
    // giving up; if we miss it here, the next sign-in re-loads the
    // user doc and the credit shows up then.
    const startingPoints = user.points
    const startingPremium = user.isPremium
    const startingCouponCount = coupons.length
    ;(async () => {
      for (let i = 0; i < 6; i++) {
        const fresh = (await fbService
          .getUserProfile(firebaseUid)
          .catch(() => null)) as User | null
        if (fresh) {
          const freshCoupons =
            ((fresh as any).coupons as Coupon[] | undefined) || []
          const pointsCredited = (fresh.points || 0) > startingPoints
          const premiumCredited = !!fresh.isPremium && !startingPremium
          const couponCredited = freshCoupons.length > startingCouponCount
          if (
            (pointsRedirect && pointsCredited) ||
            (premiumRedirect && premiumCredited) ||
            (couponRedirect && couponCredited)
          ) {
            if (couponRedirect && couponCredited) {
              // Server owns the coupons array; adopt its copy so the next
              // debounced persist doesn't clobber the freshly bought coupon.
              setCoupons(freshCoupons)
            }
            setUser((prev) => ({
              ...prev,
              points: fresh.points ?? prev.points,
              isPremium: fresh.isPremium ?? prev.isPremium,
              premiumSince: fresh.premiumSince ?? prev.premiumSince,
              membershipStartDate:
                fresh.membershipStartDate ?? prev.membershipStartDate,
            }))
            showToast(
              couponRedirect
                ? 'Coupon added to your account!'
                : pointsRedirect
                ? `${(fresh.points || 0) - startingPoints} points added!`
                : 'Welcome to MainWRLD+!',
              couponRedirect
                ? 'confirmation_number'
                : pointsRedirect
                ? 'check_circle'
                : 'workspace_premium'
            )
            return
          }
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      showToast(
        'Stripe confirmed your purchase. The balance will update shortly.',
        'sync'
      )
    })()
    // user.points / user.isPremium intentionally absent from deps —
    // they change as the poll completes and we don't want to re-arm
    // the effect mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, firebaseUid])

  // IAP setup (Stage 3b). On iOS, wire the verify callback so any
  // approved StoreKit transaction is sent to verifyAppleReceipt and
  // we credit points / extend premium from the function's response.
  //
  // Gated on firebaseUid: wiring the callback runs ensureStore() →
  // store.initialize(), which makes StoreKit replay any unfinished
  // transactions through the approved handler. If we wired before auth
  // restored, verifyAppleReceipt would throw "Not authenticated" client
  // side (auth.currentUser still null), the transaction would never get
  // finished, and it would replay — failing — on every cold launch.
  // Waiting for firebaseUid guarantees auth.currentUser is set when the
  // replay lands, so a genuine stuck transaction finally credits and
  // finishes, breaking the loop.
  useEffect(() => {
    if (!iap.isNativeIAPAvailable()) return
    if (!firebaseUid) return
    iap.setVerifyCallback(async (tx) => {
      try {
        const result = await fbService.verifyAppleReceipt({
          productId: tx.productId,
          transactionId: tx.transactionId,
          appStoreReceipt: tx.appStoreReceipt,
        })
        if (!result.credited) return false
        if (result.pointsAdded) {
          setUser((prev) => ({ ...prev, points: prev.points + result.pointsAdded! }))
          showToast(`${result.pointsAdded} points added!`, 'check_circle')
        }
        if (result.isPremium) {
          setUser((prev) => ({
            ...prev,
            isPremium: true,
            premiumSince: prev.premiumSince ?? new Date().toISOString(),
          }))
          showToast('Welcome to MainWRLD+!', 'workspace_premium')
        }
        if (result.couponAdded) {
          // Append the exact object the server stored (same id), de-duped in
          // case the approved handler fires twice for one transaction.
          const granted = result.couponAdded
          setCoupons((prev) =>
            prev.some((c) => c.id === granted.id) ? prev : [...prev, granted]
          )
          showToast(`$${granted.value} coupon added!`, 'confirmation_number')
        }
        return true
      } catch (err) {
        console.error('[MainWRLD IAP] verify failed:', err)
        // StoreKit replays unfinished transactions through this callback on
        // every cold launch. Only surface the error when the user actually
        // bought/restored this session — otherwise a single stuck
        // transaction would pop this toast on every startup.
        if (tx.userInitiated) {
          showToast('Could not verify purchase. Please try again.', 'error')
        }
        return false
      }
    })
    // setUser/setCoupons/showToast are stable; re-running only when the
    // signed-in user changes is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUid])

  // iOS cash-checkout return (Variant B). The Stripe checkout runs in an in-app
  // browser; its success/cancel pages deep-link to `mainwrld://book-purchase`,
  // which foregrounds the app and fires appUrlOpen here. We close the browser
  // and — on success — poll the user doc until the (webhook-granted) purchase
  // lands, then adopt ownership so the book flips to "owned".
  useEffect(() => {
    if (!iap.isNativeIAPAvailable()) return
    let handle: { remove: () => void } | undefined
    let cancelled = false

    const resyncOwnership = async (bookId: string) => {
      if (!firebaseUid) return
      showToast('Verifying purchase…', 'sync')
      for (let i = 0; i < 8; i++) {
        const fresh = (await fbService
          .getUserProfile(firebaseUid)
          .catch(() => null)) as any
        const purchased: string[] = fresh?.purchasedBookIds || []
        if (purchased.includes(bookId)) {
          const username = user.username
          const current = userBookDataRef.current[username] || {
            ownedBookIds: [],
            bookProgress: {},
            purchasedBookIds: [],
          }
          const updated = {
            ...current,
            ownedBookIds: fresh?.ownedBookIds || [],
            purchasedBookIds: purchased,
          }
          userBookDataRef.current = {
            ...userBookDataRef.current,
            [username]: updated,
          }
          setUserBookData((prev) => ({ ...prev, [username]: updated }))
          showToast('Purchase complete — enjoy your book!', 'check_circle')
          return
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      showToast('Payment confirmed. Your book will appear shortly.', 'sync')
    }

    ;(async () => {
      const { App } = await import('@capacitor/app')
      const h = await App.addListener('appUrlOpen', async ({ url }) => {
        if (!url || url.indexOf('mainwrld://book-purchase') !== 0) return
        // Dismiss the in-app checkout browser now that we're back in the app.
        try {
          const { Browser } = await import('@capacitor/browser')
          await Browser.close()
        } catch {
          /* browser may already be closed */
        }
        const query = new URLSearchParams(url.split('?')[1] || '')
        if (query.get('cancelled') === 'true') {
          showToast('Checkout cancelled.', 'info')
          return
        }
        const bookId = query.get('bookId') || ''
        if (bookId) await resyncOwnership(bookId)
      })
      if (cancelled) h.remove()
      else handle = h
    })()

    return () => {
      cancelled = true
      handle?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUid, user.username])
}
