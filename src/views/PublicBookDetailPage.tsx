import React from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import type { User } from '@/types'
import { useApp } from '@/state/AppContext'

export const PublicBookDetailPage = () => {
  const {
    user,
    selectedBook,
    allComments,
    getUserOwnedBookIds,
    getUserBookProgress,
    setView,
    setReadingActivity,
    setSelectedProfileUser,
    handleSaveToLibrary,
    handleRemoveFromLibrary,
    isBookInLibrary,
    handleReport,
    handleShareBook,
    handleAddToCart,
    handleToggleFavorite,
    handleDeleteBook,
    handleUnpublish,
    handleMarkCompleted
  } = useApp()
  const currentUser = user
  const book = selectedBook!
  const totalCommentsCount = allComments.filter(
    (c: any) => c.bookId === book.id
  ).length
  const isOwned = getUserOwnedBookIds().has(book.id)
  const bookProgress: any = getUserBookProgress(book.id)
  const onBack = () => setView('explore')
  const onRead = () => {
    setReadingActivity(prev => {
      const ua = [...(prev[user.username] || [])]
      const ei = ua.findIndex(a => a.bookId === book.id)
      const entry = {
        bookId: book.id,
        progress: getUserBookProgress(book.id).scrollProgress,
        lastRead: new Date().toISOString()
      }
      if (ei >= 0) ua[ei] = entry
      else ua.unshift(entry)
      return { ...prev, [user.username]: ua.slice(0, 10) }
    })
    setView('reading')
  }
  const onAuthorClick = (u: User) => {
    setSelectedProfileUser(u)
    setView('profile')
  }
  const onSave = (_id?: string) => handleSaveToLibrary(book.id)
  const onRemove = (_id?: string) => handleRemoveFromLibrary(book.id)
  const isSaved = isBookInLibrary(book.id)
  const onReport = () => handleReport('Book', book.id)
  const onShare = () => handleShareBook(book)
  const onAddToCart = () => handleAddToCart(book)
  const onToggleFavorite = () => handleToggleFavorite(book.id)
  const onDelete = handleDeleteBook
  const onUnpublish = handleUnpublish
  const onMarkCompleted = handleMarkCompleted
  const isAuthor = currentUser.username === book.author.username

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500'>
      <header className='p-6 flex justify-between items-center sticky top-0 z-50 bg-white/80 backdrop-blur-md'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <div className='flex gap-2'>
          <button
            onClick={onShare}
            className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 transition-colors active:text-accent'
          >
            <span className='material-icons-round'>share</span>
          </button>
          {book.isExplicit && (
            <div className='px-3 py-1 bg-red-500 text-white rounded-full text-[8px] font-bold uppercase tracking-widest flex items-center'>
              Explicit
            </div>
          )}
          <button
            onClick={onToggleFavorite}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              book.isFavorite
                ? 'bg-yellow-400/10 text-yellow-500'
                : 'bg-gray-50 text-gray-300'
            }`}
          >
            <span className='material-icons-round'>
              {book.isFavorite ? 'star' : 'star_border'}
            </span>
          </button>
        </div>
      </header>
      <div className='flex flex-col items-center p-6 text-center'>
        <div
          className='w-56 h-80 shadow-2xl border-1 border-white mb-10 transform -rotate-1 relative overflow-hidden'
          style={{ backgroundColor: book.coverColor }}
        >
          <CoverImg book={book} />
          <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent' />
        </div>
        <h1 className='text-3xl font-bold mb-2'>{book.title}</h1>
        <button
          onClick={() => onAuthorClick(book.author)}
          className='text-accent font-bold uppercase text-[10px] tracking-widest mb-6'
        >
          By {book.author.displayName}
        </button>

        <p className='text-sm text-gray-500 italic mb-8 max-w-sm'>
          "{book.tagline}"
        </p>

        <div className='flex flex-wrap justify-center gap-2 mb-8'>
          {book.genres.map((g: string) => (
            <span
              key={g}
              className='px-3 py-1 bg-gray-50 rounded-full text-[9px] font-bold text-gray-400 uppercase tracking-widest border border-gray-100'
            >
              {g}
            </span>
          ))}
        </div>

        <div className='grid grid-cols-3 gap-6 w-full max-w-sm mb-12 border-y border-gray-50 py-8'>
          <div className='flex flex-col items-center'>
            <p className='text-lg font-bold'>
              {Array.isArray(book.likes)
                ? book.likes.reduce((a: number, b: number) => a + b, 0)
                : book.likes || 0}
            </p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>
              Likes
            </p>
          </div>
          <div>
            <p className='text-lg font-bold'>{book.chaptersCount}</p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>
              Chapters
            </p>
          </div>
          <div>
            <p className='text-lg font-bold'>{totalCommentsCount}</p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>
              Comments
            </p>
          </div>
        </div>

        <div className='w-full max-w-sm text-left mb-12 space-y-4'>
          <div className='flex justify-between items-center'>
            <span className='text-[9px] font-bold text-gray-300 uppercase'>
              Published
            </span>
            <span className='text-xs font-bold'>{book.publishedDate}</span>
          </div>
          <div className='flex justify-between items-center'>
            <span className='text-[9px] font-bold text-gray-300 uppercase'>
              Status
            </span>
            <span className='text-xs font-bold text-accent'>
              {book.isCompleted ? 'Completed' : 'Ongoing'}
            </span>
          </div>
          <div className='flex flex-wrap gap-2 mt-4'>
            {book.hashtags.map((h: string) => (
              <span key={h} className='text-[10px] text-accent font-bold'>
                #{h}
              </span>
            ))}
          </div>
        </div>

        {/* Management Buttons for Author */}
        {isAuthor && (
          <div className='w-full max-w-sm grid grid-cols-3 gap-3 mb-8'>
            <button
              onClick={() => onUnpublish(book.id)}
              className='flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-gray-100 transition-colors'
            >
              <span className='material-icons-round text-gray-400'>
                visibility_off
              </span>
              <span className='text-[8px] font-bold uppercase text-gray-400'>
                Unpublish
              </span>
            </button>
            <button
              onClick={() => onMarkCompleted(book.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-colors ${
                book.isCompleted
                  ? 'bg-green-50 border-green-200 hover:bg-green-100'
                  : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
              }`}
            >
              <span
                className={`material-icons-round ${
                  book.isCompleted ? 'text-green-500' : 'text-accent'
                }`}
              >
                {book.isCompleted ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span
                className={`text-[8px] font-bold uppercase ${
                  book.isCompleted ? 'text-green-500' : 'text-accent'
                }`}
              >
                {book.isCompleted ? 'Completed' : 'Complete'}
              </span>
            </button>
            <button
              onClick={() => onDelete(book.id)}
              className='flex flex-col items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-100 hover:bg-red-100 transition-colors'
            >
              <span className='material-icons-round text-red-500'>
                delete_forever
              </span>
              <span className='text-[8px] font-bold uppercase text-red-500'>
                Delete
              </span>
            </button>
          </div>
        )}

        <div className='w-full max-w-sm space-y-3'>
          {isOwned || isAuthor || book.isFree || !book.isMonetized ? (
            <Button className='w-full' onClick={onRead}>
              <span className='material-icons-round text-sm'>auto_stories</span>{' '}
              {bookProgress > 0 ? 'Continue' : 'Read'}
            </Button>
          ) : (
            <div className='flex gap-2'>
              <Button className='flex-1' onClick={onRead}>
                <span className='material-icons-round text-sm'>
                  auto_stories
                </span>{' '}
                Preview
              </Button>
              <Button
                variant='secondary'
                className='flex-1'
                onClick={onAddToCart}
              >
                <span className='material-icons-round text-sm'>
                  add_shopping_cart
                </span>{' '}
                Add to Cart (${(book.price || 9.99).toFixed(2)})
              </Button>
            </div>
          )}
          {/* Library button depends strictly on isOwned (visibility in Library tab) */}
          {!isAuthor && (
            <Button
              variant={isOwned ? 'destructive' : 'outline'}
              className={`w-full ${
                isOwned
                  ? 'bg-transparent border-none shadow-none text-gray-400'
                  : ''
              }`}
              onClick={() => (isOwned ? onRemove(book.id) : onSave(book.id))}
            >
              <span className='material-icons-round text-sm'>
                {isOwned ? 'remove_circle_outline' : 'bookmark_add'}
              </span>
              {isOwned ? 'Remove from Library' : 'Save to Library'}
            </Button>
          )}
          <Button
            variant='destructive'
            className='w-full bg-transparent border-none shadow-none'
            onClick={onReport}
          >
            <span className='material-icons-round text-sm'>report</span> Report
          </Button>
        </div>
      </div>
    </div>
  )
}
