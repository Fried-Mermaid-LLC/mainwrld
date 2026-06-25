import React, { useState } from 'react'
import { Button } from '@/components/sharedComponents'
import { MatureCover } from '@/components/MatureCover'
import { useReportFlow } from '@/components/reportFlow'
import type { User } from '@/types'
import { useApp } from '@/state/AppContext'
import * as stripeConnect from '@/services/stripeConnect'

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
    isBookPurchased,
    handleShareBook,
    handleToggleFavorite,
    showToast,
    coupons,
    canSeeMature
  } = useApp()
  const { sheet: reportSheet, startReport } = useReportFlow()
  const [buying, setBuying] = useState(false)
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const currentUser = user
  const book = selectedBook!
  const totalCommentsCount = allComments.filter(
    (c: any) => c.bookId === book.id
  ).length
  const isOwned = getUserOwnedBookIds().has(book.id)
  // Read access for a monetized book requires an actual purchase — merely saving
  // it to the library (ownedBookIds) must not unlock reading. isOwned still
  // drives library visibility (Save/Remove), but the Read/Buy gate uses this.
  const isPurchased = isBookPurchased(book.id)
  const bookProgress: any = getUserBookProgress(book.id)
  const onBack = () => setView('explore')
  // Mature gate: a viewer who can't see mature content (toggle off / age
  // default off) must not open a mature book's detail — even via a shared link,
  // a search reveal, or a stale selectedBook. Enabling the toggle in Settings
  // lifts this.
  const matureGated = !canSeeMature && !!book.isMature
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
  const onReport = () => startReport('Book', book.id)
  const onShare = () => handleShareBook(book)
  const onToggleFavorite = () => handleToggleFavorite(book.id)
  const isAuthor = currentUser.username === book.author.username
  // Cash is the ONLY way to buy a book — on web AND iOS (books are not sold for
  // points). On web the tab navigates to Stripe Checkout and returns via the
  // ?book_purchase_success redirect. On iOS openStripeUrl opens it in an in-app
  // browser whose success/cancel pages deep-link back via mainwrld://, which
  // closes the browser and re-syncs ownership — all handled centrally in
  // usePayments, so here we just open the checkout.
  const listPrice = book.price || 9.99
  const availableCoupons = (coupons || []).filter((c: any) => !c.used)
  const selectedCoupon = availableCoupons.find(
    (c: any) => c.id === selectedCouponId
  )
  // Coupon discount in USD, capped so the buyer still pays the Stripe minimum
  // (matches the server's cap). Split is computed server-side on the net.
  const discountUsd = selectedCoupon
    ? Math.max(0, Math.min(selectedCoupon.value, listPrice - 0.5))
    : 0
  const payPrice = listPrice - discountUsd

  const onBuyStripe = async () => {
    if (buying) return
    setBuying(true)
    try {
      const { url } = await stripeConnect.createBookCheckout(
        book.id,
        selectedCoupon?.id
      )
      await stripeConnect.openStripeUrl(url)
    } catch (err: any) {
      showToast(err?.message || 'Could not start checkout.', 'error')
    } finally {
      setBuying(false)
    }
  }

  if (matureGated) {
    return (
      <div className='fixed inset-0 bg-white flex flex-col items-center justify-center px-10 text-center animate-in fade-in duration-300'>
        <span className='material-icons-round text-gray-300 text-5xl mb-4'>
          lock
        </span>
        <p className='text-sm font-bold text-gray-500 mb-2'>
          This book contains mature content
        </p>
        <p className='text-[11px] text-gray-400 mb-4 max-w-xs'>
          Turn on “Show mature content” in Settings to read it.
        </p>
        <button
          onClick={() => setView('settings')}
          className='text-xs font-bold uppercase tracking-widest text-accent'
        >
          Enable mature content in Settings
        </button>
        <button
          onClick={onBack}
          className='mt-4 text-[11px] font-bold uppercase tracking-widest text-gray-300'
        >
          Back to Explore
        </button>
      </div>
    )
  }

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500'>
      {/* Unified header: back on the left, centered "Book Details" + the book
          title as subtitle, Mature badge on the right. */}
      <header className='p-6 flex items-center justify-center sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#eaeaea]'>
        <button
          onClick={onBack}
          className='absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <div className='flex flex-col items-center gap-1 min-w-0 px-16'>
          <h1 className='text-[22px] font-bold leading-[1.24] text-[#1a1a1a]'>
            Book Details
          </h1>
          <p className='text-[13px] font-semibold text-[#9aa1a9] tracking-[0.13px] leading-[1.2] truncate max-w-full'>
            {book.title}
          </p>
        </div>
        {book.isMature && (
          <div className='absolute right-6 top-1/2 -translate-y-1/2 px-3 py-1 bg-red-500 text-white rounded-full text-[8px] font-bold uppercase tracking-widest flex items-center'>
            Mature
          </div>
        )}
      </header>
      <div className='flex flex-col items-center px-6 py-10 text-center'>
        <div
          className='w-56 h-80 shadow-2xl border border-white mb-8 transform -rotate-1 relative overflow-hidden'
          style={{ backgroundColor: book.coverColor }}
        >
          <MatureCover book={book} />
          <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent' />
        </div>

        <h1 className='text-3xl font-bold mb-1.5'>{book.title}</h1>
        <button
          onClick={() => onAuthorClick(book.author)}
          className='text-accent font-bold uppercase text-[10px] tracking-widest mb-5'
        >
          By {book.author.displayName}
        </button>

        {book.tagline && (
          <p className='text-sm text-gray-500 italic mb-6 max-w-sm'>
            "{book.tagline}"
          </p>
        )}

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

        <div className='grid grid-cols-3 gap-6 w-full max-w-sm mb-8 border-y border-gray-50 py-6'>
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

        {book.hashtags.length > 0 && (
          <div className='flex flex-wrap justify-center gap-x-3 gap-y-1 max-w-sm mb-8'>
            {book.hashtags.map((h: string) => (
              <span key={h} className='text-[10px] text-accent font-bold'>
                #{h}
              </span>
            ))}
          </div>
        )}

        {/* Author management (Unpublish / Complete / Delete) lives on the Book
            Details screen now, not here. */}
        <div className='w-full max-w-sm space-y-3'>
          {isPurchased || isAuthor || book.isFree || !book.isMonetized ? (
            <Button className='w-full' onClick={onRead}>
              <span className='material-icons-round text-sm'>auto_stories</span>{' '}
              {(bookProgress?.scrollProgress ?? 0) > 0 ? 'Continue' : 'Read'}
            </Button>
          ) : (
            <>
              {/* Cash-only purchase (web + iOS). Real card payment via Stripe
                  with the 70/30 split + payout; an optional coupon discounts it.
                  On iOS openStripeUrl opens it in an in-app browser. */}
              {availableCoupons.length > 0 && (
                <div className='space-y-2'>
                  <p className='text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1'>
                    Apply coupon
                  </p>
                  <div className='flex gap-2 overflow-x-auto no-scrollbar'>
                    <button
                      onClick={() => setSelectedCouponId(null)}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl border-2 text-[10px] font-bold ${
                        !selectedCouponId
                          ? 'bg-accent border-accent text-white'
                          : 'bg-gray-50 border-gray-100 text-gray-400'
                      }`}
                    >
                      None
                    </button>
                    {availableCoupons.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCouponId(c.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl border-2 text-[10px] font-bold ${
                          selectedCouponId === c.id
                            ? 'bg-accent border-accent text-white'
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                      >
                        ${c.value} off
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button className='w-full' disabled={buying} onClick={onBuyStripe}>
                <span className='material-icons-round text-sm'>shopping_bag</span>{' '}
                {buying ? 'Opening checkout…' : `Buy — $${payPrice.toFixed(2)}`}
                {discountUsd > 0 && (
                  <span className='line-through opacity-60 ml-2'>
                    ${listPrice.toFixed(2)}
                  </span>
                )}
              </Button>
              <Button variant='secondary' className='w-full' onClick={onRead}>
                <span className='material-icons-round text-sm'>auto_stories</span>{' '}
                Preview
              </Button>
            </>
          )}

          {/* Report + share + add-to-favorite (moved here from the header),
              under Read, styled like the Write Studio secondary action row. */}
          <div className='flex gap-4'>
            <button
              onClick={onReport}
              className='flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border bg-gray-50 border-gray-100 text-gray-400 hover:text-red-500'
            >
              <span className='material-icons-round text-sm'>report</span>
              Report
            </button>
            <button
              onClick={onShare}
              className='flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border bg-gray-50 border-gray-100 text-gray-400 hover:text-accent'
            >
              <span className='material-icons-round text-sm'>share</span>
              Share
            </button>
            <button
              onClick={onToggleFavorite}
              className={`flex-1 h-12 rounded-2xl font-bold text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border ${
                book.isFavorite
                  ? 'bg-yellow-400/10 border-yellow-200 text-yellow-500'
                  : 'bg-gray-50 border-gray-100 text-gray-400 hover:text-yellow-500'
              }`}
            >
              <span className='material-icons-round text-sm'>
                {book.isFavorite ? 'star' : 'star_border'}
              </span>
              Favorite
            </button>
          </div>

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
          {reportSheet}
        </div>
      </div>
    </div>
  )
}
