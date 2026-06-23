import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import { containsProfanity } from '@/config/profanity'
import {
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PER_CONVERSATION_PER_DAY
} from '@/config/constants'
import type { ChatMessage, User, View, NotificationCategory } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

interface ChatDeps {
  user: User
  setUser: Dispatch<SetStateAction<User>>
  firebaseUid: string | null
  view: View
  selectedChatUser: string | null
  registeredUsers: any[]
  mutuals: User[]
  showToast: (message: string, icon?: string) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string, category?: NotificationCategory
  ) => void
}

// Chat domain (Phase B). Owns chatMessages + its Firestore subscription, the
// 1-year message-expiry effect, the mark-read-on-view effect, and
// handleSendMessage. `mutuals` is destructured to MUTUALS so the body stays
// verbatim. Bodies + dep arrays verbatim.
export function useChat({
  user, setUser, firebaseUid, view, selectedChatUser, registeredUsers,
  mutuals: MUTUALS, showToast, addNotification
}: ChatDeps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  // Subscribe to chat messages
  useEffect(() => {
    if (!firebaseUid || !user.username) return
    const unsub = fbService.subscribeToChatMessages(user.username, (msgs: any[]) => {
      setChatMessages(
        msgs.map(m => ({
          id: m.id,
          from: m.from,
          to: m.to,
          text: m.text,
          timestamp: m.timestamp,
          read: m.read,
          senderIsPremium: m.senderIsPremium
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid, user.username])

  // Message retention is now membership-aware and owned by the server-side
  // pruneExpiredMessages scheduled function (F08): members keep messages
  // forever, non-members' messages are deleted ~1 year after they are sent.
  // The previous unconditional client-side mass-delete (which expired everyone
  // at 1 year and scanned the whole collection on every load) was removed.

  // Mark messages as read when viewing a chat conversation (writes to Firestore)
  useEffect(() => {
    if (view === 'chat-conversation' && selectedChatUser && user.username) {
      fbService
        .markMessagesRead(selectedChatUser, user.username)
        .catch(console.error)
      // Optimistic: clear the unread badge immediately. SSE doesn't echo read
      // flips, so otherwise the badge persists until the 60s fallback poll.
      setChatMessages(prev =>
        prev.map(m =>
          m.from === selectedChatUser && m.to === user.username && !m.read
            ? { ...m, read: true }
            : m
        )
      )
    }
  }, [view, selectedChatUser])

  // Returns true only when the message was actually sent. The view keeps the
  // user's text (so they can revise) on any false return — nothing is deleted.
  // Guard order: empty → length → profanity → daily limit, each with a specific
  // toast so the user knows what to fix.
  const handleSendMessage = (toUsername: string, text: string): boolean => {
    if (!text.trim()) return false
    // Length cap (the input maxLength also blocks typing past 500, but a paste
    // can exceed it; the rules + sendChatMessage slice are the server backstops).
    if (text.trim().length > MAX_MESSAGE_LENGTH) {
      showToast(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`, 'warning')
      return false
    }
    // Profanity is blocked client-side (instant feedback) WITHOUT clearing the
    // input, so the user can revise. The server (moderateChatMessageOnCreate)
    // re-checks profanity + OpenAI authoritatively.
    if (containsProfanity(text)) {
      showToast('Please revise your message — it contains a blocked word.', 'warning')
      return false
    }
    // Per-conversation daily limit: 25 outgoing messages per sender per rolling
    // 24h. The convoId is symmetric ([from,to].sort()), but the counter lives on
    // each sender's user doc and only their own sends increment it.
    const convoId = [user.username, toUsername].sort().join('__')
    const entry = user.chatDailyCounts?.[convoId]
    const isNewDay = !entry || Date.now() - entry.resetAt > DAY_MS
    const sentToday = isNewDay ? 0 : entry.count
    if (sentToday >= MAX_MESSAGES_PER_CONVERSATION_PER_DAY) {
      showToast(
        `You've reached ${MAX_MESSAGES_PER_CONVERSATION_PER_DAY} messages with this person today. Try again tomorrow!`,
        'warning'
      )
      return false
    }
    // Optimistic insert so the sent message shows instantly. Without it the
    // message is missing until the SSE echo (or the 60s fallback poll) lands.
    // The SSE handler dedupes by id, so we insert under a temp id and reconcile
    // to the server message (real id) when sendChatMessage resolves.
    const tempId = `tmp_${Math.random().toString(36).slice(2)}`
    setChatMessages(prev => [
      ...prev,
      {
        id: tempId,
        from: user.username,
        to: toUsername,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        senderIsPremium: !!user.isPremium
      }
    ])
    fbService
      .sendChatMessage(user.username, toUsername, text.trim(), !!user.isPremium)
      .then(created => {
        setChatMessages(prev => {
          const noTemp = prev.filter(m => m.id !== tempId)
          // SSE may have already delivered the real message by id — avoid a dup.
          return noTemp.some(m => m.id === created.id)
            ? noTemp
            : [...noTemp, created]
        })
      })
      .catch(err => {
        console.error(err)
        setChatMessages(prev => prev.filter(m => m.id !== tempId))
        showToast('Failed to send message. Please try again.', 'warning')
      })
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
        toUsername,
        user.username, // sender — recipient deep-links back to the sender's chat
        undefined,
        undefined,
        undefined,
        'messages'
      )
    }
    // Bump the per-conversation daily counter (mirrors useReading's chapter
    // counter); usePersist flushes chatDailyCounts to the user doc.
    setUser(prev => {
      const prevEntry = prev.chatDailyCounts?.[convoId]
      const fresh = !prevEntry || Date.now() - prevEntry.resetAt > DAY_MS
      return {
        ...prev,
        chatDailyCounts: {
          ...(prev.chatDailyCounts || {}),
          [convoId]: {
            count: (fresh ? 0 : prevEntry.count) + 1,
            resetAt: fresh ? Date.now() : prevEntry.resetAt
          }
        }
      }
    })
    return true
  }

  return { chatMessages, setChatMessages, handleSendMessage }
}
