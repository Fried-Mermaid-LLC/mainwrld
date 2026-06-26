import { useRef, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as presenceService from '@/services/presenceService'
import * as worldService from '@/services/worldService'
import type {
  User,
  Book,
  BookProgress,
  AvatarConfig,
  Coupon,
  View,
  ReaderSettings
} from '@/types'

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
  selectedBook: Book | null
  userBookData: UserBookDataMap
  allAvatarConfigs: Record<string, AvatarConfig>
  allUnlockedItems: Record<string, string[]>
  blockedUsers: Set<string>
  readingActivity: ReadingActivityMap
  coupons: Coupon[]
  cart: Book[]
  favoriteBookIds: Set<string>
  readerSettings: ReaderSettings
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
  selectedBook,
  userBookData,
  allAvatarConfigs,
  allUnlockedItems,
  blockedUsers,
  readingActivity,
  coupons,
  cart,
  favoriteBookIds,
  readerSettings
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
        // User state. NOTE: strikes + isPremium are SERVER-owned (moderation /
        // billing) — written only by Cloud Functions and loaded fresh on login,
        // so the client must not persist (and thus clobber or forge) them. See
        // the C1 privilege lock in firestore.rules. The points economy
        // (points, dailyEarnedPoints, lastPointsReset, lastClaimedPoints,
        // membershipStartDate, lastMembershipRewardDate) is ALSO server-owned now
        // — written only by the API's RewardsService and rejected by PROTECTED_
        // FIELDS — so persisting them here would just clobber server awards.
        displayName: user.displayName,
        admirersCount: user.admirersCount,
        mutualsCount: user.mutualsCount,
        dailyChaptersPublished: user.dailyChaptersPublished || 0,
        lastChapterPublishReset: user.lastChapterPublishReset || 0,
        chatDailyCounts: user.chatDailyCounts || {},
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
        favoriteBookIds: Array.from(favoriteBookIds),
        // Reader preferences (font size / inverted / scroll vs page-flip)
        readerSettings
      }

      fbService.updateUserProfile(firebaseUid, batchUpdate).catch(console.error)
    }, 2000)

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [
    user.username,
    user.displayName,
    user.isPremium,
    user.strikes,
    user.admirersCount,
    user.mutualsCount,
    user.dailyChaptersPublished,
    user.lastChapterPublishReset,
    user.chatDailyCounts,
    userBookData,
    allAvatarConfigs,
    allUnlockedItems,
    blockedUsers,
    readingActivity,
    coupons,
    cart,
    favoriteBookIds,
    readerSettings,
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
        // strikes + isPremium + the points economy are server-owned (see the
        // debounced persist above); none are written from the client.
        displayName: user.displayName,
        admirersCount: user.admirersCount,
        mutualsCount: user.mutualsCount,
        // NOTE: isOnline/lastOnline intentionally NOT written here — presence is
        // owned by the dedicated presence effect (and, per X06, by the RTDB
        // mirror). Writing isOnline:false on every tab-switch/visibility-hidden
        // would fight it. This flush only persists the data slices below.
        dailyChaptersPublished: user.dailyChaptersPublished || 0,
        lastChapterPublishReset: user.lastChapterPublishReset || 0,
        chatDailyCounts: user.chatDailyCounts || {},
        ...(ud ? { bookProgress: ud.bookProgress || {} } : {}),
        ...(cfg ? { avatarConfig: cfg } : {}),
        ...(items ? { unlockedItems: items } : {}),
        blockedUsers: [...blockedUsers],
        ...(activity ? { readingActivity: activity } : {}),
        coupons,
        cart: cartData,
        favoriteBookIds: Array.from(favoriteBookIds),
        readerSettings
      }
      fbService.updateUserProfile(firebaseUid, batchUpdate).catch(() => {})
    }
    // Flush the latest readingActivity/bookProgress when the user leaves or
    // backgrounds the app, instead of relying solely on the 2s debounce (which
    // loses the last reads if the app is backgrounded/killed within that window).
    // On iOS/Capacitor visibilitychange(hidden) is the load-bearing event;
    // beforeunload/pagehide cover web tab close/refresh.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushToFirestore()
    }
    const handlePageHide = () => flushToFirestore()
    window.addEventListener('beforeunload', flushToFirestore)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', flushToFirestore)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  })

  // Online/offline presence via RTDB onDisconnect (X06). The RTDB server runs
  // the offline write itself when the socket drops, so a force-quit/crash/
  // network loss reliably flips the user offline even when no JS runs — which
  // beforeunload/pagehide could never guarantee (especially on iOS). A Cloud
  // Function mirrors /status/{uid} into Firestore users/{uid}.
  useEffect(() => {
    if (!firebaseUid || !user.username) return
    // Optimistic self-UI; the mirror will confirm moments later.
    setUser(prev => ({ ...prev, isOnline: true }))
    presenceService.goOnline(firebaseUid)
    return () => {
      presenceService.goOffline(firebaseUid)
    }
  }, [firebaseUid, user.username])

  // Update user activity (and currentBookId) based on current view, routed
  // through RTDB so disconnect can clear it and the mirror can publish it.
  useEffect(() => {
    if (!firebaseUid || !user.username) return

    let newActivity: 'Reading' | 'Writing' | 'Idle' = 'Idle'
    if (view === 'reading') {
      newActivity = 'Reading'
    } else if (view === 'write' || view === 'publishing') {
      newActivity = 'Writing'
    }

    const currentBookId =
      view === 'reading' ? selectedBook?.id ?? null : null
    presenceService.setActivity(firebaseUid, newActivity, currentBookId)

    // Mirror the activity into the RTDB world node so peers' 3D avatars show the
    // right label live. The world's idle state is 'Exploring' (walking around),
    // not 'Idle' — only Reading/Writing override it.
    worldService.setWorldActivity(
      firebaseUid,
      newActivity === 'Idle' ? 'Exploring' : newActivity,
      currentBookId
    )

    if (user.activity !== newActivity) {
      setUser(prev => ({ ...prev, activity: newActivity }))
    }
  }, [view, firebaseUid, user.username, selectedBook?.id])

  return { persistTimerRef }
}
