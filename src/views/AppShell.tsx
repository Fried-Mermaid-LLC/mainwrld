import React from 'react'
import { auth } from '@/lib/firebase'
import * as fbService from '@/services/firebaseService'
import { getAvatarItemPath } from '@/components/avatar'
import { CustomizationView } from '@/views/CustomizationView'
import type { View, User, Book, BookProgress } from '@/types'
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
import { HomeView } from '@/views/HomeView'
import { DailyRewardsView } from '@/views/DailyRewardsView'
import { LibraryView } from '@/views/LibraryView'
import { SelfProfileView } from '@/views/SelfProfileView'
import { NotificationsView } from '@/views/NotificationsView'
import { NotificationSettingsView } from '@/views/NotificationSettingsView'
import { BlockedUsersView } from '@/views/BlockedUsersView'
import { SplashView } from '@/views/SplashView'
import { LandingView } from '@/views/LandingView'
import { LoginView } from '@/views/LoginView'
import { SignupView } from '@/views/SignupView'
import { useApp } from '@/state/AppContext'


// Presentation shell: the former App return + renderView, now reading all
// state/handlers from context. The renderView/JSX below is byte-identical to
// the original — only the data source changed (closure -> context destructure).
export const AppShell: React.FC = () => {
  const {
    view, setView, toast, showToast, confirmModal, setConfirmModal,
    showConfirm, user, setUser, firebaseUid, userDataLoaded, books,
    setBooks, globalSpotlightBookId, selectedBook, setSelectedBook, readingChapterIndex, setReadingChapterIndex,
    selectedProfileUser, setSelectedProfileUser, selectedChatUser, setSelectedChatUser, chatMessages, readerSettings,
    setReaderSettings, likedBooks, registeredUsers, scrollToCommentId, setScrollToCommentId, relationships,
    MUTUALS, isAdmin, userIsUnder16, reports, setNotifications, allAvatarConfigs,
    avatarConfig, setAvatarConfig, unlockedAvatarItems, setUnlockedAvatarItems, blockedUsers, readingActivity,
    setReadingActivity, getItemCost, handleUpdateItemPrice, allComments, coupons, setCoupons,
    cart, setCart, setUserBookData, userBookDataRef, getUserOwnedBookIds, isBookFavorited,
    getUserBookProgress, setCurrentPublishingContent, setCurrentPublishingTitle, setCurrentPublishingChapterTitle, currentPublishingId, setCurrentPublishingId,
    setCurrentPublishingChapterIndex, publishingInitialData, setPublishingInitialData, lastSelectedBookId, setLastSelectedBookId, lastSelectedChapterIndex,
    setLastSelectedChapterIndex, handleUnpublishChapter, handleDeleteChapter, handleLogout, handleSendMessage, handleLike,
    handleAdmire, handleReport, handleRemoveBook, handleRemoveComment, handleAddStrike, handleRemoveStrike,
    handleBanUser, handleDismissReport, handleBlockUser, handleSaveToLibrary, handleRemoveFromLibrary, isBookInLibrary,
    handleToggleFavorite, handleAddToCart, handlePublish, handleUnpublish, handleDeleteBook, handleMarkCompleted,
    handleRequestMonetization, handleSaveDraft, postComment, handleLikeComment, handleBookProgressUpdate, handleShareBook
  } = useApp()

  const renderView = () => {
    switch (view) {
      case 'splash':
        return <SplashView />

      case 'landing':
        return <LandingView />

      case 'login':
        return <LoginView />

      case 'forgot-password':
        return <ForgotPasswordView />

      case 'terms':
      case 'privacy':
        return <LegalView />

      case 'signup':
        return <SignupView />

      case 'home':
        return <HomeView />

      case 'daily-rewards':
        return <DailyRewardsView />

      case 'cart':
        return <CartView />

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
