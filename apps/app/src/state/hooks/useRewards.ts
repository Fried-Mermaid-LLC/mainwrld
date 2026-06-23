import { useState, useEffect } from 'react'
import type React from 'react'
import { MAX_DAILY_EARNED_POINTS } from '@/config/constants'
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

// Points / coupons / membership rewards (Phase B). Owns lastClaimedPoints,
// rewardedItems (anti-double-reward set), and coupons. awardPoints +
// rewardedItems are consumed by handleLike/handleLikeComment, and
// lastClaimedPoints by the persist effect and login cascade — all of which run
// after this hook in useAppValue, so no late-bound wiring is needed. Function
// bodies and the membership effect's dependency array are verbatim.
export function useRewards({ user, setUser, showToast, showConfirm }: RewardsDeps) {
  const [lastClaimedPoints, setLastClaimedPoints] = useState<number | null>(
    null
  )
  const [rewardedItems, setRewardedItems] = useState<Set<string>>(new Set())
  const [coupons, setCoupons] = useState<Coupon[]>([])

  const awardPoints = (amount: number, reason: string) => {
    const now = Date.now()
    const isNewDay =
      !user.lastPointsReset ||
      now - (user.lastPointsReset || 0) > 24 * 60 * 60 * 1000
    const currentDaily = isNewDay ? 0 : user.dailyEarnedPoints || 0
    if (currentDaily >= MAX_DAILY_EARNED_POINTS) return
    const finalAmount = Math.min(amount, MAX_DAILY_EARNED_POINTS - currentDaily)
    if (finalAmount <= 0) return
    setUser(prev => {
      const isStillNewDay =
        !prev.lastPointsReset ||
        now - (prev.lastPointsReset || 0) > 24 * 60 * 60 * 1000
      const prevDaily = isStillNewDay ? 0 : prev.dailyEarnedPoints || 0
      return {
        ...prev,
        points: prev.points + finalAmount,
        dailyEarnedPoints: prevDaily + finalAmount,
        lastPointsReset: isStillNewDay ? now : prev.lastPointsReset
      }
    })
    showToast(`+${finalAmount} points — ${reason}`, 'emoji_events')
  }

  const awardMembershipBonus = (
    amount: number,
    reason: string,
    rewardedAt: number
  ) => {
    if (amount <= 0) return
    setUser(prev => ({
      ...prev,
      points: prev.points + amount,
      lastMembershipRewardDate: rewardedAt
    }))
    showToast(`+${amount} points — ${reason}`, 'emoji_events')
  }

  const handleClaimPoints = () => {
    const now = Date.now()
    if (lastClaimedPoints && now - lastClaimedPoints < 24 * 60 * 60 * 1000) {
      const nextAvailable = new Date(lastClaimedPoints + 24 * 60 * 60 * 1000)
      showToast(
        `You can claim points again at ${nextAvailable.toLocaleTimeString()}`,
        'schedule'
      )
      return
    }
    const pts = user.isPremium ? 6 : 3
    awardPoints(
      pts,
      user.isPremium ? 'Daily claim (2x Premium bonus)' : 'Daily claim'
    )
    setLastClaimedPoints(now)
  }

  const handleSpinWheel = () => {
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

    const proceedWithSpin = () => {
      // Deduct points
      setUser(prev => ({
        ...prev,
        points: prev.points - 150
      }))

      // Random Chancing
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
        onConfirm: proceedWithSpin,
        onCancel: () => {}
      })

      return // stop execution here
    }

    // Not at the cap (or nothing winnable to cycle) → proceed immediately
    proceedWithSpin()
  }

  // Membership reward: 200 pts after 25hrs of premium, then annually
  useEffect(() => {
    if (!user.isPremium || !user.membershipStartDate) return
    // Capture after the guard so the narrowing survives into the closure below.
    const membershipStartDate = user.membershipStartDate
    const checkMembershipReward = () => {
      const now = Date.now()
      const msInYear = 365 * 24 * 60 * 60 * 1000
      const msIn25Hours = 25 * 60 * 60 * 1000
      if (!user.lastMembershipRewardDate) {
        if (now - membershipStartDate >= msIn25Hours) {
          awardMembershipBonus(200, 'Membership Reward', now)
        }
      } else {
        if (now - user.lastMembershipRewardDate >= msInYear) {
          awardMembershipBonus(200, 'Annual Membership Reward', now)
        }
      }
    }
    const interval = setInterval(checkMembershipReward, 60000)
    checkMembershipReward()
    return () => clearInterval(interval)
  }, [user.isPremium, user.membershipStartDate, user.lastMembershipRewardDate])

  return {
    lastClaimedPoints,
    setLastClaimedPoints,
    rewardedItems,
    setRewardedItems,
    coupons,
    setCoupons,
    awardPoints,
    awardMembershipBonus,
    handleClaimPoints,
    handleSpinWheel
  }
}
