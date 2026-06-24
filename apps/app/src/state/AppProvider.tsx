import React, { useCallback, useRef, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { AppContext } from './AppContext'
import type { NotificationCategory } from '@/types'
import * as pushService from '@/services/pushService'
import * as fbService from '@/services/firebaseService'
import { convertFirestoreBook } from '@/utils/bookConverter'
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
import { usePayments } from './hooks/usePayments'
import { usePersist } from './hooks/usePersist'
import { useAppLifecycle } from './hooks/useAppLifecycle'

// useAppValue composes the app's domain hooks (Phase B complete). Each hook owns
// one slice of state / effects / handlers; this function only wires them together.
// The hook-call order and every effect's dependency array preserve the exact
// runtime behaviour of the original monolithic App component. Two late-bound
// bridges (addNotification / setReadingActivity) let hooks that run early call
// into owners that run later. The big returned object is the context value
// consumed throughout the app via useApp().
type AddNotification = (
  title: string,
  message: string,
  icon: string,
  recipient?: string,
  sender?: string,
  targetId?: string,
  targetChapterIndex?: number,
  commentId?: string,
  category?: NotificationCategory
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
    setScrollToCommentId,
    isWriting,
    setIsWriting,
    writeReturnView,
    setWriteReturnView
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
    authBusy,
    setAuthBusy,
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
  // Points / coupons / membership rewards live in useRewards (Phase B). Points
  // are server-owned now (claim/spin/membership go through the API), so this only
  // provides lastClaimedPoints/coupons for the persist + login cascade and the
  // claim/spin handlers.
  const rewards = useRewards({ user, setUser, showToast, showConfirm })
  const {
    lastClaimedPoints,
    setLastClaimedPoints,
    coupons,
    setCoupons,
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
    addNotification: addNotificationLB
  })
  const {
    books,
    setBooks,
    booksLoading,
    globalSpotlightBookId,
    setGlobalSpotlightBookId,
    likedBooks,
    setLikedBooks,
    favoriteBookIds,
    setFavoriteBookIds,
    likedBooksInteracted,
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
    canSeeMature,
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
  const { notifications, setNotifications, addNotification, handleNotificationClick, routeFromPushData } = notif
  addNotificationRef.current = addNotification

  // Register for push once auth + user resolve (native-only, fail-soft on web).
  // Deep-links push taps through the same notification router. Re-registers on
  // each cold start since the token can rotate.
  useEffect(() => {
    if (!firebaseUid || !userDataLoaded) return
    pushService.registerForPush(firebaseUid, routeFromPushData)
  }, [firebaseUid, userDataLoaded, routeFromPushData])


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

  // Comments domain lives in useComments (Phase B). Comment-like points are now
  // awarded server-side (comments.update → RewardsService).
  const comments = useComments({
    user,
    firebaseUid,
    selectedBook,
    registeredUsers,
    showToast,
    addNotification
  })
  const { allComments, setAllComments, postComment, handleLikeComment } = comments

  // Chat domain lives in useChat (Phase B), placed after useNotifications
  // (handleSendMessage uses addNotification).
  const chat = useChat({
    user,
    setUser,
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
    books,
    setBooks,
    allComments,
    setAllComments
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
    handleUnbanUser,
    handleDismissReport,
    handleApproveMonetization,
    handleDenyMonetization
  } = admin


  // Persistence lives in usePersist (Phase B, LAST). Owns persistTimerRef and the
  // debounced batch write (24-dep), the page-leave flush, the open/close presence
  // effect and the activity-by-view effect. Reads ~every domain slice as a direct
  // ref. Called first among the tail effects, matching the monolith.
  const persist = usePersist({
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
    favoriteBookIds
  })
  const { persistTimerRef } = persist

  // Native background/foreground presence (X06) — no-op on web.
  useAppLifecycle(firebaseUid)

  // Shared-book deep-link taps on native (F09). main.tsx's appUrlOpen listener
  // dispatches `mainwrld:open-book` with the tapped book id (the bundled iOS app
  // loads from capacitor://localhost, so window.location is never the share
  // URL). An already-authenticated user goes straight to book-detail; a
  // signed-out one lands on the public preview, which reads the id stashed in
  // sessionStorage. Covers warm taps; cold-start taps are handled by
  // resolveInitialView reading the same sessionStorage key.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail as string
      if (!id) return
      if (firebaseUid) {
        fbService
          .getBook(id)
          .then(fb => {
            if (fb) {
              setSelectedBook(convertFirestoreBook(fb, favoriteBookIds))
              setView('book-detail')
            }
          })
          .catch(() => {})
      } else {
        setView('public-book')
      }
    }
    window.addEventListener('mainwrld:open-book', handler)
    return () => window.removeEventListener('mainwrld:open-book', handler)
  }, [firebaseUid, favoriteBookIds, setSelectedBook, setView])

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


  // Payments (Stripe web redirects + native IAP verify) live in usePayments
  // (Phase B). Placed after the user-data loader and before useAuthActions so its
  // [view] and [] effects register in the same order as the monolith.
  usePayments({ view, user, firebaseUid, setUser, coupons, setCoupons, showToast, setUserBookData, userBookDataRef })

  // Auth actions live in useAuthActions (Phase B). Placed at the tail so its
  // onAuthStateChanged listener registers LAST (after persist/loader/payment
  // effects, matching the monolith) and so setFavoriteBookIds, setRegisteredUsers
  // and addNotification are direct refs.
  const authActions = useAuthActions({
    setUser,
    setFirebaseUid,
    setView,
    setSelectedBook,
    setFavoriteBookIds,
    setAuthLoading,
    setUserDataLoaded,
    setAuthError,
    setAuthBusy,
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
    setBooks, booksLoading, globalSpotlightBookId, setGlobalSpotlightBookId, selectedBook, setSelectedBook, readingChapterIndex,
    setReadingChapterIndex, selectedProfileUser, setSelectedProfileUser, selectedChatUser, setSelectedChatUser, chatMessages,
    setChatMessages, moveDir, setMoveDir, readerSettings, setReaderSettings, likedBooks,
    setLikedBooks, favoriteBookIds, setFavoriteBookIds, likedBooksInteracted, signUpForm, setSignUpForm,
    loginForm, setLoginForm, authError, setAuthError, authBusy, setAuthBusy, registeredUsers, setRegisteredUsers,
    activeCommentChapterKey, setActiveCommentChapterKey, scrollToCommentId, setScrollToCommentId, relationships, setRelationships,
    MUTUALS, hasAdminClaim, setHasAdminClaim, isAdmin, canSeeMature, reports,
    setReports, notifications, setNotifications, allAvatarConfigs, setAllAvatarConfigs, avatarConfig,
    setAvatarConfig, allUnlockedItems, setAllUnlockedItems, unlockedAvatarItems, setUnlockedAvatarItems, blockedUsers,
    setBlockedUsers, readingActivity, setReadingActivity, itemPriceOverrides, setItemPriceOverrides, getItemCost,
    handleUpdateItemPrice, allComments, setAllComments, lastClaimedPoints, setLastClaimedPoints,
    coupons, setCoupons, cart, setCart, userBookData,
    setUserBookData, userBookDataRef, getTotalLikes, getChapterLikes, getUserOwnedBookIds, isBookFavorited,
    getUserBookProgress, setUserOwnsBook, setUserBookProgress, persistTimerRef, pendingAdmireRef, currentPublishingContent,
    setCurrentPublishingContent, currentPublishingTitle, setCurrentPublishingTitle, currentPublishingChapterTitle, setCurrentPublishingChapterTitle, currentPublishingId,
    setCurrentPublishingId, currentPublishingChapterIndex, setCurrentPublishingChapterIndex, publishingInitialData, setPublishingInitialData, lastSelectedBookId,
    setLastSelectedBookId, lastSelectedChapterIndex, setLastSelectedChapterIndex, addNotification,
    handleUnpublishChapter, handleDeleteChapter, handleLogout, handleNotificationClick, handleLogin, handleSignup,
    handleSendMessage, handleLike, handleAdmire, handleReport, handleRemoveBook, handleRemoveComment,
    handleAddStrike, handleRemoveStrike, handleBanUser, handleUnbanUser, handleDismissReport, handleApproveMonetization, handleDenyMonetization, handleBlockUser, handleUnblockUser,
    handleSaveToLibrary, handleRemoveFromLibrary, isBookInLibrary, handleToggleFavorite, handleAddToCart,
    handleClaimPoints, handleSpinWheel, handlePublish, handleUnpublish, handleDeleteBook,
    handleMarkCompleted, handleRequestMonetization, handleSaveDraft, postComment, handleLikeComment, handleBookProgressUpdate,
    handleShareBook, isWriting, setIsWriting, writeReturnView, setWriteReturnView,
  }
}

export type AppContextValue = ReturnType<typeof useAppValue>

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useAppValue()
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
