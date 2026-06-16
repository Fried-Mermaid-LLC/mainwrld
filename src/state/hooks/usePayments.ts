import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as iap from '@/services/iap'
import type { User, View } from '@/types'

interface PaymentsDeps {
  view: View
  setUser: Dispatch<SetStateAction<User>>
  showToast: (message: string, icon?: string) => void
  showConfirm: (opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    icon?: string
    iconBg?: string
    onConfirm: () => void
    onCancel?: () => void
  }) => void
}

// Payments domain (Phase B). The Stripe web-redirect handler (points/premium
// success + cancel + pending-purchase reconciliation, keyed on view) and the
// native StoreKit IAP verify-callback setup. Owns no state — credits points /
// premium straight onto setUser. Placed after the user-data loader and before
// useAuthActions so the [view] and [] effects register in the same order as the
// monolith. Bodies + dependency arrays verbatim.
export function usePayments({ view, setUser, showToast, showConfirm }: PaymentsDeps) {
  // Handle Stripe payment redirects and pending purchases - only after user is loaded
  useEffect(() => {
    if (view === 'splash' || view === 'landing' || view === 'login' || view === 'signup') return
    const urlParams = new URLSearchParams(window.location.search)
    // Handle redirect with ?points_success=true
    if (urlParams.get('points_success') === 'true') {
      const pendingPoints = JSON.parse(
        localStorage.getItem('mainwrld_pending_points') || 'null'
      )
      if (pendingPoints) {
        setUser(prev => ({ ...prev, points: prev.points + pendingPoints.pts }))
        showToast(
          `${pendingPoints.pts} points added to your account!`,
          'check_circle'
        )
        localStorage.removeItem('mainwrld_pending_points')
      }
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    // Handle premium subscription success
    if (urlParams.get('premium_success') === 'true') {
      setUser(prev => ({
        ...prev,
        isPremium: true,
        premiumSince: new Date().toISOString(),
        membershipStartDate: Date.now()
      }))
      showToast('Welcome to MainWRLD+!', 'workspace_premium')
      localStorage.removeItem('mainwrld_pending_premium')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (urlParams.get('payment_cancelled') === 'true') {
      showToast('Payment cancelled.', 'info')
      localStorage.removeItem('mainwrld_pending_purchase')
      localStorage.removeItem('mainwrld_pending_coupon')
      localStorage.removeItem('mainwrld_pending_points')
      localStorage.removeItem('mainwrld_pending_premium')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    // Auto-detect pending purchase when user returns to app (no redirect needed)
    const pendingPoints = JSON.parse(
      localStorage.getItem('mainwrld_pending_points') || 'null'
    )
    if (pendingPoints) {
      // Check if enough time passed (user was likely on Stripe checkout)
      const timeSinceSet = Date.now() - (pendingPoints.timestamp || 0)
      if (timeSinceSet > 5000) {
        showConfirm({
          title: 'Purchase Complete?',
          message: `Did you complete the purchase of ${pendingPoints.pts} points for $${pendingPoints.usd}?`,
          confirmLabel: 'Yes, Add Points',
          cancelLabel: 'No',
          icon: 'check_circle',
          onConfirm: () => {
            setUser(prev => ({
              ...prev,
              points: prev.points + pendingPoints.pts
            }))
            showToast(
              `${pendingPoints.pts} points added to your account!`,
              'check_circle'
            )
            localStorage.removeItem('mainwrld_pending_points')
          },
          onCancel: () => {
            localStorage.removeItem('mainwrld_pending_points')
          }
        })
      }
    }
    // Auto-detect pending premium subscription
    const pendingPremium = JSON.parse(
      localStorage.getItem('mainwrld_pending_premium') || 'null'
    )
    if (pendingPremium) {
      const timeSinceSet = Date.now() - (pendingPremium.timestamp || 0)
      if (timeSinceSet > 5000) {
        showConfirm({
          title: 'Subscription Complete?',
          message: 'Did you complete the MainWRLD Premium subscription?',
          confirmLabel: 'Yes, Activate',
          cancelLabel: 'No',
          icon: 'workspace_premium',
          onConfirm: () => {
            setUser(prev => ({
              ...prev,
              isPremium: true,
              premiumSince: new Date().toISOString(),
              membershipStartDate: Date.now()
            }))
            showToast('Welcome to MainWRLD+!', 'workspace_premium')
            localStorage.removeItem('mainwrld_pending_premium')
          },
          onCancel: () => {
            localStorage.removeItem('mainwrld_pending_premium')
          }
        })
      }
    }
  }, [view])

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
