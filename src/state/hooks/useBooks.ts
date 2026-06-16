import { useState, useRef, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import { CHAPTER_LIKES_THRESHOLD } from '@/config/constants'
import type { User, Book, View } from '@/types'

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
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
  ) => void
  awardPoints: (amount: number, reason: string) => void
  rewardedItems: Set<string>
  setRewardedItems: Dispatch<SetStateAction<Set<string>>>
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
  addNotification,
  awardPoints,
  rewardedItems,
  setRewardedItems
}: BooksDeps) {
  const [books, setBooks] = useState<Book[]>([])
  const [globalSpotlightBookId, setGlobalSpotlightBookId] = useState<
    string | null
  >(null)
  const [likedBooks, setLikedBooks] = useState<Set<string>>(new Set())
  const [favoriteBookIds, setFavoriteBookIds] = useState<Set<string>>(new Set())
  const likedBooksInteracted = useRef(false)
  const [spotlightInit, setSpotlightInit] = useState(false)

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
          price: fb.price ?? 0
        }))
        setBooks(converted)
      }
    )
    return () => unsubscribe()
  }, [favoriteBookIds, firebaseUid])

  useEffect(() => {
    const unsubscribe = fbService.subscribeToGlobalSpotlight(
      (spotlight: any) => {
        setGlobalSpotlightBookId(spotlight?.spotlightBookId || null)
      }
    )
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (books.length === 0 || spotlightInit) return
    setSpotlightInit(true)
    fbService.ensureGlobalSpotlight(books).catch((err: any) => {
      console.warn('[MainWRLD] Spotlight disabled:', err?.message || err)
    })
  }, [books, spotlightInit])

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

  const handleLike = async (bookId: string, chapterIndex: number = 0) => {
    likedBooksInteracted.current = true
    const likeKey = `${bookId}:${chapterIndex}`
    const isLiked = likedBooks.has(likeKey)

    const targetBook = books.find(b => b.id === bookId)
    if (!targetBook) return

    const chLikes = getChapterLikes(
      targetBook.likes,
      targetBook.chapters?.length || 1
    )

    if (isLiked) {
      const next = new Set(likedBooks)
      next.delete(likeKey)
      setLikedBooks(next)
      chLikes[chapterIndex] = Math.max(0, (chLikes[chapterIndex] || 0) - 1)
    } else {
      const next = new Set(likedBooks)
      next.add(likeKey)
      setLikedBooks(next)
      chLikes[chapterIndex] = (chLikes[chapterIndex] || 0) + 1
      const chapterTitle =
        targetBook.chapters?.[chapterIndex]?.title ||
        `Chapter ${chapterIndex + 1}`
      const authorUsername =
        (targetBook as any).authorUsername || targetBook.author.username
      addNotification(
        'Chapter Liked',
        `${user?.displayName} liked ${chapterTitle} from "${targetBook.title}"`,
        'favorite',
        authorUsername,
        user.username,
        targetBook.id,
        chapterIndex
      )

      // Earned points: award book author 2 pts when chapter hits like threshold
      const rewardKey = `chapter:${bookId}:${chapterIndex}:${Math.floor(
        chLikes[chapterIndex] / CHAPTER_LIKES_THRESHOLD
      )}`
      if (
        chLikes[chapterIndex] % CHAPTER_LIKES_THRESHOLD === 0 &&
        !rewardedItems.has(rewardKey) &&
        targetBook.author.username === user.username
      ) {
        setRewardedItems(prev => new Set(prev).add(rewardKey))
        awardPoints(2, `${chapterTitle} hit ${chLikes[chapterIndex]} likes!`)
      }
    }

    // Update locally for immediate UI feedback
    setBooks(prev =>
      prev.map(b => {
        if (b.id !== bookId) return b
        const updated = { ...b, likes: [...chLikes] }
        if (selectedBook && selectedBook.id === bookId) setSelectedBook(updated)
        return updated
      })
    )

    // Persist to Firestore
    fbService.updateBook(bookId, { likes: chLikes }).catch(console.error)
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
  }

  const handleUnpublish = async (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    const wasMonetized = book?.isMonetized
    await fbService.updateBook(bookId, {
      isDraft: true,
      isMonetized: false,
      wasMonetizedBefore: wasMonetized || book?.wasMonetizedBefore || false
    })
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: book.title,
          text: book.tagline,
          url: window.location.href
        })
      } catch (err) {
        console.log('Share failed', err)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      addNotification(
        'Link Copied',
        'Link copied to clipboard!',
        'content_copy'
      )
    }
  }

  return {
    books,
    setBooks,
    globalSpotlightBookId,
    setGlobalSpotlightBookId,
    likedBooks,
    setLikedBooks,
    favoriteBookIds,
    setFavoriteBookIds,
    likedBooksInteracted,
    spotlightInit,
    setSpotlightInit,
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
