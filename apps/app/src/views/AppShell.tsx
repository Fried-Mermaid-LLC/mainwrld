import React, { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import type { View } from '@/types'
import { CustomizationView } from '@/views/CustomizationView'
import { ExploreView } from '@/views/ExploreView'
import { OtherProfileView } from '@/views/OtherProfileView'
import { PublicBookDetailPage } from '@/views/PublicBookDetailPage'
import { PublicBookLandingPage } from '@/views/PublicBookLandingPage'
import { ReadingView } from '@/views/ReadingView'
import { MonetizationRequestView } from '@/views/MonetizationRequestView'
import { PublishingView } from '@/views/PublishingView'
import { LegalView } from '@/views/LegalView'
import { ForgotPasswordView } from '@/views/ForgotPasswordView'
import { ResetPasswordView } from '@/views/ResetPasswordView'
import { SettingsView } from '@/views/SettingsView'
import { AdminDashboard } from '@/views/AdminDashboard'
import { CommentsView } from '@/views/CommentsView'
import { ChatListView } from '@/views/ChatListView'
import { ChatConversationView } from '@/views/ChatConversationView'
import { WriteView } from '@/views/WriteView'
import { HomeView } from '@/views/HomeView'
import { DailyRewardsView } from '@/views/DailyRewardsView'
import { LibraryView } from '@/views/LibraryView'
import { SelfProfileView } from '@/views/SelfProfileView'
import { NotificationsView } from '@/views/NotificationsView'
import { NotificationSettingsView } from '@/views/NotificationSettingsView'
import { BlockedUsersView } from '@/views/BlockedUsersView'
import { LandingView } from '@/views/LandingView'
import { LoginView } from '@/views/LoginView'
import { SignupView } from '@/views/SignupView'
import { WelcomePopup } from '@/components/WelcomePopup'
import { OnboardingGate } from '@/components/OnboardingGate'
import { useApp } from '@/state/AppContext'



// Presentation shell: the former App return + renderView, now reading all
// state/handlers from context. The renderView/JSX below is byte-identical to
// the original — only the data source changed (closure -> context destructure).
export const AppShell: React.FC = () => {
  const {
    view, setView, toast, confirmModal, setConfirmModal, userDataLoaded,
    selectedBook, selectedProfileUser, isWriting, writeMode, setWriteReturnView, setWriteMode
  } = useApp()

  // Keep the native Capacitor splash up through the initial `splash` view and
  // dismiss it the moment auth resolves and we navigate away. There's no React
  // splash anymore, so this hand-off is what avoids a white flash on launch.
  useEffect(() => {
    if (view !== 'splash' && Capacitor.isNativePlatform()) {
      SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
    }
  }, [view])

  // Failsafe against a stranded launch. With launchAutoHide:false the native
  // splash only disappears when we call hide() — normally via the [view] effect
  // above once auth navigates off `splash`. But onAuthStateChanged can fail to
  // fire (or its awaits can stall) in a production WKWebView — a known cause of
  // "the splash hangs forever" (see lib/firebase.ts) that no amount of network
  // fixes can guarantee away. So if we're STILL on `splash` after a few
  // seconds, force the app forward: hide the native splash and fall back to
  // `landing`. This is safe because resolveInitialView only yields `splash` on
  // the normal launch path — reset-password and shared-book deep links start on
  // their own view — so a stuck `splash` can only be the plain login flow. If
  // auth resolves later it simply navigates on top (self-healing). Runs once.
  useEffect(() => {
    const t = setTimeout(() => {
      if (Capacitor.isNativePlatform()) {
        SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
      }
      setView(v => (v === 'splash' ? 'landing' : v))
    }, 8000)
    return () => clearTimeout(t)
  }, [setView])

  const renderView = () => {
    switch (view) {
      case 'splash':
        // The native Capacitor splash covers the screen until auth resolves and
        // we navigate away (dismissed by the effects above). There's no React
        // splash, so render nothing underneath.
        return null

      case 'landing':
        return <LandingView />

      case 'login':
        return <LoginView />

      case 'forgot-password':
        return <ForgotPasswordView />

      case 'reset-password':
        return <ResetPasswordView />

      case 'terms':
      case 'privacy':
      case 'guidelines':
        return <LegalView />

      case 'signup':
        return <SignupView />

      case 'home':
        return <HomeView />

      case 'daily-rewards':
        return <DailyRewardsView />

      case 'explore':
        return <ExploreView />

      case 'library':
        return <LibraryView />

      case 'write':
        return <WriteView />

      case 'publishing':
        return <PublishingView />

      case 'monetization-request':
        return <MonetizationRequestView />

      case 'self-profile':
        return <SelfProfileView />

      case 'customization':
        return <CustomizationView />

      case 'notifications':
        return <NotificationsView />

      case 'profile':
        return selectedProfileUser ? <OtherProfileView /> : null

      case 'settings':
        return <SettingsView />

      case 'notification-settings':
        return <NotificationSettingsView />

      case 'blocked-users':
        return <BlockedUsersView />

      case 'book-detail':
        return selectedBook ? <PublicBookDetailPage /> : null

      // Public, auth-optional shared-book preview (F09). Unlike book-detail it
      // must NOT gate on selectedBook — the visitor may be unauthenticated and
      // the preview is fetched independently from the ogBook function.
      case 'public-book':
        return <PublicBookLandingPage />

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
        return <ReadingView />

      case 'comments':
        return <CommentsView />

      case 'admin-dashboard':
        return <AdminDashboard />

      case 'chat':
        return <ChatListView />

      case 'chat-conversation':
        return <ChatConversationView />

      default:
        return (
          <div className='fixed inset-0 flex items-center justify-center'>
            Missing View: {view}
          </div>
        )
    }
  }

  const showNav =
    !isWriting &&
    // Hide the tab bar on the chapter editor page (Write Studio in editor
    // mode) so the editing surface is full-height; the Studio works grid
    // (writeMode === 'list') still shows it.
    !(view === 'write' && writeMode === 'editor') &&
    ['home', 'explore', 'library', 'write', 'self-profile'].includes(view)

  return (
    <div
      className='min-h-dvh bg-white transition-colors duration-500 overflow-hidden text-black font-sans'
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {renderView()}
      {showNav && (
        <nav
          className='fixed left-1/2 -translate-x-1/2 z-[200] flex items-center gap-1 bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 px-3 py-2'
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
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
              onClick={() => {
                // Plain tab navigation: clear any draft-origin so the editor's
                // Back falls back to Home instead of a stale return view, and
                // open the Studio on its works grid rather than a stale editor.
                setWriteReturnView(null)
                if (tab.id === 'write') setWriteMode('list')
                setView(tab.id as View)
              }}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-full transition-all ${
                view === tab.id
                  ? 'text-accent bg-accent/10 scale-105'
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
      {/* First-run appearance setup — covers the app until the user picks a
          character, so a new account never lingers on the default model. */}
      <OnboardingGate />
      {/* First-launch onboarding popup (F10) — gated to appear after the
          character is created (see WelcomePopup's avatarConfig guard). */}
      <WelcomePopup />
    </div>
  )
}
