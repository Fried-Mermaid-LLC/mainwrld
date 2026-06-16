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
import * as fbService from '@/services/firebaseService'
import {
  BASE,
  STRIPE_PUBLISHABLE_KEY,
  getStripe,
  STRIPE_PRICE_IDS,
  STRIPE_PAYMENT_LINKS,
  STRIPE_PREMIUM_PAYMENT_LINK,
  STRIPE_PREMIUM_PRICE_ID,
  STRIPE_BOOK_PRICE_ID
} from '@/config/config'
import {
  ACCENT_COLOR,
  WORLD_RADIUS,
  MAX_LIBRARY_SIZE,
  MIN_WORD_COUNT,
  MAX_DAILY_EARNED_POINTS,
  COMMENT_LIKES_THRESHOLD,
  MAX_WORD_COUNT,
  GENRE_LIST,
  SKIN_TONE_COLORS
} from '@/config/constants'
import {
  getHairPosition,
  getFacePosition,
  getAvatarItemPath,
  AvatarLayers,
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
  Comment,
  Coupon,
  AvatarGender,
  AvatarCategory,
  AvatarItem,
  Chapter,
  Book
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
import type { Dispatch, SetStateAction } from 'react'
import { AppContext } from './AppContext'
import { useUI } from './hooks/useUI'
import { useAuth } from './hooks/useAuth'
import { useRewards } from './hooks/useRewards'
import { useAvatar } from './hooks/useAvatar'
import { useNotifications } from './hooks/useNotifications'
import { useComments } from './hooks/useComments'
import { useChat } from './hooks/useChat'
import { useCart } from './hooks/useCart'
import { useBooks } from './hooks/useBooks'
import { useSocial } from './hooks/useSocial'
import { useReading } from './hooks/useReading'
import { useAdmin } from './hooks/useAdmin'
import { useAuthActions } from './hooks/useAuthActions'
import { useUserDataLoader } from './hooks/useUserDataLoader'

// The entire former App body lifted verbatim into a single hook. Hook-call
// order and every effect dependency array are preserved exactly, so runtime
// behaviour is identical to the previous monolithic component. Phase B will
// strangle individual domains out of this hook into dedicated hook files.
type AddNotification = (
  title: string,
  message: string,
  icon: string,
  recipient?: string,
  sender?: string,
  targetId?: string,
  targetChapterIndex?: number,
  commentId?: string
) => void

type ReadingActivityMap = Record<
  string,
  { bookId: string; progress: number; lastRead: string }[]
>

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
  // Auth identity/session state lives in useAuth (Phase B). Placed right after
  // useUI so its onIdTokenChanged effect registers in the same order as before.
  const authState = useAuth()
  const {
    BLANK_USER,
    user,
    setUser,
    authLoading,
    setAuthLoading,
    firebaseUid,
    setFirebaseUid,
    userDataLoaded,
    setUserDataLoaded,
    signUpForm,
    setSignUpForm,
    loginForm,
    setLoginForm,
    authError,
    setAuthError,
    hasAdminClaim,
    setHasAdminClaim,
    isAdmin
  } = authState
  // Late-bound bridge for addNotification: useNotifications is called below
  // (it consumes MUTUALS/registeredUsers/books). Hooks that run earlier
  // (useBooks/useSocial) reach notifications through this stable wrapper;
  // addNotificationRef.current is wired the moment useNotifications returns.
  const addNotificationRef = useRef<AddNotification>(() => {})
  const addNotificationLB = useCallback<AddNotification>(
    (...args) => addNotificationRef.current(...args),
    []
  )
  // Late-bound bridge for setReadingActivity: readingActivity is owned in the
  // body below (→ useReading later), but useSocial's subscribeToUsers effect
  // writes it. setReadingActivityRef.current is wired right after the
  // readingActivity state is declared.
  const setReadingActivityRef = useRef<Dispatch<SetStateAction<ReadingActivityMap>>>(
    () => {}
  )
  const setReadingActivityLB = useCallback<Dispatch<SetStateAction<ReadingActivityMap>>>(
    value => setReadingActivityRef.current(value),
    []
  )
  // Points / coupons / membership rewards live in useRewards (Phase B). Placed
  // early so awardPoints + rewardedItems are direct refs for handleLike /
  // handleLikeComment, and lastClaimedPoints/coupons for the persist effect.
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
  // Books domain lives in useBooks (Phase B). Placed before useNotifications
  // (which reads books) and after useRewards (handleLike awards points). It
  // reaches notifications through addNotificationLB since useNotifications runs
  // later in this hook.
  const booksState = useBooks({
    user,
    firebaseUid,
    selectedBook,
    setSelectedBook,
    setView,
    showToast,
    showConfirm,
    addNotification: addNotificationLB,
    awardPoints,
    rewardedItems,
    setRewardedItems
  })
  const {
    books,
    setBooks,
    globalSpotlightBookId,
    setGlobalSpotlightBookId,
    likedBooks,
    setLikedBooks,
    favoriteBookIds,
    setFavoriteBookIds,
    likedBooksInteracted,
    spotlightInit,
    setSpotlightInit,
    getTotalLikes,
    getChapterLikes,
    isBookFavorited,
    handleLike,
    handleToggleFavorite,
    handleUnpublish,
    handleDeleteBook,
    handleMarkCompleted,
    handleShareBook
  } = booksState


  // Avatar config / unlocked items live in useAvatar (Phase B). Moved ahead of
  // useSocial because subscribeToUsers writes setAllAvatarConfigs /
  // setAllUnlockedItems, which must be direct refs.
  const avatar = useAvatar({ user, selectedProfileUser })
  const {
    allAvatarConfigs,
    setAllAvatarConfigs,
    avatarConfig,
    setAvatarConfig,
    allUnlockedItems,
    setAllUnlockedItems,
    unlockedAvatarItems,
    setUnlockedAvatarItems
  } = avatar
  // Social graph lives in useSocial (Phase B). Placed before useNotifications
  // (which reads MUTUALS/registeredUsers) and after useAvatar. It reaches
  // addNotification via addNotificationLB and setReadingActivity via
  // setReadingActivityLB, since both owners run later in this hook.
  const social = useSocial({
    user,
    firebaseUid,
    setView,
    showToast,
    showConfirm,
    addNotification: addNotificationLB,
    setAllAvatarConfigs,
    setAllUnlockedItems,
    setReadingActivity: setReadingActivityLB
  })
  const {
    registeredUsers,
    setRegisteredUsers,
    relationships,
    setRelationships,
    MUTUALS,
    userIsUnder16,
    blockedUsers,
    setBlockedUsers,
    pendingAdmireRef,
    handleAdmire,
    handleBlockUser,
    handleUnblockUser
  } = social

  // Notifications state (Firestore real-time)
  // Notifications domain lives in useNotifications (Phase B), placed after
  // books/MUTUALS/registeredUsers (handleNotificationClick reads them) and
  // before the handlers that call addNotification.
  const notif = useNotifications({
    user,
    firebaseUid,
    books,
    mutuals: MUTUALS,
    registeredUsers,
    setView,
    setSelectedBook,
    setReadingChapterIndex,
    setActiveCommentChapterKey,
    setScrollToCommentId,
    setSelectedProfileUser,
    setSelectedChatUser
  })
  const { notifications, setNotifications, addNotification, handleNotificationClick } = notif
  addNotificationRef.current = addNotification


  // Reading domain lives in useReading (Phase B). Placed after useBooks,
  // useSocial and useNotifications so books/relationships/addNotification are
  // direct refs. setReadingActivityRef is rewired to this hook's
  // setReadingActivity (useSocial's subscribeToUsers writes it via the bridge).
  const reading = useReading({
    user,
    setUser,
    firebaseUid,
    userDataLoaded,
    books,
    setBooks,
    selectedBook,
    setSelectedBook,
    setView,
    showToast,
    relationships,
    addNotification
  })
  const {
    readingActivity,
    setReadingActivity,
    userBookData,
    setUserBookData,
    userBookDataRef,
    getUserOwnedBookIds,
    getUserBookProgress,
    setUserOwnsBook,
    setUserBookProgress,
    currentPublishingContent,
    setCurrentPublishingContent,
    currentPublishingTitle,
    setCurrentPublishingTitle,
    currentPublishingChapterTitle,
    setCurrentPublishingChapterTitle,
    currentPublishingId,
    setCurrentPublishingId,
    currentPublishingChapterIndex,
    setCurrentPublishingChapterIndex,
    publishingInitialData,
    setPublishingInitialData,
    lastSelectedBookId,
    setLastSelectedBookId,
    lastSelectedChapterIndex,
    setLastSelectedChapterIndex,
    handleUnpublishChapter,
    handleDeleteChapter,
    handleSaveToLibrary,
    handleRemoveFromLibrary,
    isBookInLibrary,
    handlePublish,
    handleRequestMonetization,
    handleSaveDraft,
    handleBookProgressUpdate
  } = reading
  setReadingActivityRef.current = setReadingActivity

  // Comments domain lives in useComments (Phase B), placed after useRewards
  // so handleLikeComment can use awardPoints/rewardedItems.
  const comments = useComments({
    user,
    firebaseUid,
    selectedBook,
    registeredUsers,
    showToast,
    addNotification,
    awardPoints,
    rewardedItems,
    setRewardedItems
  })
  const { allComments, setAllComments, postComment, handleLikeComment } = comments

  // Chat domain lives in useChat (Phase B), placed after useNotifications
  // (handleSendMessage uses addNotification).
  const chat = useChat({
    user,
    firebaseUid,
    view,
    selectedChatUser,
    registeredUsers,
    mutuals: MUTUALS,
    showToast,
    addNotification
  })
  const { chatMessages, setChatMessages, handleSendMessage } = chat

  const cart_ = useCart({ showToast })
  const { cart, setCart, handleAddToCart } = cart_
  // Moderation / admin domain lives in useAdmin (Phase B). Placed after
  // useNotifications/useSocial/useBooks so addNotification, registeredUsers and
  // books are direct refs; subscribeToReports is gated on firebaseUid && isAdmin.
  const admin = useAdmin({
    user,
    firebaseUid,
    isAdmin,
    showToast,
    addNotification,
    registeredUsers,
    setRegisteredUsers,
    books
  })
  const {
    reports,
    setReports,
    itemPriceOverrides,
    setItemPriceOverrides,
    getItemCost,
    handleUpdateItemPrice,
    handleReport,
    handleRemoveBook,
    handleRemoveComment,
    handleAddStrike,
    handleRemoveStrike,
    handleBanUser,
    handleDismissReport
  } = admin


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


  // User-data loader lives in useUserDataLoader (Phase B). Runs the post-login
  // getUserProfile cascade and flips userDataLoaded true. Placed here (after the
  // persist effect, before the payment effects) so its effect registers in the
  // same order; every setter is a direct ref.
  useUserDataLoader({
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
    setLastClaimedPoints,
    setUserDataLoaded
  })

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


  // Auth actions live in useAuthActions (Phase B). Placed at the tail so its
  // onAuthStateChanged listener registers LAST (after persist/loader/payment
  // effects, matching the monolith) and so setFavoriteBookIds, setRegisteredUsers
  // and addNotification are direct refs.
  const authActions = useAuthActions({
    setUser,
    setFirebaseUid,
    setView,
    setFavoriteBookIds,
    setAuthLoading,
    setUserDataLoaded,
    setAuthError,
    setRegisteredUsers,
    firebaseUid,
    BLANK_USER,
    loginForm,
    signUpForm,
    addNotification
  })
  const { handleLogout, handleLogin, handleSignup } = authActions

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
