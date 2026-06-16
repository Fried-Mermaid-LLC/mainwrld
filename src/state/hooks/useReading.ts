import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import { MAX_DAILY_CHAPTERS, containsBadWord } from '@/config/constants'
import type { User, Book, BookProgress, View, Relationship } from '@/types'

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
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
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

  const handleDeleteChapter = (bookId: string, chapterIndex: number) => {
    setBooks(prev =>
      prev.map(b => {
        if (b.id === bookId && b.chapters) {
          const updatedChapters = b.chapters.filter(
            (_, i) => i !== chapterIndex
          )
          const newChaptersCount =
            chapterIndex < b.chaptersCount
              ? Math.max(0, b.chaptersCount - 1)
              : b.chaptersCount
          const newContent = updatedChapters.map(c => c.content).join('\n\n')
          fbService
            .updateBook(bookId, {
              chapters: updatedChapters,
              chaptersCount: newChaptersCount,
              content: newContent
            })
            .catch(console.error)
          return {
            ...b,
            chapters: updatedChapters,
            chaptersCount: newChaptersCount,
            content: newContent
          }
        }
        return b
      })
    )
    showToast('Chapter permanently deleted.', 'error')
  }

  const handleSaveToLibrary = (bookId: string) => {
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
    // Sync the ref RIGHT NOW so the next rapid save sees this book
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
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
    const newPurchased = (currentUd.purchasedBookIds || []).filter(
      (id: string) => id !== bookId
    )
    const updatedUd = {
      ...currentUd,
      ownedBookIds: newOwned,
      purchasedBookIds: newPurchased
    }
    // Sync the ref RIGHT NOW so the next rapid remove sees this change
    userBookDataRef.current = {
      ...userBookDataRef.current,
      [user.username]: updatedUd
    }
    setUserBookData(prev => ({ ...prev, [user.username]: updatedUd }))
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

  const handlePublish = async (data: any) => {
    try {
      // Daily chapter publish limit
      const now = Date.now()
      const isNewDay = now - user.lastChapterPublishReset > 24 * 60 * 60 * 1000
      const dailyCount = isNewDay ? 0 : user.dailyChaptersPublished
      if (dailyCount >= MAX_DAILY_CHAPTERS) {
        showToast(
          `You've reached your daily publishing limit of ${MAX_DAILY_CHAPTERS} chapters. Please try again tomorrow!`
        )
        return
      }
      if (
        containsBadWord(currentPublishingTitle || '') ||
        containsBadWord(data.tagline || '') ||
        containsBadWord(currentPublishingChapterTitle || '')
      ) {
        showToast(
          'Your book title, chapter title, or tagline contains inappropriate language. Please revise before publishing.',
          'warning'
        )
        return
      }
      if (currentPublishingId) {
        // Update existing book - preserve existing metadata when just adding/updating chapters
        const existingBook = books.find(b => b.id === currentPublishingId)
        if (existingBook) {
          const updatedChapters = [...(existingBook.chapters || [])]
          const targetIndex =
            currentPublishingChapterIndex !== null
              ? currentPublishingChapterIndex
              : updatedChapters.length - 1

          if (targetIndex >= 0 && targetIndex < updatedChapters.length) {
            const resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              updatedChapters[targetIndex]?.title ||
              `Chapter ${targetIndex + 1}`
            updatedChapters[targetIndex] = {
              ...updatedChapters[targetIndex],
              title: resolvedChapterTitle,
              content: currentPublishingContent
            }
          } else {
            const resolvedChapterTitle =
              currentPublishingChapterTitle.trim() ||
              `Chapter ${updatedChapters.length + 1}`
            updatedChapters.push({
              title: resolvedChapterTitle,
              content: currentPublishingContent
            })
          }

          const updatedLikes = (() => {
            const arr = Array.isArray(existingBook.likes)
              ? [...existingBook.likes]
              : [existingBook.likes || 0]
            while (arr.length < updatedChapters.length) arr.push(0)
            return arr
          })()

          await fbService.updateBook(currentPublishingId, {
            tagline: data.tagline || existingBook.tagline || '',
            isExplicit: data.isExplicit ?? existingBook.isExplicit ?? false,
            genres:
              data.genres && data.genres.length > 0
                ? data.genres
                : existingBook.genres || [],
            hashtags:
              data.hashtags && data.hashtags.length > 0
                ? data.hashtags
                : existingBook.hashtags || [],
            coverImage: data.coverImage || existingBook.coverImage || null,
            coverColor: data.coverImage
              ? '#f5f5f5'
              : existingBook.coverColor ||
                '#' + Math.floor(Math.random() * 16777215).toString(16),
            chapters: updatedChapters,
            chaptersCount: Math.max(
              existingBook.chaptersCount || 0,
              targetIndex + 1
            ),
            likes: updatedLikes,
            isDraft: false,
            commentsEnabled: data.commentsEnabled ?? true,
            content: updatedChapters.map((c: any) => c.content).join('\n\n')
          })

          // Notify users who have this book in their library about the new chapter
          if (
            currentPublishingChapterIndex === null ||
            (existingBook.chapters &&
              currentPublishingChapterIndex >= existingBook.chapters.length)
          ) {
            Object.entries(userBookData).forEach(
              ([username, udata]: [string, any]) => {
                if (
                  username !== user?.username &&
                  udata.ownedBookIds?.includes(currentPublishingId)
                ) {
                  addNotification(
                    'New Chapter',
                    `"${existingBook.title}" has a new chapter!`,
                    'menu_book',
                    username,
                    user?.username
                  )
                }
              }
            )
          }
        }
      } else {
        // New book — write to Firestore
        const bookData = {
          title: currentPublishingTitle,
          authorUid: firebaseUid || '',
          authorUsername: user?.username || '',
          authorDisplayName: user?.displayName || '',
          coverColor: data.coverImage
            ? '#f5f5f5'
            : '#' + Math.floor(Math.random() * 16777215).toString(16),
          coverImage: data.coverImage || null,
          likes: [0],
          commentsCount: 0,
          monetizationAttempts: 0,
          publishedDate: new Date().toISOString().split('T')[0],
          isCompleted: false,
          isExplicit: data.isExplicit ?? false,
          chaptersCount: 1,
          tagline: data.tagline || '',
          genres: data.genres || [],
          hashtags: data.hashtags || [],
          content: currentPublishingContent,
          isDraft: false,
          commentsEnabled: data.commentsEnabled ?? true,
          chapters: [
            {
              title: currentPublishingChapterTitle.trim() || 'Chapter 1',
              content: currentPublishingContent
            }
          ],
          isFree: true,
          price: 0
        }
        await fbService.createBook(bookData)

        // Notify admirers and mutuals about the new book
        const myAdmirers = relationships
          .filter(r => r.target === user?.username)
          .map(r => r.admirer)
        const myAdmiring = relationships
          .filter(r => r.admirer === user?.username)
          .map(r => r.target)
        const notifyUsers = new Set([...myAdmirers, ...myAdmiring])
        notifyUsers.forEach(username => {
          if (username !== user?.username) {
            addNotification(
              'New Book',
              `${user?.displayName} published a new book: "${currentPublishingTitle}"`,
              'auto_stories',
              username,
              user?.username
            )
          }
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
          Date.now() - prev.lastChapterPublishReset > 24 * 60 * 60 * 1000
        return {
          ...prev,
          dailyChaptersPublished:
            (isNewDay ? 0 : prev.dailyChaptersPublished) + 1,
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

  const handleRequestMonetization = async (bookId: string) => {
    const book = books.find(b => b.id === bookId)
    await fbService.updateBook(bookId, {
      monetizationAttempts: (book?.monetizationAttempts || 0) + 1
    })
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
      // Update existing draft in Firestore
      const existingBook = books.find(b => b.id === bookId)
      if (existingBook) {
        const updatedChapters = [...(existingBook.chapters || [])]
        if (
          chapterIndex !== null &&
          chapterIndex >= 0 &&
          chapterIndex < updatedChapters.length
        ) {
          const resolvedChapterTitle =
            (chapterTitle || '').trim() ||
            updatedChapters[chapterIndex]?.title ||
            `Chapter ${chapterIndex + 1}`
          updatedChapters[chapterIndex] = {
            ...updatedChapters[chapterIndex],
            title: resolvedChapterTitle,
            content
          }
        } else if (content.trim()) {
          const resolvedChapterTitle =
            (chapterTitle || '').trim() ||
            `Chapter ${updatedChapters.length + 1}`
          updatedChapters.push({ title: resolvedChapterTitle, content })
        }
        await fbService.updateBook(bookId, {
          title: title.trim() || existingBook.title,
          chapters: updatedChapters,
          content: updatedChapters.map((c: any) => c.content).join('\n\n')
        })
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
      const updatedChapters = content.trim()
        ? [{ title: resolvedChapterTitle, content }]
        : []
      await fbService.updateBook(existingDraft.id, {
        title: title.trim() || existingDraft.title,
        content,
        chapters: updatedChapters,
        chaptersCount: updatedChapters.length,
        isDraft: true
      })
    } else {
      // Create new draft in Firestore and return the real document id
      const resolvedChapterTitle = (chapterTitle || '').trim() || 'Chapter 1'
      const bookData = {
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
      const created = await fbService.createBook(bookData)
      newBookId = (created as any).id
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
    // Update user activity status to "Reading"
    if (user.activity !== 'Reading') {
      setUser(prev => ({ ...prev, activity: 'Reading' }))
      if (firebaseUid) {
        fbService
          .updateUserProfile(firebaseUid, { activity: 'Reading' })
          .catch(console.error)
      }
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
    handlePublish,
    handleRequestMonetization,
    handleSaveDraft,
    handleBookProgressUpdate
  }
}
