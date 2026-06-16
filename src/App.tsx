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

// sendWelcomeEmail('mochamattel@gmail.com', 'Jevon', 'jevonmahoney')

/**
 * MainWRLD- Full Integrated Creator & Reader Platform
 */

// --- Constants ---
// --- App Root ---

const App: React.FC = () => {
  const [view, setView] = useState<View>('splash')
  const [toast, setToast] = useState<{ message: string; icon: string } | null>(
    null
  )
  const showToast = useCallback(
    (message: string, icon: string = 'check_circle') => {
      setToast({ message, icon })
      setTimeout(() => setToast(null), 2500)
    },
    []
  )
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    icon?: string
    iconBg?: string
    onConfirm: () => void
    onCancel?: () => void
  } | null>(null)
  const showConfirm = useCallback(
    (opts: {
      title: string
      message: string
      confirmLabel?: string
      cancelLabel?: string
      icon?: string
      iconBg?: string
      onConfirm: () => void
      onCancel?: () => void
    }) => {
      setConfirmModal(opts)
    },
    []
  )
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
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [readingChapterIndex, setReadingChapterIndex] = useState(0)
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(
    null
  )
  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null)
  // Chat messages (Firestore real-time)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [moveDir, setMoveDir] = useState(new THREE.Vector3())
  const [readerSettings, setReaderSettings] = useState({
    fontSize: 13,
    inverted: false,
    scrollMode: true
  })

  useEffect(() => {
    if (view !== 'home') return

    const preventClipboard = (e: Event) => e.preventDefault()
    const preventClipboardShortcuts = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'x', 'v'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener('copy', preventClipboard)
    document.addEventListener('cut', preventClipboard)
    document.addEventListener('paste', preventClipboard)
    document.addEventListener('keydown', preventClipboardShortcuts)

    return () => {
      document.removeEventListener('copy', preventClipboard)
      document.removeEventListener('cut', preventClipboard)
      document.removeEventListener('paste', preventClipboard)
      document.removeEventListener('keydown', preventClipboardShortcuts)
    }
  }, [view])

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
  const [activeCommentChapterKey, setActiveCommentChapterKey] = useState<
    string | null
  >(null)
  const [scrollToCommentId, setScrollToCommentId] = useState<string | null>(
    null
  )

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

  // Rewards and Cart State
  const [lastClaimedPoints, setLastClaimedPoints] = useState<number | null>(
    null
  )
  const [rewardedItems, setRewardedItems] = useState<Set<string>>(new Set())

  // Coupons (loaded from Firestore user doc)
  const [coupons, setCoupons] = useState<Coupon[]>([])

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
  }, [favoriteBookIds])

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
  }, [])

  // ===== FIRESTORE REAL-TIME SUBSCRIPTIONS =====

  // Subscribe to relationships
  useEffect(() => {
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
  }, [])

  // Subscribe to chat messages
  useEffect(() => {
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
  }, [])

  // Subscribe to notifications
  useEffect(() => {
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
  }, [])

  // Subscribe to comments
  useEffect(() => {
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
  }, [])

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
  }, [])

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

      showToast(`You won a $${winValue} coupon!`, 'confirmation_number')
    }

    // If slots full → ask confirmation and STOP execution
    if (unusedCoupons.length >= 3) {
      const oldestUnused = unusedCoupons[0]

      showConfirm({
        title: 'Your coupon slots are full (3/3)',
        message: `Winning a new coupon will permanently eliminate your oldest ticket ($${oldestUnused.value}). Do you wish to proceed?`,
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

  const renderView = () => {
    switch (view) {
      case 'splash':
        return (
          <div className='fixed inset-0 bg-white flex flex-col items-center justify-center animate-in fade-in duration-700'>
            <img
              src={`${BASE}logo.png`}
              alt='MainWRLD'
              className='w-24 h-24 mb-4'
            />
            <img src={`${BASE}wordlogo.png`} alt='MainWRLD' className='h-8' />
          </div>
        )

      case 'landing':
        return (
          <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in fade-in duration-700'>
            <div className='min-h-dvh flex flex-col px-8 pt-safe-top pb-safe-bottom'>
              {/* Hero */}
              <div className='flex-1 flex flex-col items-center justify-center text-center py-16'>
                <img
                  src={`${BASE}logo.png`}
                  alt='MainWRLD'
                  className='w-24 h-24 mb-6 drop-shadow-xl'
                />
                <img
                  src={`${BASE}wordlogo.png`}
                  alt='MainWRLD'
                  className='h-7 mb-8'
                />
                <h1 className='text-4xl font-display leading-tight mb-4'>
                  Where stories
                  <br />
                  come to life.
                </h1>
                <p className='text-sm text-gray-400 font-medium max-w-xs leading-relaxed'>
                  Read, write and share stories in a living 3D world. Meet
                  authors, build your audience and earn as you create.
                </p>
              </div>

              {/* Feature highlights */}
              <div className='space-y-3 mb-10'>
                {[
                  {
                    icon: 'auto_stories',
                    title: 'Read & write freely',
                    desc: 'Discover endless stories or publish your own in seconds.'
                  },
                  {
                    icon: 'public',
                    title: 'A living 3D world',
                    desc: 'Walk in, meet readers and authors as 3D avatars.'
                  },
                  {
                    icon: 'workspace_premium',
                    title: 'Earn & go premium',
                    desc: 'Collect points, grow your audience and unlock more.'
                  }
                ].map(f => (
                  <div
                    key={f.title}
                    className='flex items-center gap-4 bg-gray-50 rounded-2xl p-4'
                  >
                    <div className='w-11 h-11 shrink-0 rounded-xl bg-accent/10 flex items-center justify-center text-accent'>
                      <span className='material-icons-round text-[22px]'>
                        {f.icon}
                      </span>
                    </div>
                    <div className='text-left'>
                      <p className='text-sm font-bold leading-tight'>
                        {f.title}
                      </p>
                      <p className='text-[11px] text-gray-400 font-medium leading-snug mt-0.5'>
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div className='space-y-3 pb-8'>
                <Button
                  className='w-full'
                  onClick={() => {
                    setAuthError(null)
                    setView('signup')
                  }}
                >
                  Get Started
                </Button>
                <button
                  onClick={() => {
                    setAuthError(null)
                    setView('login')
                  }}
                  className='w-full text-xs font-bold text-gray-400 uppercase tracking-widest py-3'
                >
                  I already have an account
                </button>
              </div>

              {/* Footer */}
              <footer className='flex items-center justify-center gap-4 pb-6 text-center'>
                <span className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>
                  © Fried Mermaid LLC
                </span>
                <span className='w-px h-3 bg-gray-200' />
                <button
                  onClick={() => setView('terms')}
                  className='text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-accent transition-colors'
                >
                  Terms
                </button>
                <span className='w-px h-3 bg-gray-200' />
                <button
                  onClick={() => setView('privacy')}
                  className='text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-accent transition-colors'
                >
                  Privacy
                </button>
              </footer>
            </div>
          </div>
        )

      case 'login':
        return (
          <div className='fixed inset-0 bg-white p-8 flex flex-col items-center justify-center animate-in fade-in duration-500'>
            <button
              onClick={() => {
                setAuthError(null)
                setView('landing')
              }}
              className='absolute top-safe-top left-8 mt-4 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
            >
              <span className='material-icons-round'>arrow_back</span>
            </button>
            <img
              src={`${BASE}logo.png`}
              alt='MainWRLD'
              className='w-20 h-20 mb-4'
            />
            <h1 className='text-3xl font-display mb-12'>Log In</h1>
            <div className='w-full max-w-sm space-y-4 mb-4'>
              <Input
                label='Username or Email'
                placeholder='Enter username or email...'
                value={loginForm.username}
                onChange={(val: string) =>
                  setLoginForm({ ...loginForm, username: val })
                }
              />
              <Input
                label='Password'
                type='password'
                placeholder='••••••••••••'
                value={loginForm.password}
                onChange={(val: string) =>
                  setLoginForm({ ...loginForm, password: val })
                }
              />
              <button
                onClick={() => setView('forgot-password')}
                className='text-[10px] font-bold text-accent uppercase tracking-widest text-right w-full py-1'
              >
                Forgot Password?
              </button>
            </div>
            {authError && (
              <p className='text-[10px] text-red-500 font-bold mb-4 uppercase tracking-widest'>
                {authError}
              </p>
            )}
            <Button className='w-full max-w-sm' onClick={handleLogin}>
              Continue
            </Button>
            <button
              onClick={() => {
                setAuthError(null)
                setView('signup')
              }}
              className='mt-8 text-xs font-bold text-gray-400 uppercase tracking-widest py-2'
            >
              Create Account
            </button>
          </div>
        )

      case 'forgot-password':
        return (
          <ForgotPasswordView
            onBack={() => setView('login')}
            registeredUsers={registeredUsers}
            onResetPassword={async (email: string) => {
              try {
                const { sendPasswordResetEmail } = await import('firebase/auth')
                await sendPasswordResetEmail(auth, email)
              } catch {}
            }}
            showToast={showToast}
          />
        )

      case 'terms':
      case 'privacy':
        return (
          <LegalView doc={LEGAL_DOCS[view]} onBack={() => setView('landing')} />
        )

      case 'signup':
        return (
          <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
            <header className='flex items-center gap-4 mb-10'>
              <button
                onClick={() => {
                  setAuthError(null)
                  setView('login')
                }}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
              <h1 className='text-2xl font-bold'>Sign Up</h1>
            </header>
            <div className='space-y-6'>
              <Input
                label='Email Address'
                value={signUpForm.email}
                onChange={(val: string) =>
                  setSignUpForm({ ...signUpForm, email: val })
                }
              />
              <Input
                label='Birth Date'
                type='date'
                value={signUpForm.birthDate}
                onChange={(val: string) =>
                  setSignUpForm({ ...signUpForm, birthDate: val })
                }
              />
              <Input
                label='Display Name'
                description='5-25 characters'
                value={signUpForm.displayName}
                onChange={(val: string) =>
                  setSignUpForm({ ...signUpForm, displayName: val })
                }
              />
              <Input
                label='Username'
                description='5-25 chars, lowercase, no caps'
                value={signUpForm.username}
                onChange={(val: string) =>
                  setSignUpForm({
                    ...signUpForm,
                    username: val.toLowerCase().replace(/\s/g, '')
                  })
                }
              />
              <Input
                label='Password'
                type='password'
                description='Minimum 12 characters'
                value={signUpForm.password}
                onChange={(val: string) =>
                  setSignUpForm({ ...signUpForm, password: val })
                }
              />
              <div className='space-y-1.5'>
                <label className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2'>
                  Location
                </label>
                <select className='w-full bg-gray-50 rounded-2xl px-6 py-4 text-sm font-medium outline-none appearance-none'>
                  <option>United States</option>
                  <option>United Kingdom</option>
                  <option>Canada</option>
                </select>
              </div>
              {authError && (
                <p className='text-[10px] text-red-500 font-bold uppercase tracking-widest px-2'>
                  {authError}
                </p>
              )}
              <Button className='w-full' onClick={handleSignup}>
                Join MainWRLD
              </Button>
            </div>
          </div>
        )

      case 'home':
        return (
          <div className='fixed inset-0 bg-white'>
            <Canvas shadows>
              <Suspense fallback={null}>
                <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />
                <ambientLight intensity={0.8} />
                <pointLight position={[10, 10, 10]} intensity={1.5} />
                <mesh scale={[WORLD_RADIUS, WORLD_RADIUS, WORLD_RADIUS]}>
                  <sphereGeometry args={[1, 64, 64]} />
                  <meshStandardMaterial
                    color='#ffffff'
                    transparent
                    opacity={0.15}
                    side={THREE.BackSide}
                  />
                </mesh>
                <gridHelper
                  args={[100, 50, 0xeeeeee, 0xf5f5f5]}
                  position={[0, -0.01, 0]}
                />
                <Player moveDir={moveDir} avatarConfig={avatarConfig} />
                {(() => {
                  // Get usernames of actual mutuals (both directions exist)
                  const myAdmiring = relationships
                    .filter(r => r.admirer === user.username)
                    .map(r => r.target)
                  const actualMutualUsernames = myAdmiring.filter(t =>
                    relationships.some(
                      r => r.admirer === t && r.target === user.username
                    )
                  )
                  // Build User objects for actual mutuals from registeredUsers
                  const dynamicMutuals: User[] = actualMutualUsernames
                    .map((username, i) => {
                      const regUser = registeredUsers.find(
                        u => u.username === username
                      )
                      const mutualUser = MUTUALS.find(
                        u => u.username === username
                      )
                      const found = regUser || mutualUser
                      if (
                        found &&
                        (!found.position ||
                          (found.position[0] === 0 && found.position[2] === 0))
                      ) {
                        const angle =
                          (i / Math.max(actualMutualUsernames.length, 1)) *
                          Math.PI *
                          2
                        const radius = 8 + Math.random() * 10
                        found.position = [
                          Math.cos(angle) * radius,
                          0,
                          Math.sin(angle) * radius
                        ] as [number, number, number]
                      }
                      return found
                    })
                    .filter(Boolean) as User[]
                  // If no dynamic mutuals, show MUTUALS as fallback so world isn't empty
                  const avatarsToShow =
                    dynamicMutuals.length > 0 ? dynamicMutuals : MUTUALS
                  // Limit visible mutuals to avoid overwhelming the scene
                  // const eightHoursAgo = Date.now() - 8 * 3600 * 1000
                  const visibleMutuals =
                    avatarsToShow.length > 200
                      ? avatarsToShow
                          .filter((m: any) => m.isOnline)
                          .slice(0, 200)
                      : avatarsToShow.slice(0, 200)
                  // Filter out blocked users
                  return visibleMutuals
                    .filter(u => !blockedUsers.has(u.username))
                    .map(u => (
                      <MovingAvatar
                        key={u.username}
                        user={u}
                        onClick={() => {
                          setSelectedProfileUser(u)
                          setView('profile')
                        }}
                      />
                    ))
                  // ONLY SHOW USERS WHO ARE ONLINE & MUTUAL
                })()}
                <Environment preset='city' />
              </Suspense>
            </Canvas>
            <div className='absolute top-3 left-6 pointer-events-none flex justify-between w-[calc(100%-48px)] items-start'>
              <div>
                <img
                  src={`${BASE}wordlogo.png`}
                  alt='MainWRLD'
                  className='w-[240px] drop-shadow-md'
                />
              </div>
              <div className='flex flex-col gap-4 pointer-events-auto'>
                <button
                  onClick={() => setView('notifications')}
                  className='w-14 h-14 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl flex items-center justify-center text-gray-500 border border-white relative transition-all active:scale-90'
                >
                  <span className='material-icons-round'>notifications</span>
                  {notifications.some(
                    n => n.recipient === user.username && !n.read
                  ) && (
                    <span className='absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white' />
                  )}
                </button>
                <button
                  onClick={() => setView('daily-rewards')}
                  className='w-14 h-14 bg-accent/90 backdrop-blur-xl rounded-2xl shadow-xl flex flex-col items-center justify-center text-white border border-white relative transition-all active:scale-90'
                >
                  <span className='material-icons-round'>card_giftcard</span>
                  <span className='text-[7px] font-black uppercase leading-tight'>
                    Points
                  </span>
                </button>
              </div>
            </div>
            {/* D-Pad */}
            <div className='absolute bottom-32 right-8 w-32 h-32 flex items-center justify-center pointer-events-none'>
              <div
                className='grid grid-cols-3 gap-1 pointer-events-auto select-none'
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  WebkitTouchCallout: 'none'
                }}
              >
                <div />
                <button
                  onPointerDown={() => setMoveDir(new THREE.Vector3(0, 0, -1))}
                  onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
                  className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    WebkitTouchCallout: 'none'
                  }}
                >
                  <span className='material-icons-round select-none'>
                    keyboard_arrow_up
                  </span>
                </button>
                <div />
                <button
                  onPointerDown={() => setMoveDir(new THREE.Vector3(-1, 0, 0))}
                  onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
                  className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    WebkitTouchCallout: 'none'
                  }}
                >
                  <span className='material-icons-round select-none'>
                    keyboard_arrow_left
                  </span>
                </button>
                <div />
                <button
                  onPointerDown={() => setMoveDir(new THREE.Vector3(1, 0, 0))}
                  onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
                  className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    WebkitTouchCallout: 'none'
                  }}
                >
                  <span className='material-icons-round select-none'>
                    keyboard_arrow_right
                  </span>
                </button>
                <div />
                <button
                  onPointerDown={() => setMoveDir(new THREE.Vector3(0, 0, 1))}
                  onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
                  className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
                  style={{
                    WebkitTapHighlightColor: 'transparent',
                    WebkitTouchCallout: 'none'
                  }}
                >
                  <span className='material-icons-round select-none'>
                    keyboard_arrow_down
                  </span>
                </button>
                <div />
              </div>
            </div>
          </div>
        )

      case 'daily-rewards':
        return (
          <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500 z-[400]'>
            <header className='p-6 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-xl z-50'>
              <button
                onClick={() => setView('home')}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
              <h1 className='text-xl font-bold'>Daily Rewards</h1>
            </header>
            <div className='p-8 flex flex-col items-center gap-10'>
              <div className='text-center space-y-2'>
                <p className='text-xs text-gray-400 font-bold uppercase tracking-widest'>
                  Your Points
                </p>
                <h2 className='text-5xl font-display text-accent'>
                  {user.points}
                </h2>
              </div>

              {/* Daily Earned Points Progress */}
              {(() => {
                const now = Date.now()
                const isNewDay =
                  !user.lastPointsReset ||
                  now - (user.lastPointsReset || 0) > 24 * 60 * 60 * 1000
                const earned = isNewDay ? 0 : user.dailyEarnedPoints || 0
                const pct = Math.min(
                  100,
                  (earned / MAX_DAILY_EARNED_POINTS) * 100
                )
                return (
                  <div className='w-full px-2'>
                    <div className='flex justify-between items-center mb-2'>
                      <p className='text-[10px] text-gray-400 font-bold uppercase tracking-widest'>
                        Today's Earned Points
                      </p>
                      <p className='text-sm font-bold text-accent'>
                        {earned}/{MAX_DAILY_EARNED_POINTS}
                      </p>
                    </div>
                    <div className='w-full h-3 bg-gray-100 rounded-full overflow-hidden'>
                      <div
                        className='h-full bg-accent rounded-full transition-all duration-500'
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {earned >= MAX_DAILY_EARNED_POINTS && (
                      <p className='text-[10px] text-accent font-bold mt-1 text-center'>
                        Daily cap reached! Come back tomorrow.
                      </p>
                    )}
                  </div>
                )
              })()}

              <div className='w-full space-y-8'>
                <div className='p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 flex flex-col items-center gap-6 shadow-sm'>
                  <div className='text-center'>
                    <h3 className='text-lg font-bold'>Daily 3 Points</h3>
                    <p className='text-[10px] text-gray-400 font-bold uppercase tracking-widest'>
                      Claim every 24 hours
                    </p>
                  </div>
                  <Button className='w-full h-16' onClick={handleClaimPoints}>
                    Claim Points
                  </Button>
                </div>

                <div className='p-8 bg-black rounded-[2.5rem] border border-gray-800 flex flex-col items-center gap-6 shadow-xl relative overflow-hidden'>
                  <div className='absolute top-0 right-0 p-4 opacity-10'></div>
                  <div className='text-center relative z-10'>
                    <h3 className='text-lg font-bold text-white'>
                      Coupon Kiosk
                    </h3>
                    <p className='text-[10px] text-white/50 font-bold uppercase tracking-widest'>
                      150 Points to win a coupon
                    </p>
                  </div>
                  <div className='w-32 h-32 rounded-full border-4 border-dashed border-accent flex items-center justify-center relative z-10 animate-[spin_10s_linear_infinite]'>
                    <span className='material-icons-round text-5xl text-accent'>
                      auto_awesome
                    </span>
                  </div>
                  <Button
                    variant='primary'
                    className='w-full h-16 relative z-10'
                    onClick={handleSpinWheel}
                  >
                    {' '}
                    Win a $1, $3, $5, or $10 Coupon
                  </Button>
                  <p className='text-[8px] text-white/30 font-bold uppercase tracking-widest text-center mt-2'>
                    Win coupons for your next book purchase
                  </p>
                </div>

                {/* Purchase Points Section */}
                <div className='p-8 bg-white rounded-[2.5rem] border border-gray-100 flex flex-col items-center gap-6 shadow-sm'>
                  <div className='text-center'>
                    <h3 className='text-lg font-bold'>Purchase Points</h3>
                    <p className='text-[10px] text-gray-400 font-bold uppercase tracking-widest'>
                      Get points instantly
                    </p>
                  </div>
                  <div className='grid grid-cols-2 gap-4 w-full'>
                    {[
                      { usd: 1, pts: 100 },
                      { usd: 3, pts: 300 },
                      { usd: 5, pts: 500 },
                      { usd: 10, pts: 1000 }
                    ].map(pkg => (
                      <button
                        key={pkg.pts}
                        onClick={async () => {
                          // On iOS go through Apple IAP (App Store 3.1.1).
                          // The credit happens server-side after Apple
                          // approves the transaction; see iap.setVerifyCallback
                          // wired in the App useEffect above.
                          if (iap.isNativeIAPAvailable()) {
                            try {
                              await iap.purchase(
                                `points_${pkg.pts}` as iap.IapSku
                              )
                            } catch (err: any) {
                              console.error('[MainWRLD IAP] purchase failed:', err)
                              showToast(
                                err?.message || 'Purchase failed.',
                                'error'
                              )
                            }
                            return
                          }

                          // Web path: Stripe Checkout link (unchanged).
                          const paymentLink =
                            STRIPE_PAYMENT_LINKS[`points_${pkg.pts}`]

                          if (!paymentLink) {
                            // Payment links not configured yet - use in-app confirmation
                            showConfirm({
                              title: `Purchase ${pkg.pts} Points`,
                              message: `Buy ${pkg.pts} points for $${pkg.usd}?`,
                              confirmLabel: 'Purchase',
                              icon: 'auto_awesome',
                              onConfirm: () => {
                                setUser(prev => ({
                                  ...prev,
                                  points: prev.points + pkg.pts
                                }))
                                showToast(
                                  `${pkg.pts} points added!`,
                                  'check_circle'
                                )
                              }
                            })
                            return
                          }

                          // Store pending points purchase with timestamp for when user returns
                          localStorage.setItem(
                            'mainwrld_pending_points',
                            JSON.stringify({
                              pts: pkg.pts,
                              usd: pkg.usd,
                              timestamp: Date.now()
                            })
                          )
                          // Redirect to Stripe Payment Link
                          window.location.href = paymentLink
                        }}
                        className='p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:border-accent transition-all flex flex-col items-center gap-1 group active:scale-95'
                      >
                        <span className='text-lg font-black text-accent'>
                          {pkg.pts}
                        </span>
                        <span className='text-[8px] font-bold text-gray-400 uppercase tracking-widest'>
                          Points
                        </span>
                        <div className='mt-2 px-3 py-1 bg-accent text-white rounded-lg text-[10px] font-bold'>
                          ${pkg.usd}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className='text-[8px] text-gray-400 text-center font-bold uppercase tracking-widest flex items-center justify-center gap-1 mt-2'>
                    <span className='material-icons-round text-[10px]'>
                      lock
                    </span>{' '}
                    Secured by Stripe
                  </p>
                </div>
              </div>

              {/* Premium Membership */}
              <div className='w-full'>
                <div className='p-8 bg-gradient-to-br from-amber-50 to-orange-50 rounded-[2.5rem] border border-amber-200 flex flex-col items-center gap-6 shadow-sm relative overflow-hidden'>
                  <div className='absolute top-4 right-4'>
                    <span className='material-icons-round text-pink-300 text-4xl'>
                      workspace_premium
                    </span>
                  </div>
                  <div className='text-center relative z-10'>
                    <h3 className='text-lg font-bold text-amber-900'>
                      MainWRLD+
                    </h3>
                    <p className='text-[10px] text-amber-600 font-bold uppercase tracking-widest'>
                      {user.isPremium ? 'Active Subscription' : '$30 a year'}
                    </p>
                  </div>

                  {/* HERE */}

                  {user.isPremium ? (
                    <div className='w-full space-y-3'>
                      <div className='flex items-center gap-2 text-amber-700'>
                        <span className='material-icons-round text-sm'>
                          check_circle
                        </span>
                        <span className='text-xs font-bold'>No More Ads</span>
                      </div>
                      <div className='flex items-center gap-2 text-amber-700'>
                        <span className='material-icons-round text-sm'>
                          check_circle
                        </span>
                        <span className='text-xs font-bold'>
                          2x daily points (6 pts/day)
                        </span>
                      </div>
                      <div className='flex items-center gap-2 text-amber-700'>
                        <span className='material-icons-round text-sm'>
                          check_circle
                        </span>
                        <span className='text-xs font-bold'>
                          Compete in MainWRLD book contests
                        </span>
                      </div>
                      <div className='flex items-center gap-2 text-amber-700'>
                        <span className='material-icons-round text-sm'>
                          check_circle
                        </span>
                        <span className='text-xs font-bold'>
                          Save Chat Messages Forever
                        </span>
                      </div>
                      <div className='flex items-center gap-2 text-amber-700'>
                        <span className='material-icons-round text-sm'>
                          check_circle
                        </span>
                        <span className='text-xs font-bold'>
                          Annual 200 Point Bonus
                        </span>
                      </div>
                      <div className='pt-3 text-center'>
                        <span className='text-[9px] font-bold text-amber-500 uppercase tracking-widest'>
                          Member since{' '}
                          {user.premiumSince
                            ? new Date(
                                user.premiumSince
                              ).toLocaleDateString('en-US', {
                                month: 'short',
                                year: 'numeric'
                              })
                            : 'today'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className='w-full space-y-3'>
                        <div className='flex items-center gap-2 text-amber-700'>
                          <span className='material-icons-round text-sm'>
                            auto_awesome
                          </span>
                          <span className='text-xs font-bold'>No More Ads</span>
                        </div>
                        <div className='flex items-center gap-2 text-amber-700'>
                          <span className='material-icons-round text-sm'>
                            auto_awesome
                          </span>
                          <span className='text-xs font-bold'>
                            2x daily points (6 pts/day)
                          </span>
                        </div>
                        <div className='flex items-center gap-2 text-amber-700'>
                          <span className='material-icons-round text-sm'>
                            auto_awesome
                          </span>
                          <span className='text-xs font-bold'>
                            Compete in MainWRLD book contests
                          </span>
                        </div>
                        <div className='flex items-center gap-2 text-amber-700'>
                          <span className='material-icons-round text-sm'>
                            auto_awesome
                          </span>
                          <span className='text-xs font-bold'>
                            Save Chat Messages Forever
                          </span>
                        </div>
                        <div className='flex items-center gap-2 text-amber-700'>
                          <span className='material-icons-round text-sm'>
                            auto_awesome
                          </span>
                          <span className='text-xs font-bold'>
                            Annual 200 Point Bonus
                          </span>
                        </div>
                      </div>
                      <Button
                        className='w-full h-16 bg-amber-500 hover:bg-amber-600'
                        onClick={async () => {
                          // iOS: Apple IAP subscription. The credit (set
                          // isPremium=true) happens server-side via the
                          // verifyAppleReceipt callback wired in App.
                          if (iap.isNativeIAPAvailable()) {
                            try {
                              await iap.purchase('premium_monthly')
                            } catch (err: any) {
                              console.error('[MainWRLD IAP] premium purchase failed:', err)
                              showToast(
                                err?.message || 'Subscription failed.',
                                'error'
                              )
                            }
                            return
                          }
                          if (
                            STRIPE_PREMIUM_PAYMENT_LINK &&
                            !STRIPE_PREMIUM_PAYMENT_LINK.includes(
                              'test_premium'
                            )
                          ) {
                            localStorage.setItem(
                              'mainwrld_pending_premium',
                              JSON.stringify({ timestamp: Date.now() })
                            )
                            window.location.href = STRIPE_PREMIUM_PAYMENT_LINK
                          } else {
                            showConfirm({
                              title: 'Upgrade to Premium',
                              message: 'Subscribe to MainWRLD+ for $30/year?',
                              confirmLabel: 'Subscribe',
                              cancelLabel: 'Maybe Later',
                              icon: 'workspace_premium',
                              onConfirm: () => {
                                setUser(prev => ({
                                  ...prev,
                                  isPremium: true,
                                  premiumSince: new Date().toISOString(),
                                  membershipStartDate: Date.now()
                                }))
                                showToast(
                                  'Welcome to MainWRLD+!',
                                  'workspace_premium'
                                )
                              }
                            })
                          }
                        }}
                      >
                        Subscribe — $30/yr
                      </Button>
                      <p className='text-[8px] text-amber-400 text-center font-bold uppercase tracking-widest flex items-center justify-center gap-1'>
                        <span className='material-icons-round text-[10px]'>
                          lock
                        </span>{' '}
                        Secured by Stripe • Cancel anytime
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Coupon Slots UI */}
              <div className='w-full space-y-6'>
                <div className='flex justify-between items-end px-4'>
                  <h3 className='text-[10px] font-bold text-gray-400 uppercase tracking-widest'>
                    Coupon Slots
                  </h3>
                  <span className='text-[10px] font-bold text-accent'>
                    {coupons.filter((c: Coupon) => !c.used).length}/3 Filled
                  </span>
                </div>

                <div className='grid grid-cols-3 gap-4'>
                  {[0, 1, 2].map(slotIdx => {
                    // Filter out used coupons before displaying
                    const availableCoupons = coupons.filter(
                      (c: Coupon) => !c.used
                    )
                    const coupon = availableCoupons[slotIdx]
                    return (
                      <div
                        key={slotIdx}
                        className={`aspect-square rounded-[1.8rem] border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                          coupon
                            ? 'bg-accent/5 border-accent shadow-lg shadow-accent/10'
                            : 'bg-gray-50 border-dashed border-gray-200 opacity-50'
                        }`}
                      >
                        {coupon ? (
                          <>
                            <span className='material-icons-round text-accent text-xl'>
                              confirmation_number
                            </span>
                            <span className='text-lg font-black text-accent'>
                              ${coupon.value}
                            </span>
                            <span className='text-[7px] font-bold text-accent/60 uppercase tracking-tighter'>
                              {slotIdx === 0
                                ? 'Oldest Slot'
                                : slotIdx === 2
                                ? 'Newest Slot'
                                : 'Slot ' + (slotIdx + 1)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className='material-icons-round text-gray-300'>
                              lock_open
                            </span>
                            <span className='text-[8px] font-bold text-gray-300 uppercase'>
                              Empty
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {coupons.length > 0 && (
                  <div className='space-y-3 mt-8'>
                    <h4 className='text-[9px] font-bold text-gray-300 uppercase tracking-[0.2em] px-4'>
                      Inventory Details
                    </h4>
                    {coupons.map((c, idx) => (
                      <div
                        key={c.id}
                        className='p-5 bg-gray-50 border border-gray-100 rounded-2xl flex justify-between items-center animate-in slide-in-from-right duration-300'
                        style={{ animationDelay: `${idx * 100}ms` }}
                      >
                        <div className='flex items-center gap-4'>
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              idx === 0
                                ? 'bg-red-50 text-red-500'
                                : 'bg-accent/10 text-accent'
                            }`}
                          >
                            <span className='material-icons-round text-sm'>
                              {idx === 0 ? 'history' : 'local_offer'}
                            </span>
                          </div>
                          <div>
                            <p className='text-sm font-bold text-black'>
                              ${c.value} Off Discount
                            </p>
                            <p className='text-[8px] font-bold text-gray-400 uppercase'>
                              {idx === 0
                                ? 'Removed next'
                                : 'Stored in slot ' + (idx + 1)}
                            </p>
                          </div>
                        </div>
                        <span className='text-[10px] font-black text-accent uppercase tracking-widest'>
                          Unused
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'cart':
        return (
          <CartView
            cart={cart}
            setCart={setCart}
            coupons={coupons}
            setCoupons={setCoupons}
            onBack={() => setView('self-profile')}
            onOwnedUpdate={(bookId: string) => {
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
              userBookDataRef.current = {
                ...userBookDataRef.current,
                [user.username]: updatedUd
              }
              setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
              setBooks(prev => {
                const updated = prev.map(b =>
                  b.id === bookId ? { ...b, isOwned: true } : b
                )
                if (selectedBook && selectedBook.id === bookId) {
                  setSelectedBook({ ...selectedBook, isOwned: true })
                }
                return updated
              })
              if (firebaseUid) {
                fbService
                  .addBookToLibrary(firebaseUid, bookId)
                  .catch(console.error)
              }
            }}
            showToast={showToast}
            showConfirm={showConfirm}
          />
        )

      case 'explore':
        return (
          <ExploreView
            books={books.filter(
              (b: Book) =>
                !blockedUsers.has(b.author.username) &&
                !b.isDraft &&
                !(userIsUnder16 && b.isExplicit)
            )}
            spotlightSourceBooks={books.filter((b: Book) => !b.isDraft)}
            spotlightBookId={globalSpotlightBookId}
            onSelect={(b: Book) => {
              setSelectedBook(b)
              setView('book-detail')
            }}
            users={[
              ...registeredUsers.filter(
                (u: any) => u.username !== user.username
              ),
              ...MUTUALS.filter(
                m =>
                  !registeredUsers.some(
                    (u: any) => u.username === m.username
                  ) && m.username !== user.username
              )
            ]}
            onUserSelect={(u: User) => {
              setSelectedProfileUser(u)
              setView('profile')
            }}
            avatarConfigs={allAvatarConfigs}
            blockedUsers={blockedUsers}
            readingActivity={readingActivity}
            currentUsername={user.username}
            onAuthorSelect={(u: User) => {
              setSelectedProfileUser(u)
              setView('profile')
            }}
            onOwnSelect={(u: User) => {
              setSelectedProfileUser(u)
              setView('self-profile')
            }}
            userFavoriteGenres={(() => {
              const genreCounts: Record<string, number> = {}
              books
                .filter(b => isBookFavorited(b.id) || b.isOwned)
                .forEach(b => {
                  ;(b.genres || []).forEach((g: string) => {
                    genreCounts[g] = (genreCounts[g] || 0) + 1
                  })
                })
              return Object.entries(genreCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(e => e[0])
            })()}
          />
        )

      case 'library':
        const ownedIds = getUserOwnedBookIds()
        const ownedBooks = books.filter(
          b => ownedIds.has(b.id) && !blockedUsers.has(b.author.username)
        )

        return (
          <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
            <div>
              <header className='p-6 border-b border-gray-50 flex justify-between items-center'>
                <div>
                  <h1 className='text-2xl font-bold'>Library</h1>
                  <p className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
                    {ownedBooks.length}/{MAX_LIBRARY_SIZE} Saved
                  </p>
                </div>
                <div className='w-24 h-2 bg-gray-50 rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-accent'
                    style={{
                      width: `${(ownedBooks.length / MAX_LIBRARY_SIZE) * 100}%`
                    }}
                  />
                </div>
              </header>
              <div className='flex flex-wrap gap-4 p-6'>
                {ownedBooks.map(b => {
                  const progressData = getUserBookProgress(b.id)
                  const scrollProgress = progressData.scrollProgress || 0
                  const chapterIndex = progressData.chapterIndex || 0
                  const currentChapterTitle =
                    b.chapters?.[chapterIndex]?.title || null

                  return (
                    <div
                      key={b.id}
                      onClick={() => {
                        setSelectedBook(b)
                        setView('book-detail')
                      }}
                      className='space-y-2 cursor-pointer w-28'
                    >
                      <div
                        className='aspect-[2/3] rounded-2x1 shadow-lg overflow-hidden relative'
                        style={{ backgroundColor: b.coverColor }}
                      >
                        <CoverImg book={b} />
                        <div className='absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent z-20'>
                          {currentChapterTitle && (
                            <p className='text-xs text-white font-semibold mb-1 truncate'>
                              {currentChapterTitle}
                            </p>
                          )}
                          <p className='text-[10px] text-white/80 font-bold uppercase tracking-wider mb-1'>
                            {scrollProgress}% Read
                          </p>
                          <div className='w-full h-1.5 bg-white/30 rounded-full overflow-hidden'>
                            <div
                              className='h-full bg-accent'
                              style={{ width: `${scrollProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className='px-1'>
                        <p className='text-xs font-bold truncate'>{b.title}</p>
                        <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                          {b.author.displayName}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )

      case 'write':
        return (
          <WriteView
            books={books}
            user={user}
            initialBookId={lastSelectedBookId}
            initialChapterIndex={lastSelectedChapterIndex}
            onSelectionChange={(id: string, ch: string) => {
              setLastSelectedBookId(id)
              setLastSelectedChapterIndex(ch)
            }}
            onPublish={async (
              id: string | null,
              title: string,
              content: string,
              chapterIndex: number | null,
              chapterTitle: string
            ) => {
              let effectiveId = id
              if (!effectiveId) {
                // For new books, create in Firestore and wait for the ID
                const resolvedChapterTitle = chapterTitle.trim() || 'Chapter 1'
                const bookData = {
                  title: title.trim(),
                  authorUid: firebaseUid || '',
                  authorUsername: user?.username || '',
                  authorDisplayName: user?.displayName || '',
                  coverColor:
                    '#' + Math.floor(Math.random() * 16777215).toString(16),
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
                try {
                  const created = await fbService.createBook(bookData)
                  effectiveId = (created as any).id
                } catch (err) {
                  console.error('Failed to create book:', err)
                  return
                }
              } else {
                // Existing book — save draft
                await handleSaveDraft(
                  id,
                  title,
                  content,
                  chapterIndex,
                  chapterTitle
                )
              }

              if (effectiveId) {
                const existingBook = books.find(b => b.id === effectiveId)
                setCurrentPublishingId(effectiveId)
                setCurrentPublishingTitle(title)
                setCurrentPublishingContent(content)
                setCurrentPublishingChapterTitle(chapterTitle.trim())
                setCurrentPublishingChapterIndex(chapterIndex)
                setPublishingInitialData(
                  existingBook
                    ? {
                        tagline: existingBook.tagline,
                        genres: existingBook.genres,
                        hashtags: existingBook.hashtags,
                        isExplicit: existingBook.isExplicit,
                        commentsEnabled: existingBook.commentsEnabled
                      }
                    : null
                )
                setView('publishing')
              }
            }}
            onSaveDraft={handleSaveDraft}
            onUnpublishChapter={handleUnpublishChapter}
            onDeleteChapter={handleDeleteChapter}
            onMonetize={() => setView('monetization-request')}
            onBack={() => setView('home')}
            showToast={showToast}
            onNotify={(title: string, message: string) => {
              const newNotif = {
                id: Math.random().toString(36).substr(2, 9),
                title,
                message,
                icon: 'warning',
                timestamp: new Date(),
                recipient: user.username || 'system'
              }
              setNotifications(prev => [newNotif, ...prev])
            }}
          />
        )

      case 'publishing':
        return (
          <PublishingView
            initialData={publishingInitialData}
            onPost={handlePublish}
            onBack={() => setView('write')}
            isNewBook={!currentPublishingId}
          />
        )

      case 'monetization-request':
        return (
          <MonetizationRequestView
            user={user}
            works={books.filter(b => b.author.username === user.username)}
            onRequest={handleRequestMonetization}
            onBack={() => setView('write')}
            showToast={showToast}
          />
        )

      case 'self-profile':
        return (
          <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in fade-in duration-500'>
            <header className='p-6 flex justify-end items-center sticky top-0 bg-white/80 backdrop-blur-md z-50'>
              <div className='flex gap-2'>
                <button
                  onClick={() => setView('cart')}
                  className='w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 relative'
                >
                  <span className='material-icons-round'>shopping_cart</span>
                  {cart.length > 0 && (
                    <span className='absolute -top-1 -right-1 w-5 h-5 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white'>
                      {cart.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setView('settings')}
                  className='w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400'
                >
                  <span className='material-icons-round'>settings</span>
                </button>
              </div>
            </header>
            <div className='p-6 flex flex-col items-center'>
              {avatarConfig ? (
                <div className='w-36 h-36 rounded-[3rem] overflow-hidden border-4 border-white shadow-2xl mb-6 relative bg-gray-50'>
                  <AvatarLayers
                    avatarConfig={avatarConfig}
                    containerClassName='absolute left-1/2'
                    containerStyle={{
                      width: '140px',
                      height: '194px',
                      transform: 'translateX(-50%) scale(2.2)',
                      transformOrigin: 'top center',
                      top: '8%'
                    }}
                    hairShrink={0.92}
                    hairShift={-0.05}
                    hairStyleOverride={(() => {
                      const pos = getHairPosition(
                        avatarConfig.hairId,
                        0.91,
                        -0.05
                      )
                      const top = parseFloat(pos.top)
                      return { ...pos, top: `${(top + 0.4).toFixed(3)}%` }
                    })()}
                  />
                </div>
              ) : (
                <div className='w-32 h-32 rounded-[3rem] bg-accent/5 flex items-center justify-center text-accent text-5xl font-bold mb-6 border-4 border-white shadow-2xl'>
                  {user.displayName[0]}
                </div>
              )}
              <div className='flex items-center gap-2'>
                <h1 className='text-2xl font-bold'>{user.displayName}</h1>
                {user.isPremium && (
                  <span className='material-icons-round text-pink-500 text-lg'>
                    workspace_premium
                  </span>
                )}
              </div>
              <p className='text-xs text-gray-300 font-bold uppercase tracking-widest mb-10'>
                @{user.username}
              </p>
              <div className='grid grid-cols-4 gap-4 w-full px-4 mb-10'>
                <div className='text-center'>
                  <p className='text-lg font-bold'>{user.points}</p>
                  <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
                    Points
                  </p>
                </div>
                <div className='text-center'>
                  <p className='text-lg font-bold'>
                    {(() => {
                      const admiring = relationships
                        .filter(r => r.admirer === user.username)
                        .map(r => r.target)
                      return admiring.filter(t =>
                        relationships.some(
                          r => r.admirer === t && r.target === user.username
                        )
                      ).length
                    })()}
                  </p>
                  <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
                    Mutuals
                  </p>
                </div>
                <div className='text-center'>
                  <p className='text-lg font-bold'>
                    {
                      relationships.filter(r => r.target === user.username)
                        .length
                    }
                  </p>
                  <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
                    Admirers
                  </p>
                </div>
                <div className='text-center'>
                  <p className='text-lg font-bold'>
                    {
                      relationships.filter(r => r.admirer === user.username)
                        .length
                    }
                  </p>
                  <p className='text-[8px] font-bold text-gray-300 uppercase tracking-widest'>
                    Admiring
                  </p>
                </div>
              </div>
              <Button
                className='w-full max-w-xs mb-10'
                onClick={() => setView('customization')}
              >
                <span className='material-icons-round'>palette</span> CUSTOMIZE
              </Button>
              <section className='w-full space-y-6 mb-12'>
                <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
                  Your Works
                </h3>
                <div className='flex gap-6 overflow-x-auto no-scrollbar px-2'>
                  {/* Updated to filter out drafts */}
                  {books
                    .filter(
                      b => b.author.username === user.username && !b.isDraft
                    )
                    .map(b => (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedBook(b)
                          setView('book-detail')
                        }}
                        className='flex-shrink-0 w-32 cursor-pointer space-y-2'
                      >
                        <div
                          className={`aspect-[2/3] shadow-md overflow-hidden relative ${
                            b.isDraft ? 'opacity-50' : ''
                          }`}
                          style={{ backgroundColor: b.coverColor }}
                        >
                          <CoverImg book={b} />
                        </div>
                        <div className='px-1'>
                          <p className='text-xs font-bold truncate'>
                            {b.title}
                          </p>
                          <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                            {b.author.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                  {books.filter(
                    b => b.author.username === user.username && !b.isDraft
                  ).length === 0 && (
                    <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                      No published works
                    </p>
                  )}
                </div>
              </section>
              <section className='w-full space-y-6'>
                <h3 className='text-xs font-bold uppercase tracking-widest text-gray-400 ml-2'>
                  Favorites
                </h3>
                <div className='flex gap-6 overflow-x-auto no-scrollbar px-2'>
                  {books
                    .filter(b => b.isFavorite)
                    .map(b => (
                      <div
                        key={b.id}
                        onClick={() => {
                          setSelectedBook(b)
                          setView('book-detail')
                        }}
                        className='flex-shrink-0 w-32 cursor-pointer space-y-2'
                      >
                        <div
                          className='aspect-[2/3] shadow-md overflow-hidden relative'
                          style={{ backgroundColor: b.coverColor }}
                        >
                          <CoverImg book={b} />
                        </div>
                        <div className='px-1'>
                          <p className='text-xs font-bold truncate'>
                            {b.title}
                          </p>
                          <p className='text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate'>
                            {b.author.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                  {books.filter(b => b.isFavorite).length === 0 && (
                    <p className='text-[9px] font-bold text-gray-300 uppercase tracking-widest ml-2 py-4'>
                      No favorites yet
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        )

      case 'customization':
        return (
          <CustomizationView
            user={user}
            setUser={setUser}
            onBack={() => setView('self-profile')}
            avatarConfig={avatarConfig}
            setAvatarConfig={setAvatarConfig}
            unlockedAvatarItems={unlockedAvatarItems}
            setUnlockedAvatarItems={setUnlockedAvatarItems}
            isAdmin={isAdmin}
            getItemCost={getItemCost}
          />
        )

      case 'notifications': {
        // Sort once: newest first
        const sortedNotifs = notifications
          .filter(
            n =>
              n.recipient === user.username && !blockedUsers.has(n.sender || '')
          )
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(0, 20)
        // Mark all as read after a short delay so user sees unread state first
        if (sortedNotifs.some(n => !n.read)) {
          setTimeout(
            () =>
              fbService
                .markNotificationsRead(user.username)
                .catch(console.error),
            2000
          )
        }
        return (
          <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
            <header className='p-6 flex items-center gap-4'>
              <button
                onClick={() => setView('home')}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
              <h1 className='text-xl font-bold'>Notifications</h1>
            </header>

            <div className='p-6 space-y-4'>
              {sortedNotifs.length > 0 ? (
                sortedNotifs.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-5 rounded-[1.5rem] border flex gap-4 cursor-pointer items-start hover:opacity-75 transition-opacity ${
                      !n.read
                        ? 'bg-accent/10 border-accent/20'
                        : 'bg-accent/5 border-accent/10'
                    }`}
                  >
                    <div className='relative shrink-0 pointer-events-none'>
                      <div className='w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center'>
                        <span className='material-icons-round'>{n.icon}</span>
                      </div>
                      {!n.read && (
                        <span className='absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white' />
                      )}
                    </div>
                    <div className='min-w-0 pointer-events-none'>
                      <p
                        className={`text-xs font-bold ${
                          !n.read ? 'text-black' : 'text-gray-600'
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className='text-[10px] text-gray-400'>{n.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className='text-center py-20 text-gray-300 font-bold uppercase tracking-widest text-[10px]'>
                  No new notifications
                </div>
              )}
            </div>
          </div>
        )
      }

      case 'profile':
        return (
          selectedProfileUser && (
            <OtherProfileView
              user={selectedProfileUser}
              books={books}
              onBack={() => setView('home')}
              onBookSelect={(b: Book) => {
                setSelectedBook(b)
                setView('book-detail')
              }}
              onAdmire={() => handleAdmire(selectedProfileUser)}
              onBlock={() => handleBlockUser(selectedProfileUser.username)}
              onReport={() =>
                handleReport('User', selectedProfileUser.username)
              }
              onMessage={() => {
                setSelectedChatUser(selectedProfileUser.username)
                setView('chat-conversation')
              }}
              relationships={relationships}
              currentUsername={user.username}
              readingActivity={readingActivity}
              avatarConfig={
                allAvatarConfigs[selectedProfileUser.username] || null
              }
              favoriteBookIds={
                new Set(
                  registeredUsers.find(
                    (u: any) => u.username === selectedProfileUser.username
                  )?.favoriteBookIds || []
                )
              }
            />
          )
        )

      case 'settings':
        return (
          <SettingsView
            onBack={() => setView('self-profile')}
            handleLogout={handleLogout}
            onNavigate={(v: View) => setView(v)}
            isAdmin={isAdmin}
            user={user}
            onUpdateUser={(updatedUser: User) => {
              setUser(updatedUser)
              if (firebaseUid) {
                fbService
                  .updateUserProfile(firebaseUid, {
                    displayName: updatedUser.displayName,
                    points: updatedUser.points,
                    strikes: updatedUser.strikes
                  })
                  .catch(console.error)
              }
            }}
            onUpdatePassword={async (newPassword: string) => {
              try {
                await fbService.changePassword(newPassword)
                showToast('Password updated!', 'check_circle')
              } catch (err: any) {
                showToast(
                  'Failed to update password. You may need to log in again.',
                  'error'
                )
              }
            }}
            showToast={showToast}
          />
        )

      case 'notification-settings':
        return (
          <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
            <header className='flex items-center gap-4 mb-10'>
              <button
                onClick={() => setView('settings')}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
              <h1 className='text-xl font-bold'>Notifications</h1>
            </header>
            <div className='space-y-6'>
              {['New Admirers', 'Book Likes', 'Comments', 'App Updates'].map(
                item => (
                  <div
                    key={item}
                    className='flex justify-between items-center p-6 bg-gray-50 rounded-3xl'
                  >
                    <span className='text-sm font-bold'>{item}</span>
                    <input
                      type='checkbox'
                      defaultChecked
                      className='accent-accent w-5 h-5'
                    />
                  </div>
                )
              )}
            </div>
          </div>
        )

      case 'blocked-users':
        return (
          <div className='fixed inset-0 bg-white p-8 overflow-y-auto no-scrollbar animate-in slide-in-from-right duration-500'>
            <header className='flex items-center gap-4 mb-10'>
              <button
                onClick={() => setView('settings')}
                className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
              >
                <span className='material-icons-round'>arrow_back</span>
              </button>
              <h1 className='text-xl font-bold'>Blocked Users</h1>
              <span className='text-[10px] font-bold text-gray-300 uppercase tracking-widest'>
                {blockedUsers.size}
              </span>
            </header>
            {blockedUsers.size === 0 ? (
              <div className='flex flex-col items-center justify-center h-64 text-gray-300'>
                <span className='material-icons-round text-4xl mb-4'>
                  block
                </span>
                <p className='text-[10px] font-bold uppercase tracking-widest'>
                  No blocked users
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                {[...blockedUsers].map(blockedUsername => {
                  const blockedUser =
                    registeredUsers.find(u => u.username === blockedUsername) ||
                    MUTUALS.find(u => u.username === blockedUsername)
                  return (
                    <div
                      key={blockedUsername}
                      className='flex items-center gap-4 p-5 bg-gray-50 rounded-3xl border border-gray-100'
                    >
                      <div className='w-12 h-12 rounded-2xl bg-gray-200 flex items-center justify-center text-gray-400'>
                        <span className='material-icons-round'>person</span>
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-bold truncate'>
                          {blockedUser?.displayName || blockedUsername}
                        </p>
                        <p className='text-[10px] text-gray-400 font-bold'>
                          @{blockedUsername}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnblockUser(blockedUsername)}
                        className='px-5 py-2.5 bg-white rounded-2xl text-xs font-bold border border-gray-200 text-gray-500 transition-all active:scale-95 hover:border-accent hover:text-accent'
                      >
                        Unblock
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )

      case 'book-detail':
        return (
          selectedBook && (
            <PublicBookDetailPage
              currentUser={user}
              book={selectedBook}
              totalCommentsCount={
                allComments.filter((c: any) => c.bookId === selectedBook.id)
                  .length
              }
              isOwned={getUserOwnedBookIds().has(selectedBook.id)}
              bookProgress={getUserBookProgress(selectedBook.id)}
              onBack={() => setView('explore')}
              onRead={() => {
                setReadingActivity(prev => {
                  const ua = [...(prev[user.username] || [])]
                  const ei = ua.findIndex(a => a.bookId === selectedBook.id)
                  const entry = {
                    bookId: selectedBook.id,
                    progress: getUserBookProgress(selectedBook.id)
                      .scrollProgress,
                    lastRead: new Date().toISOString()
                  }
                  if (ei >= 0) ua[ei] = entry
                  else ua.unshift(entry)
                  return { ...prev, [user.username]: ua.slice(0, 10) }
                })
                setView('reading')
              }}
              onAuthorClick={(u: User) => {
                setSelectedProfileUser(u)
                setView('profile')
              }}
              onSave={() => handleSaveToLibrary(selectedBook.id)}
              onRemove={() => handleRemoveFromLibrary(selectedBook.id)}
              isSaved={isBookInLibrary(selectedBook.id)}
              onReport={() => handleReport('Book', selectedBook.id)}
              onShare={() => handleShareBook(selectedBook)}
              onAddToCart={() => handleAddToCart(selectedBook)}
              onToggleFavorite={() => handleToggleFavorite(selectedBook.id)}
              onDelete={handleDeleteBook}
              onUnpublish={handleUnpublish}
              onMarkCompleted={handleMarkCompleted}
            />
          )
        )

      case 'reading':
        if (!userDataLoaded) {
          return (
            <div className='fixed inset-0 bg-white flex items-center justify-center'>
              <p className='text-[10px] font-bold uppercase tracking-widest text-gray-400'>
                Loading reader...
              </p>
            </div>
          )
        }
        const savedProgress = selectedBook
          ? getUserBookProgress(selectedBook.id)
          : { scrollProgress: 0, chapterIndex: 0 }
        return (
          <ReadingView
            currentUser={user}
            book={selectedBook}
            initialScrollProgress={savedProgress.scrollProgress}
            initialChapterIndex={savedProgress.chapterIndex}
            initialExactPosition={savedProgress}
            settings={readerSettings}
            setSettings={setReaderSettings}
            onBack={() => setView('book-detail')}
            onComments={(chapterIdx?: number) => {
              setReadingChapterIndex(chapterIdx ?? 0)
              setView('comments')
            }}
            likedChapters={likedBooks}
            onLike={(chapterIdx: number) =>
              selectedBook && handleLike(selectedBook.id, chapterIdx)
            }
            onSave={() => selectedBook && handleSaveToLibrary(selectedBook.id)}
            isSaved={selectedBook ? isBookInLibrary(selectedBook.id) : false}
            canSave={
              selectedBook
                ? user.username !== selectedBook.author.username &&
                  (getUserOwnedBookIds().has(selectedBook.id) ||
                    selectedBook.isFree ||
                    !selectedBook.isMonetized)
                : false
            }
            chapterCommentsCount={
              allComments.filter(
                (c: any) =>
                  c.bookId === selectedBook?.id &&
                  (c.chapterIndex ?? 0) === readingChapterIndex
              ).length
            }
            onProgressUpdate={(
              scrollProgress: number,
              chapterIndex: number,
              exact?: Partial<BookProgress>
            ) => {
              setReadingChapterIndex(chapterIndex)
              selectedBook &&
                handleBookProgressUpdate(
                  selectedBook.id,
                  scrollProgress,
                  chapterIndex,
                  exact
                )
            }}
            onShare={() => selectedBook && handleShareBook(selectedBook)}
          />
        )

      case 'comments':
        return (
          <CommentsView
            comments={allComments.filter(c => {
              if (c.bookId !== selectedBook?.id) return false
              // Filter out comments by blocked users (match by displayName)
              const commentAuthor =
                registeredUsers.find(u => u.displayName === c.author) ||
                MUTUALS.find(u => u.displayName === c.author)
              if (commentAuthor && blockedUsers.has(commentAuthor.username))
                return false
              return true
            })}
            onPost={postComment}
            onBack={() => {
              setScrollToCommentId(null)
              setView('reading')
            }}
            onReport={(id: string) => handleReport('Comment', id)}
            onLikeComment={handleLikeComment}
            currentUsername={user.username}
            chapters={selectedBook?.chapters || []}
            initialChapterIndex={readingChapterIndex}
            scrollToCommentId={scrollToCommentId}
            onScrolledTo={() => setScrollToCommentId(null)}
          />
        )

      case 'admin-dashboard':
        return (
          <AdminDashboard
            reports={reports}
            books={books.filter((b: any) => !b.isDraft)}
            comments={allComments}
            registeredUsers={registeredUsers}
            onBack={() => setView('settings')}
            onRemoveBook={handleRemoveBook}
            onRemoveComment={handleRemoveComment}
            onAddStrike={handleAddStrike}
            onRemoveStrike={handleRemoveStrike}
            onBanUser={handleBanUser}
            onDismissReport={handleDismissReport}
            getItemCost={getItemCost}
            onUpdateItemPrice={handleUpdateItemPrice}
          />
        )

      case 'chat':
        return (
          <ChatListView
            currentUsername={user.username}
            relationships={relationships}
            registeredUsers={registeredUsers}
            mutualsFallback={MUTUALS}
            chatMessages={chatMessages}
            blockedUsers={blockedUsers}
            avatarConfigs={allAvatarConfigs}
            onSelectChat={(username: string) => {
              setSelectedChatUser(username)
              setView('chat-conversation')
            }}
            onBack={() => setView('home')}
            getAvatarItemPath={getAvatarItemPath}
          />
        )

      case 'chat-conversation':
        const chatIsMutual = selectedChatUser
          ? relationships.some(
              r => r.admirer === user.username && r.target === selectedChatUser
            ) &&
            relationships.some(
              r => r.admirer === selectedChatUser && r.target === user.username
            )
          : false
        return (
          <ChatConversationView
            currentUsername={user.username}
            currentDisplayName={user.displayName}
            targetUsername={selectedChatUser || ''}
            targetUser={
              registeredUsers.find(u => u.username === selectedChatUser) ||
              MUTUALS.find(u => u.username === selectedChatUser)
            }
            messages={chatMessages.filter(
              m =>
                (m.from === user.username && m.to === selectedChatUser) ||
                (m.from === selectedChatUser && m.to === user.username)
            )}
            onSend={(text: string) =>
              selectedChatUser && handleSendMessage(selectedChatUser, text)
            }
            onBack={() => setView('chat')}
            getAvatarItemPath={getAvatarItemPath}
            avatarConfig={
              selectedChatUser
                ? allAvatarConfigs[selectedChatUser] || null
                : null
            }
            isMutual={chatIsMutual}
          />
        )

      default:
        return (
          <div className='fixed inset-0 flex items-center justify-center'>
            Missing View: {view}
          </div>
        )
    }
  }

  const showNav = [
    'home',
    'explore',
    'library',
    'write',
    'self-profile'
  ].includes(view)

  return (
    <div
      className='min-h-dvh bg-white transition-colors duration-500 overflow-hidden text-black font-sans'
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {renderView()}
      {showNav && (
        <nav
          className='fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-6 pt-4 flex justify-around items-center z-[200]'
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          {[
            { id: 'home', icon: 'home', label: 'Home' },
            { id: 'explore', icon: 'explore', label: 'Explore' },
            { id: 'library', icon: 'bookmarks', label: 'Library' },
            { id: 'write', icon: 'edit_note', label: 'Write' },
            { id: 'self-profile', icon: 'person', label: 'Me' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as View)}
              className={`flex flex-col items-center gap-1 transition-all ${
                view === tab.id
                  ? 'text-accent scale-110'
                  : 'text-gray-400 opacity-60'
              }`}
            >
              <span className='material-icons-round text-2xl'>{tab.icon}</span>
              <span className='text-[8px] font-bold uppercase tracking-tighter'>
                {tab.label}
              </span>
            </button>
          ))}
        </nav>
      )}
      {/* Toast notification */}
      {toast && (
        <div className='fixed top-10 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-top fade-in duration-300'>
          <div className='flex items-center gap-3 px-6 py-4 bg-black/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10'>
            <span className='material-icons-round text-accent'>
              {toast.icon}
            </span>
            <span className='text-sm font-bold text-white'>
              {toast.message}
            </span>
          </div>
        </div>
      )}
      {/* Confirmation Modal */}
      {confirmModal && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] flex items-center justify-center p-6 animate-in fade-in duration-200'>
          <div className='bg-white rounded-[2rem] p-8 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300'>
            <div className='text-center space-y-3'>
              <div
                className={`w-16 h-16 ${
                  confirmModal.iconBg || 'bg-accent/10'
                } rounded-full flex items-center justify-center mx-auto`}
              >
                <span
                  className={`material-icons-round text-3xl ${
                    confirmModal.iconBg ? 'text-white' : 'text-accent'
                  }`}
                >
                  {confirmModal.icon || 'shopping_cart'}
                </span>
              </div>
              <h2 className='text-lg font-bold'>{confirmModal.title}</h2>
              <p className='text-sm text-gray-400 leading-relaxed'>
                {confirmModal.message}
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                onClick={() => {
                  confirmModal.onCancel?.()
                  setConfirmModal(null)
                }}
                className='flex-1 py-4 rounded-2xl bg-gray-100 text-sm font-bold transition-all active:scale-95'
              >
                {confirmModal.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm()
                  setConfirmModal(null)
                }}
                className='flex-1 py-4 rounded-2xl bg-accent text-white text-sm font-bold transition-all active:scale-95'
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
