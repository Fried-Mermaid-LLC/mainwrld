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
import { useApp } from '@/state/AppContext'

// Presentation shell: the former App return + renderView, now reading all
// state/handlers from context. The renderView/JSX below is byte-identical to
// the original — only the data source changed (closure -> context destructure).
export const AppShell: React.FC = () => {
  const {
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
  } = useApp()

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
