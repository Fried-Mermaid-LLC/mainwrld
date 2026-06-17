import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as iap from '@/services/iap'
import type { User, View } from '@/types'

interface PaymentsDeps {
  view: View
  user: User
  firebaseUid: string | null
  setUser: Dispatch<SetStateAction<User>>
  showToast: (message: string, icon?: string) => void
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
  showToast,
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
    const cancelRedirect = urlParams.get('payment_cancelled') === 'true'
    if (cancelRedirect) {
      showToast('Payment cancelled.', 'info')
      localStorage.removeItem('mainwrld_pending_points')
      localStorage.removeItem('mainwrld_pending_premium')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (!pointsRedirect && !premiumRedirect) return
    if (!firebaseUid) return

    localStorage.removeItem('mainwrld_pending_points')
    localStorage.removeItem('mainwrld_pending_premium')
    window.history.replaceState({}, '', window.location.pathname)
    showToast('Verifying purchase…', 'sync')

    // Webhook usually lands before the user finishes redirecting, but
    // network variance can flip the order. Poll a few seconds before
    // giving up; if we miss it here, the next sign-in re-loads the
    // user doc and the credit shows up then.
    const startingPoints = user.points
    const startingPremium = user.isPremium
    ;(async () => {
      for (let i = 0; i < 6; i++) {
        const fresh = (await fbService
          .getUserProfile(firebaseUid)
          .catch(() => null)) as User | null
        if (fresh) {
          const pointsCredited = (fresh.points || 0) > startingPoints
          const premiumCredited = !!fresh.isPremium && !startingPremium
          if (
            (pointsRedirect && pointsCredited) ||
            (premiumRedirect && premiumCredited)
          ) {
            setUser((prev) => ({
              ...prev,
              points: fresh.points ?? prev.points,
              isPremium: fresh.isPremium ?? prev.isPremium,
              premiumSince: fresh.premiumSince ?? prev.premiumSince,
              membershipStartDate:
                fresh.membershipStartDate ?? prev.membershipStartDate,
            }))
            showToast(
              pointsRedirect
                ? `${(fresh.points || 0) - startingPoints} points added!`
                : 'Welcome to MainWRLD+!',
              pointsRedirect ? 'check_circle' : 'workspace_premium'
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
  useEffect(() => {
    if (!iap.isNativeIAPAvailable()) return
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
        return true
      } catch (err) {
        console.error('[MainWRLD IAP] verify failed:', err)
        showToast('Could not verify purchase. Please try again.', 'error')
        return false
      }
    })
  }, [])
}
