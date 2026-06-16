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
        return <LegalView />

      case 'signup':
        return <SignupView />

      case 'home':
        return <HomeView />

      case 'daily-rewards':
        return <DailyRewardsView />

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
        return <LibraryView />

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
        return <NotificationSettingsView />

      case 'blocked-users':
        return <BlockedUsersView />

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
