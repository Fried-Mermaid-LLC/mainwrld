import React from 'react'
import { AvatarLayers } from '@/components/avatar'
import type { Relationship, ChatMessage } from '@/types'

// --- Chat Components ---

export const ChatListView = ({
  currentUsername,
  relationships,
  registeredUsers,
  mutualsFallback,
  chatMessages,
  blockedUsers,
  onSelectChat,
  onBack,
  getAvatarItemPath,
  avatarConfigs = {}
}: any) => {
  // Get actual mutual usernames
  const myAdmiring = relationships
    .filter((r: Relationship) => r.admirer === currentUsername)
    .map((r: Relationship) => r.target)
  const mutualUsernames = myAdmiring.filter((t: string) =>
    relationships.some(
      (r: Relationship) => r.admirer === t && r.target === currentUsername
    )
  )

  // Build mutual user objects
  const mutuals = mutualUsernames
    .map((username: string) => {
      return (
        registeredUsers.find((u: any) => u.username === username) ||
        mutualsFallback.find((u: any) => u.username === username)
      )
    })
    .filter(Boolean)
    .filter((u: any) => !blockedUsers.has(u.username))

  // Also include non-mutual users who have existing messages (read-only conversations)
  const usersWithMessages = Array.from(
    new Set(
      chatMessages
        .filter(
          (m: ChatMessage) =>
            m.from === currentUsername || m.to === currentUsername
        )
        .map((m: ChatMessage) => (m.from === currentUsername ? m.to : m.from))
    )
  ).filter(
    (username: string) =>
      !mutualUsernames.includes(username) && !blockedUsers.has(username)
  )

  const nonMutualChatUsers = usersWithMessages
    .map((username: string) => {
      return (
        registeredUsers.find((u: any) => u.username === username) ||
        mutualsFallback.find((u: any) => u.username === username)
      )
    })
    .filter(Boolean)

  // Combine mutuals and non-mutual users with existing messages
  const allChatUsers = [...mutuals, ...nonMutualChatUsers]

  // Fall back to demo mutuals if none
  const displayUsers =
    allChatUsers.length > 0
      ? allChatUsers
      : mutualsFallback.filter((u: any) => !blockedUsers.has(u.username))

  // Get conversations with last message
  const conversations = displayUsers
    .map((chatUser: any) => {
      const msgs = chatMessages.filter(
        (m: ChatMessage) =>
          (m.from === currentUsername && m.to === chatUser.username) ||
          (m.from === chatUser.username && m.to === currentUsername)
      )
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null
      const unread = msgs.filter(
        (m: ChatMessage) => m.to === currentUsername && !m.read
      ).length
      const isStillMutual = mutualUsernames.includes(chatUser.username)
      return {
        user: chatUser,
        lastMessage: lastMsg,
        unreadCount: unread,
        messageCount: msgs.length,
        isMutual: isStillMutual
      }
    })
    .sort((a: any, b: any) => {
      // Sort by most recent message, then by unread
      if (a.lastMessage && b.lastMessage)
        return (
          new Date(b.lastMessage.timestamp).getTime() -
          new Date(a.lastMessage.timestamp).getTime()
        )
      if (a.lastMessage) return -1
      if (b.lastMessage) return 1
      return 0
    })

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500 z-[400]'>
      <header className='p-6 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-xl z-50'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-xl font-bold flex-1'>Messages</h1>
      </header>

      {conversations.length === 0 ? (
        <div className='p-12 text-center'>
          <span className='material-icons-round text-5xl text-gray-200 mb-4'>
            chat
          </span>
          <p className='text-sm font-bold text-gray-300 uppercase tracking-widest'>
            No mutuals yet
          </p>
          <p className='text-xs text-gray-400 mt-2'>
            Admire someone and have them admire you back to start chatting!
          </p>
        </div>
      ) : (
        <div className='px-4'>
          {conversations.map((conv: any) => (
            <button
              key={conv.user.username}
              onClick={() => onSelectChat(conv.user.username)}
              className='w-full p-4 flex items-center gap-4 rounded-2xl transition-all active:scale-[0.98] hover:bg-gray-50 group'
            >
              <div className='relative flex-shrink-0'>
                <div className='w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl font-bold overflow-hidden'>
                  {avatarConfigs[conv.user.username] ? (
                    <div className='relative w-full h-full'>
                      <AvatarLayers
                        avatarConfig={avatarConfigs[conv.user.username]}
                        containerClassName='absolute left-1/2'
                        containerStyle={{
                          width: '70px',
                          height: '97px',
                          transform: 'translateX(-50%) scale(1.35)',
                          transformOrigin: 'top center',
                          top: '8%'
                        }}
                      />
                    </div>
                  ) : (
                    <span className='material-icons-round text-2xl'>
                      person
                    </span>
                  )}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    conv.user.isOnline ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              </div>
              <div className='flex-1 text-left min-w-0'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm font-bold truncate'>
                    {conv.user.displayName}
                  </span>
                  {conv.lastMessage && (
                    <span className='text-[9px] text-gray-300 font-bold flex-shrink-0'>
                      {(() => {
                        const diff =
                          Date.now() -
                          new Date(conv.lastMessage.timestamp).getTime()
                        const mins = Math.floor(diff / 60000)
                        if (mins < 1) return 'now'
                        if (mins < 60) return `${mins}m`
                        const hrs = Math.floor(mins / 60)
                        if (hrs < 24) return `${hrs}h`
                        return `${Math.floor(hrs / 24)}d`
                      })()}
                    </span>
                  )}
                </div>
                <p className='text-xs text-gray-400 truncate mt-0.5'>
                  {conv.lastMessage
                    ? `${
                        conv.lastMessage.from === currentUsername ? 'You: ' : ''
                      }${conv.lastMessage.text}`
                    : 'Start a conversation'}
                </p>
              </div>
              {conv.unreadCount > 0 && (
                <span className='w-6 h-6 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0'>
                  {conv.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
