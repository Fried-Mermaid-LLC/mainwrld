import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Suspense
} from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  Html,
  Environment,
  PerspectiveCamera,
  useGLTF
} from '@react-three/drei'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import * as fbService from '@/services/firebaseService'
import {
  BASE,
  STRIPE_PUBLISHABLE_KEY,
  getStripe,
  STRIPE_PRICE_IDS,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_BOOK_PRICE_ID,
  sendWelcomeEmail
} from '@/config/config'
import {
  ACCENT_COLOR,
  WORLD_RADIUS,
  MAX_LIBRARY_SIZE,
  MIN_WORD_COUNT,
  MAX_DAILY_EARNED_POINTS,
  COMMENT_LIKES_THRESHOLD,
  CHAPTER_LIKES_THRESHOLD,
  MAX_DAILY_CHAPTERS,
  MAX_WORD_COUNT,
  GENRE_LIST,
  ADMIN_USERNAMES,
  containsBadWord,
  SKIN_TONE_COLORS
} from '@/config/constants'
import {
  getHairPosition,
  getFacePosition,
  getAvatarItemPath,
  AvatarLayers,
  AVATAR_ITEMS,
  HAIR_POSITIONS,
  FACE_POSITIONS
} from '@/components/avatar'
import { Button, Input, CoverImg } from '@/components/sharedComponents'
import * as iap from '@/services/iap'
import {
  LOREM_CONTENT,
  CURRENT_USER_MOCK,
  MOCK_USERS,
  INITIAL_BOOKS
} from '@/data/mockData'
import { AvatarModel, MovingAvatar, Player } from '@/components/three/threeComponents'
import { CustomizationView } from '@/views/CustomizationView'
import {
  View,
  User,
  UserRecord,
  NotificationItem,
  ChatMessage,
  Relationship,
  Comment,
  Coupon,
  Report,
  AvatarGender,
  AvatarCategory,
  AvatarConfig,
  AvatarItem,
  Chapter,
  Book,
  BookProgress
} from '@/types'

import { ExploreView } from '@/views/ExploreView'
import { OtherProfileView } from '@/views/OtherProfileView'
import { PublicBookDetailPage } from '@/views/PublicBookDetailPage'
import { CartView } from '@/views/CartView'
import { ReadingView } from '@/views/ReadingView'
import { MonetizationRequestView } from '@/views/MonetizationRequestView'
import { PublishingView } from '@/views/PublishingView'
import { LegalView, LEGAL_DOCS } from '@/views/LegalView'
import { ForgotPasswordView } from '@/views/ForgotPasswordView'
import { SettingsView } from '@/views/SettingsView'
import { AdminDashboard } from '@/views/AdminDashboard'
import { CommentsView } from '@/views/CommentsView'
import { ChatListView } from '@/views/ChatListView'
import { ChatConversationView } from '@/views/ChatConversationView'
import { WriteView } from '@/views/WriteView'
import { AppContext } from './AppContext'
import { useUI } from './hooks/useUI'
import { useRewards } from './hooks/useRewards'

