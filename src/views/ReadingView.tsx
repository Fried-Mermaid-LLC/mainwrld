import React, { useState, useEffect, useRef } from 'react'
import { renderFormattedContent } from '@/utils/renderFormattedContent'
import type { BookProgress } from '@/types'
import { useApp } from '@/state/AppContext'
import * as fbService from '@/services/firebaseService'

export const ReadingView = () => {
  const {
    user,
    selectedBook,
    readerSettings,
    setReaderSettings,
    setView,
    setReadingChapterIndex,
    likedBooks,
    handleLike,
    handleSaveToLibrary,
    isBookInLibrary,
    getUserOwnedBookIds,
    allComments,
    readingChapterIndex,
    handleBookProgressUpdate,
    handleShareBook,
    getUserBookProgress
  } = useApp()
  const currentUser = user
  const book = selectedBook
  const savedProgress: BookProgress = selectedBook
    ? getUserBookProgress(selectedBook.id)
    : { scrollProgress: 0, chapterIndex: 0 }
  const initialScrollProgress = savedProgress.scrollProgress
  const initialChapterIndex = savedProgress.chapterIndex
  const initialExactPosition: any = savedProgress
  const settings = readerSettings
  const setSettings = setReaderSettings
  const onBack = () => setView('book-detail')
  const onComments = (chapterIdx?: number) => {
    setReadingChapterIndex(chapterIdx ?? 0)
    setView('comments')
  }
  const likedChapters = likedBooks
  const onLike = (chapterIdx: number) =>
    selectedBook && handleLike(selectedBook.id, chapterIdx)
  const onSave = () => selectedBook && handleSaveToLibrary(selectedBook.id)
  const isSaved = selectedBook ? isBookInLibrary(selectedBook.id) : false
  const canSave = selectedBook
    ? user.username !== selectedBook.author.username &&
      (getUserOwnedBookIds().has(selectedBook.id) ||
        selectedBook.isFree ||
        !selectedBook.isMonetized)
    : false
  const chapterCommentsCount = allComments.filter(
    (c: any) =>
      c.bookId === selectedBook?.id &&
      (c.chapterIndex ?? 0) === readingChapterIndex
  ).length
  const onProgressUpdate = (
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
  }
  const onShare = () => selectedBook && handleShareBook(selectedBook)
  const [showOptions, setShowOptions] = useState(false)
  const [currentChapterIdx, setCurrentChapterIdx] = useState(
    initialChapterIndex || 0
  )
  const [localScrollProgress, setLocalScrollProgress] = useState(
    initialScrollProgress || 0
  )
  const [isBlurred, setIsBlurred] = useState(false)
  // Schema 2: chapter bodies are lazy-loaded one at a time through the
  // getChapterContent callable (paywall-enforced). Cache by chapterId so
  // re-visiting a chapter is instant; prefetch the next one.
  const [chapterContent, setChapterContent] = useState('')
  const [chapterLoading, setChapterLoading] = useState(false)
  const [chapterError, setChapterError] = useState(false)
  const chapterCacheRef = useRef<Map<string, string>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const pageFlipRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef(0)
  const suppressSaveRef = useRef(true)
  const initialRef = useRef({
    scrollProgress: initialScrollProgress || 0,
    chapterIndex: initialChapterIndex || 0,
    exact: initialExactPosition || {}
  })

  // Blur content when window loses focus or visibility (prevents screenshots)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBlurred(document.hidden)
    }

    const handleBlur = () => {
      setIsBlurred(true)
    }

    const handleFocus = () => {
      setIsBlurred(false)
    }

    // Listen for visibility changes (tab switching, minimizing)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    // Mobile screenshot detection (Android/iOS)
    // Detect power + volume button combinations and screenshot gestures
    let screenshotAttemptTimer: NodeJS.Timeout
    const handleScreenshotAttempt = (e: KeyboardEvent) => {
      // Android: Power + Volume Down
      // iOS: Power + Volume Up or Power + Home
      // These trigger visibility changes, so we blur proactively
      if (e.key === 'AudioVolumeDown' || e.key === 'AudioVolumeUp') {
        setIsBlurred(true)
        clearTimeout(screenshotAttemptTimer)
        screenshotAttemptTimer = setTimeout(() => {
          if (!document.hidden && document.hasFocus()) {
            setIsBlurred(false)
          }
        }, 1500)
      }
    }

    window.addEventListener('keydown', handleScreenshotAttempt as any)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleScreenshotAttempt as any)
      clearTimeout(screenshotAttemptTimer)
    }
  }, [])

  // Prevent copy/paste and screenshots in reading view
  useEffect(() => {
    const preventCopy = (e: Event) => e.preventDefault()
    const preventKeys = (e: KeyboardEvent) => {
      // Block Print Screen, Ctrl+C, Ctrl+A, Ctrl+P, Cmd+C, Cmd+A, Cmd+P
      if (
        e.key === 'PrintScreen' ||
        ((e.ctrlKey || e.metaKey) &&
          ['c', 'a', 'p', 's'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault()
      }
    }
    document.addEventListener('copy', preventCopy)
    document.addEventListener('cut', preventCopy)
    document.addEventListener('keydown', preventKeys)
    document.addEventListener('contextmenu', preventCopy)
    return () => {
      document.removeEventListener('copy', preventCopy)
      document.removeEventListener('cut', preventCopy)
      document.removeEventListener('keydown', preventKeys)
      document.removeEventListener('contextmenu', preventCopy)
    }
  }, [])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!settings.scrollMode) return
    const target = e.currentTarget
    const scrollable = Math.max(target.scrollHeight - target.clientHeight, 1)
    const progress = Math.round((target.scrollTop / scrollable) * 100)
    setLocalScrollProgress(progress)
  }

  const handlePageFlipScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (settings.scrollMode) return
    const target = e.currentTarget
    const scrollable = Math.max(target.scrollWidth - target.clientWidth, 1)
    const progress = Math.round((target.scrollLeft / scrollable) * 100)
    setLocalScrollProgress(progress)
  }

  const isAuthor = currentUser?.username === book?.author?.username
  // Use the authoritative owned+purchased set (same as PublicBookDetailPage),
  // not the ad-hoc book.isOwned flag — so a purchased book reads in full even
  // after a reload that didn't re-hydrate isOwned, and even after the book was
  // removed from the library (purchasedBookIds is append-only / permanent).
  const isOwned = book ? getUserOwnedBookIds().has(book.id) : false
  const isFreeOrUnmonetized = book?.isFree || !book?.isMonetized
  const canAccessAll = isAuthor || isOwned || isFreeOrUnmonetized

  // Chapter list comes from light metadata (chapterMeta); chapter bodies are
  // fetched lazily one at a time via the getChapterContent callable.
  const allMeta: { id: string; title: string }[] = book?.chapterMeta || []
  // Author sees all chapters (including drafts), others with access see only
  // published chapters, non-access users see only the first chapter (preview).
  const visibleChapters = isAuthor
    ? allMeta
    : canAccessAll
    ? allMeta.slice(0, book?.chaptersCount || allMeta.length)
    : allMeta.slice(0, 1)
  const currentMeta = visibleChapters[currentChapterIdx]
  const currentChapterTitle = currentMeta?.title || book?.title || 'Story'

  // Load the current chapter body lazily via the callable. Cancels in-flight
  // loads on chapter/book change, and prefetches the next chapter into the cache.
  useEffect(() => {
    if (!book) return
    if (!currentMeta) {
      setChapterContent('')
      return
    }
    const cached = chapterCacheRef.current.get(currentMeta.id)
    if (cached !== undefined) {
      setChapterContent(cached)
      setChapterLoading(false)
      setChapterError(false)
    }
    let cancelled = false
    if (cached === undefined) {
      setChapterLoading(true)
      setChapterError(false)
      fbService
        .fetchChapterContent(book.id, currentMeta.id)
        .then(res => {
          if (cancelled) return
          chapterCacheRef.current.set(currentMeta.id, res.content)
          setChapterContent(res.content)
        })
        .catch(err => {
          if (cancelled) return
          console.warn('[MainWRLD] Chapter load failed:', err)
          setChapterError(true)
          setChapterContent('')
        })
        .finally(() => {
          if (!cancelled) setChapterLoading(false)
        })
    }
    // Prefetch the next visible chapter.
    const next = visibleChapters[currentChapterIdx + 1]
    if (next && !chapterCacheRef.current.has(next.id)) {
      fbService
        .fetchChapterContent(book.id, next.id)
        .then(r => chapterCacheRef.current.set(next.id, r.content))
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, currentChapterIdx, canAccessAll])

  const handleForward = () => {
    if (!settings.scrollMode && pageFlipRef.current) {
      const maxScroll =
        pageFlipRef.current.scrollWidth - pageFlipRef.current.clientWidth
      if (pageFlipRef.current.scrollLeft >= maxScroll - 10) {
        if (currentChapterIdx < visibleChapters.length - 1) {
          setCurrentChapterIdx(prev => prev + 1)
          pageFlipRef.current.scrollLeft = 0
        }
      } else {
        pageFlipRef.current.scrollLeft += pageFlipRef.current.clientWidth
      }
    } else if (containerRef.current) {
      containerRef.current.scrollTop += 300
    }
  }

  const handleBackward = () => {
    if (!settings.scrollMode && pageFlipRef.current) {
      if (pageFlipRef.current.scrollLeft <= 10) {
        if (currentChapterIdx > 0) {
          setCurrentChapterIdx(prev => prev - 1)
        }
      } else {
        pageFlipRef.current.scrollLeft -= pageFlipRef.current.clientWidth
      }
    } else if (containerRef.current) {
      containerRef.current.scrollTop -= 300
    }
  }

  const touchStartYRef = useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const diffX = touchStartRef.current - touchEnd
    const diffY = Math.abs(touchStartYRef.current - touchEndY)
    // Only trigger on primarily horizontal swipes (ignore vertical scrolling)
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > diffY) {
      if (diffX > 0) handleForward()
      else handleBackward()
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'p') handleForward()
      if (key === 'o') handleBackward()
      // Block common screenshot and dev tools shortcuts
      if (
        (e.ctrlKey && (key === 'p' || key === 's' || key === 'u')) ||
        (e.metaKey && (key === 'p' || key === 's' || key === 'u')) ||
        (e.metaKey &&
          e.shiftKey &&
          (key === '3' || key === '4' || key === '5')) ||
        e.key === 'PrintScreen' ||
        e.key === 'F12' ||
        (e.ctrlKey &&
          e.shiftKey &&
          (key === 'i' || key === 'j' || key === 'c')) ||
        (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault()
        return false
      }
    }
    const preventDefault = (e: Event) => e.preventDefault()
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('contextmenu', preventDefault)
    document.addEventListener('copy', preventDefault)
    document.addEventListener('cut', preventDefault)
    document.addEventListener('selectstart', preventDefault)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('contextmenu', preventDefault)
      document.removeEventListener('copy', preventDefault)
      document.removeEventListener('cut', preventDefault)
      document.removeEventListener('selectstart', preventDefault)
    }
  }, [handleForward, handleBackward])

  // Restore scroll position when component mounts
  useEffect(() => {
    let cancelled = false
    let attempts = 0

    const restoreScroll = () => {
      if (cancelled) return

      if (settings.scrollMode && containerRef.current) {
        const scrollableHeight = Math.max(
          containerRef.current.scrollHeight - containerRef.current.clientHeight,
          0
        )
        const exactTop =
          typeof initialRef.current.exact?.scrollTopPx === 'number'
            ? initialRef.current.exact.scrollTopPx
            : undefined
        let targetScroll =
          exactTop ??
          (initialRef.current.scrollProgress / 100) * scrollableHeight

        const savedHeight = initialRef.current.exact?.scrollHeightPx
        if (
          typeof exactTop === 'number' &&
          typeof savedHeight === 'number' &&
          savedHeight > 0 &&
          savedHeight !== containerRef.current.scrollHeight
        ) {
          targetScroll =
            (exactTop / savedHeight) * containerRef.current.scrollHeight
        }

        containerRef.current.scrollTop = Math.min(
          Math.max(targetScroll, 0),
          scrollableHeight
        )
      } else if (!settings.scrollMode && pageFlipRef.current) {
        const scrollableWidth = Math.max(
          pageFlipRef.current.scrollWidth - pageFlipRef.current.clientWidth,
          0
        )
        const exactLeft =
          typeof initialRef.current.exact?.scrollLeftPx === 'number'
            ? initialRef.current.exact.scrollLeftPx
            : undefined
        let targetScroll =
          exactLeft ??
          (initialRef.current.scrollProgress / 100) * scrollableWidth

        const savedWidth = initialRef.current.exact?.scrollWidthPx
        if (
          typeof exactLeft === 'number' &&
          typeof savedWidth === 'number' &&
          savedWidth > 0 &&
          savedWidth !== pageFlipRef.current.scrollWidth
        ) {
          targetScroll =
            (exactLeft / savedWidth) * pageFlipRef.current.scrollWidth
        }

        pageFlipRef.current.scrollLeft = Math.min(
          Math.max(targetScroll, 0),
          scrollableWidth
        )
      }

      attempts += 1
      if (attempts < 10 && !cancelled) {
        setTimeout(restoreScroll, 120)
      } else {
        suppressSaveRef.current = false
      }
    }

    const timer = setTimeout(restoreScroll, 100)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Keep the latest onProgressUpdate in a ref so the sync effect below does not
  // depend on the callback's identity. The parent passes a fresh inline function
  // every render; including it in the dep array caused an infinite update loop
  // (effect -> setReadingChapterIndex in parent -> new callback -> effect -> ...),
  // which also forced repeated re-renders that lost the WebGL context.
  const onProgressUpdateRef = useRef(onProgressUpdate)
  onProgressUpdateRef.current = onProgressUpdate

  // Sync progress back to main state when it changes significantly (save both scroll and chapter)
  useEffect(() => {
    if (suppressSaveRef.current) return

    const exact: Partial<BookProgress> = {}
    if (settings.scrollMode && containerRef.current) {
      exact.scrollTopPx = containerRef.current.scrollTop
      exact.scrollHeightPx = containerRef.current.scrollHeight
      exact.clientHeightPx = containerRef.current.clientHeight
    } else if (!settings.scrollMode && pageFlipRef.current) {
      exact.scrollLeftPx = pageFlipRef.current.scrollLeft
      exact.scrollWidthPx = pageFlipRef.current.scrollWidth
      exact.clientWidthPx = pageFlipRef.current.clientWidth
    }

    onProgressUpdateRef.current(localScrollProgress, currentChapterIdx, exact)
  }, [localScrollProgress, currentChapterIdx])

  // Scroll to top when chapter changes (skip initial mount to allow restore)
  const chapterChangeRef = useRef(false)
  useEffect(() => {
    if (!chapterChangeRef.current) {
      chapterChangeRef.current = true
      return // Skip initial mount — let the scroll restore handle it
    }
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
    if (pageFlipRef.current) {
      pageFlipRef.current.scrollLeft = 0
    }
    setLocalScrollProgress(0)
  }, [currentChapterIdx])

  return (
    <div
      className={`fixed inset-0 animate-in fade-in duration-500 overflow-hidden flex flex-col ${
        settings.inverted ? 'bg-black text-white' : 'bg-white text-black'
      }`}
    >
      <header
        className={`p-6 flex justify-between items-center z-[100] ${
          settings.inverted ? 'bg-black/80' : 'bg-white/80'
        } backdrop-blur-md border-b ${
          settings.inverted ? 'border-gray-800' : 'border-gray-50'
        }`}
      >
        <button onClick={onBack} className='w-10 h-10 opacity-40'>
          <span className='material-icons-round'>close</span>
        </button>

        <div className='flex-1 px-4 flex flex-col items-center'>
          <select
            value={currentChapterIdx}
            onChange={e => {
              setCurrentChapterIdx(parseInt(e.target.value))
              setLocalScrollProgress(0)
            }}
            className={`text-[10px] font-bold uppercase tracking-widest bg-transparent outline-none border-b border-accent/40 pb-1 max-w-[200px] text-center cursor-pointer mb-2 ${
              settings.inverted ? 'text-white' : 'text-black'
            }`}
            disabled={!canAccessAll}
          >
            {visibleChapters.length > 0 ? (
              visibleChapters.map((ch: any, i: number) => (
                <option
                  key={i}
                  value={i}
                  className={
                    settings.inverted
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-black'
                  }
                >
                  {ch.title || `Chapter ${i + 1}`}
                  {isAuthor && i >= (book?.chaptersCount || 0)
                    ? ' (Draft)'
                    : ''}
                </option>
              ))
            ) : (
              <option value={0}>{book?.title || 'Story'}</option>
            )}
          </select>
          <div className='w-full max-w-[120px] h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden'>
            <div
              className='h-full bg-accent transition-all duration-300'
              style={{ width: `${localScrollProgress}%` }}
            ></div>
          </div>
        </div>

        <div className='flex items-center gap-1'>
          <button onClick={onShare} className='w-10 h-10 opacity-40'>
            <span className='material-icons-round'>share</span>
          </button>
          <button
            onClick={() => setShowOptions(!showOptions)}
            className='w-10 h-10 opacity-40'
          >
            <span className='material-icons-round'>settings</span>
          </button>
        </div>
      </header>

      {showOptions && (
        <div
          className={`fixed top-24 right-6 w-64 p-6 rounded-3xl shadow-2xl z-[110] border ${
            settings.inverted
              ? 'bg-gray-900 border-gray-800 text-white'
              : 'bg-white border-gray-100 text-black'
          }`}
        >
          <div className='space-y-6'>
            <div>
              <p className='text-[9px] font-bold uppercase opacity-40 mb-3'>
                Font Size ({settings.fontSize}px)
              </p>
              <input
                type='range'
                min='10'
                max='18'
                value={settings.fontSize}
                onChange={e =>
                  setSettings({
                    ...settings,
                    fontSize: parseInt(e.target.value)
                  })
                }
                className='w-full accent-accent'
              />
            </div>
            <div className='flex justify-between items-center'>
              <p className='text-[10px] font-bold uppercase'>Invert Colors</p>
              <input
                type='checkbox'
                checked={settings.inverted}
                onChange={() =>
                  setSettings({ ...settings, inverted: !settings.inverted })
                }
                className='accent-accent'
              />
            </div>
            <div className='flex justify-between items-center'>
              <p className='text-[10px] font-bold uppercase'>Scroll Mode</p>
              <input
                type='checkbox'
                checked={settings.scrollMode}
                onChange={() =>
                  setSettings({ ...settings, scrollMode: !settings.scrollMode })
                }
                className='accent-accent'
              />
            </div>
          </div>
        </div>
      )}
      {!settings.scrollMode && (
        <>
          <button
            onClick={handleBackward}
            className={`fixed left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center z-[150] active:scale-90 transition-all shadow-md opacity-80 hover:opacity-100 ${
              settings.inverted
                ? 'bg-white/20 border-white/40 text-white'
                : 'bg-white/60 border-white/80 text-black'
            }`}
            aria-label='Previous Page'
          >
            <span className='material-icons-round'>chevron_left</span>
          </button>
          <button
            onClick={handleForward}
            className={`fixed right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center z-[150] active:scale-90 transition-all shadow-md opacity-80 hover:opacity-100 ${
              settings.inverted
                ? 'bg-white/20 border-white/40 text-white'
                : 'bg-white/60 border-white/80 text-black'
            }`}
            aria-label='Next Page'
          >
            <span className='material-icons-round'>chevron_right</span>
          </button>
        </>
      )}
      {settings.scrollMode ? (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className='flex-1 overflow-y-auto no-scrollbar p-8 pt-10'
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            className={`max-w-2xl mx-auto space-y-10 mb-20 reader-content select-none transition-all duration-300 ${
              isBlurred ? 'blur-xl' : ''
            }`}
            style={{
              fontSize: `${settings.fontSize}px`,
              WebkitUserSelect: 'none',
              userSelect: 'none'
            }}
          >
            {!canAccessAll && (
              <div className='p-4 mb-10 bg-accent/10 border border-accent/20 rounded-2xl text-center'>
                <p className='text-[10px] font-bold text-accent uppercase tracking-[0.2em]'>
                  Preview Mode
                </p>
                <p className='text-[8px] font-medium text-accent/60 uppercase mt-1'>
                  Purchase the full work to unlock all chapters.
                </p>
              </div>
            )}
            <h1 className='text-3xl font-bold text-center mb-12'>
              {currentChapterTitle}
            </h1>
            <div className='leading-relaxed whitespace-pre-line text-justify'>
              {chapterLoading ? (
                <p className='text-center text-xs opacity-40 py-10 uppercase tracking-widest'>
                  Loading…
                </p>
              ) : chapterError ? (
                <p className='text-center text-xs opacity-40 py-10 uppercase tracking-widest'>
                  Couldn’t load this chapter.
                </p>
              ) : (
                renderFormattedContent(chapterContent)
              )}
            </div>
            {/* Chapter navigation buttons for scroll mode */}
            {visibleChapters.length > 1 && (
              <div className='flex justify-between items-center pt-8 pb-4'>
                <button
                  onClick={() => {
                    if (currentChapterIdx > 0) {
                      setCurrentChapterIdx(prev => prev - 1)
                      if (containerRef.current)
                        containerRef.current.scrollTop = 0
                    }
                  }}
                  disabled={currentChapterIdx === 0}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${
                    currentChapterIdx === 0 ? 'opacity-20' : 'opacity-60'
                  } ${settings.inverted ? 'text-white' : 'text-black'}`}
                >
                  ← Previous
                </button>
                <span
                  className={`text-[9px] font-bold uppercase tracking-widest opacity-30 ${
                    settings.inverted ? 'text-white' : 'text-black'
                  }`}
                >
                  {currentChapterIdx + 1} / {visibleChapters.length}
                </span>
                <button
                  onClick={() => {
                    if (currentChapterIdx < visibleChapters.length - 1) {
                      setCurrentChapterIdx(prev => prev + 1)
                      if (containerRef.current)
                        containerRef.current.scrollTop = 0
                    }
                  }}
                  disabled={currentChapterIdx >= visibleChapters.length - 1}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${
                    currentChapterIdx >= visibleChapters.length - 1
                      ? 'opacity-20'
                      : 'opacity-60'
                  } ${settings.inverted ? 'text-white' : 'text-black'}`}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className='flex-1 overflow-hidden relative'>
          {!canAccessAll && (
            <div className='absolute top-4 left-4 right-4 p-4 bg-accent/10 border border-accent/20 rounded-2xl text-center z-20'>
              <p className='text-[10px] font-bold text-accent uppercase tracking-[0.2em]'>
                Preview Mode
              </p>
              <p className='text-[8px] font-medium text-accent/60 uppercase mt-1'>
                Purchase the full work to unlock all chapters.
              </p>
            </div>
          )}
          <div
            ref={pageFlipRef}
            className='page-flip-container no-scrollbar h-full w-full overflow-x-auto snap-x snap-mandatory'
            onScroll={handlePageFlipScroll}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={`page-flip-content reader-content h-full p-14 pt-10 relative z-10" ${
                isBlurred ? 'blur-xl' : ''
              }`}
              style={{
                fontSize: `${settings.fontSize}px`,
                columnWidth: 'calc(100vw - 112px)',
                columnGap: '112px'
              }}
            >
              <h1 className='text-3xl font-bold mb-12 pt-10'>
                {currentChapterTitle}
              </h1>
              <div className='leading-relaxed whitespace-pre-line text-justify'>
                {chapterLoading ? (
                  <p className='text-center text-xs opacity-40 py-10 uppercase tracking-widest'>
                    Loading…
                  </p>
                ) : chapterError ? (
                  <p className='text-center text-xs opacity-40 py-10 uppercase tracking-widest'>
                    Couldn’t load this chapter.
                  </p>
                ) : (
                  renderFormattedContent(chapterContent)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className='max-w-2xl mx-auto border-t border-gray-100 py-12 flex flex-col items-center gap-10'>
        <div className='flex items-center gap-12'>
          {(() => {
            const chapterLikeKey = `${book?.id}:${currentChapterIdx}`
            const chapterIsLiked = likedChapters?.has(chapterLikeKey) || false
            const chapterLikesArr = Array.isArray(book?.likes)
              ? book.likes
              : [book?.likes || 0]
            const chapterLikesCount = chapterLikesArr[currentChapterIdx] || 0
            return (
              <button
                onClick={() => onLike(currentChapterIdx)}
                className='flex flex-col items-center gap-1 transition-all active:scale-90'
              >
                <span
                  className={`material-icons-round text-2xl ${
                    chapterIsLiked ? 'text-accent' : 'text-gray-400'
                  }`}
                >
                  thumb_up
                </span>
                <span
                  className={`text-[9px] font-bold uppercase ${
                    chapterIsLiked ? 'text-accent' : 'text-gray-400'
                  }`}
                >
                  Like
                </span>
                <span
                  className={`text-[9px] font-bold ${
                    chapterIsLiked ? 'text-accent' : 'text-gray-400'
                  }`}
                >
                  {chapterLikesCount}
                </span>
              </button>
            )
          })()}
          <button
            onClick={() => onComments(currentChapterIdx)}
            className='flex flex-col items-center gap-1 transition-all active:scale-90'
          >
            <span className='material-icons-round text-2xl text-gray-400'>
              chat_bubble
            </span>
            <span className='text-[9px] font-bold uppercase text-gray-400'>
              Comment
            </span>
            <span className='text-[9px] font-bold text-gray-400'>
              {chapterCommentsCount || 0}
            </span>
          </button>
          {canSave && (
            <button
              onClick={onSave}
              className='flex flex-col items-center gap-1 transition-all active:scale-90'
            >
              <span
                className={`material-icons-round text-2xl ${
                  isSaved ? 'text-accent' : 'text-gray-400'
                }`}
              >
                {isSaved ? 'bookmark' : 'bookmark_border'}
              </span>
              <span
                className={`text-[9px] font-bold uppercase ${
                  isSaved ? 'text-accent' : 'text-gray-400'
                }`}
              >
                Save
              </span>
            </button>
          )}
        </div>
        {/* Chapter navigation */}
        <div className='flex items-center gap-6'>
          {currentChapterIdx > 0 && (
            <button
              onClick={() => setCurrentChapterIdx(prev => prev - 1)}
              className='flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors'
            >
              <span className='material-icons-round text-sm'>
                keyboard_arrow_left
              </span>
              <span className='text-[9px] font-bold uppercase'>
                Prev Chapter
              </span>
            </button>
          )}
          {currentChapterIdx < visibleChapters.length - 1 && (
            <button
              onClick={() => setCurrentChapterIdx(prev => prev + 1)}
              className='flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors'
            >
              <span className='text-[9px] font-bold uppercase'>
                Next Chapter
              </span>
              <span className='material-icons-round text-sm'>
                keyboard_arrow_right
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
