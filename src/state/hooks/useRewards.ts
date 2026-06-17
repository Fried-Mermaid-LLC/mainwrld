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

    const unusedCoupons = coupons.filter((c: Coupon) => !c.used)

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
        const unusedOnly = prev.filter((c: Coupon) => !c.used)

        if (unusedOnly.length >= 3) {
          unusedOnly.shift() // Remove oldest unused (FIFO)
        }

        return [...unusedOnly, newCoupon]
      })

      showToast(`You won a ${winValue * 100}-point coupon!`, 'confirmation_number')
    }

    // If slots full → ask confirmation and STOP execution
    if (unusedCoupons.length >= 3) {
      const oldestUnused = unusedCoupons[0]

      showConfirm({
        title: 'Your coupon slots are full (3/3)',
        message: `Winning a new coupon will permanently eliminate your oldest ticket (${oldestUnused.value * 100} pts). Do you wish to proceed?`,
        confirmLabel: 'Yes',
        cancelLabel: 'No',
        icon: 'check_circle',
        onConfirm: proceedWithSpin,
        onCancel: () => {}
      })

      return // stop execution here
    }

    // If slots not full then proceed immediately
    proceedWithSpin()
  }

  // Membership reward: 200 pts after 25hrs of premium, then annually
  useEffect(() => {
    if (!user.isPremium || !user.membershipStartDate) return
    const checkMembershipReward = () => {
      const now = Date.now()
      const msInYear = 365 * 24 * 60 * 60 * 1000
      const msIn25Hours = 25 * 60 * 60 * 1000
      if (!user.lastMembershipRewardDate) {
        if (now - user.membershipStartDate >= msIn25Hours) {
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