// The entire former App body lifted verbatim into a single hook. Hook-call
// order and every effect dependency array are preserved exactly, so runtime
// behaviour is identical to the previous monolithic component. Phase B will
// strangle individual domains out of this hook into dedicated hook files.
export function useAppValue() {
  // UI / navigation / selection state lives in useUI (Phase B). Called first so
  // its effects (clipboard guard) register in the same order as before.
  const ui = useUI()
  const {
    view,
    setView,
    toast,
    setToast,
    showToast,
    confirmModal,
    setConfirmModal,
    showConfirm,
    selectedBook,
    setSelectedBook,
    readingChapterIndex,
    setReadingChapterIndex,
    selectedProfileUser,
    setSelectedProfileUser,
    selectedChatUser,
    setSelectedChatUser,
    moveDir,
    setMoveDir,
    readerSettings,
    setReaderSettings,
    activeCommentChapterKey,
    setActiveCommentChapterKey,
    scrollToCommentId,
    setScrollToCommentId
  } = ui
  const BLANK_USER: User = {
    username: '',
    displayName: '',
    isOnline: false,
    activity: 'Idle',
    position: [0, 0, 0],
    isMutual: false,
    points: 0,
    admirersCount: 0,
    mutualsCount: 0,
    strikes: 0
  }
  const [user, setUser] = useState<User>(BLANK_USER)
  const [authLoading, setAuthLoading] = useState(true)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null)
  const [userDataLoaded, setUserDataLoaded] = useState(false) // Guard for persist effects
  const [books, setBooks] = useState<Book[]>([])
  const [globalSpotlightBookId, setGlobalSpotlightBookId] = useState<
    string | null
  >(null)
  // Chat messages (Firestore real-time)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const [likedBooks, setLikedBooks] = useState<Set<string>>(new Set())
  const [favoriteBookIds, setFavoriteBookIds] = useState<Set<string>>(new Set())
  const likedBooksInteracted = useRef(false)
  const [signUpForm, setSignUpForm] = useState({
    email: '',
    birthDate: '',
    displayName: '',
    username: '',
    password: ''
  })
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [authError, setAuthError] = useState<string | null>(null)

  // Users loaded from Firestore
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([])

  // Relationships state (Firestore real-time)
  const [relationships, setRelationships] = useState<Relationship[]>([])

  // Compute mutuals from relationships and registeredUsers
  const MUTUALS = useMemo(() => {
    if (!user.username) return []
    const myAdmiring = relationships
      .filter(r => r.admirer === user.username)
      .map(r => r.target)
    const admiringMe = relationships
      .filter(r => r.target === user.username)
      .map(r => r.admirer)
    const mutualUsernames = myAdmiring.filter(username =>
      admiringMe.includes(username)
    )
    return registeredUsers
      .filter(u => mutualUsernames.includes(u.username))
      .map(u => ({
        ...u,
        isMutual: true,
        isOnline: u.isOnline || false,
        activity: u.activity || ('Idle' as const),
        position: u.position || ([0, 0, 0] as [number, number, number]),
        points: u.points || 0,
        admirersCount: u.admirersCount || 0,
        mutualsCount: u.mutualsCount || 0,
        strikes: u.strikes || 0
      }))
  }, [user.username, relationships, registeredUsers])

  // Admin authority lives in the Firebase Auth custom claim `admin`,
  // set by the setAdmin Cloud Function (Stage 2c). The Firestore Rules
  // enforce this server-side; this client state is just for UI.
  // ADMIN_USERNAMES.includes(...) is kept as a TEMPORARY fallback so
  // existing admins keep working until the bootstrap setAdmin call is
  // run for them — it should be removed once all admins have the claim.
  const [hasAdminClaim, setHasAdminClaim] = useState(false)
  useEffect(() => {
    let cancelled = false
    const unsubscribe = auth.onIdTokenChanged(async (fbUser) => {
      if (!fbUser) {
        if (!cancelled) setHasAdminClaim(false)
        return
      }
      try {
        const tokenResult = await fbUser.getIdTokenResult()
        if (!cancelled) setHasAdminClaim(tokenResult.claims.admin === true)
      } catch {
        if (!cancelled) setHasAdminClaim(false)
      }
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  const isAdmin = hasAdminClaim || ADMIN_USERNAMES.includes(user.username)

  // Check if current user is under 16 (for explicit content filtering)
  const userIsUnder16 = useMemo(() => {
    if (!user.username) return false
    const userRecord = registeredUsers.find(
      u => u.username === user.username
    ) as any
    if (!userRecord?.birthDate) return false
    const birth = new Date(userRecord.birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age < 16
  }, [registeredUsers, user.username])

  // Reports state (Firestore real-time)
  const [reports, setReports] = useState<Report[]>([])

  // Notifications state (Firestore real-time)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  // Avatar customization state (loaded from Firestore user doc)
  const [allAvatarConfigs, setAllAvatarConfigs] = useState<
    Record<string, AvatarConfig>
  >({})

  const avatarConfig = allAvatarConfigs[user.username] || null
  const setAvatarConfig = useCallback(
    (config: AvatarConfig | null) => {
      setAllAvatarConfigs(prev => {
        if (!config) {
          const next = { ...prev }
          ;-delete next[user.username]
          return next
        }
        return { ...prev, [user.username]: config }
      })
    },
    [user.username]
  )

  // Unlocked avatar items (loaded from Firestore user doc)
  const [allUnlockedItems, setAllUnlockedItems] = useState<
    Record<string, string[]>
  >({})

  const unlockedAvatarItems = useMemo(
    () => new Set(allUnlockedItems[user.username] || []),
    [allUnlockedItems, user.username]
  )
  const setUnlockedAvatarItems = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setAllUnlockedItems(prev => {
        const currentSet = new Set(prev[user.username] || [])
        const newSet =
          typeof updater === 'function' ? updater(currentSet) : updater
        return { ...prev, [user.username]: [...newSet] }
      })
    },
    [user.username]
  )

  // Blocked users state (loaded from Firestore user doc)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())

  // Reading activity (loaded from Firestore user doc)
  const [readingActivity, setReadingActivity] = useState<
    Record<string, { bookId: string; progress: number; lastRead: string }[]>
  >({})

  // Item price overrides (loaded from Firestore user doc, admin only)
  const [itemPriceOverrides, setItemPriceOverrides] = useState<
    Record<string, number>
  >({})

  const getItemCost = (itemId: string): number => {
    if (itemId in itemPriceOverrides) return itemPriceOverrides[itemId]
    const item = AVATAR_ITEMS.find(i => i.id === itemId)
    return item?.cost ?? 0
  }

  const handleUpdateItemPrice = (itemId: string, price: number) => {
    const updated = { ...itemPriceOverrides, [itemId]: price }
    setItemPriceOverrides(updated)
    if (firebaseUid)
      fbService
        .updateUserProfile(firebaseUid, { itemPriceOverrides: updated })
        .catch(console.error)
  }

  // Comments state (Firestore real-time)
  const [allComments, setAllComments] = useState<Comment[]>([])

  // Rewards state/logic lives in useRewards (Phase B), placed before the
  // handlers (handleLike/handleLikeComment) and the persist effect that consume
  // awardPoints / rewardedItems / lastClaimedPoints.
  const rewards = useRewards({ user, setUser, showToast, showConfirm })
  const {
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
  } = rewards

  // Cart (loaded from Firestore user doc)
  const [cart, setCart] = useState<Book[]>([])

  // Per-user book ownership and progress (loaded from Firestore user doc)
  const [userBookData, setUserBookData] = useState<
    Record<
      string,
      {
        ownedBookIds: string[]
        purchasedBookIds?: string[]
        bookProgress: Record<string, BookProgress>
      }
    >
  >({})
  // Keep a ref in sync so immediate Firestore writes always read the latest data
  const userBookDataRef = useRef(userBookData)
  userBookDataRef.current = userBookData

  // Helper to get total likes for a book (handles both old number and new number[] format)
  const getTotalLikes = (likes: number | number[]): number => {
    if (Array.isArray(likes)) return likes.reduce((a, b) => a + b, 0)
    return likes || 0
  }

  // Helper to get chapter likes for a book (ensures array format)
  const getChapterLikes = (
    likes: number | number[],
    chapterCount: number
  ): number[] => {
    if (Array.isArray(likes)) {
      // Extend array if needed for new chapters
      const arr = [...likes]
      while (arr.length < chapterCount) arr.push(0)
      return arr
    }
    // Migrate old format: distribute total evenly or put all on first chapter
    const arr = new Array(Math.max(chapterCount, 1)).fill(0)
    arr[0] = likes || 0
    return arr
  }

  // Helper to get current user's owned book IDs
  const getUserOwnedBookIds = useCallback(() => {
    const owned = userBookData[user.username]?.ownedBookIds || []
    const purchased = userBookData[user.username]?.purchasedBookIds || []
    return new Set([...owned, ...purchased])
  }, [userBookData, user.username])

  const isBookFavorited = useCallback(
    (bookId: string): boolean => {
      return favoriteBookIds.has(bookId)
    },
    [favoriteBookIds]
  )

  // Helper to get current user's progress for a book
  const getUserBookProgress = useCallback(
    (bookId: string): BookProgress => {
      const progress = userBookData[user.username]?.bookProgress?.[bookId]
      if (!progress) return { scrollProgress: 0, chapterIndex: 0 }
      // Handle old format migration
      if (typeof progress === 'number')
        return { scrollProgress: progress, chapterIndex: 0 }
      return {
        scrollProgress: progress.scrollProgress ?? 0,
        chapterIndex: progress.chapterIndex ?? 0,
        scrollTopPx: progress.scrollTopPx,
        scrollHeightPx: progress.scrollHeightPx,
        clientHeightPx: progress.clientHeightPx,
        scrollLeftPx: progress.scrollLeftPx,
        scrollWidthPx: progress.scrollWidthPx,
        clientWidthPx: progress.clientWidthPx,
        savedAt: progress.savedAt
      }
    },
    [userBookData, user.username]
  )

  // Helper to mark a book as owned for current user
  const setUserOwnsBook = useCallback(
    (bookId: string) => {
      setUserBookData(prev => {
        const userData = prev[user.username] || {
          ownedBookIds: [],
          bookProgress: {},
          purchasedBookIds: []
        }
        if (!userData.ownedBookIds.includes(bookId)) {
          userData.ownedBookIds = [...userData.ownedBookIds, bookId]
        }
        // Also track as purchased so removing from library doesn't lose access
        if (!userData.purchasedBookIds) userData.purchasedBookIds = []
        if (!userData.purchasedBookIds.includes(bookId)) {
          userData.purchasedBookIds = [...userData.purchasedBookIds, bookId]
        }
        return { ...prev, [user.username]: userData }
      })
    },
    [user.username]
  )

  // Helper to update progress for current user (scroll progress + chapter index + exact position)
  const setUserBookProgress = useCallback(
    (
      bookId: string,
      scrollProgress: number,
      chapterIndex: number,
      exact?: Partial<BookProgress>
    ) => {
      setUserBookData(prev => {
        const userData = prev[user.username] || {
          ownedBookIds: [],
          bookProgress: {}
        }
        const existing = userData.bookProgress?.[bookId] || {
          scrollProgress: 0,
          chapterIndex: 0
        }
        userData.bookProgress = {
          ...userData.bookProgress,
          [bookId]: {
            ...existing,
            scrollProgress,
            chapterIndex,
            ...exact,
            savedAt: Date.now()
          }
        }
        return { ...prev, [user.username]: userData }
      })
    },
    [user.username]
  )

  // Debounce ref for batched Firestore writes
  const persistTimerRef = useRef<any>(null)
  const pendingAdmireRef = useRef<Set<string>>(new Set())

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

  // Publishing temp state
  const [currentPublishingContent, setCurrentPublishingContent] = useState('')
  const [currentPublishingTitle, setCurrentPublishingTitle] = useState('')
  const [currentPublishingChapterTitle, setCurrentPublishingChapterTitle] =
    useState('')
  const [currentPublishingId, setCurrentPublishingId] = useState<string | null>(
    null
  )
  const [currentPublishingChapterIndex, setCurrentPublishingChapterIndex] =
    useState<number | null>(null)
  const [publishingInitialData, setPublishingInitialData] = useState<any>(null)

  // Persistence for WriteView state through navigation unmounts
  const [lastSelectedBookId, setLastSelectedBookId] = useState<string>('new')
  const [lastSelectedChapterIndex, setLastSelectedChapterIndex] =
    useState<string>('new')

  // Subscribe to Firestore books in real-time
  useEffect(() => {
    if (!firebaseUid) return
    const unsubscribe = fbService.subscribeToBooksChanges(
      (firestoreBooks: any[]) => {
        const converted = firestoreBooks.map((fb: any) => ({
          ...fb,
          author: {
            username: fb.authorUsername || fb.author?.username || 'unknown',
            displayName:
              fb.authorDisplayName || fb.author?.displayName || 'Unknown',
            isOnline: false,
            activity: 'Idle' as const,
            position: [0, 0, 0] as [number, number, number],
            isMutual: false,
            points: 0,
            admirersCount: 0,
            mutualsCount: 0,
            strikes: 0
          },
          // Ensure likes is always an array
          likes: Array.isArray(fb.likes) ? fb.likes : [fb.likes || 0],
          isFavorite: favoriteBookIds.has(fb.id),
          price: fb.price ?? 0
        }))
        setBooks(converted)
      }
    )
    return () => unsubscribe()
  }, [favoriteBookIds, firebaseUid])

  useEffect(() => {
    const unsubscribe = fbService.subscribeToGlobalSpotlight(
      (spotlight: any) => {
        setGlobalSpotlightBookId(spotlight?.spotlightBookId || null)
      }
    )
    return () => unsubscribe()
  }, [])

  const [spotlightInit, setSpotlightInit] = useState(false)

  useEffect(() => {
    if (books.length === 0 || spotlightInit) return
    setSpotlightInit(true)
    fbService.ensureGlobalSpotlight(books).catch((err: any) => {
      console.warn('[MainWRLD] Spotlight disabled:', err?.message || err)
    })
  }, [books, spotlightInit])

  useEffect(() => {
    setBooks(prev =>
      prev.map(book => {
        const nextIsFavorite = favoriteBookIds.has(book.id)
        return book.isFavorite === nextIsFavorite
          ? book
          : { ...book, isFavorite: nextIsFavorite }
      })
    )
    setSelectedBook(prev => {
      if (!prev) return prev
      const nextIsFavorite = favoriteBookIds.has(prev.id)
      return prev.isFavorite === nextIsFavorite
        ? prev
        : { ...prev, isFavorite: nextIsFavorite }
    })
  }, [favoriteBookIds])

  // Subscribe to all registered users in real-time for online status and reading activity
  useEffect(() => {
    if (!firebaseUid) return
    const unsubscribe = fbService.subscribeToUsers((users: any[]) => {
      setRegisteredUsers(users)
      // Pre-populate avatar configs for all users so profile views show avatars
      const configs: Record<string, AvatarConfig> = {}
      const unlocked: Record<string, string[]> = {}
      const readingAct: Record<string, any[]> = {}
      users.forEach((u: any) => {
        if (u.avatarConfig && u.username) configs[u.username] = u.avatarConfig
        if (u.unlockedItems && u.username)
          unlocked[u.username] = u.unlockedItems
        if (u.readingActivity && u.username)
          readingAct[u.username] = u.readingActivity
      })
      if (Object.keys(configs).length > 0) {
        setAllAvatarConfigs(prev => ({ ...prev, ...configs }))
      }
      if (Object.keys(unlocked).length > 0) {
        setAllUnlockedItems(prev => ({ ...prev, ...unlocked }))
      }
      if (Object.keys(readingAct).length > 0) {
        setReadingActivity(prev => ({ ...prev, ...readingAct }))
      }
    })
    return () => unsubscribe()
  }, [firebaseUid])

  // ===== FIRESTORE REAL-TIME SUBSCRIPTIONS =====

  // Subscribe to relationships
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToRelationships((rels: any[]) => {
      setRelationships(
        rels.map(r => ({
          admirer: r.admirer,
          target: r.target,
          timestamp: r.timestamp
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  // Subscribe to chat messages
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToChatMessages((msgs: any[]) => {
      setChatMessages(
        msgs.map(m => ({
          id: m.id,
          from: m.from,
          to: m.to,
          text: m.text,
          timestamp: m.timestamp,
          read: m.read
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  // Subscribe to notifications
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToNotifications((notifs: any[]) => {
      setNotifications(
        notifs.map(n => ({
          id: n.id,
          title: n.title,
          message: n.message,
          icon: n.icon,
          timestamp: n.timestamp ? new Date(n.timestamp) : new Date(),
          recipient: n.recipient,
          sender: n.sender,
          read: n.read,
          targetId: n.targetId,
          targetChapterIndex: n.targetChapterIndex,
          commentId: n.commentId
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  // Subscribe to comments
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToComments((comments: any[]) => {
      setAllComments(
        comments.map(c => ({
          id: c.id || c.commentId || c.docId,
          bookId: c.bookId,
          chapterIndex: c.chapterIndex,
          author: c.author,
          authorUsername: c.authorUsername,
          text: c.text,
          likes: c.likes || 0,
          likedBy: c.likedBy || [],
          timestamp: c.timestamp || 'Now'
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

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

  // Subscribe to reports
  useEffect(() => {
    if (!firebaseUid || !isAdmin) return
    const unsub = fbService.subscribeToReports((reps: any[]) => {
      setReports(
        reps.map(r => ({
          id: r.id,
          type: r.type,
          targetId: r.targetId,
          reportedBy: r.reportedBy,
          timestamp: r.timestamp,
          status: r.status
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid, isAdmin])

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
          profile.dailyChaptersPublished !== undefined
        ) {
          setUser(prev => ({
            ...prev,
            dailyEarnedPoints: profile.dailyEarnedPoints || 0,
            lastPointsReset: profile.lastPointsReset || null,
            membershipStartDate: profile.membershipStartDate || null,
            lastMembershipRewardDate: profile.lastMembershipRewardDate || null,
            dailyChaptersPublished: profile.dailyChaptersPublished || 0,
            lastChapterPublishReset: profile.lastChapterPublishReset || 0
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

  // Load avatar config for other users when viewing their profile
  useEffect(() => {
    if (!selectedProfileUser || selectedProfileUser.username === user.username)
      return
    if (allAvatarConfigs[selectedProfileUser.username]) return // already loaded
    fbService
      .getUserByUsername(selectedProfileUser.username)
      .then((profile: any) => {
        if (profile?.avatarConfig) {
          setAllAvatarConfigs(prev => ({
            ...prev,
            [selectedProfileUser.username]: profile.avatarConfig
          }))
        }
      })
      .catch(console.error)
  }, [selectedProfileUser])

  // Save likedBooks to Firestore after user interaction
  useEffect(() => {
    if (likedBooksInteracted.current && firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, { likedBooks: Array.from(likedBooks) })
        .catch(console.error)
    }
  }, [likedBooks])

  // Message expiry: delete messages older than 1 year from Firestore
  useEffect(() => {
    if (!user.username) return
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    fbService
      .deleteChatMessagesOlderThan(oneYearAgo.toISOString())
      .catch(console.error)
  }, [])

  // Mark messages as read when viewing a chat conversation (writes to Firestore)
  useEffect(() => {
    if (view === 'chat-conversation' && selectedChatUser && user.username) {
      fbService
        .markMessagesRead(selectedChatUser, user.username)
        .catch(console.error)
    }
  }, [view, selectedChatUser])

  // NOTE: Individual persist effects removed — all user data is now batched
  // into a single debounced write (see persistTimerRef effect above)
  // This reduces Firestore writes by ~8x and prevents quota exhaustion

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

  // Firebase Auth state listener - handles auto-login
  useEffect(() => {
    const timer = setTimeout(() => {
      const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
        if (firebaseUser) {
          try {
            const profile = await fbService.getUserProfile(firebaseUser.uid)
            if (profile) {
              setUser({
                username: (profile as any).username,
                displayName: (profile as any).displayName,
                isOnline: true,
                activity: 'Idle',
                position: [0, 0, 0],
                isMutual: false,
                points: (profile as any).points || 0,
                admirersCount: (profile as any).admirersCount || 0,
                mutualsCount: (profile as any).mutualsCount || 0,
                strikes: (profile as any).strikes || 0,
                isPremium: (profile as any).isPremium || false,
                admiringCount: (profile as any).admiringCount || 0,
                premiumSince: (profile as any).premiumSince || 0
              })
              setFirebaseUid(firebaseUser.uid)
              setView('home')
              // Mark user online in Firestore on auth restore
              fbService
                .updateUserProfile(firebaseUser.uid, {
                  isOnline: true,
                  lastOnline: new Date().toISOString()
                })
                .catch(console.error)
            } else {
              setFavoriteBookIds(new Set())
              setView('landing')
            }
          } catch {
            setFavoriteBookIds(new Set())
            setView('landing')
          }
        } else {
          setFavoriteBookIds(new Set())
          setView('landing')
        }
        setAuthLoading(false)
      })
      return () => unsubscribe()
    }, 1500) // Keep splash screen delay
    return () => clearTimeout(timer)
  }, [])

  const addNotification = useCallback(
    (
      title: string,
      message: string,
      icon: string,
      recipient?: string,
      sender?: string,
      targetId?: string,
      targetChapterIndex?: number,
      commentId?: string
    ) => {
      const newNotif = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        message,
        icon,
        timestamp: new Date().toISOString(),
        recipient: recipient || user.username,
        sender: sender || user.username,
        read: false,
        targetId,
        targetChapterIndex,
        commentId
      }
      fbService.addNotificationDoc(newNotif).catch(console.error)
    },
    [user.username]
  )

  const handleUnpublishChapter = (bookId: string, chapterIndex: number) => {
    setBooks(prev =>
      prev.map(b => {
        if (b.id === bookId) {
          if (chapterIndex < b.chaptersCount) {
            const newChaptersCount = Math.max(0, b.chaptersCount - 1)
            fbService
              .updateBook(bookId, { chaptersCount: newChaptersCount })
              .catch(console.error)
            return { ...b, chaptersCount: newChaptersCount }
          }
        }
        return b
      })
    )
    showToast('Chapter unpublished and moved to drafts.', 'info')
  }

  const handleDeleteChapter = (bookId: string, chapterIndex: number) => {
    setBooks(prev =>
      prev.map(b => {
        if (b.id === bookId && b.chapters) {
          const updatedChapters = b.chapters.filter(
            (_, i) => i !== chapterIndex
          )
          const newChaptersCount =
            chapterIndex < b.chaptersCount
              ? Math.max(0, b.chaptersCount - 1)
              : b.chaptersCount
          const newContent = updatedChapters.map(c => c.content).join('\n\n')
          fbService
            .updateBook(bookId, {
              chapters: updatedChapters,
              chaptersCount: newChaptersCount,
              content: newContent
            })
            .catch(console.error)
          return {
            ...b,
            chapters: updatedChapters,
            chaptersCount: newChaptersCount,
            content: newContent
          }
        }
        return b
      })
    )
    showToast('Chapter permanently deleted.', 'error')
  }

  const handleLogout = async () => {
    // Mark offline in Firestore before logging out
    if (firebaseUid) {
      await fbService
        .updateUserProfile(firebaseUid, {
          isOnline: false,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    }
    try {
      await fbService.logOut()
    } catch {}
    setUser(BLANK_USER)
    setFirebaseUid(null)
    setFavoriteBookIds(new Set())
    setUserDataLoaded(false)
    setView('landing')
  }

  const handleNotificationClick = (n: NotificationItem) => {
    console.log('[Notification Click]', n)

    // Mark notification as read when clicked
    if (n.id) {
      fbService.markNotificationRead(n.id).catch(console.error)
    }

    // Handle comment notifications - link to comment
    if (n.title.includes('Comment')) {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setReadingChapterIndex(n.targetChapterIndex || 0)
          setActiveCommentChapterKey(
            `${n.targetId}_${n.targetChapterIndex || 0}`
          )
          // Scroll to the specific comment if commentId is available
          if (n.commentId) {
            setScrollToCommentId(n.commentId)
          }
          setView('comments')
        }
      }
      return
    }

    // Handle chapter like notifications - link to book
    if (n.title.includes('Liked') || n.title === 'Chapter Liked') {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView('book-detail')
        }
      }
      return
    }

    // Handle admirer/mutual notifications
    if (n.title === 'New Admirer' || n.title === 'Mutual Connection!') {
      const username = n.targetId || n.sender
      if (username) {
        const targetUser =
          MUTUALS.find(u => u.username === username) ||
          registeredUsers.find(u => u.username === username)
        if (targetUser) {
          setSelectedProfileUser(targetUser)
          setView('profile')
        }
      }
      return
    }

    // Handle message notifications
    if (n.title.includes('Message')) {
      const chatUser = n.targetId || n.sender
      if (chatUser) {
        setSelectedChatUser(chatUser)
        setView('chat-conversation')
      }
      return
    }

    // Handle new book/chapter notifications
    if (n.title === 'New Book' || n.title === 'New Chapter') {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView('book-detail')
        }
      }
      return
    }
  }

  const handleLogin = async () => {
    try {
      const result = await fbService.logIn(
        loginForm.username,
        loginForm.password
      )
      setUser({
        username: (result as any).username,
        displayName: (result as any).displayName,
        isOnline: true,
        activity: 'Idle',
        position: [0, 0, 0],
        isMutual: false,
        points: (result as any).points || 0,
        admirersCount: (result as any).admirersCount || 0,
        mutualsCount: (result as any).mutualsCount || 0,
        strikes: (result as any).strikes || 0,
        isPremium: (result as any).isPremium || false,
        admiringCount: (result as any).admiringCount || 0
      })
      setFirebaseUid((result as any).uid)
      setFavoriteBookIds(new Set())
      setAuthError(null)
      setView('home')
      // Mark user online in Firestore
      fbService
        .updateUserProfile((result as any).uid, {
          isOnline: true,
          lastOnline: new Date().toISOString()
        })
        .catch(console.error)
    } catch (err: any) {
      setAuthError(err.message || 'Invalid username or password.')
    }
  }

  const handleSignup = async () => {
    const { username, displayName, password, email } = signUpForm

    // Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setAuthError('Please enter a valid email address.')
      return
    }
    const usernameRegex = /^[a-z0-9_]{5,25}$/
    if (!usernameRegex.test(username)) {
      setAuthError('Username must be 5-25 chars, lowercase, no spaces.')
      return
    }
    if (displayName.length < 5 || displayName.length > 25) {
      setAuthError('Display Name must be 5-25 characters.')
      return
    }
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,35}$/
    if (!passwordRegex.test(password)) {
      setAuthError(
        'Password must be 12-35 characters and include at least one uppercase letter, one number, and one symbol.'
      )
      return
    }
    if (containsBadWord(username) || containsBadWord(displayName)) {
      setAuthError('Username or display name contains inappropriate language.')
      return
    }

    // Check username uniqueness via Firestore
    try {
      const usernameAvailable = await fbService.checkUsernameAvailable(username)
      if (!usernameAvailable) {
        setAuthError('Username already taken.')
        return
      }
    } catch {
      setAuthError('Unable to check username. Please try again.')
      return
    }

    try {
      const result = await fbService.signUp(
        email,
        password,
        username,
        displayName,
        signUpForm.birthDate
      )

      const newUser: User = {
        username,
        displayName,
        isOnline: true,
        activity: 'Idle',
        position: [0, 0, 0],
        isMutual: false,
        points: 50,
        admirersCount: 0,
        mutualsCount: 0,
        strikes: 0
      }

      setUser(newUser)
      setFirebaseUid(result.uid)
      setFavoriteBookIds(new Set())
      setAuthError(null)
      setView('home')

      // Refresh registered users list
      fbService
        .getAllUsers()
        .then((users: any[]) => setRegisteredUsers(users))
        .catch(console.error)

      // Send welcome email asynchronously (non-blocking)
      if (email) {
        sendWelcomeEmail(email, displayName, username)
      }
      addNotification(
        'Welcome to MainWRLD!',
        `Hey ${displayName}, start exploring stories and connecting with other readers!`,
        'celebration',
        username
      )
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists.')
      } else {
        setAuthError(err.message || 'Signup failed. Please try again.')
      }
    }
  }

  const handleSendMessage = (toUsername: string, text: string) => {
    if (!text.trim()) return
    if (containsBadWord(text)) {
      showToast('Your message contains inappropriate language.', 'warning')
      return
    }
    // Write to Firestore — real-time subscription will update local state
    fbService
      .sendChatMessage(user.username, toUsername, text.trim())
      .catch(console.error)
    // Send notification to recipient
    const recipientUser =
      registeredUsers.find(u => u.username === toUsername) ||
      MUTUALS.find(u => u.username === toUsername)
    if (recipientUser) {
      addNotification(
        'New Message',
        `${user.displayName}: ${text.trim().slice(0, 50)}${
          text.length > 50 ? '...' : ''
        }`,
        'chat',
        toUsername
      )
    }
  }

  const handleLike = async (bookId: string, chapterIndex: number = 0) => {
    likedBooksInteracted.current = true
    const likeKey = `${bookId}:${chapterIndex}`
    const isLiked = likedBooks.has(likeKey)

    const targetBook = books.find(b => b.id === bookId)
    if (!targetBook) return

    const chLikes = getChapterLikes(
      targetBook.likes,
      targetBook.chapters?.length || 1
    )

    if (isLiked) {
      const next = new Set(likedBooks)
      next.delete(likeKey)
      setLikedBooks(next)
      chLikes[chapterIndex] = Math.max(0, (chLikes[chapterIndex] || 0) - 1)
    } else {
      const next = new Set(likedBooks)
      next.add(likeKey)
      setLikedBooks(next)
      chLikes[chapterIndex] = (chLikes[chapterIndex] || 0) + 1
      const chapterTitle =
        targetBook.chapters?.[chapterIndex]?.title ||
        `Chapter ${chapterIndex + 1}`
      const authorUsername =
        (targetBook as any).authorUsername || targetBook.author.username
      addNotification(
        'Chapter Liked',
        `${user?.displayName} liked ${chapterTitle} from "${targetBook.title}"`,
        'favorite',
        authorUsername,
        user.username,
        targetBook.id,
        chapterIndex
      )

      // Earned points: award book author 2 pts when chapter hits like threshold
      const rewardKey = `chapter:${bookId}:${chapterIndex}:${Math.floor(
        chLikes[chapterIndex] / CHAPTER_LIKES_THRESHOLD
      )}`
      if (
        chLikes[chapterIndex] % CHAPTER_LIKES_THRESHOLD === 0 &&
        !rewardedItems.has(rewardKey) &&
        targetBook.author.username === user.username
      ) {
        setRewardedItems(prev => new Set(prev).add(rewardKey))
        awardPoints(2, `${chapterTitle} hit ${chLikes[chapterIndex]} likes!`)
      }
    }

    // Update locally for immediate UI feedback
    setBooks(prev =>
      prev.map(b => {
        if (b.id !== bookId) return b
        const updated = { ...b, likes: [...chLikes] }
        if (selectedBook && selectedBook.id === bookId) setSelectedBook(updated)
        return updated
      })
    )

    // Persist to Firestore
    fbService.updateBook(bookId, { likes: chLikes }).catch(console.error)
  }

  const handleAdmire = (targetUser: User) => {
    const admireKey = `${user.username}->${targetUser.username}`

    // Prevent rapid double-clicks while Firestore is updating
    if (pendingAdmireRef.current.has(admireKey)) return

    const alreadyAdmiring = relationships.some(
      r => r.admirer === user.username && r.target === targetUser.username
    )

    if (alreadyAdmiring) {
      // Check if they are mutuals before un-admiring
      const isMutual = relationships.some(
        r => r.admirer === targetUser.username && r.target === user.username
      )
      if (isMutual) {
        showConfirm({
          title: 'Stop being mutuals?',
          message: `You and ${targetUser.displayName} will no longer be mutuals. Chat will be disabled but previous messages will be saved as read-only.`,
          confirmLabel: 'Yes, stop admiring',
          cancelLabel: 'Cancel',
          icon: 'people_outline',
          onConfirm: () => {
            pendingAdmireRef.current.add(admireKey)
            // Optimistic local update: remove relationship
            setRelationships(prev =>
              prev.filter(
                r =>
                  !(
                    r.admirer === user.username &&
                    r.target === targetUser.username
                  )
              )
            )
            fbService
              .removeRelationship(user.username, targetUser.username)
              .catch(console.error)
              .finally(() => pendingAdmireRef.current.delete(admireKey))
            showToast('You are no longer mutuals', 'people_outline')
          },
          onCancel: () => {}
        })
      } else {
        // Not mutuals, just un-admire silently
        pendingAdmireRef.current.add(admireKey)
        setRelationships(prev =>
          prev.filter(
            r =>
              !(r.admirer === user.username && r.target === targetUser.username)
          )
        )
        fbService
          .removeRelationship(user.username, targetUser.username)
          .catch(console.error)
          .finally(() => pendingAdmireRef.current.delete(admireKey))
        showToast('Stopped admiring', 'person_remove')
      }
      return
    }

    // Lock to prevent duplicate clicks
    pendingAdmireRef.current.add(admireKey)

    // Optimistic local update: add relationship immediately
    setRelationships(prev => [
      ...prev,
      {
        admirer: user.username,
        target: targetUser.username,
        timestamp: new Date().toISOString()
      }
    ])

    // Add admire relationship to Firestore
    fbService
      .addRelationship(user.username, targetUser.username)
      .catch(console.error)
      .finally(() => pendingAdmireRef.current.delete(admireKey))

    // Notify the target user they have a new admirer
    addNotification(
      'New Admirer',
      `${user.displayName} is now admiring you!`,
      'person_add',
      targetUser.username
    )

    // Check if this creates a mutual (target already admires current user)
    // Use local state first, then fall back to Firestore query for reliability
    const targetAdmiresLocal = relationships.some(
      r => r.admirer === targetUser.username && r.target === user.username
    )
    if (targetAdmiresLocal) {
      addNotification(
        'Mutual Connection!',
        `You and ${targetUser.displayName} are now mutuals!`,
        'people',
        user.username
      )
      addNotification(
        'Mutual Connection!',
        `You and ${user.displayName} are now mutuals!`,
        'people',
        targetUser.username
      )
    } else {
      // Firestore fallback: local relationships state might not have the reverse relationship yet
      fbService
        .checkRelationshipExists(targetUser.username, user.username)
        .then(exists => {
          if (exists) {
            addNotification(
              'Mutual Connection!',
              `You and ${targetUser.displayName} are now mutuals!`,
              'people',
              user.username
            )
            addNotification(
              'Mutual Connection!',
              `You and ${user.displayName} are now mutuals!`,
              'people',
              targetUser.username
            )
          }
        })
        .catch(console.error)
    }
  }

  const handleReport = (
    type: 'Book' | 'Comment' | 'User',
    targetId: string
  ) => {
    const newReport = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      targetId,
      reportedBy: user.username,
      timestamp: new Date().toISOString(),
      status: 'pending'
    }
    fbService.addReportDoc(newReport).catch(console.error)
    addNotification(
      'Report Filed',
      `Your report for ${type.toLowerCase()} has been submitted.`,
      'flag'
    )
    showToast(`${type} reported successfully!`, 'flag')
  }

  const handleRemoveBook = (bookId: string) => {
    fbService.deleteBook(bookId).catch(console.error)
    reports
      .filter(r => r.targetId === bookId && r.type === 'Book')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
  }

  const handleRemoveComment = (commentId: string) => {
    fbService.removeCommentDoc(commentId).catch(console.error)
    // Resolve any reports for this comment
    reports
      .filter(r => r.targetId === commentId && r.type === 'Comment')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
  }

  const handleAddStrike = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (targetUser?.uid) {
      fbService
        .updateUserProfile(targetUser.uid, {
          strikes: (targetUser.strikes || 0) + 1
        })
        .catch(console.error)
    }
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username ? { ...u, strikes: (u.strikes || 0) + 1 } : u
      )
    )
  }

  const handleRemoveStrike = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (targetUser?.uid && targetUser.strikes > 0) {
      fbService
        .updateUserProfile(targetUser.uid, { strikes: targetUser.strikes - 1 })
        .catch(console.error)
    }
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username && u.strikes > 0
          ? { ...u, strikes: u.strikes - 1 }
          : u
      )
    )
  }

  const handleBanUser = (username: string) => {
    // Remove user's comments from Firestore
    fbService.removeCommentsByAuthor(username).catch(console.error)
    // Remove user's relationships from Firestore
    fbService.removeAllRelationshipsForUser(username).catch(console.error)
    // Resolve reports for this user
    reports
      .filter(r => r.targetId === username && r.type === 'User')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
    // Delete user's books from Firestore
    books
      .filter(b => b.author.username === username)
      .forEach(b => {
        fbService.deleteBook(b.id).catch(console.error)
      })
    // Note: User account deletion from Firebase Auth would require admin SDK
    // For now, just update their profile with a banned flag
    const bannedUser = registeredUsers.find(u => u.username === username)
    if (bannedUser?.uid) {
      fbService
        .updateUserProfile(bannedUser.uid, { isBanned: true })
        .catch(console.error)
    }
    setRegisteredUsers(prev => prev.filter(u => u.username !== username))
  }

  const handleDismissReport = (reportId: string) => {
    fbService.updateReportStatus(reportId, 'dismissed').catch(console.error)
  }

  const handleBlockUser = (targetUsername: string) => {
    if (targetUsername === user.username) return // Can't block yourself
    setBlockedUsers(prev => new Set([...prev, targetUsername]))
    // Remove any admire relationships in both directions via Firestore
    fbService
      .removeRelationshipsBetween(user.username, targetUsername)
      .catch(console.error)
    addNotification(
      'User Blocked',
      `You blocked @${targetUsername}. You will no longer see their content.`,
      'block'
    )
    setView('home')
  }

  const handleUnblockUser = (targetUsername: string) => {
    setBlockedUsers(prev => {
      const next = new Set(prev)
      next.delete(targetUsername)
      return next
    })
  }

  const handleSaveToLibrary = (bookId: string) => {
    setBooks(prev => {
      const updated = prev.map(b =>
        b.id === bookId ? { ...b, isOwned: true } : b
      )
      const updatedBook = updated.find(b => b.id === bookId)
      if (updatedBook && selectedBook && selectedBook.id === bookId)
        setSelectedBook(updatedBook)
      return updated
    })
    // Compute updated data from the ref, then SYNC the ref immediately
    // so rapid consecutive saves each see the previous save's result
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const newOwned = currentUd.ownedBookIds.includes(bookId)
      ? currentUd.ownedBookIds
      : [...currentUd.ownedBookIds, bookId]
    const currentPurchased = currentUd.purchasedBookIds || []
    const newPurchased = currentPurchased.includes(bookId)
      ? currentPurchased
      : [...currentPurchased, bookId]
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased
    }
    // Sync the ref RIGHT NOW so the next rapid save sees this book
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
    showToast('Book saved to your library!', 'bookmark')
    if (firebaseUid) {
      fbService.addBookToLibrary(firebaseUid, bookId).catch(console.error)
    }
  }

  const handleRemoveFromLibrary = (bookId: string) => {
    setBooks(prev => {
      const updated = prev.map(b =>
        b.id === bookId ? { ...b, isOwned: false } : b
      )
      const updatedBook = updated.find(b => b.id === bookId)
      if (updatedBook && selectedBook && selectedBook.id === bookId)
        setSelectedBook(updatedBook)
      return updated
    })
    // Compute updated data from the ref, then SYNC the ref immediately
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const newOwned = currentUd.ownedBookIds.filter(
      (id: string) => id !== bookId
    )
    const newPurchased = (currentUd.purchasedBookIds || []).filter(
      (id: string) => id !== bookId
    )
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased
    }
    // Sync the ref RIGHT NOW so the next rapid remove sees this change
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
    showToast('Book removed from your library.', 'bookmark_remove')
    if (firebaseUid) {
      fbService.removeBookFromLibrary(firebaseUid, bookId).catch(console.error)
    }
  }

  const isBookInLibrary = useCallback(
    (bookId: string): boolean => {
      const userData = userBookData[user.username] || {
        ownedBookIds: [],
        bookProgress: {}
      }
      return userData.ownedBookIds.includes(bookId)
    },
    [userBookData, user.username]
  )

  const handleToggleFavorite = (bookId: string) => {
    const nextFavoriteBookIds = new Set(favoriteBookIds)
    const isFavorited = nextFavoriteBookIds.has(bookId)

    if (isFavorited) nextFavoriteBookIds.delete(bookId)
    else nextFavoriteBookIds.add(bookId)

    setFavoriteBookIds(nextFavoriteBookIds)

    setBooks(prev =>
      prev.map(book =>
        book.id === bookId ? { ...book, isFavorite: !isFavorited } : book
      )
    )

    setSelectedBook(prev => {
      if (!prev || prev.id !== bookId) return prev
      return { ...prev, isFavorite: !isFavorited }
    })

    if (firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, {
          favoriteBookIds: Array.from(nextFavoriteBookIds)
        })
        .catch(console.error)
    }
  }

  const handleAddToCart = (book: Book) => {
    if (cart.find(item => item.id === book.id)) {
      showToast('Book is already in your cart!', 'info')
      return
    }
    setCart([...cart, book])
    showToast('Book added to cart!', 'shopping_cart')
  }
  // Rewards logic (awardPoints/handleClaimPoints/handleSpinWheel/membership) -> useRewards (Phase B)

  const handlePublish = async (data: any) => {
    try {
      // Daily chapter publish limit
      const now = Date.now()
      const isNewDay = now - user.lastChapterPublishReset > 24 * 60 * 60 * 1000
      const dailyCount = isNewDay ? 0 : user.dailyChaptersPublished
      if (dailyCount >= MAX_DAILY_CHAPTERS) {
        showToast(
          `You've reached your daily publishing limit of ${MAX_DAILY_CHAPTERS} chapters. Please try again tomorrow!`
        )
        return
      }
      if (
        containsBadWord(currentPublishingTitle || '') ||
        containsBadWord(data.tagline || '') ||
        containsBadWord(currentPublishingChapterTitle || '')
      ) {
        showToast(
          'Your book title, chapter title, or tagline contains inappropriate language. Please revise before publishing.',
          'warning'
        )
        return
      }
      if (currentPublishingId) {
        // Update existing book - preserve existing metadata when just adding/updating chapters
        const existingBook = books.find(b => b.id === currentPublishingId)
        if (existingBook) {
          const updatedChapters = [...(existingBook.chapters || [])]
          const targetIndex =
            currentPublishingChapterIndex !== null
              ? currentPublishingChapterIndex
              : updatedChapters.length - 1

          if (targetIndex >= 0 && targetIndex < updatedChapters.length) {
            const resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              updatedChapters[targetIndex]?.title ||
              `Chapter ${targetIndex + 1}`
            updatedChapters[targetIndex] = {
              ...updatedChapters[targetIndex],
              title: resolvedChapterTitle,
              content: currentPublishingContent
            }
          } else {
            const resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              `Chapter ${updatedChapters.length + 1}`
            updatedChapters.push({
              title: resolvedChapterTitle,
              content: currentPublishingContent
            })
          }

          const updatedLikes = (() => {
            const arr = Array.isArray(existingBook.likes)
              ? [...existingBook.likes]
              : [existingBook.likes || 0]
            while (arr.length < updatedChapters.length) arr.push(0)
            return arr
          })()

          await fbService.updateBook(currentPublishingId, {
            tagline: data.tagline || existingBook.tagline || '',
            isExplicit: data.isExplicit ?? existingBook.isExplicit ?? false,
            genres:
              data.genres && data.genres.length > 0
                ? data.genres
                : existingBook.genres || [],
            hashtags:
              data.hashtags && data.hashtags.length > 0
                ? data.hashtags
                : existingBook.hashtags || [],
            coverImage: data.coverImage || existingBook.coverImage || null,
            coverColor: data.coverImage
              ? '#f5f5f5'
              : existingBook.coverColor ||
                '#' + Math.floor(Math.random() * 16777215).toString(16),
            chapters: updatedChapters,
            chaptersCount: Math.max(
              existingBook.chaptersCount || 0,
              targetIndex + 1
            ),
            likes: updatedLikes,
            isDraft: false,
            commentsEnabled: data.commentsEnabled ?? true,
            content: updatedChapters.map((c: any) => c.content).join('\n\n')
          })

          // Notify users who have this book in their library about the new chapter
          if (
            currentPublishingChapterIndex === null ||
            (existingBook.chapters &&
              currentPublishingChapterIndex >= existingBook.chapters.length)
          ) {
            Object.entries(userBookData).forEach(
              ([username, udata]: [string, any]) => {
                if (
                  username !== user?.username &&
                  udata.ownedBookIds?.includes(currentPublishingId)
                ) {
                  addNotification(
                    'New Chapter',
                    `"${existingBook.title}" has a new chapter!`,
                    'menu_book',
                    username,
                    user?.username
                  )
                }
              }
            )
          }
        }
      } else {
        // New book — write to Firestore
        const bookData = {
          title: currentPublishingTitle,
          authorUid: firebaseUid || '',
          authorUsername: user?.username || '',
          authorDisplayName: user?.displayName || '',
          coverColor: data.coverImage
            ? '#f5f5f5'
            : '#' + Math.floor(Math.random() * 16777215).toString(16),
          coverImage: data.coverImage || null,
          likes: [0],
          commentsCount: 0,
          monetizationAttempts: 0,
          publishedDate: new Date().toISOString().split('T')[0],
          isCompleted: false,
          isExplicit: data.isExplicit ?? false,
          chaptersCount: 1,
          tagline: data.tagline || '',
          genres: data.genres || [],
          hashtags: data.hashtags || [],
          content: currentPublishingContent,
          isDraft: false,
          commentsEnabled: data.commentsEnabled ?? true,
          chapters: [
            {
              title: currentPublishingChapterTitle.trim() || 'Chapter 1',
              content: currentPublishingContent
            }
          ],
          isFree: true,
          price: 0
        }
        await fbService.createBook(bookData)

        // Notify admirers and mutuals about the new book
        const myAdmirers = relationships
          .filter(r => r.target === user?.username)
          .map(r => r.admirer)
        const myAdmiring = relationships
          .filter(r => r.admirer === user?.username)
          .map(r => r.target)
        const notifyUsers = new Set([...myAdmirers, ...myAdmiring])
        notifyUsers.forEach(username => {
          if (username !== user?.username) {
            addNotification(
              'New Book',
              `${user?.displayName} published a new book: "${currentPublishingTitle}"`,
              'auto_stories',
              username,
              user?.username
            )
          }
        })
      }
      setView('self-profile')
      setCurrentPublishingContent('')
      setCurrentPublishingTitle('')
      setCurrentPublishingChapterTitle('')
      setCurrentPublishingId(null)
      setCurrentPublishingChapterIndex(null)
      setPublishingInitialData(null)
      showToast('Published successfully!', 'check_circle')
      // Increment daily chapter publish count
      setUser(prev => {
        const isNewDay =
          Date.now() - prev.lastChapterPublishReset > 24 * 60 * 60 * 1000
        return {
          ...prev,
          dailyChaptersPublished:
            (isNewDay ? 0 : prev.dailyChaptersPublished) + 1,
          lastChapterPublishReset: isNewDay
            ? Date.now()
            : prev.lastChapterPublishReset
        }
      })
    } catch (err: any) {
      console.error('Publish error:', err)
      showToast('Failed to publish. Please try again.', 'error')
    }
  }

  const handleUnpublish = async (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    const wasMonetized = book?.isMonetized
    await fbService.updateBook(bookId, {
      isDraft: true,
      isMonetized: false,
      wasMonetizedBefore: wasMonetized || book?.wasMonetizedBefore || false
    })
    showToast('Book unpublished and moved to drafts.', 'visibility_off')
  }

  const handleDeleteBook = (bookId: string) => {
    showConfirm({
      title: 'This action cannot be undone.',
      message: `Are you sure you want to permanently delete this book?`,
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      icon: 'check_circle',
      onConfirm: async () => {
        await fbService.deleteBook(bookId)
        setView('self-profile')
        showToast(`You successfully deleted your book`)
      },
      onCancel: () => {}
    })
  }

  const handleMarkCompleted = (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    if (!book) return

    if (book.isCompleted) {
      if (book.isMonetized) {
        showConfirm({
          title: 'Warning: Demonetization',
          message:
            'This book is currently monetized. Marking it as uncomplete will permanently demonetize it and it cannot be monetized again. Are you sure?',
          confirmLabel: 'Yes, demonetize and reopen',
          cancelLabel: 'Cancel',
          icon: 'money_off',
          onConfirm: async () => {
            const updates = {
              isCompleted: false,
              wasCompleted: true,
              isMonetized: false,
              wasMonetizedBefore: true,
              isFree: true,
              price: 0
            }
            await fbService.updateBook(bookId, updates)
            if (selectedBook?.id === bookId)
              setSelectedBook((prev: any) =>
                prev ? { ...prev, ...updates } : prev
              )
            showToast('Book demonetized and reopened', 'money_off')
          },
          onCancel: () => {}
        })
      } else {
        showConfirm({
          title: 'Reopen this work?',
          message:
            'This will remove the completed status. The book will become editable again.',
          confirmLabel: 'Reopen',
          cancelLabel: 'Cancel',
          icon: 'undo',
          onConfirm: async () => {
            const updates = { isCompleted: false, wasCompleted: true }
            await fbService.updateBook(bookId, updates)
            if (selectedBook?.id === bookId)
              setSelectedBook((prev: any) =>
                prev ? { ...prev, ...updates } : prev
              )
            showToast('Completed status removed', 'undo')
          },
          onCancel: () => {}
        })
      }
    } else {
      showConfirm({
        title: 'Mark as Completed?',
        message:
          'Once marked completed, this book will become un-editable. Are you sure?',
        confirmLabel: 'Yes, Complete',
        cancelLabel: 'Cancel',
        icon: 'check_circle',
        onConfirm: async () => {
          const updates = { isCompleted: true, wasCompleted: true }
          await fbService.updateBook(bookId, updates)
          if (selectedBook?.id === bookId)
            setSelectedBook((prev: any) =>
              prev ? { ...prev, ...updates } : prev
            )
          showToast('Book marked as completed!', 'check_circle')
        },
        onCancel: () => {}
      })
    }
  }

  const handleRequestMonetization = async (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    await fbService.updateBook(bookId, {
      monetizationAttempts: (book?.monetizationAttempts || 0) + 1
    })
  }

  const handleSaveDraft = async (
    bookId: string | null,
    title: string,
    content: string,
    chapterIndex: number | null,
    chapterTitle?: string
  ): Promise<string | null> => {
    if (!title.trim() && !bookId) return null
    let newBookId = bookId
    if (bookId) {
      // Update existing draft in Firestore
      const existingBook = books.find(b => b.id === bookId)
      if (existingBook) {
        const updatedChapters = [...(existingBook.chapters || [])]
        if (
          chapterIndex !== null &&
          chapterIndex >= 0 &&
          chapterIndex < updatedChapters.length
        ) {
          const resolvedChapterTitle =
            (chapterTitle || '').trim() ||
            updatedChapters[chapterIndex]?.title ||
            `Chapter ${chapterIndex + 1}`
          updatedChapters[chapterIndex] = {
            ...updatedChapters[chapterIndex],
            title: resolvedChapterTitle,
            content
          }
        } else if (content.trim()) {
          const resolvedChapterTitle =
            (chapterTitle || '').trim() ||
            `Chapter ${updatedChapters.length + 1}`
          updatedChapters.push({ title: resolvedChapterTitle, content })
        }
        await fbService.updateBook(bookId, {
          title: title.trim() || existingBook.title,
          chapters: updatedChapters,
          content: updatedChapters.map((c: any) => c.content).join('\n\n')
        })
      }
      setLastSelectedBookId(bookId)
      setLastSelectedChapterIndex(
        chapterIndex !== null ? chapterIndex.toString() : 'new'
      )
      return bookId
    }

    const existingDraft = books.find(
      (b: Book) =>
        b.isDraft &&
        b.title === title.trim() &&
        b.author.username === user?.username
    )
    if (existingDraft) {
      newBookId = existingDraft.id
      const resolvedChapterTitle = (chapterTitle || '').trim() || 'Chapter 1'
      const updatedChapters = content.trim()
        ? [{ title: resolvedChapterTitle, content }]
        : []
      await fbService.updateBook(existingDraft.id, {
        title: title.trim() || existingDraft.title,
        content,
        chapters: updatedChapters,
        chaptersCount: updatedChapters.length,
        isDraft: true
      })
    } else {
      // Create new draft in Firestore and return the real document id
      const resolvedChapterTitle = (chapterTitle || '').trim() || 'Chapter 1'
      const bookData = {
        title: title.trim(),
        authorUid: firebaseUid || '',
        authorUsername: user?.username || '',
        authorDisplayName: user?.displayName || '',
        coverColor: '#' + Math.floor(Math.random() * 16777215).toString(16),
        likes: [0],
        commentsCount: 0,
        publishedDate: new Date().toISOString().split('T')[0],
        isCompleted: false,
        isDraft: true,
        isExplicit: false,
        chaptersCount: content.trim() ? 1 : 0,
        tagline: '',
        genres: [],
        hashtags: [],
        content,
        chapters: content.trim()
          ? [{ title: resolvedChapterTitle, content }]
          : []
      }
      const created = await fbService.createBook(bookData)
      newBookId = (created as any).id
    }

    setLastSelectedBookId(newBookId || 'new')
    setLastSelectedChapterIndex(
      chapterIndex !== null ? chapterIndex.toString() : 'new'
    )
    return newBookId
  }

  const postComment = async (text: string, chapterIndex?: number) => {
    if (selectedBook?.commentsEnabled === false) {
      showToast('Comments Disabled')
      return
    }
    if (!selectedBook?.id) {
      showToast('No book selected for comment.', 'error')
      return
    }
    if (containsBadWord(text)) {
      showToast('Your comment contains inappropriate language.', 'warning')
      return
    }

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      bookId: selectedBook.id,
      chapterIndex,
      author: user.displayName,
      authorUsername: user.username,
      text,
      likes: 0,
      likedBy: [] as string[],
      timestamp: new Date().toISOString()
    }

    try {
      setAllComments(prev => [...prev, newComment as any])
      const createdCommentId = await fbService.addCommentDoc(newComment)

      const chapterName =
        chapterIndex !== undefined && selectedBook.chapters?.[chapterIndex]
          ? ` (${selectedBook.chapters[chapterIndex].title})`
          : ''
      addNotification(
        'New Comment',
        `${user.displayName} commented on "${selectedBook.title}"${chapterName}`,
        'chat_bubble',
        selectedBook.author.username,
        user.username,
        selectedBook.id,
        chapterIndex,
        createdCommentId || newComment.id
      )

      showToast('Your comment has been successfully added.')
    } catch (error) {
      setAllComments(prev => prev.filter(c => c.id !== newComment.id))
      console.error(error)
      showToast('Failed to post comment. Please try again.', 'error')
    }
  }

  const handleLikeComment = async (commentId: string) => {
    const comment = allComments.find(c => c.id === commentId)
    if (!comment) return
    const likedBy = comment.likedBy || []
    if (likedBy.includes(user.username)) return // Already liked
    const newLikes = comment.likes + 1
    const updatedLikedBy = [...likedBy, user.username]
    setAllComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, likes: newLikes, likedBy: updatedLikedBy }
          : c
      )
    )
    try {
      await fbService.updateComment(commentId, {
        likes: newLikes,
        likedBy: updatedLikedBy
      })
    } catch (error) {
      setAllComments(prev =>
        prev.map(c =>
          c.id === commentId ? { ...c, likes: comment.likes, likedBy } : c
        )
      )
      console.error(error)
      showToast('Failed to like comment. Please try again.', 'error')
      return
    }
    const recipientUsername =
      (comment as any).authorUsername ||
      registeredUsers.find((u: any) => u.displayName === comment.author)
        ?.username ||
      comment.author
    addNotification(
      'Comment Liked',
      `${user.displayName} liked your comment: "${comment.text.substring(
        0,
        20
      )}..."`,
      'favorite_border',
      recipientUsername,
      user.username,
      comment.bookId,
      comment.chapterIndex,
      comment.id
    )

    // Earned points: award comment author 1 pt when comment hits like threshold
    const rewardKey = `comment:${commentId}:${Math.floor(
      newLikes / COMMENT_LIKES_THRESHOLD
    )}`
    if (
      newLikes % COMMENT_LIKES_THRESHOLD === 0 &&
      !rewardedItems.has(rewardKey) &&
      recipientUsername === user.username
    ) {
      setRewardedItems(prev => new Set(prev).add(rewardKey))
      awardPoints(1, `Your comment hit ${newLikes} likes!`)
    }
  }

  const handleBookProgressUpdate = (
    bookId: string,
    scrollProgress: number,
    chapterIndex: number,
    exact?: Partial<BookProgress>
  ) => {
    if (!userDataLoaded) return
    // Save progress per-user (both scroll position and chapter index)
    setUserBookProgress(bookId, scrollProgress, chapterIndex, exact)
    // Update reading activity
    setReadingActivity(prev => {
      const userActivity = [...(prev[user.username] || [])]
      const existing = userActivity.findIndex(a => a.bookId === bookId)
      if (existing >= 0)
        userActivity[existing] = {
          bookId,
          progress: scrollProgress,
          lastRead: new Date().toISOString()
        }
      else
        userActivity.unshift({
          bookId,
          progress: scrollProgress,
          lastRead: new Date().toISOString()
        })
      return { ...prev, [user.username]: userActivity.slice(0, 10) }
    })
    // Update user activity status to "Reading"
    if (user.activity !== 'Reading') {
      setUser(prev => ({ ...prev, activity: 'Reading' }))
      if (firebaseUid) {
        fbService
          .updateUserProfile(firebaseUid, { activity: 'Reading' })
          .catch(console.error)
      }
    }
  }

  const handleShareBook = async (book: Book) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: book.title,
          text: book.tagline,
          url: window.location.href
        })
      } catch (err) {
        console.log('Share failed', err)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      addNotification(
        'Link Copied',
        'Link copied to clipboard!',
        'content_copy'
      )
    }
  }


  return {
    view, setView, toast, setToast, showToast, confirmModal,
    setConfirmModal, showConfirm, BLANK_USER, user, setUser, authLoading,
    setAuthLoading, firebaseUid, setFirebaseUid, userDataLoaded, setUserDataLoaded, books,
    setBooks, globalSpotlightBookId, setGlobalSpotlightBookId, selectedBook, setSelectedBook, readingChapterIndex,
    setReadingChapterIndex, selectedProfileUser, setSelectedProfileUser, selectedChatUser, setSelectedChatUser, chatMessages,
    setChatMessages, moveDir, setMoveDir, readerSettings, setReaderSettings, likedBooks,
    setLikedBooks, favoriteBookIds, setFavoriteBookIds, likedBooksInteracted, signUpForm, setSignUpForm,
    loginForm, setLoginForm, authError, setAuthError, registeredUsers, setRegisteredUsers,
    activeCommentChapterKey, setActiveCommentChapterKey, scrollToCommentId, setScrollToCommentId, relationships, setRelationships,
    MUTUALS, hasAdminClaim, setHasAdminClaim, isAdmin, userIsUnder16, reports,
    setReports, notifications, setNotifications, allAvatarConfigs, setAllAvatarConfigs, avatarConfig,
    setAvatarConfig, allUnlockedItems, setAllUnlockedItems, unlockedAvatarItems, setUnlockedAvatarItems, blockedUsers,
    setBlockedUsers, readingActivity, setReadingActivity, itemPriceOverrides, setItemPriceOverrides, getItemCost,
    handleUpdateItemPrice, allComments, setAllComments, lastClaimedPoints, setLastClaimedPoints, rewardedItems,
    setRewardedItems, coupons, setCoupons, cart, setCart, userBookData,
    setUserBookData, userBookDataRef, getTotalLikes, getChapterLikes, getUserOwnedBookIds, isBookFavorited,
    getUserBookProgress, setUserOwnsBook, setUserBookProgress, persistTimerRef, pendingAdmireRef, currentPublishingContent,
    setCurrentPublishingContent, currentPublishingTitle, setCurrentPublishingTitle, currentPublishingChapterTitle, setCurrentPublishingChapterTitle, currentPublishingId,
    setCurrentPublishingId, currentPublishingChapterIndex, setCurrentPublishingChapterIndex, publishingInitialData, setPublishingInitialData, lastSelectedBookId,
    setLastSelectedBookId, lastSelectedChapterIndex, setLastSelectedChapterIndex, spotlightInit, setSpotlightInit, addNotification,
    handleUnpublishChapter, handleDeleteChapter, handleLogout, handleNotificationClick, handleLogin, handleSignup,
    handleSendMessage, handleLike, handleAdmire, handleReport, handleRemoveBook, handleRemoveComment,
    handleAddStrike, handleRemoveStrike, handleBanUser, handleDismissReport, handleBlockUser, handleUnblockUser,
    handleSaveToLibrary, handleRemoveFromLibrary, isBookInLibrary, handleToggleFavorite, handleAddToCart, awardPoints,
    awardMembershipBonus, handleClaimPoints, handleSpinWheel, handlePublish, handleUnpublish, handleDeleteBook,
    handleMarkCompleted, handleRequestMonetization, handleSaveDraft, postComment, handleLikeComment, handleBookProgressUpdate,
    handleShareBook,
  }
}

export type AppContextValue = ReturnType<typeof useAppValue>

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useAppValue()
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
