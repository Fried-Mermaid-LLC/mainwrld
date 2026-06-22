import { useState, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import type {
  NotificationItem,
  NotificationCategory,
  NotificationPrefs,
  User,
  Book,
  View
} from '@/types'

// Default prefs when a user has none on file: all categories enabled, so legacy
// accounts keep receiving notifications.
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newAdmirers: true,
  bookLikes: true,
  comments: true,
  appUpdates: true
}

// Whether the recipient's in-app feed should show a notification of this
// category. 'system'/'messages'/unknown categories are always shown.
const isCategoryEnabled = (
  category: NotificationCategory | undefined,
  prefs?: NotificationPrefs
): boolean => {
  if (!category || category === 'system' || category === 'messages') return true
  const p = prefs ?? DEFAULT_NOTIFICATION_PREFS
  const value = (p as any)[category]
  return value !== false // default-on for any unknown/missing category
}

interface NotificationsDeps {
  user: User
  firebaseUid: string | null
  books: Book[]
  mutuals: User[]
  registeredUsers: any[]
  setView: Dispatch<SetStateAction<View>>
  setSelectedBook: Dispatch<SetStateAction<Book | null>>
  setReadingChapterIndex: Dispatch<SetStateAction<number>>
  setActiveCommentChapterKey: Dispatch<SetStateAction<string | null>>
  setScrollToCommentId: Dispatch<SetStateAction<string | null>>
  setSelectedProfileUser: Dispatch<SetStateAction<User | null>>
  setSelectedChatUser: Dispatch<SetStateAction<string | null>>
}

// Notifications domain (Phase B). Owns the notifications list + its Firestore
// subscription, addNotification (called by many handlers), and the
// notification-click deep-link router. The `mutuals` dep is destructured to the
// local name MUTUALS so the moved handleNotificationClick body stays verbatim.
export function useNotifications({
  user,
  firebaseUid,
  books,
  mutuals: MUTUALS,
  registeredUsers,
  setView,
  setSelectedBook,
  setReadingChapterIndex,
  setActiveCommentChapterKey,
  setScrollToCommentId,
  setSelectedProfileUser,
  setSelectedChatUser
}: NotificationsDeps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  // Subscribe to notifications
  useEffect(() => {
    if (!firebaseUid || !user.username) return
    const unsub = fbService.subscribeToNotifications(user.username, (notifs: any[]) => {
      setNotifications(
        notifs
          .map(n => ({
            id: n.id,
            title: n.title,
            message: n.message,
            icon: n.icon,
            timestamp: n.timestamp ? new Date(n.timestamp) : new Date(),
            recipient: n.recipient,
            sender: n.sender,
            read: n.read,
            targetId: n.targetId,
            targetChapterIndex: n.targetChapterIndex,
            commentId: n.commentId,
            category: n.category as NotificationCategory | undefined
          }))
          // X01 owns the recipient-side in-app filter: hide categories the user
          // disabled in their prefs (default-on for legacy/missing prefs;
          // 'system'/'messages'/unknown are never hidden).
          .filter(n => isCategoryEnabled(n.category, user.notificationPrefs))
      )
    })
    return () => unsub()
  }, [firebaseUid, user.username, user.notificationPrefs])

  const addNotification = useCallback(
    (
      title: string,
      message: string,
      icon: string,
      recipient?: string,
      sender?: string,
      targetId?: string,
      targetChapterIndex?: number,
      commentId?: string,
      category?: NotificationCategory
    ) => {
      const newNotif = {
        id: Math.random().toString(36).substr(2, 9),
        title,
        message,
        icon,
        timestamp: new Date().toISOString(),
        recipient: recipient || user.username,
        sender: sender || user.username,
        read: false,
        targetId,
        targetChapterIndex,
        commentId,
        category
      }
      fbService.addNotificationDoc(newNotif).catch(console.error)
    },
    [user.username]
  )

  // Shared deep-link router, keyed primarily on category (machine-readable),
  // with the legacy title-string matching kept as a fallback for old docs that
  // predate the category field. Used by both in-app clicks and push taps.
  const routeNotification = useCallback(
    (n: Partial<NotificationItem>) => {
      const openBook = (view: View) => {
        if (!n.targetId) return
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView(view)
        }
      }
      const openProfile = () => {
        const username = n.targetId || n.sender
        if (!username) return
        const targetUser =
          MUTUALS.find(u => u.username === username) ||
          registeredUsers.find(u => u.username === username)
        if (targetUser) {
          setSelectedProfileUser(targetUser)
          setView('profile')
        }
      }
      const openChat = () => {
        const chatUser = n.targetId || n.sender
        if (chatUser) {
          setSelectedChatUser(chatUser)
          setView('chat-conversation')
        }
      }
      const title = n.title || ''

      // Comments (category 'comments' covers New Comment + Comment Liked).
      if (n.category === 'comments' || title.includes('Comment')) {
        if (n.targetId) {
          const targetBook = books.find(b => b.id === n.targetId)
          if (targetBook) {
            setSelectedBook(targetBook)
            setReadingChapterIndex(n.targetChapterIndex || 0)
            setActiveCommentChapterKey(
              `${n.targetId}_${n.targetChapterIndex || 0}`
            )
            if (n.commentId) setScrollToCommentId(n.commentId)
            setView('comments')
          }
        }
        return
      }
      if (
        n.category === 'bookLikes' ||
        title.includes('Liked') ||
        title === 'Chapter Liked'
      ) {
        openBook('book-detail')
        return
      }
      if (
        n.category === 'newAdmirers' ||
        title === 'New Admirer' ||
        title === 'Mutual Connection!'
      ) {
        openProfile()
        return
      }
      if (n.category === 'messages' || title.includes('Message')) {
        openChat()
        return
      }
      if (
        n.category === 'appUpdates' ||
        title === 'New Book' ||
        title === 'New Chapter'
      ) {
        openBook('book-detail')
        return
      }
      // Monetization notifications (F01/F03) carry targetId = bookId.
      if (title === 'Book Monetized' || title.startsWith('Monetization')) {
        openBook('book-detail')
        return
      }
    },
    [
      books,
      MUTUALS,
      registeredUsers,
      setSelectedBook,
      setReadingChapterIndex,
      setActiveCommentChapterKey,
      setScrollToCommentId,
      setView,
      setSelectedProfileUser,
      setSelectedChatUser
    ]
  )

  const handleNotificationClick = (n: NotificationItem) => {
    if (n.id) {
      fbService.markNotificationRead(n.id).catch(console.error)
    }
    routeNotification(n)
  }

  // Reconstruct a minimal NotificationItem from an FCM data payload (all string
  // values) and route it, so a push tap deep-links exactly like an in-app click.
  const routeFromPushData = useCallback(
    (data: Record<string, string>) => {
      routeNotification({
        title: data.title || '',
        category: (data.category as NotificationCategory) || undefined,
        targetId: data.targetId || undefined,
        targetChapterIndex: data.targetChapterIndex
          ? Number(data.targetChapterIndex)
          : undefined,
        commentId: data.commentId || undefined,
        sender: data.sender || undefined
      })
    },
    [routeNotification]
  )

  return {
    notifications,
    setNotifications,
    addNotification,
    handleNotificationClick,
    routeFromPushData
  }
}
