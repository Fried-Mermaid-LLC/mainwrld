import React, { useEffect, useState } from 'react'
import { Button, CoverImg } from '@/components/sharedComponents'
import { useApp } from '@/state/AppContext'
import * as fbService from '@/services/firebaseService'
import { fetchPublicBookPreview } from '@/services/publicBookService'
import { convertFirestoreBook } from '@/utils/bookConverter'
import { buildBookShareUrl } from '@/config/constants'
import type { Book, PublicBookPreview } from '@/types'

// Public, auth-OPTIONAL landing page for a shared `/book/<id>` link (F09). It
// does NOT assume a signed-in `user`: the preview is fetched from the `ogBook`
// Cloud Function (Admin SDK, bypasses Firestore rules), not the auth-gated
// realtime `books` subscription. One primary "Read" CTA gates anonymous
// visitors to sign-in/sign-up; an already-authenticated visitor opens the book
// directly. Reuses the read-only layout of PublicBookDetailPage but drops every
// library/cart/favorite/report/author control that needs a session.
const readPendingShareBookId = (): string | null => {
  try {
    return sessionStorage.getItem('pendingShareBookId')
  } catch {
    return null
  }
}

export const PublicBookLandingPage: React.FC = () => {
  const { user, firebaseUid, setView, setSelectedBook, favoriteBookIds } =
    useApp()
  const [bookId, setBookId] = useState<string | null>(readPendingShareBookId)
  const [preview, setPreview] = useState<PublicBookPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)

  // Native warm taps re-target this page at a new book (see AppProvider's
  // mainwrld:open-book effect); keep the rendered id in sync.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail as string
      if (id) setBookId(id)
    }
    window.addEventListener('mainwrld:open-book', handler)
    return () => window.removeEventListener('mainwrld:open-book', handler)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!bookId) {
      setLoading(false)
      setPreview(null)
      return
    }
    setLoading(true)
    fetchPublicBookPreview(bookId).then(p => {
      if (cancelled) return
      setPreview(p)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [bookId])

  const isAuthed = !!firebaseUid && !!user?.username

  const onRead = async () => {
    if (!preview || opening) return
    if (isAuthed) {
      // Logged-in: skip the gate, open the real book-detail. Fetch on demand
      // (the book may not be in the visitor's live subscription) and rebuild
      // the client Book shape so selectedBook.author is well-formed.
      setOpening(true)
      try {
        const fb = await fbService.getBook(preview.id)
        if (fb) {
          setSelectedBook(convertFirestoreBook(fb, favoriteBookIds))
          setView('book-detail')
        }
      } finally {
        setOpening(false)
      }
    } else {
      // Anonymous: keep the pending id (already stashed) so useAuthActions
      // routes the visitor into this book right after they authenticate.
      try {
        sessionStorage.setItem('pendingShareBookId', preview.id)
      } catch {}
      setView('landing')
    }
  }

  const onShare = async () => {
    if (!preview) return
    const url = buildBookShareUrl(preview.id)
    if (navigator.share) {
      try {
        await navigator.share({
          title: preview.title,
          text: preview.tagline,
          url
        })
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
      } catch {}
    }
  }

  if (loading) {
    return (
      <div className='fixed inset-0 bg-white flex items-center justify-center'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-gray-400'>
          Loading book…
        </p>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className='fixed inset-0 bg-white flex flex-col items-center justify-center px-10 text-center animate-in fade-in duration-300'>
        <span className='material-icons-round text-gray-300 text-5xl mb-4'>
          menu_book
        </span>
        <p className='text-sm font-bold text-gray-500 mb-2'>
          This book isn’t available
        </p>
        <button
          onClick={() => setView('landing')}
          className='mt-6 text-xs font-bold uppercase tracking-widest text-accent'
        >
          Go to MainWRLD
        </button>
      </div>
    )
  }

  // A bare-enough Book stand-in for CoverImg (only reads coverImage/coverColor/
  // title). The full Book is fetched on "Read" for authenticated visitors.
  const coverBook = {
    coverImage: preview.coverImage,
    coverColor: preview.coverColor,
    title: preview.title
  } as Book

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-24 animate-in fade-in duration-500'>
      <header className='p-6 flex justify-between items-center sticky top-0 z-50 bg-white/80 backdrop-blur-md'>
        <img src='/wordlogo.png' alt='MainWRLD' className='h-5 w-auto' />
        <div className='flex gap-2'>
          <button
            onClick={onShare}
            className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 transition-colors active:text-accent'
          >
            <span className='material-icons-round'>share</span>
          </button>
          {preview.isExplicit && (
            <div className='px-3 py-1 bg-red-500 text-white rounded-full text-[8px] font-bold uppercase tracking-widest flex items-center'>
              Explicit
            </div>
          )}
        </div>
      </header>

      <div className='flex flex-col items-center p-6 text-center'>
        <div
          className='w-56 h-80 shadow-2xl border-1 border-white mb-10 transform -rotate-1 relative overflow-hidden'
          style={{ backgroundColor: preview.coverColor }}
        >
          <CoverImg book={coverBook} />
          <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent' />
        </div>
        <h1 className='text-3xl font-bold mb-2'>{preview.title}</h1>
        <p className='text-accent font-bold uppercase text-[10px] tracking-widest mb-6'>
          By {preview.authorDisplayName}
        </p>

        <p className='text-sm text-gray-500 italic mb-8 max-w-sm'>
          "{preview.tagline}"
        </p>

        <div className='flex flex-wrap justify-center gap-2 mb-8'>
          {preview.genres.map(g => (
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
            <p className='text-lg font-bold'>{preview.totalLikes}</p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>Likes</p>
          </div>
          <div>
            <p className='text-lg font-bold'>{preview.chaptersCount}</p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>
              Chapters
            </p>
          </div>
          <div>
            <p className='text-lg font-bold text-accent'>
              {preview.isCompleted ? 'Done' : 'Live'}
            </p>
            <p className='text-[9px] text-gray-300 font-bold uppercase'>
              Status
            </p>
          </div>
        </div>

        {preview.hashtags.length > 0 && (
          <div className='w-full max-w-sm flex flex-wrap gap-2 mb-12 justify-center'>
            {preview.hashtags.map(h => (
              <span key={h} className='text-[10px] text-accent font-bold'>
                #{h}
              </span>
            ))}
          </div>
        )}

        <div className='w-full max-w-sm'>
          <Button className='w-full' disabled={opening} onClick={onRead}>
            <span className='material-icons-round text-sm'>auto_stories</span>{' '}
            {opening ? 'Opening…' : 'Read'}
          </Button>
          {!isAuthed && (
            <p className='text-[10px] text-gray-400 mt-4'>
              Sign in or create a free account to start reading.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
