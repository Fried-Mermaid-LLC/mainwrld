import { useState, useEffect } from 'react'
import * as fbService from '@/services/firebaseService'
import { containsProfanity } from '@/config/profanity'
import type { Comment, User, Book, NotificationCategory } from '@/types'

interface CommentsDeps {
  user: User
  firebaseUid: string | null
  selectedBook: Book | null
  registeredUsers: any[]
  showToast: (message: string, icon?: string) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string, category?: NotificationCategory
  ) => void
}

// Comments domain (Phase B). Owns allComments + its Firestore subscription,
// postComment and handleLikeComment. Placed after useRewards so handleLikeComment
// can use awardPoints/rewardedItems. (handleRemoveComment stays in AppProvider —
// it touches admin `reports` and will move with useAdmin.) Bodies verbatim.
export function useComments({
  user, firebaseUid, selectedBook, registeredUsers, showToast,
  addNotification
}: CommentsDeps) {
  const [allComments, setAllComments] = useState<Comment[]>([])

  // Subscribe to comments
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToComments((comments: any[]) => {
      setAllComments(
        comments.map(c => ({
          id: c.id || c.commentId || c.docId,
          bookId: c.bookId,
          chapterIndex: c.chapterIndex,
          author: c.author,
          authorUsername: c.authorUsername,
          text: c.text,
          likes: c.likes || 0,
          likedBy: c.likedBy || [],
          timestamp: c.timestamp || 'Now'
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  const postComment = async (text: string, chapterIndex?: number) => {
    if (selectedBook?.commentsEnabled === false) {
      showToast('Comments Disabled')
      return
    }
    if (!selectedBook?.id) {
      showToast('No book selected for comment.', 'error')
      return
    }
    // Profanity blocked client-side (instant); the server
    // (moderateCommentOnCreate) re-checks profanity + OpenAI authoritatively.
    if (containsProfanity(text)) {
      showToast('Your comment contains inappropriate language.', 'warning')
      return
    }

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      bookId: selectedBook.id,
      chapterIndex,
      author: user.displayName,
      authorUsername: user.username,
      text,
      likes: 0,
      likedBy: [] as string[],
      timestamp: new Date().toISOString()
    }

    try {
      setAllComments(prev => [...prev, newComment as any])
      const createdCommentId = await fbService.addCommentDoc(newComment)

      const chapterMetaEntry =
        chapterIndex !== undefined
          ? selectedBook.chapterMeta?.[chapterIndex]
          : undefined
      const chapterName = chapterMetaEntry
        ? ` (${chapterMetaEntry.title})`
        : ''
      // Don't notify yourself about commenting on your own book.
      if (selectedBook.author.username !== user.username) {
        addNotification(
          'New Comment',
          `${user.displayName} commented on "${selectedBook.title}"${chapterName}`,
          'chat_bubble',
          selectedBook.author.username,
          user.username,
          selectedBook.id,
          chapterIndex,
          createdCommentId || newComment.id,
          'comments'
        )
      }

      showToast('Your comment has been successfully added.')
    } catch (error) {
      setAllComments(prev => prev.filter(c => c.id !== newComment.id))
      console.error(error)
      showToast('Failed to post comment. Please try again.', 'error')
    }
  }

  const handleLikeComment = async (commentId: string) => {
    const comment = allComments.find(c => c.id === commentId)
    if (!comment) return
    // Can't like your own comment (self-endorsement; the server strips it too,
    // and this avoids a "X liked your comment" self-notification).
    if ((comment as any).authorUsername === user.username) return
    const likedBy = comment.likedBy || []
    if (likedBy.includes(user.username)) return // Already liked
    const newLikes = comment.likes + 1
    const updatedLikedBy = [...likedBy, user.username]
    setAllComments(prev =>
      prev.map(c =>
        c.id === commentId
          ? { ...c, likes: newLikes, likedBy: updatedLikedBy }
          : c
      )
    )
    try {
      await fbService.updateComment(commentId, {
        likes: newLikes,
        likedBy: updatedLikedBy
      })
    } catch (error) {
      setAllComments(prev =>
        prev.map(c =>
          c.id === commentId ? { ...c, likes: comment.likes, likedBy } : c
        )
      )
      console.error(error)
      showToast('Failed to like comment. Please try again.', 'error')
      return
    }
    const recipientUsername =
      (comment as any).authorUsername ||
      registeredUsers.find((u: any) => u.displayName === comment.author)
        ?.username ||
      comment.author
    addNotification(
      'Comment Liked',
      `${user.displayName} liked your comment: "${comment.text.substring(
        0,
        20
      )}..."`,
      'favorite_border',
      recipientUsername,
      user.username,
      comment.bookId,
      comment.chapterIndex,
      comment.id,
      'comments'
    )
    // Points + the 50-like milestone notification are awarded server-side now
    // (comments.update → RewardsService), so the author is credited for likes
    // from any user — not just the dead self-like path this used to (never) hit.
  }

  return { allComments, setAllComments, postComment, handleLikeComment }
}
