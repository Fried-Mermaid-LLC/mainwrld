import { useState, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import type { NotificationItem, User, Book, View } from '@/types'

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
        notifs.map(n => ({
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
          commentId: n.commentId
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid, user.username])

  const addNotification = useCallback(
    (
      title: string,
      message: string,
      icon: string,
      recipient?: string,
      sender?: string,
      targetId?: string,
      targetChapterIndex?: number,
      commentId?: string
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
        commentId
      }
      fbService.addNotificationDoc(newNotif).catch(console.error)
    },
    [user.username]
  )

  const handleNotificationClick = (n: NotificationItem) => {
    console.log('[Notification Click]', n)

    // Mark notification as read when clicked
    if (n.id) {
      fbService.markNotificationRead(n.id).catch(console.error)
    }

    // Handle comment notifications - link to comment
    if (n.title.includes('Comment')) {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setReadingChapterIndex(n.targetChapterIndex || 0)
          setActiveCommentChapterKey(
            `${n.targetId}_${n.targetChapterIndex || 0}`
          )
          // Scroll to the specific comment if commentId is available
          if (n.commentId) {
            setScrollToCommentId(n.commentId)
          }
          setView('comments')
        }
      }
      return
    }

    // Handle chapter like notifications - link to book
    if (n.title.includes('Liked') || n.title === 'Chapter Liked') {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView('book-detail')
        }
      }
      return
    }

    // Handle admirer/mutual notifications
    if (n.title === 'New Admirer' || n.title === 'Mutual Connection!') {
      const username = n.targetId || n.sender
      if (username) {
        const targetUser =
          MUTUALS.find(u => u.username === username) ||
          registeredUsers.find(u => u.username === username)
        if (targetUser) {
          setSelectedProfileUser(targetUser)
          setView('profile')
        }
      }
      return
    }

    // Handle message notifications
    if (n.title.includes('Message')) {
      const chatUser = n.targetId || n.sender
      if (chatUser) {
        setSelectedChatUser(chatUser)
        setView('chat-conversation')
      }
      return
    }

    // Handle new book/chapter notifications
    if (n.title === 'New Book' || n.title === 'New Chapter') {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView('book-detail')
        }
      }
      return
    }

    // Handle monetization notifications (F01 fan-out + F03 accept/deny) — all
    // carry targetId = bookId and deep-link to the book.
    if (n.title === 'Book Monetized' || n.title.startsWith('Monetization')) {
      if (n.targetId) {
        const targetBook = books.find(b => b.id === n.targetId)
        if (targetBook) {
          setSelectedBook(targetBook)
          setView('book-detail')
        }
      }
      return
    }
  }

  return { notifications, setNotifications, addNotification, handleNotificationClick }
}
