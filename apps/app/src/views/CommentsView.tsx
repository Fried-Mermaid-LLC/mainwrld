import React, { useState, useEffect, useRef } from 'react'
import type { Comment } from '@/types'
import { useApp } from '@/state/AppContext'

export const CommentsView = () => {
  const {
    allComments,
    selectedBook,
    registeredUsers,
    MUTUALS,
    blockedUsers,
    postComment,
    setScrollToCommentId,
    setView,
    handleReport,
    handleLikeComment,
    user,
    readingChapterIndex,
    scrollToCommentId
  } = useApp()
  const comments = allComments.filter(c => {
    if (c.bookId !== selectedBook?.id) return false
    // Filter out comments by blocked users (match by displayName)
    const commentAuthor =
      registeredUsers.find(u => u.displayName === c.author) ||
      MUTUALS.find(u => u.displayName === c.author)
    if (commentAuthor && blockedUsers.has(commentAuthor.username))
      return false
    return true
  })
  const onPost = postComment
  const onBack = () => {
    setScrollToCommentId(null)
    setView('reading')
  }
  const onReport = (id: string) => handleReport('Comment', id)
  const onLikeComment = handleLikeComment
  const currentUsername = user.username
  // chapterMeta carries the light per-chapter list (id + title); only
  // length/title are read here.
  const chapters = (selectedBook?.chapterMeta ?? []) as { title?: string }[]
  const initialChapterIndex = readingChapterIndex
  const onScrolledTo = () => setScrollToCommentId(null)
  const [newText, setNewText] = useState('')
  const [activeChapter, setActiveChapter] =
    useState<number>(initialChapterIndex)
  const commentsContainerRef = useRef<HTMLDivElement>(null)

  // Filter comments for the selected chapter
  // Comments without chapterIndex (legacy) are treated as belonging to chapter 0
  const filteredComments =
    chapters.length > 0
      ? comments.filter((c: any) => (c.chapterIndex ?? 0) === activeChapter)
      : comments

  // Scroll to a specific comment when scrollToCommentId is set
  useEffect(() => {
    if (scrollToCommentId && commentsContainerRef.current) {
      const commentElement = document.getElementById(
        `comment-${scrollToCommentId}`
      )
      if (commentElement) {
        commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Highlight the comment briefly
        commentElement.classList.add('ring-2', 'ring-accent')
        setTimeout(() => {
          commentElement.classList.remove('ring-2', 'ring-accent')
          onScrolledTo && onScrolledTo()
        }, 2000)
      }
    }
  }, [scrollToCommentId, onScrolledTo])

  const handlePost = () => {
    if (newText.trim()) {
      onPost(newText, chapters.length > 0 ? activeChapter : undefined)
      setNewText('')
    }
  }

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto p-6 animate-in slide-in-from-bottom duration-500 z-[400]'>
      <header className='flex justify-between items-center mb-1 sticky top-0 bg-white py-2 z-10'>
        <div>
          <h1 className='text-xl font-bold'>Comments</h1>
          {chapters.length > 0 && (
            <p className='text-xs text-teal-600 font-semibold uppercase tracking-wide'>
              For this chapter
            </p>
          )}
        </div>
        <button
          onClick={onBack}
          className='w-10 h-10 text-gray-300 transition-transform active:scale-90'
        >
          <span className='material-icons-round'>close</span>
        </button>
      </header>

      <div className='space-y-6 pb-32' ref={commentsContainerRef}>
        {filteredComments.map((c: any) => {
          const hasLiked = (c.likedBy || []).includes(currentUsername)
          return (
            <div
              key={c.id}
              id={`comment-${c.id}`}
              className='p-5 bg-gray-50 rounded-3xl space-y-3 border border-gray-100 group relative transition-all'
            >
              <div className='flex justify-between'>
                <span className='text-xs font-bold text-accent'>
                  {c.author}
                </span>
                <span className='text-[9px] font-bold text-gray-300 uppercase'>
                  {c.timestamp}
                </span>
              </div>
              <p className='text-sm leading-relaxed'>{c.text}</p>
              <div className='flex gap-4 pt-2'>
                <button
                  onClick={() => onLikeComment(c.id)}
                  className={`flex items-center gap-1.5 transition-all active:scale-90 ${
                    hasLiked ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={hasLiked}
                >
                  <span
                    className={`material-icons-round text-sm ${
                      hasLiked ? 'text-accent' : 'text-gray-300'
                    }`}
                  >
                    thumb_up
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      hasLiked ? 'text-accent' : 'text-gray-400'
                    }`}
                  >
                    {c.likes}
                  </span>
                </button>
                <button
                  onClick={() => onReport(c.id)}
                  className='flex items-center gap-1.5 transition-all active:scale-90 group'
                >
                  <span className='material-icons-round text-sm text-gray-200 group-active:text-red-500'>
                    report
                  </span>
                  <span className='text-[10px] font-bold text-gray-400'>
                    Report
                  </span>
                </button>
              </div>
            </div>
          )
        })}
        {filteredComments.length === 0 && (
          <div className='text-center py-20 text-gray-200 font-bold uppercase tracking-widest text-[10px]'>
            {chapters.length > 0
              ? `No comments on this chapter yet`
              : 'Be the first to comment'}
          </div>
        )}
      </div>
      <div className='fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-50 flex gap-4'>
        <input
          placeholder={
            chapters.length > 0
              ? `Comment on ${
                  chapters[activeChapter]?.title || 'this chapter'
                }...`
              : 'Add a comment...'
          }
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handlePost()}
          className='flex-1 bg-gray-50 rounded-2xl px-5 py-4 text-sm outline-none shadow-inner'
        />
        <button
          onClick={handlePost}
          className='w-14 h-14 bg-accent text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-90'
        >
          <span className='material-icons-round'>send</span>
        </button>
      </div>
    </div>
  )
}
