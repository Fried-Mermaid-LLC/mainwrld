import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as presenceService from '@/services/presenceService'
import * as stripeConnect from '@/services/stripeConnect'
import { MAX_DAILY_CHAPTERS, libraryLimitFor, LIBRARY_FULL_TOAST } from '@/config/constants'
import { containsProfanity } from '@/config/profanity'
import type { User, Book, BookProgress, View, Relationship, NotificationCategory } from '@/types'

interface ReadingDeps {
  user: User
  setUser: Dispatch<SetStateAction<User>>
  firebaseUid: string | null
  userDataLoaded: boolean
  books: Book[]
  setBooks: Dispatch<SetStateAction<Book[]>>
  selectedBook: Book | null
  setSelectedBook: Dispatch<SetStateAction<Book | null>>
  setView: Dispatch<SetStateAction<View>>
  showToast: (message: string, icon?: string) => void
  relationships: Relationship[]
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string, category?: NotificationCategory
  ) => void
}

// Reading domain (Phase B). Owns reading activity, per-user book ownership +
// progress (with the synchronously-mutated userBookDataRef), the WriteView
// publishing temp state, and the publish/draft/chapter/library/progress
// handlers. Placed after useBooks (books/setBooks), useSocial (relationships)
// and useNotifications (addNotification is a direct ref). setReadingActivity is
// owned here and rewired into setReadingActivityRef in AppProvider, since
// useSocial's subscribeToUsers writes it through that bridge. Bodies + every
// dependency array are verbatim.
export function useReading({
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
}: ReadingDeps) {
  // Reading activity (loaded from Firestore user doc)
  const [readingActivity, setReadingActivity] = useState<
    Record<string, { bookId: string; progress: number; lastRead: string }[]>
  >({})

  // Per-user book ownership and progress (loaded from Firestore user doc)
  const [userBookData, setUserBookData] = useState<
    Record<
      string,
      {
        ownedBookIds: string[]
        purchasedBookIds?: string[]
        bookProgress: Record<string, BookProgress>
      }
    >
  >({})
  // Keep a ref in sync so immediate Firestore writes always read the latest data
  const userBookDataRef = useRef(userBookData)
  userBookDataRef.current = userBookData

  // Helper to get current user's owned book IDs
  const getUserOwnedBookIds = useCallback(() => {
    const owned = userBookData[user.username]?.ownedBookIds || []
    const purchased = userBookData[user.username]?.purchasedBookIds || []
    return new Set([...owned, ...purchased])
  }, [userBookData, user.username])

  // Helper to get current user's progress for a book
  const getUserBookProgress = useCallback(
    (bookId: string): BookProgress => {
      const progress = userBookData[user.username]?.bookProgress?.[bookId]
      if (!progress) return { scrollProgress: 0, chapterIndex: 0 }
      // Handle old format migration
      if (typeof progress === 'number')
        return { scrollProgress: progress, chapterIndex: 0 }
      return {
        scrollProgress: progress.scrollProgress ?? 0,
        chapterIndex: progress.chapterIndex ?? 0,
        scrollTopPx: progress.scrollTopPx,
        scrollHeightPx: progress.scrollHeightPx,
        clientHeightPx: progress.clientHeightPx,
        scrollLeftPx: progress.scrollLeftPx,
        scrollWidthPx: progress.scrollWidthPx,
        clientWidthPx: progress.clientWidthPx,
        savedAt: progress.savedAt
      }
    },
    [userBookData, user.username]
  )

  // Helper to mark a book as owned for current user
  const setUserOwnsBook = useCallback(
    (bookId: string) => {
      setUserBookData(prev => {
        const userData = prev[user.username] || {
          ownedBookIds: [],
          bookProgress: {},
          purchasedBookIds: []
        }
        if (!userData.ownedBookIds.includes(bookId)) {
          userData.ownedBookIds = [...userData.ownedBookIds, bookId]
        }
        // Also track as purchased so removing from library doesn't lose access
        if (!userData.purchasedBookIds) userData.purchasedBookIds = []
        if (!userData.purchasedBookIds.includes(bookId)) {
          userData.purchasedBookIds = [...userData.purchasedBookIds, bookId]
        }
        return { ...prev, [user.username]: userData }
      })
    },
    [user.username]
  )

  // Helper to update progress for current user (scroll progress + chapter index + exact position)
  const setUserBookProgress = useCallback(
    (
      bookId: string,
      scrollProgress: number,
      chapterIndex: number,
      exact?: Partial<BookProgress>
    ) => {
      setUserBookData(prev => {
        const userData = prev[user.username] || {
          ownedBookIds: [],
          bookProgress: {}
        }
        const existing = userData.bookProgress?.[bookId] || {
          scrollProgress: 0,
          chapterIndex: 0
        }
        userData.bookProgress = {
          ...userData.bookProgress,
          [bookId]: {
            ...existing,
            scrollProgress,
            chapterIndex,
            ...exact,
            savedAt: Date.now()
          }
        }
        return { ...prev, [user.username]: userData }
      })
    },
    [user.username]
  )

  // Publishing temp state
  const [currentPublishingContent, setCurrentPublishingContent] = useState('')
  const [currentPublishingTitle, setCurrentPublishingTitle] = useState('')
  const [currentPublishingChapterTitle, setCurrentPublishingChapterTitle] =
    useState('')
  const [currentPublishingId, setCurrentPublishingId] = useState<string | null>(
    null
  )
  const [currentPublishingChapterIndex, setCurrentPublishingChapterIndex] =
    useState<number | null>(null)
  const [publishingInitialData, setPublishingInitialData] = useState<any>(null)

  // Persistence for WriteView state through navigation unmounts
  const [lastSelectedBookId, setLastSelectedBookId] = useState<string>('new')
  const [lastSelectedChapterIndex, setLastSelectedChapterIndex] =
    useState<string>('new')

  // Upload a freshly-picked base64 cover to Storage and return its URL + path,
  // or null to keep the existing cover. Degrades gracefully: if the upload fails
  // (offline, Storage error) we keep the previous cover rather than blocking the
  // publish. Best-effort deletes the old file when a new one replaces it.
  const resolveCover = async (
    bookId: string,
    dataCover: string | undefined | null,
    prevPath?: string | null
  ): Promise<{ coverImage: string; coverPath: string } | null> => {
    if (!dataCover || !dataCover.startsWith('data:')) return null
    try {
      const up = await fbService.uploadCover(
        firebaseUid || 'anon',
        bookId,
        dataCover
      )
      if (prevPath) fbService.deleteCoverByPath(prevPath)
      return { coverImage: up.url, coverPath: up.path }
    } catch (err) {
      console.warn('[MainWRLD] Cover upload failed, keeping existing:', err)
      return null
    }
  }

  const handleUnpublishChapter = (bookId: string, chapterIndex: number) => {
    setBooks(prev =>
      prev.map(b => {
        if (b.id === bookId) {
          if (chapterIndex < b.chaptersCount) {
            const newChaptersCount = Math.max(0, b.chaptersCount - 1)
            fbService
              .updateBook(bookId, { chaptersCount: newChaptersCount })
              .catch(console.error)
            return { ...b, chaptersCount: newChaptersCount }
          }
        }
        return b
      })
    )
    showToast('Chapter unpublished and moved to drafts.', 'info')
  }

  const handleDeleteChapter = async (bookId: string, chapterIndex: number) => {
    const book = books.find(b => b.id === bookId)
    if (!book) return
    const meta = (book.chapterMeta || []).map(m => ({ id: m.id, title: m.title }))
    if (chapterIndex < 0 || chapterIndex >= meta.length) return
    const chapterId = meta[chapterIndex].id
    const newMeta = meta.filter((_, i) => i !== chapterIndex)
    const newChaptersCount =
      chapterIndex < book.chaptersCount
        ? Math.max(0, book.chaptersCount - 1)
        : book.chaptersCount

    try {
      await fbService.commitChapterDelete(bookId, chapterId, {
        chapterMeta: newMeta,
        chaptersCount: newChaptersCount
      })
    } catch (err) {
      console.error(err)
      showToast('Failed to delete chapter. Please try again.', 'error')
      return
    }

    setBooks(prev =>
      prev.map(b =>
        b.id === bookId
          ? { ...b, chapterMeta: newMeta, chaptersCount: newChaptersCount }
          : b
      )
    )
    showToast('Chapter permanently deleted.', 'error')
  }

  const handleSaveToLibrary = (bookId: string) => {
    // F07: cap the free library at FREE_LIBRARY_SIZE; premium members are
    // uncapped (libraryLimitFor → Infinity). Read the latest data from the ref
    // so the count is correct under rapid consecutive saves.
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const alreadyInLibrary = new Set([
      ...currentUd.ownedBookIds,
      ...(currentUd.purchasedBookIds || [])
    ])
    // Re-saving a book already in the library is a no-op and not capped; only a
    // genuinely new add is blocked once the library is full.
    const libraryLimit = libraryLimitFor(user.isPremium)
    if (!alreadyInLibrary.has(bookId) && alreadyInLibrary.size >= libraryLimit) {
      showToast(LIBRARY_FULL_TOAST, 'error')
      return
    }
    setBooks(prev => {
      const updated = prev.map(b =>
        b.id === bookId ? { ...b, isOwned: true } : b
      )
      const updatedBook = updated.find(b => b.id === bookId)
      if (updatedBook && selectedBook && selectedBook.id === bookId)
        setSelectedBook(updatedBook)
      return updated
    })
    // Compute updated data from the ref, then SYNC the ref immediately
    // so rapid consecutive saves each see the previous save's result
    const newOwned = currentUd.ownedBookIds.includes(bookId)
      ? currentUd.ownedBookIds
      : [...currentUd.ownedBookIds, bookId]
    // Saving a (free) book only adds it to the library — it must NOT mark the
    // book purchased. purchasedBookIds is reserved for genuinely paid books
    // (recordBookPurchase / the points + Stripe rails). Preserve any existing
    // purchased ids via the spread; never append here.
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned
    }
    // Sync the ref RIGHT NOW so the next rapid save sees this book
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    // Merge ownedBookIds into the LATEST state rather than overwriting the
    // user's record with the ref snapshot above. While reading, scroll fires a
    // stream of setUserBookProgress updates; the ref only catches up to them on
    // render, so a progress update committed (or still queued) when Save is
    // tapped would be clobbered by the snapshot's stale bookProgress — losing
    // the reading position of the very book being saved. Touch only
    // ownedBookIds; bookProgress is carried forward from prev untouched.
    setUserBookData(prev => {
      const live = prev[user.username] || updatedUd
      const owned = live.ownedBookIds.includes(bookId)
        ? live.ownedBookIds
        : [...live.ownedBookIds, bookId]
      return { ...prev, [user.username]: { ...live, ownedBookIds: owned } }
    })
    showToast('Book saved to your library!', 'bookmark')
    if (firebaseUid) {
      fbService.addBookToLibrary(firebaseUid, bookId).catch(console.error)
    }
  }

  const handleRemoveFromLibrary = (bookId: string) => {
    setBooks(prev => {
      const updated = prev.map(b =>
        b.id === bookId ? { ...b, isOwned: false } : b
      )
      const updatedBook = updated.find(b => b.id === bookId)
      if (updatedBook && selectedBook && selectedBook.id === bookId)
        setSelectedBook(updatedBook)
      return updated
    })
    // Compute updated data from the ref, then SYNC the ref immediately
    const currentUd = userBookDataRef.current[user.username] || {
      ownedBookIds: [],
      bookProgress: {},
      purchasedBookIds: []
    }
    const newOwned = currentUd.ownedBookIds.filter(
      (id: string) => id !== bookId
    )
    // Permanence: removing from the library only drops ownedBookIds. A purchased
    // book stays in purchasedBookIds forever, so getUserOwnedBookIds() (which
    // unions both) keeps read access after removal.
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned
    }
    // Sync the ref RIGHT NOW so the next rapid remove sees this change
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    // Merge into the LATEST state (not the ref snapshot) so an in-flight
    // reading-progress update isn't clobbered. Touch only ownedBookIds;
    // bookProgress is preserved from prev so a removed-then-resaved book keeps
    // its position (and matches handleSaveToLibrary).
    setUserBookData(prev => {
      const live = prev[user.username] || updatedUd
      return {
        ...prev,
        [user.username]: {
          ...live,
          ownedBookIds: live.ownedBookIds.filter((id: string) => id !== bookId)
        }
      }
    })
    showToast('Book removed from your library.', 'bookmark_remove')
    if (firebaseUid) {
      fbService.removeBookFromLibrary(firebaseUid, bookId).catch(console.error)
    }
  }

  const isBookInLibrary = useCallback(
    (bookId: string): boolean => {
      const userData = userBookData[user.username] || {
        ownedBookIds: [],
        bookProgress: {}
      }
      return userData.ownedBookIds.includes(bookId)
    },
    [userBookData, user.username]
  )

  // True only for genuinely paid books. Unlike getUserOwnedBookIds() (which
  // unions ownedBookIds + purchasedBookIds), this checks purchasedBookIds alone,
  // so a monetized book merely saved to the library does NOT count as bought.
  const isBookPurchased = useCallback(
    (bookId: string): boolean => {
      const purchased = userBookData[user.username]?.purchasedBookIds || []
      return purchased.includes(bookId)
    },
    [userBookData, user.username]
  )

  const handlePublish = async (data: any) => {
    try {
      // Daily chapter publish limit
      const now = Date.now()
      const isNewDay =
        now - (user.lastChapterPublishReset ?? 0) > 24 * 60 * 60 * 1000
      const dailyCount = isNewDay ? 0 : user.dailyChaptersPublished ?? 0
      if (dailyCount >= MAX_DAILY_CHAPTERS) {
        showToast(
          `You've reached your daily publishing limit of ${MAX_DAILY_CHAPTERS} chapters. Please try again tomorrow!`
        )
        return
      }
      // Profanity blocked client-side (instant); the server
      // (moderateBookOnWrite / moderateChapterOnWrite) re-checks profanity +
      // OpenAI authoritatively after the write.
      if (
        containsProfanity(currentPublishingTitle) ||
        containsProfanity(data.tagline) ||
        containsProfanity(currentPublishingChapterTitle)
      ) {
        showToast(
          'Your book title, chapter title, or tagline contains inappropriate language. Please revise before publishing.',
          'warning'
        )
        return
      }

      // Mutuals = bidirectional admiration (we admire each other). These
      // "friends" are notified when a new book or new chapter is published below.
      const myAdmirers = relationships
        .filter(r => r.target === user?.username)
        .map(r => r.admirer)
      const myAdmiring = new Set(
        relationships
          .filter(r => r.admirer === user?.username)
          .map(r => r.target)
      )
      const mutualUsernames = [
        ...new Set(
          myAdmirers.filter(u => u !== user?.username && myAdmiring.has(u))
        )
      ]

      if (currentPublishingId) {
        // Update existing book - preserve existing metadata when just adding/updating chapters
        const existingBook = books.find(b => b.id === currentPublishingId)
        if (existingBook) {
          // Chapter bodies live in the subcollection: edit only the target
          // chapter and update the light chapterMeta on the book doc.
          const meta = (existingBook.chapterMeta || []).map(m => ({
            id: m.id,
            title: m.title
          }))
          const targetIndex =
            currentPublishingChapterIndex !== null
              ? currentPublishingChapterIndex
              : meta.length - 1

          let chapterId: string
          let order: number
          let resolvedChapterTitle: string
          if (targetIndex >= 0 && targetIndex < meta.length) {
            chapterId = meta[targetIndex].id
            order = targetIndex
            resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              meta[targetIndex].title ||
              `Chapter ${targetIndex + 1}`
            meta[targetIndex] = { id: chapterId, title: resolvedChapterTitle }
          } else {
            order = meta.length
            chapterId = fbService.newChapterId(existingBook.id)
            resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              `Chapter ${meta.length + 1}`
            meta.push({ id: chapterId, title: resolvedChapterTitle })
          }

          const updatedLikes = (() => {
            const arr = Array.isArray(existingBook.likes)
              ? [...existingBook.likes]
              : [existingBook.likes || 0]
            while (arr.length < meta.length) arr.push(0)
            return arr
          })()

          // Upload a freshly-picked cover to Storage (degrades gracefully).
          const cover = await resolveCover(
            existingBook.id,
            data.coverImage,
            existingBook.coverPath
          )

          await fbService.commitChapterWrite(
            currentPublishingId,
            chapterId,
            {
              content: currentPublishingContent,
              order,
              title: resolvedChapterTitle,
              authorUsername: user?.username || '',
              isDraft: false
            },
            {
              tagline: data.tagline || existingBook.tagline || '',
              isMature: data.isMature ?? existingBook.isMature ?? false,
              genres:
                data.genres && data.genres.length > 0
                  ? data.genres
                  : existingBook.genres || [],
              hashtags:
                data.hashtags && data.hashtags.length > 0
                  ? data.hashtags
                  : existingBook.hashtags || [],
              ...(cover
                ? { coverImage: cover.coverImage, coverPath: cover.coverPath }
                : {}),
              coverColor: cover
                ? '#f5f5f5'
                : existingBook.coverColor ||
                  '#' + Math.floor(Math.random() * 16777215).toString(16),
              chapterMeta: meta,
              chaptersCount: Math.max(
                existingBook.chaptersCount || 0,
                order + 1
              ),
              likes: updatedLikes,
              isDraft: false,
              commentsEnabled: data.commentsEnabled ?? true
            }
          )

          // Optimistic: mirror the published metadata locally so the profile /
          // book preview show the real tagline, cover and chapter immediately
          // instead of the stale draft values until the ~30s books poll lands.
          const publishPatch: Partial<Book> = {
            tagline: data.tagline || existingBook.tagline || '',
            isMature: data.isMature ?? existingBook.isMature ?? false,
            genres:
              data.genres && data.genres.length > 0
                ? data.genres
                : existingBook.genres || [],
            hashtags:
              data.hashtags && data.hashtags.length > 0
                ? data.hashtags
                : existingBook.hashtags || [],
            ...(cover
              ? { coverImage: cover.coverImage, coverPath: cover.coverPath }
              : {}),
            coverColor: cover ? '#f5f5f5' : existingBook.coverColor,
            chapterMeta: meta,
            chaptersCount: Math.max(existingBook.chaptersCount || 0, order + 1),
            likes: updatedLikes,
            isDraft: false,
            commentsEnabled: data.commentsEnabled ?? true
          }
          setBooks(prev =>
            prev.map(b =>
              b.id === currentPublishingId ? { ...b, ...publishPatch } : b
            )
          )
          if (selectedBook?.id === currentPublishingId) {
            setSelectedBook(prev => (prev ? { ...prev, ...publishPatch } : prev))
          }

          // Notify the book's library owners AND the author's mutuals about the
          // genuinely-new chapter (deduped so nobody is notified twice).
          const prevChapterCount = existingBook.chapterMeta?.length ?? 0
          if (
            currentPublishingChapterIndex === null ||
            currentPublishingChapterIndex >= prevChapterCount
          ) {
            const libraryOwners = Object.entries(userBookData)
              .filter(([, udata]: [string, any]) =>
                udata.ownedBookIds?.includes(currentPublishingId)
              )
              .map(([username]) => username)
            const chapterRecipients = new Set([
              ...libraryOwners,
              ...mutualUsernames
            ])
            chapterRecipients.forEach(username => {
              if (username !== user?.username) {
                addNotification(
                  'New Chapter',
                  `"${existingBook.title}" has a new chapter!`,
                  'menu_book',
                  username,
                  user?.username,
                  currentPublishingId || existingBook.id, // targetId = book id
                  undefined,
                  undefined,
                  'appUpdates'
                )
              }
            })
          }
        }
      } else {
        // New book (schema 2) — light doc + first chapter in the subcollection.
        const bookId = fbService.newBookId()
        const chapterId = fbService.newChapterId(bookId)
        const firstChapterTitle =
          currentPublishingChapterTitle.trim() || 'Chapter 1'
        const cover = await resolveCover(bookId, data.coverImage, null)
        const bookData = {
          id: bookId,
          title: currentPublishingTitle,
          authorUid: firebaseUid || '',
          authorUsername: user?.username || '',
          authorDisplayName: user?.displayName || '',
          coverColor: cover
            ? '#f5f5f5'
            : '#' + Math.floor(Math.random() * 16777215).toString(16),
          coverImage: cover ? cover.coverImage : null,
          coverPath: cover ? cover.coverPath : null,
          likes: [0],
          commentsCount: 0,
          monetizationAttempts: 0,
          publishedDate: new Date().toISOString().split('T')[0],
          isCompleted: false,
          isMature: data.isMature ?? false,
          chaptersCount: 1,
          tagline: data.tagline || '',
          genres: data.genres || [],
          hashtags: data.hashtags || [],
          isDraft: false,
          commentsEnabled: data.commentsEnabled ?? true,
          chapterMeta: [{ id: chapterId, title: firstChapterTitle }],
          schemaVersion: 2,
          isFree: true,
          price: 0
        }
        await fbService.createBook(bookData)
        await fbService.saveChapter(bookId, chapterId, {
          content: currentPublishingContent,
          order: 0,
          title: firstChapterTitle,
          authorUsername: user?.username || ''
        })

        // Optimistic: insert the freshly published book so it appears on the
        // profile with its real cover/tagline right away, instead of being
        // absent (or stale) until the ~30s books poll picks it up. The
        // subscription reconciles to server truth and de-dupes by id.
        const optimisticBook = {
          ...bookData,
          author: {
            username: user?.username || 'unknown',
            displayName: user?.displayName || 'Unknown',
            isOnline: false,
            activity: 'Idle' as const,
            position: [0, 0, 0] as [number, number, number],
            isMutual: false,
            points: 0,
            admirersCount: 0,
            mutualsCount: 0,
            strikes: 0
          },
          likes: Array.isArray(bookData.likes) ? bookData.likes : [0],
          isFavorite: false
        } as unknown as Book
        setBooks(prev =>
          prev.some(b => b.id === bookId) ? prev : [optimisticBook, ...prev]
        )

        // Notify mutuals (bidirectional connections) about the new book.
        mutualUsernames.forEach(username => {
          addNotification(
            'New Book',
            `${user?.displayName} published a new book: "${currentPublishingTitle}"`,
            'auto_stories',
            username,
            user?.username,
            bookId, // targetId = the newly-created book id
            undefined,
            undefined,
            'appUpdates'
          )
        })
      }
      setView('self-profile')
      setCurrentPublishingContent('')
      setCurrentPublishingTitle('')
      setCurrentPublishingChapterTitle('')
      setCurrentPublishingId(null)
      setCurrentPublishingChapterIndex(null)
      setPublishingInitialData(null)
      showToast('Published successfully!', 'check_circle')
      // Increment daily chapter publish count
      setUser(prev => {
        const isNewDay =
          Date.now() - (prev.lastChapterPublishReset ?? 0) > 24 * 60 * 60 * 1000
        return {
          ...prev,
          dailyChaptersPublished:
            (isNewDay ? 0 : prev.dailyChaptersPublished ?? 0) + 1,
          lastChapterPublishReset: isNewDay
            ? Date.now()
            : prev.lastChapterPublishReset
        }
      })
    } catch (err: any) {
      console.error('Publish error:', err)
      showToast('Failed to publish. Please try again.', 'error')
    }
  }

  // Submits a monetization request via the server (submitMonetizationRequest
  // callable, F02). The server re-verifies ownership/eligibility, requires the
  // seller's payout account to be enabled, validates the price tier, stamps the
  // seller identity, sets monetizationStatus:'pending' and bumps attempts — all
  // fields the client can no longer write directly (locked by firestore.rules).
  // The "one more step" payout gate is handled in MonetizationRequestView before
  // this is called; we still surface a payouts error gracefully as a fallback.
  // Returns true on success so the view can navigate back.
  const handleRequestMonetization = async (
    bookId: string,
    requestedPrice: number
  ): Promise<boolean> => {
    try {
      await stripeConnect.submitMonetizationRequest(bookId, requestedPrice)
      // Optimistic: reflect "pending" immediately; the books subscription
      // confirms with server truth within ~1s.
      setBooks(prev =>
        prev.map(b =>
          b.id === bookId
            ? {
                ...b,
                monetizationStatus: 'pending' as const,
                requestedPrice,
                monetizationRequestedAt: new Date().toISOString(),
                monetizationAttempts: (b.monetizationAttempts || 0) + 1
              }
            : b
        )
      )
      if (selectedBook?.id === bookId) {
        setSelectedBook(prev =>
          prev
            ? { ...prev, monetizationStatus: 'pending', requestedPrice }
            : prev
        )
      }
      showToast('Request submitted for review', 'send')
      return true
    } catch (err: any) {
      const msg = String(err?.message || '')
      if (/payout/i.test(msg)) {
        showToast('Set up your payout account first.', 'account_balance')
      } else {
        showToast(msg || 'Could not submit request. Please try again.', 'error')
      }
      return false
    }
  }

  const handleSaveDraft = async (
    bookId: string | null,
    title: string,
    content: string,
    chapterIndex: number | null,
    chapterTitle?: string
  ): Promise<string | null> => {
    if (!title.trim() && !bookId) return null
    let newBookId = bookId
    if (bookId) {
      // Update existing draft in Firestore (schema 2: chapter body → subcollection)
      const existingBook = books.find(b => b.id === bookId)
      if (existingBook) {
        const meta = (existingBook.chapterMeta || []).map(m => ({
          id: m.id,
          title: m.title
        }))
        let chapterId: string
        let order: number
        let resolvedChapterTitle: string
        if (
          chapterIndex !== null &&
          chapterIndex >= 0 &&
          chapterIndex < meta.length
        ) {
          chapterId = meta[chapterIndex].id
          order = chapterIndex
          resolvedChapterTitle =
            (chapterTitle || '').trim() ||
            meta[chapterIndex].title ||
            `Chapter ${chapterIndex + 1}`
          meta[chapterIndex] = { id: chapterId, title: resolvedChapterTitle }
        } else if (content.trim()) {
          order = meta.length
          chapterId = fbService.newChapterId(bookId)
          resolvedChapterTitle =
            (chapterTitle || '').trim() || `Chapter ${meta.length + 1}`
          meta.push({ id: chapterId, title: resolvedChapterTitle })
        } else {
          // Nothing to write (empty new chapter) — just persist the title.
          const nextTitle = title.trim() || existingBook.title
          await fbService.updateBook(bookId, { title: nextTitle })
          // Optimistic: reflect the new title immediately; the books
          // subscription confirms with server truth within ~30s.
          setBooks(prev =>
            prev.map(b => (b.id === bookId ? { ...b, title: nextTitle } : b))
          )
          setLastSelectedBookId(bookId)
          setLastSelectedChapterIndex(
            chapterIndex !== null ? chapterIndex.toString() : 'new'
          )
          return bookId
        }
        await fbService.commitChapterWrite(
          bookId,
          chapterId,
          {
            content,
            order,
            title: resolvedChapterTitle,
            authorUsername: user?.username || ''
          },
          {
            title: title.trim() || existingBook.title,
            chapterMeta: meta
          }
        )
        // Optimistic: update chapterMeta locally so the just-saved chapter is
        // immediately visible (and selectable in the editor) instead of
        // blanking out until the ~30s books poll lands.
        const nextTitle = title.trim() || existingBook.title
        setBooks(prev =>
          prev.map(b =>
            b.id === bookId ? { ...b, title: nextTitle, chapterMeta: meta } : b
          )
        )
      }
      setLastSelectedBookId(bookId)
      setLastSelectedChapterIndex(
        chapterIndex !== null ? chapterIndex.toString() : 'new'
      )
      return bookId
    }

    const existingDraft = books.find(
      (b: Book) =>
        b.isDraft &&
        b.title === title.trim() &&
        b.author.username === user?.username
    )
    if (existingDraft) {
      newBookId = existingDraft.id
      const resolvedChapterTitle = (chapterTitle || '').trim() || 'Chapter 1'
      const meta = (existingDraft.chapterMeta || []).map(m => ({
        id: m.id,
        title: m.title
      }))
      const chapterId = meta[0]?.id || fbService.newChapterId(existingDraft.id)
      await fbService.commitChapterWrite(
        existingDraft.id,
        chapterId,
        {
          content,
          order: 0,
          title: resolvedChapterTitle,
          authorUsername: user?.username || ''
        },
        {
          title: title.trim() || existingDraft.title,
          chapterMeta: [{ id: chapterId, title: resolvedChapterTitle }],
          chaptersCount: content.trim() ? 1 : 0,
          isDraft: true
        }
      )
      // Optimistic: mirror the persisted fields immediately.
      setBooks(prev =>
        prev.map(b =>
          b.id === existingDraft.id
            ? {
                ...b,
                title: title.trim() || existingDraft.title,
                chapterMeta: [{ id: chapterId, title: resolvedChapterTitle }],
                chaptersCount: content.trim() ? 1 : 0,
                isDraft: true
              }
            : b
        )
      )
    } else {
      // Create a new draft (schema 2): light doc + first chapter in subcollection.
      const resolvedChapterTitle = (chapterTitle || '').trim() || 'Chapter 1'
      const id = fbService.newBookId()
      const hasContent = !!content.trim()
      const chapterId = hasContent ? fbService.newChapterId(id) : null
      const bookData = {
        id,
        title: title.trim(),
        authorUid: firebaseUid || '',
        authorUsername: user?.username || '',
        authorDisplayName: user?.displayName || '',
        coverColor: '#' + Math.floor(Math.random() * 16777215).toString(16),
        likes: [0],
        commentsCount: 0,
        publishedDate: new Date().toISOString().split('T')[0],
        isCompleted: false,
        isDraft: true,
        isMature: false,
        chaptersCount: hasContent ? 1 : 0,
        tagline: '',
        genres: [],
        hashtags: [],
        chapterMeta:
          hasContent && chapterId
            ? [{ id: chapterId, title: resolvedChapterTitle }]
            : [],
        schemaVersion: 2
      }
      const created = await fbService.createBook(bookData)
      newBookId = (created as any).id
      if (hasContent && chapterId) {
        await fbService.saveChapter(id, chapterId, {
          content,
          order: 0,
          title: resolvedChapterTitle,
          authorUsername: user?.username || ''
        })
      }
      // Optimistic: insert the freshly created draft so it appears in myWorks
      // (and becomes the selected book in the editor) right away, rather than
      // vanishing until the ~30s books poll picks it up. The subscription
      // reconciles to server truth and de-dupes by id.
      const optimisticBook = {
        ...bookData,
        id,
        author: {
          username: user?.username || 'unknown',
          displayName: user?.displayName || 'Unknown',
          isOnline: false,
          activity: 'Idle' as const,
          position: [0, 0, 0] as [number, number, number],
          isMutual: false,
          points: 0,
          admirersCount: 0,
          mutualsCount: 0,
          strikes: 0
        },
        likes: Array.isArray(bookData.likes) ? bookData.likes : [0],
        isFavorite: false,
        price: 0
      } as unknown as Book
      setBooks(prev =>
        prev.some(b => b.id === id) ? prev : [optimisticBook, ...prev]
      )
    }

    setLastSelectedBookId(newBookId || 'new')
    setLastSelectedChapterIndex(
      chapterIndex !== null ? chapterIndex.toString() : 'new'
    )
    return newBookId
  }

  const handleBookProgressUpdate = (
    bookId: string,
    scrollProgress: number,
    chapterIndex: number,
    exact?: Partial<BookProgress>
  ) => {
    if (!userDataLoaded) return
    // Save progress per-user (both scroll position and chapter index)
    setUserBookProgress(bookId, scrollProgress, chapterIndex, exact)
    // Update reading activity
    setReadingActivity(prev => {
      const userActivity = [...(prev[user.username] || [])]
      const existing = userActivity.findIndex(a => a.bookId === bookId)
      if (existing >= 0)
        userActivity[existing] = {
          bookId,
          progress: scrollProgress,
          lastRead: new Date().toISOString()
        }
      else
        userActivity.unshift({
          bookId,
          progress: scrollProgress,
          lastRead: new Date().toISOString()
        })
      return { ...prev, [user.username]: userActivity.slice(0, 10) }
    })
    // Update user activity status to "Reading" via RTDB presence (X06) so the
    // live "currently reading" signal carries the book id and self-clears on
    // disconnect; the mirror Cloud Function writes it back to Firestore. (Do
    // NOT write activity to Firestore directly here — that would fight the
    // mirror.)
    if (firebaseUid) {
      presenceService.setActivity(firebaseUid, 'Reading', bookId)
    }
    if (user.activity !== 'Reading') {
      setUser(prev => ({ ...prev, activity: 'Reading' }))
    }
  }

  return {
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
    isBookPurchased,
    handlePublish,
    handleRequestMonetization,
    handleSaveDraft,
    handleBookProgressUpdate
  }
}
