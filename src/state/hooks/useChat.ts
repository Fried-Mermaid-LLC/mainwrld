import { useState, useEffect } from 'react'
import * as fbService from '@/services/firebaseService'
import { containsBadWord } from '@/config/constants'
import type { ChatMessage, User, View } from '@/types'

interface ChatDeps {
  user: User
  firebaseUid: string | null
  view: View
  selectedChatUser: string | null
  registeredUsers: any[]
  mutuals: User[]
  showToast: (message: string, icon?: string) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
  ) => void
}

// Chat domain (Phase B). Owns chatMessages + its Firestore subscription, the
// 1-year message-expiry effect, the mark-read-on-view effect, and
// handleSendMessage. `mutuals` is destructured to MUTUALS so the body stays
// verbatim. Bodies + dep arrays verbatim.
export function useChat({
  user, firebaseUid, view, selectedChatUser, registeredUsers,
  mutuals: MUTUALS, showToast, addNotification
}: ChatDeps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  // Subscribe to chat messages
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToChatMessages((msgs: any[]) => {
      setChatMessages(
        msgs.map(m => ({
          id: m.id,
          from: m.from,
          to: m.to,
          text: m.text,
          timestamp: m.timestamp,
          read: m.read
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  // Message expiry: delete messages older than 1 year from Firestore
  useEffect(() => {
    if (!user.username) return
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    fbService
      .deleteChatMessagesOlderThan(oneYearAgo.toISOString())
      .catch(console.error)
  }, [])

  // Mark messages as read when viewing a chat conversation (writes to Firestore)
  useEffect(() => {
    if (view === 'chat-conversation' && selectedChatUser && user.username) {
      fbService
        .markMessagesRead(selectedChatUser, user.username)
        .catch(console.error)
    }
  }, [view, selectedChatUser])

  const handleSendMessage = (toUsername: string, text: string) => {
    if (!text.trim()) return
    if (containsBadWord(text)) {
      showToast('Your message contains inappropriate language.', 'warning')
      return
    }
    // Write to Firestore — real-time subscription will update local state
    fbService
      .sendChatMessage(user.username, toUsername, text.trim())
      .catch(console.error)
    // Send notification to recipient
    const recipientUser =
      registeredUsers.find(u => u.username === toUsername) ||
      MUTUALS.find(u => u.username === toUsername)
    if (recipientUser) {
      addNotification(
        'New Message',
        `${user.displayName}: ${text.trim().slice(0, 50)}${
          text.length > 50 ? '...' : ''
        }`,
        'chat',
        toUsername
      )
    }
  }

  return { chatMessages, setChatMessages, handleSendMessage }
}
