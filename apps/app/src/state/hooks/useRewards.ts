import { useState } from 'react'
import type React from 'react'
import * as fbService from '@/services/firebaseService'
import type { User, Coupon } from '@/types'

interface RewardsDeps {
  user: User
  setUser: React.Dispatch<React.SetStateAction<User>>
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

// Points / coupons / membership rewards (Phase B). Points are now SERVER-OWNED:
// like milestones, the daily claim, the spin debit, and the membership bonus are
// all applied server-side (apps/api RewardsService) via atomic increments, so the
// client's profile autosave can never clobber an award credited while the author
// is online. This hook just calls those endpoints and syncs the returned balance.
// Coupons stay client-managed (the wheel generates/evicts them locally).
export function useRewards({ user, setUser, showToast, showConfirm }: RewardsDeps) {
  const [lastClaimedPoints, setLastClaimedPoints] = useState<number | null>(
    null
  )
  const [coupons, setCoupons] = useState<Coupon[]>([])

  // Sync the server-owned balance fields from a refreshed profile payload.
  const syncBalance = (u: any) => {
    if (!u) return
    setUser(prev => ({
      ...prev,
      points: u.points ?? prev.points,
      dailyEarnedPoints: u.dailyEarnedPoints ?? prev.dailyEarnedPoints,
      lastPointsReset: u.lastPointsReset ?? prev.lastPointsReset,
      lastMembershipRewardDate:
        u.lastMembershipRewardDate ?? prev.lastMembershipRewardDate
    }))
    if (u.lastClaimedPoints) setLastClaimedPoints(u.lastClaimedPoints)
  }

  const handleClaimPoints = async () => {
    try {
      const res = await fbService.claimDailyPoints()
      if (!res.claimed) {
        const nextAvailable = res.nextAvailableAt
          ? new Date(res.nextAvailableAt)
          : null
        showToast(
          nextAvailable
            ? `You can claim points again at ${nextAvailable.toLocaleTimeString()}`
            : 'You already claimed your points today.',
          'schedule'
        )
        return
      }
      syncBalance(res.user)
      if (res.awarded > 0) {
        showToast(
          `+${res.awarded} points — ${user.isPremium ? 'Daily claim (2x Premium bonus)' : 'Daily claim'}`,
          'emoji_events'
        )
      } else {
        showToast('Daily cap reached! Come back tomorrow.', 'schedule')
      }
    } catch (err) {
      console.error(err)
      showToast('Failed to claim points. Please try again.', 'error')
    }
  }

  const handleSpinWheel = async () => {
    if (user.points < 150) {
      showToast('You need 150 points to win a coupon', 'info')
      return
    }

    // Coupons bought for real money carry a `buy_` id (set server-side in
    // stripeWebhook / verifyAppleReceipt); won coupons get a random base36 id
    // that can never contain `_`. The wheel's 3-slot cap may only cycle out
    // WON coupons — a purchased coupon must never be destroyed by a spin.
    const isPurchased = (c: Coupon) => c.id.startsWith('buy_')
    const unusedCoupons = coupons.filter((c: Coupon) => !c.used)
    const oldestWon = unusedCoupons.find((c: Coupon) => !isPurchased(c))

    const proceedWithSpin = async () => {
      // Debit the 150 points SERVER-side (authoritative balance). Only on a
      // confirmed debit do we generate the coupon locally.
      let res: { ok: boolean; points: number }
      try {
        res = await fbService.spinCouponWheel()
      } catch (err) {
        console.error(err)
        showToast('Spin failed. Please try again.', 'error')
        return
      }
      if (!res.ok) {
        showToast('You need 150 points to win a coupon', 'info')
        return
      }
      setUser(prev => ({ ...prev, points: res.points }))

      // Random Chancing (coupon generation stays client-side).
      const rand = Math.random() * 100
      let winValue = 1
      if (rand < 84) {
        winValue = 1
      } else if (rand < 93) {
        winValue = 3
      } else if (rand < 98) {
        winValue = 5
      } else {
        winValue = 10
      }

      const newCoupon: Coupon = {
        id: Math.random().toString(36).substr(2, 9),
        value: winValue,
        used: false
      }

      setCoupons(prev => {
        const unusedCount = prev.filter((c: Coupon) => !c.used).length
        // At/over the cap, cycle out the oldest WON coupon to make room. If
        // every slot is held by purchased coupons there is nothing to cycle,
        // so the win simply stacks on top — paid coupons are never lost.
        if (unusedCount >= 3) {
          const evictId = prev.find(
            (c: Coupon) => !c.used && !isPurchased(c)
          )?.id
          if (evictId) {
            return [...prev.filter((c: Coupon) => c.id !== evictId), newCoupon]
          }
        }
        return [...prev, newCoupon]
      })

      showToast(`You won a $${winValue} coupon!`, 'confirmation_number')
    }

    // Only warn when a WON coupon is actually about to be cycled out. If the
    // slots are full purely of purchased coupons, the spin just stacks.
    if (unusedCoupons.length >= 3 && oldestWon) {
      showConfirm({
        title: 'Your coupon slots are full',
        message: `Winning a new coupon will cycle out your oldest won coupon ($${oldestWon.value}). Purchased coupons are always kept. Do you wish to proceed?`,
        confirmLabel: 'Yes',
        cancelLabel: 'No',
        icon: 'check_circle',
        onConfirm: () => {
          void proceedWithSpin()
        },
        onCancel: () => {}
      })

      return // stop execution here
    }

    // Not at the cap (or nothing winnable to cycle) → proceed immediately
    await proceedWithSpin()
  }

  return {
    lastClaimedPoints,
    setLastClaimedPoints,
    coupons,
    setCoupons,
    handleClaimPoints,
    handleSpinWheel
  }
}
