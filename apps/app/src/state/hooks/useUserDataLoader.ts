import { useEffect } from 'react'
import type { Dispatch, SetStateAction, MutableRefObject } from 'react'
import * as fbService from '@/services/firebaseService'
import type {
  User,
  Book,
  BookProgress,
  AvatarConfig,
  Coupon,
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

interface UserDataLoaderDeps {
  firebaseUid: string | null
  user: User
  setLikedBooks: Dispatch<SetStateAction<Set<string>>>
  setFavoriteBookIds: Dispatch<SetStateAction<Set<string>>>
  likedBooksInteracted: MutableRefObject<boolean>
  setBlockedUsers: Dispatch<SetStateAction<Set<string>>>
  setAllAvatarConfigs: Dispatch<SetStateAction<Record<string, AvatarConfig>>>
  setAllUnlockedItems: Dispatch<SetStateAction<Record<string, string[]>>>
  setUserBookData: Dispatch<SetStateAction<UserBookDataMap>>
  setReadingActivity: Dispatch<SetStateAction<ReadingActivityMap>>
  setCoupons: Dispatch<SetStateAction<Coupon[]>>
  setCart: Dispatch<SetStateAction<Book[]>>
  setItemPriceOverrides: Dispatch<SetStateAction<Record<string, number>>>
  setUser: Dispatch<SetStateAction<User>>
  setReaderSettings: Dispatch<SetStateAction<ReaderSettings>>
  setLastClaimedPoints: Dispatch<SetStateAction<number | null>>
  setUserDataLoaded: Dispatch<SetStateAction<boolean>>
}

// User-data loader (Phase B). The post-login getUserProfile cascade that hydrates
// every domain's slice from the Firestore user doc and finally flips
// userDataLoaded true (which ungates the persist effect). Owns no state — every
// setter is a direct ref from the domain hooks above. Placed near the tail (after
// persist, before the payment effects) so its [firebaseUid, user.username] effect
// keeps the same registration order. Body + dependency array verbatim.
export function useUserDataLoader({
  firebaseUid,
  user,
  setLikedBooks,
  setFavoriteBookIds,
  likedBooksInteracted,
  setBlockedUsers,
  setAllAvatarConfigs,
  setAllUnlockedItems,
  setUserBookData,
  setReadingActivity,
  setCoupons,
  setCart,
  setItemPriceOverrides,
  setUser,
  setReaderSettings,
  setLastClaimedPoints,
  setUserDataLoaded
}: UserDataLoaderDeps) {
  // Load user-specific data from Firestore when user logs in
  useEffect(() => {
    if (!firebaseUid || !user.username) return
    fbService
      .getUserProfile(firebaseUid)
      .then((profile: any) => {
        if (!profile) return
        // Load likedBooks
        if (profile.likedBooks) setLikedBooks(new Set(profile.likedBooks))
        else setLikedBooks(new Set())
        if (profile.favoriteBookIds)
          setFavoriteBookIds(new Set(profile.favoriteBookIds))
        else setFavoriteBookIds(new Set())
        likedBooksInteracted.current = false
        // Load blocked users
        if (profile.blockedUsers) setBlockedUsers(new Set(profile.blockedUsers))
        // Load avatar config
        if (profile.avatarConfig)
          setAllAvatarConfigs(prev => ({
            ...prev,
            [user.username]: profile.avatarConfig
          }))
        // Load unlocked items
        if (profile.unlockedItems)
          setAllUnlockedItems(prev => ({
            ...prev,
            [user.username]: profile.unlockedItems
          }))
        // Load user book data
        if (
          profile.ownedBookIds ||
          profile.bookProgress ||
          profile.purchasedBookIds
        ) {
          setUserBookData(prev => ({
            ...prev,
            [user.username]: {
              ownedBookIds: profile.ownedBookIds || [],
              purchasedBookIds: profile.purchasedBookIds || [],
              bookProgress: profile.bookProgress || {}
            }
          }))
        }
        // Load reading activity
        if (profile.readingActivity)
          setReadingActivity(prev => ({
            ...prev,
            [user.username]: profile.readingActivity
          }))
        // Load reader settings (font size / inverted / scroll vs page-flip).
        // Merge over the defaults so a partially-stored object (older docs that
        // predate a newly added field) still hydrates cleanly.
        if (profile.readerSettings)
          setReaderSettings(prev => ({ ...prev, ...profile.readerSettings }))
        // Load coupons
        if (profile.coupons) setCoupons(profile.coupons)
        // Load cart (stored as full book objects)
        if (profile.cart) setCart(profile.cart)
        // Load item price overrides
        if (profile.itemPriceOverrides)
          setItemPriceOverrides(profile.itemPriceOverrides)
        // Load earned points tracking + membership + chapter limits
        if (
          profile.dailyEarnedPoints !== undefined ||
          profile.lastPointsReset !== undefined ||
          profile.membershipStartDate !== undefined ||
          profile.lastMembershipRewardDate !== undefined ||
          profile.dailyChaptersPublished !== undefined ||
          profile.chatDailyCounts !== undefined ||
          profile.notificationPrefs !== undefined ||
          profile.showMatureContent !== undefined ||
          profile.onboardingTutorialDismissed !== undefined
        ) {
          setUser(prev => ({
            ...prev,
            dailyEarnedPoints: profile.dailyEarnedPoints || 0,
            lastPointsReset: profile.lastPointsReset || null,
            membershipStartDate: profile.membershipStartDate || null,
            premiumSince: profile.premiumSince || null,
            lastMembershipRewardDate: profile.lastMembershipRewardDate || null,
            dailyChaptersPublished: profile.dailyChaptersPublished || 0,
            lastChapterPublishReset: profile.lastChapterPublishReset || 0,
            chatDailyCounts: profile.chatDailyCounts || {},
            // F06 notification prefs (B2) + F10 onboarding dismissal (A4)
            notificationPrefs: profile.notificationPrefs || undefined,
            // Mature-content opt-in. Keep the raw tri-state (true/false/
            // undefined) — coercing to false would defeat the 17+ age default.
            showMatureContent: profile.showMatureContent,
            onboardingTutorialDismissed:
              profile.onboardingTutorialDismissed || false
          }))
        }
        if (profile.isPremium && !profile.membershipStartDate) {
          const membershipStartNow = Date.now()
          setUser(prev => ({
            ...prev,
            membershipStartDate: prev.membershipStartDate || membershipStartNow
          }))
          fbService
            .updateUserProfile(firebaseUid, {
              membershipStartDate: membershipStartNow
            })
            .catch(console.error)
        }
        // Load last claimed points timestamp
        if (profile.lastClaimedPoints)
          setLastClaimedPoints(profile.lastClaimedPoints)
        // Mark user data as loaded so persist effects can start saving
        setUserDataLoaded(true)
      })
      .catch(console.error)
  }, [firebaseUid, user.username])
}
