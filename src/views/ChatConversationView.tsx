import React, { useState, useEffect, useRef } from 'react'
import { AvatarLayers } from '@/components/avatar'
import type { ChatMessage } from '@/types'

export const ChatConversationView = ({
  currentUsername,
  currentDisplayName,
  targetUsername,
  targetUser,
  messages,
  onSend,
  onBack,
  getAvatarItemPath,
  avatarConfig,
  isMutual
}: any) => {
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (newMessage.trim()) {
      onSend(newMessage)
      setNewMessage('')
    }
  }

  // Sort messages by timestamp, then group by date
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const groupedMessages = sortedMessages.reduce(
    (groups: any, msg: ChatMessage) => {
      const date = new Date(msg.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(msg)
      return groups
    },
    {}
  )

  return (
    <div className='fixed inset-0 bg-white flex flex-col animate-in slide-in-from-right duration-500 z-[400]'>
      {/* Header */}
      <header className='p-4 flex items-center gap-3 bg-white border-b border-gray-100 z-10'>
        <button
          onClick={onBack}
          className='w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <div className='relative'>
          <div className='w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden'>
            {avatarConfig ? (
              <div className='relative w-full h-full'>
                <AvatarLayers
                  avatarConfig={avatarConfig}
                  containerClassName='absolute left-1/2'
                  containerStyle={{
                    width: '70px',
                    height: '97px',
                    transform: 'translateX(-50%) scale(1)',
                    transformOrigin: 'top center',
                    top: '8%'
                  }}
                />
              </div>
            ) : (
              <span className='material-icons-round text-gray-400'>person</span>
            )}
          </div>
          {targetUser?.isOnline && (
            <div className='absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white' />
          )}
        </div>
        <div className='flex-1'>
          <p className='text-sm font-bold'>
            {targetUser?.displayName || targetUsername}
          </p>
          <p className='text-[9px] text-gray-400 font-bold uppercase tracking-widest'>
            {targetUser?.isOnline ? 'Online' : 'Offline'}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto no-scrollbar p-4 space-y-1'>
        {messages.length === 0 && (
          <div className='text-center py-20'>
            <span className='material-icons-round text-4xl text-gray-200 mb-2'>
              chat_bubble_outline
            </span>
            <p className='text-xs text-gray-300 font-bold uppercase tracking-widest'>
              No messages yet
            </p>
            <p className='text-[10px] text-gray-400 mt-1'>Say hello!</p>
          </div>
        )}
        {Object.entries(groupedMessages).map(([date, msgs]: [string, any]) => (
          <div key={date}>
            <div className='text-center my-4'>
              <span className='text-[9px] font-bold text-gray-300 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full'>
                {date}
              </span>
            </div>
            {msgs.map((msg: ChatMessage) => {
              const isMine = msg.from === currentUsername
              return (
                <div
                  key={msg.id}
                  className={`flex mb-2 ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-2xl ${
                      isMine
                        ? 'bg-accent text-white rounded-br-md'
                        : 'bg-gray-100 text-black rounded-bl-md'
                    }`}
                  >
                    <p className='text-sm leading-relaxed'>{msg.text}</p>
                    <p
                      className={`text-[8px] mt-1 ${
                        isMine ? 'text-white/60' : 'text-gray-400'
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — only shown if still mutuals */}
      {isMutual !== false ? (
        <div className='p-4 bg-white border-t border-gray-100 flex gap-3'>
          <input
            placeholder='Type a message...'
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            className='flex-1 bg-gray-50 rounded-2xl px-5 py-4 text-sm outline-none shadow-inner'
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className='w-14 h-14 bg-accent text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-90 disabled:opacity-40'
          >
            <span className='material-icons-round'>send</span>
          </button>
        </div>
      ) : (
        <div className='p-4 bg-gray-50 border-t border-gray-100 text-center'>
          <p className='text-xs text-gray-400 font-medium'>
            You are no longer mutuals. Messages are read-only.
          </p>
        </div>
      )}
    </div>
  )
}
