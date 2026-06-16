import { useRef, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import type { User, Book, BookProgress, AvatarConfig, Coupon, View } from '@/types'

type UserBookDataMap = Record<
  string,
  {
    ownedBookIds: string[]
    purchasedBookIds?: string[]
    bookProgress: Record<string, BookProgress>
  }
>
type ReadingActivityMap = Record<
  string,
  { bookId: string; progress: number; lastRead: string }[]
>

interface PersistDeps {
  user: User
  setUser: Dispatch<SetStateAction<User>>
  firebaseUid: string | null
  userDataLoaded: boolean
  view: View
  lastClaimedPoints: number | null
  userBookData: UserBookDataMap
  allAvatarConfigs: Record<string, AvatarConfig>
  allUnlockedItems: Record<string, string[]>
  blockedUsers: Set<string>
  readingActivity: ReadingActivityMap
  coupons: Coupon[]
  cart: Book[]
  favoriteBookIds: Set<string>
}

// Persistence domain (Phase B, the LAST extraction). Owns persistTimerRef and
// the four write-side effects: the single debounced batch write (24-dep array),
// the page-leave flush, the open/close online-presence effect, and the
// activity-by-view effect. Owns no domain state — it reads every slice as a
// direct ref. Called first among the tail effects (before the loader/payment/
// auth effects) so the registration order matches the monolith. Bodies and every
// dependency array (especially the 24-element persist array) are verbatim.
export function usePersist({
  user,
  setUser,
  firebaseUid,
  userDataLoaded,
  view,
  lastClaimedPoints,
  userBookData,
  allAvatarConfigs,
  allUnlockedItems,
  blockedUsers,
  readingActivity,
  coupons,
  cart,
  favoriteBookIds
}: PersistDeps) {
  // Debounce ref for batched Firestore writes
  const persistTimerRef = useRef<any>(null)

  // Single debounced persist effect — batches ALL user data into one Firestore write
  // This replaces 8 separate persist effects, reducing writes by ~8x
  useEffect(() => {
    if (!firebaseUid || !user.username || !userDataLoaded) return
    if (view === 'splash' || view === 'landing' || view === 'login' || view === 'signup') return

    // Clear previous timer
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)

    // Debounce: wait 2 seconds of no changes before writing
    persistTimerRef.current = setTimeout(() => {
      const ud = userBookData[user.username]
      const cfg = allAvatarConfigs[user.username]
      const items = allUnlockedItems[user.username]
      const activity = readingActivity[user.username]
      const cartData = cart.map(b => ({
        id: b.id,
        title: b.title,
        price: b.price,
        coverColor: b.coverColor,
        coverImage: b.coverImage
      }))

      const batchUpdate: Record<string, any> = {
        // User state
        points: user.points,
        displayName: user.displayName,
        strikes: user.strikes,
        admirersCount: user.admirersCount,
        mutualsCount: user.mutualsCount,
        isPremium: user.isPremium || false,
        dailyEarnedPoints: user.dailyEarnedPoints || 0,
        lastPointsReset: user.lastPointsReset || null,
        lastClaimedPoints: lastClaimedPoints || null,
        membershipStartDate: user.membershipStartDate || null,
        lastMembershipRewardDate: user.lastMembershipRewardDate || null,
        dailyChaptersPublished: user.dailyChaptersPublished || 0,
        lastChapterPublishReset: user.lastChapterPublishReset || 0,
        // Book data (ownedBookIds/purchasedBookIds managed atomically via arrayUnion/arrayRemove)
        ...(ud
          ? {
              bookProgress: ud.bookProgress || {}
            }
          : {}),
        // Avatar
        ...(cfg ? { avatarConfig: cfg } : {}),
        // Unlocked items
        ...(items ? { unlockedItems: items } : {}),
        // Blocked users
        blockedUsers: [...blockedUsers],
        // Reading activity
        ...(activity ? { readingActivity: activity } : {}),
        // Coupons
        coupons,
        // Cart
        cart: cartData,
        // Favorites
        favoriteBookIds: Array.from(favoriteBookIds)
      }

      fbService.updateUserProfile(firebaseUid, batchUpdate).catch(console.error)
    }, 2000)

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [
    user.points,
    user.username,
    user.displayName,
    user.isPremium,
    user.strikes,
    user.admirersCount,
    user.mutualsCount,
    user.dailyEarnedPoints,
    user.lastPointsReset,
    user.membershipStartDate,
    user.lastMembershipRewardDate,
    user.dailyChaptersPublished,
    user.lastChapterPublishReset,
    lastClaimedPoints,
    userBookData,
    allAvatarConfigs,
    allUnlockedItems,
    blockedUsers,
    readingActivity,
    coupons,
    cart,
    favoriteBookIds,
    firebaseUid,
    userDataLoaded,
    view
  ])

  // Flush pending persist immediately when user is leaving the page
  // Uses visibilitychange + pagehide (reliable on mobile Safari) in addition to beforeunload
  useEffect(() => {
    const flushToFirestore = () => {
      if (!firebaseUid || !user.username || !userDataLoaded) return
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      const ud = userBookData[user.username]
      const cfg = allAvatarConfigs[user.username]
      const items = allUnlockedItems[user.username]
      const activity = readingActivity[user.username]
      const cartData = cart.map(b => ({
        id: b.id,
        title: b.title,
        price: b.price,
        coverColor: b.coverColor,
        coverImage: b.coverImage
      }))
      const batchUpdate: Record<string, any> = {
        points: user.points,
        displayName: user.displayName,
        strikes: user.strikes,
        admirersCount: user.admirersCount,
        mutualsCount: user.mutualsCount,
        isPremium: user.isPremium || false,
        isOnline: false,
        lastOnline: new Date().toISOString(),
        dailyEarnedPoints: user.dailyEarnedPoints || 0,
        lastPointsReset: user.lastPointsReset || null,
        lastClaimedPoints: lastClaimedPoints || null,
        membershipStartDate: user.membershipStartDate || null,
        lastMembershipRewardDate: user.lastMembershipRewardDate || null,
        dailyChaptersPublished: user.dailyChaptersPublished || 0,
        lastChapterPublishReset: user.lastChapterPublishReset || 0,
        ...(ud ? { bookProgress: ud.bookProgress || {} } : {}),
        ...(cfg ? { avatarConfig: cfg } : {}),
        ...(items ? { unlockedItems: items } : {}),
        blockedUsers: [...blockedUsers],
        ...(activity ? { readingActivity: activity } : {}),
        coupons,
        cart: cartData,
        favoriteBookIds: Array.from(favoriteBookIds)
      }
      fbService.updateUserProfile(firebaseUid, batchUpdate).catch(() => {})
    }
    // const handleVisibilityChange = () => {
    //   if (document.visibilityState === 'hidden') flushToFirestore()
    // }
    // const handlePageHide = () => flushToFirestore()
    // window.addEventListener('beforeunload', flushToFirestore)
    // document.addEventListener('visibilitychange', handleVisibilityChange)
    // window.addEventListener('pagehide', handlePageHide)
    // return () => {
    //   window.removeEventListener('beforeunload', flushToFirestore)
    //   document.removeEventListener('visibilitychange', handleVisibilityChange)
    //   window.removeEventListener('pagehide', handlePageHide)
    // }
  })

  // Online/offline presence: only on open/close, not tab switching
  useEffect(() => {
    if (!firebaseUid || !user.username) return

    const setOnline = () => {
      setUser(prev => ({ ...prev, isOnline: true }))

      fbService
        .updateUserProfile(firebaseUid, {
          isOnline: true,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    }

    const setOffline = () => {
      setUser(prev => ({ ...prev, isOnline: false }))

      fbService
        .updateUserProfile(firebaseUid, {
          isOnline: false,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    }

    // Mark online when this tab/window is active
    setOnline()

    // Mark offline only when tab/window is closed/refreshed/navigated away
    window.addEventListener('beforeunload', setOffline)
    window.addEventListener('pagehide', setOffline)

    return () => {
      window.removeEventListener('beforeunload', setOffline)
      window.removeEventListener('pagehide', setOffline)
    }
  }, [firebaseUid, user.username])

  // Update user activity based on current view
  useEffect(() => {
    if (!firebaseUid || !user.username) return

    let newActivity: 'Reading' | 'Writing' | 'Idle' = 'Idle'
    if (view === 'reading') {
      newActivity = 'Reading'
    } else if (view === 'write' || view === 'publishing') {
      newActivity = 'Writing'
    }

    if (user.activity !== newActivity) {
      setUser(prev => ({ ...prev, activity: newActivity }))
      fbService
        .updateUserProfile(firebaseUid, { activity: newActivity })
        .catch(console.error)
    }
  }, [view, firebaseUid, user.username])

  return { persistTimerRef }
}
