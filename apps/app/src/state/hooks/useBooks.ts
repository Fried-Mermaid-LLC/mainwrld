import { useState, useRef, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import { buildBookShareUrl } from '@/config/constants'
import type { User, Book, View, NotificationCategory } from '@/types'

interface BooksDeps {
  user: User
  firebaseUid: string | null
  selectedBook: Book | null
  setSelectedBook: Dispatch<SetStateAction<Book | null>>
  setView: Dispatch<SetStateAction<View>>
  showToast: (message: string, icon?: string) => void
  showConfirm: (opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    icon?: string
    iconBg?: string
    onConfirm: () => void
    onCancel?: () => void
  }) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string, category?: NotificationCategory
  ) => void
}

// Books domain (Phase B). Owns the books list + its Firestore subscription, the
// global spotlight, liked/favorite sets, the like/favorite/publish-lifecycle
// handlers and the share handler. Placed before useNotifications (which reads
// books) and after useRewards (handleLike awards points); notifications are
// reached through the addNotification dep, which AppProvider passes as the
// late-bound addNotificationLB. Bodies + every dependency array are verbatim.
export function useBooks({
  user,
  firebaseUid,
  selectedBook,
  setSelectedBook,
  setView,
  showToast,
  showConfirm,
  addNotification
}: BooksDeps) {
  const [books, setBooks] = useState<Book[]>([])
  const [booksLoading, setBooksLoading] = useState(true)
  const [globalSpotlightBookId, setGlobalSpotlightBookId] = useState<
    string | null
  >(null)
  const [likedBooks, setLikedBooks] = useState<Set<string>>(new Set())
  const [favoriteBookIds, setFavoriteBookIds] = useState<Set<string>>(new Set())
  const likedBooksInteracted = useRef(false)

  // Helper to get total likes for a book (handles both old number and new number[] format)
  const getTotalLikes = (likes: number | number[]): number => {
    if (Array.isArray(likes)) return likes.reduce((a, b) => a + b, 0)
    return likes || 0
  }

  // Helper to get chapter likes for a book (ensures array format)
  const getChapterLikes = (
    likes: number | number[],
    chapterCount: number
  ): number[] => {
    if (Array.isArray(likes)) {
      // Extend array if needed for new chapters
      const arr = [...likes]
      while (arr.length < chapterCount) arr.push(0)
      return arr
    }
    // Migrate old format: distribute total evenly or put all on first chapter
    const arr = new Array(Math.max(chapterCount, 1)).fill(0)
    arr[0] = likes || 0
    return arr
  }

  const isBookFavorited = useCallback(
    (bookId: string): boolean => {
      return favoriteBookIds.has(bookId)
    },
    [favoriteBookIds]
  )

  // Subscribe to Firestore books in real-time
  useEffect(() => {
    if (!firebaseUid) return
    const unsubscribe = fbService.subscribeToBooksChanges(
      firebaseUid,
      (firestoreBooks: any[]) => {
        const converted = firestoreBooks.map((fb: any) => ({
          ...fb,
          author: {
            username: fb.authorUsername || fb.author?.username || 'unknown',
            displayName:
              fb.authorDisplayName || fb.author?.displayName || 'Unknown',
            isOnline: false,
            activity: 'Idle' as const,
            position: [0, 0, 0] as [number, number, number],
            isMutual: false,
            points: 0,
            admirersCount: 0,
            mutualsCount: 0,
            strikes: 0
          },
          // Ensure likes is always an array
          likes: Array.isArray(fb.likes) ? fb.likes : [fb.likes || 0],
          isFavorite: favoriteBookIds.has(fb.id),
          price: fb.price ?? 0,
          // Backward-compat: legacy docs store `isExplicit`, new docs `isMature`.
          // Normalize here so the rest of the app only reads `isMature`.
          isMature: fb.isMature ?? fb.isExplicit ?? false
        }))
        setBooks(converted)
        setBooksLoading(false)
      }
    )
    return () => unsubscribe()
  }, [favoriteBookIds, firebaseUid])

  // Read-only subscription to the server-selected Star of the Week. Selection
  // is owned by the scheduled rotateSpotlight Cloud Function (X04); the client
  // no longer computes or writes the spotlight.
  useEffect(() => {
    const unsubscribe = fbService.subscribeToGlobalSpotlight(
      (spotlight: any) => {
        setGlobalSpotlightBookId(spotlight?.spotlightBookId || null)
      }
    )
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    setBooks(prev =>
      prev.map(book => {
        const nextIsFavorite = favoriteBookIds.has(book.id)
        return book.isFavorite === nextIsFavorite
          ? book
          : { ...book, isFavorite: nextIsFavorite }
      })
    )
    setSelectedBook(prev => {
      if (!prev) return prev
      const nextIsFavorite = favoriteBookIds.has(prev.id)
      return prev.isFavorite === nextIsFavorite
        ? prev
        : { ...prev, isFavorite: nextIsFavorite }
    })
  }, [favoriteBookIds])

  // Save likedBooks to Firestore after user interaction
  useEffect(() => {
    if (likedBooksInteracted.current && firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, { likedBooks: Array.from(likedBooks) })
        .catch(console.error)
    }
  }, [likedBooks])

  // Per-chapter like toggle. Points + milestone notifications are now awarded
  // server-side (likeChapter endpoint), which is the only path that mutates a
  // book's reader `likes` — so this just toggles optimistically and reconciles
  // with the server's authoritative count. Self-likes are rejected (the server
  // does too); we short-circuit to avoid a bad optimistic flip.
  const handleLike = async (bookId: string, chapterIndex: number = 0) => {
    const targetBook = books.find(b => b.id === bookId)
    if (!targetBook) return

    const authorUsername =
      (targetBook as any).authorUsername || targetBook.author.username
    if (authorUsername === user.username) return // can't like your own book

    likedBooksInteracted.current = true
    const likeKey = `${bookId}:${chapterIndex}`
    const wasLiked = likedBooks.has(likeKey)
    const chapterCount = targetBook.chapterMeta?.length || 1
    const prevCount = getChapterLikes(targetBook.likes, chapterCount)[chapterIndex] || 0

    const applyCount = (count: number) =>
      setBooks(prev =>
        prev.map(b => {
          if (b.id !== bookId) return b
          const likesArr = getChapterLikes(b.likes, chapterCount)
          likesArr[chapterIndex] = count
          const updated = { ...b, likes: likesArr }
          if (selectedBook && selectedBook.id === bookId) setSelectedBook(updated)
          return updated
        })
      )

    // Optimistic toggle.
    const optimistic = new Set(likedBooks)
    if (wasLiked) optimistic.delete(likeKey)
    else optimistic.add(likeKey)
    setLikedBooks(optimistic)
    applyCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1)

    try {
      const res = await fbService.likeChapter(bookId, chapterIndex)
      // Reconcile with the server's authoritative count + liked state.
      applyCount(res.likes)
      setLikedBooks(prev => {
        const next = new Set(prev)
        if (res.liked) next.add(likeKey)
        else next.delete(likeKey)
        return next
      })
      // Notify the author of a fresh like (milestone/points notifications are
      // server-side now). Guarded above against self-likes.
      if (res.liked) {
        const chapterTitle =
          targetBook.chapterMeta?.[chapterIndex]?.title ||
          `Chapter ${chapterIndex + 1}`
        addNotification(
          'Chapter Liked',
          `${user?.displayName} liked ${chapterTitle} from "${targetBook.title}"`,
          'favorite',
          authorUsername,
          user.username,
          targetBook.id,
          chapterIndex,
          undefined,
          'bookLikes'
        )
      }
    } catch (err) {
      // Revert optimistic state on failure.
      setLikedBooks(likedBooks)
      applyCount(prevCount)
      console.error(err)
    }
  }

  const handleToggleFavorite = (bookId: string) => {
    const nextFavoriteBookIds = new Set(favoriteBookIds)
    const isFavorited = nextFavoriteBookIds.has(bookId)

    if (isFavorited) nextFavoriteBookIds.delete(bookId)
    else nextFavoriteBookIds.add(bookId)

    setFavoriteBookIds(nextFavoriteBookIds)

    setBooks(prev =>
      prev.map(book =>
        book.id === bookId ? { ...book, isFavorite: !isFavorited } : book
      )
    )

    setSelectedBook(prev => {
      if (!prev || prev.id !== bookId) return prev
      return { ...prev, isFavorite: !isFavorited }
    })

    if (firebaseUid) {
      fbService
        .updateUserProfile(firebaseUid, {
          favoriteBookIds: Array.from(nextFavoriteBookIds)
        })
        .catch(console.error)
    }

    // Best-effort per-book favorites counter for the spotlight ranking (X04).
    // Fire-and-forget — never blocks the favorite UX.
    fbService
      .adjustBookFavorite(bookId, isFavorited ? -1 : 1)
      .catch(() => {})
  }

  const handleUnpublish = async (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    const wasMonetized = book?.isMonetized
    const patch = {
      isDraft: true,
      isMonetized: false,
      wasMonetizedBefore: wasMonetized || book?.wasMonetizedBefore || false
    }
    // Optimistic: move the book to drafts immediately so it leaves the
    // published lists instead of lingering until the ~30s books poll lands.
    setBooks(prev => prev.map(b => (b.id === bookId ? { ...b, ...patch } : b)))
    if (selectedBook?.id === bookId)
      setSelectedBook(prev => (prev ? { ...prev, ...patch } : prev))
    await fbService.updateBook(bookId, patch)
    showToast('Book unpublished and moved to drafts.', 'visibility_off')
  }

  const handleDeleteBook = (bookId: string) => {
    showConfirm({
      title: 'This action cannot be undone.',
      message: `Are you sure you want to permanently delete this book?`,
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      icon: 'check_circle',
      onConfirm: async () => {
        await fbService.deleteBook(bookId)
        // Optimistic: drop the deleted book from local state so it doesn't
        // linger in the profile lists until the ~30s books poll lands.
        setBooks(prev => prev.filter(b => b.id !== bookId))
        setSelectedBook(prev => (prev && prev.id === bookId ? null : prev))
        setView('self-profile')
        showToast(`You successfully deleted your book`)
      },
      onCancel: () => {}
    })
  }

  const handleMarkCompleted = (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    if (!book) return

    if (book.isCompleted) {
      if (book.isMonetized) {
        showConfirm({
          title: 'Warning: Demonetization',
          message:
            'This book is currently monetized. Marking it as uncomplete will permanently demonetize it and it cannot be monetized again. Are you sure?',
          confirmLabel: 'Yes, demonetize and reopen',
          cancelLabel: 'Cancel',
          icon: 'money_off',
          onConfirm: async () => {
            const updates = {
              isCompleted: false,
              wasCompleted: true,
              isMonetized: false,
              wasMonetizedBefore: true,
              isFree: true,
              price: 0
            }
            await fbService.updateBook(bookId, updates)
            setBooks(prev =>
              prev.map(b => (b.id === bookId ? { ...b, ...updates } : b))
            )
            if (selectedBook?.id === bookId)
              setSelectedBook((prev: any) =>
                prev ? { ...prev, ...updates } : prev
              )
            showToast('Book demonetized and reopened', 'money_off')
          },
          onCancel: () => {}
        })
      } else {
        showConfirm({
          title: 'Reopen this work?',
          message:
            'This will remove the completed status. The book will become editable again.',
          confirmLabel: 'Reopen',
          cancelLabel: 'Cancel',
          icon: 'undo',
          onConfirm: async () => {
            const updates = { isCompleted: false, wasCompleted: true }
            await fbService.updateBook(bookId, updates)
            setBooks(prev =>
              prev.map(b => (b.id === bookId ? { ...b, ...updates } : b))
            )
            if (selectedBook?.id === bookId)
              setSelectedBook((prev: any) =>
                prev ? { ...prev, ...updates } : prev
              )
            showToast('Completed status removed', 'undo')
          },
          onCancel: () => {}
        })
      }
    } else {
      showConfirm({
        title: 'Mark as Completed?',
        message:
          'Once marked completed, this book will become un-editable. Are you sure?',
        confirmLabel: 'Yes, Complete',
        cancelLabel: 'Cancel',
        icon: 'check_circle',
        onConfirm: async () => {
          const updates = { isCompleted: true, wasCompleted: true }
          await fbService.updateBook(bookId, updates)
          setBooks(prev =>
            prev.map(b => (b.id === bookId ? { ...b, ...updates } : b))
          )
          if (selectedBook?.id === bookId)
            setSelectedBook((prev: any) =>
              prev ? { ...prev, ...updates } : prev
            )
          showToast('Book marked as completed!', 'check_circle')
        },
        onCancel: () => {}
      })
    }
  }

  const handleShareBook = async (book: Book) => {
    // Share the canonical, outside-the-app book URL (F09), NOT window.location
    // (which is always the SPA root and never deep-links to the book). The
    // `/book/<id>` URL unfurls via the ogBook function and gates reading
    // behind sign-in for recipients with no account.
    const shareUrl = buildBookShareUrl(book.id)
    if (navigator.share) {
      try {
        await navigator.share({
          title: book.title,
          text: book.tagline,
          url: shareUrl
        })
      } catch (err) {
        console.log('Share failed', err)
      }
    } else {
      navigator.clipboard.writeText(shareUrl)
      addNotification(
        'Link Copied',
        'Link copied to clipboard!',
        'content_copy',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'system'
      )
    }
  }

  return {
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
  }
}
