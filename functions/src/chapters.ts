import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

const REGION = 'us-central1'

// Reader-facing gateway for chapter bodies. After chapters moved out of the book
// document into books/{bookId}/chapters/{chapterId}, the security rules only let
// the author/admin read those docs directly — everyone else must come through
// here so the paywall is enforced server-side (clients can no longer just read
// the bodies). Mirrors the client access rule in ReadingView:
//   author/admin → full access
//   free or unmonetized book → full access
//   preview chapter (order 0) → always readable
//   purchased/owned book → full access
//   otherwise → permission-denied
export const getChapterContent = onCall<
  { bookId: string; chapterId: string },
  Promise<{ title: string; content: string }>
>({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const uid = req.auth.uid
  const { bookId, chapterId } = req.data || ({} as any)
  if (!bookId || !chapterId) {
    throw new HttpsError('invalid-argument', 'bookId and chapterId required.')
  }

  const db = getFirestore()
  const bookSnap = await db.collection('books').doc(bookId).get()
  if (!bookSnap.exists) throw new HttpsError('not-found', 'Book not found.')
  const book = bookSnap.data() as any

  const chapterSnap = await db
    .collection('books')
    .doc(bookId)
    .collection('chapters')
    .doc(chapterId)
    .get()
  if (!chapterSnap.exists) throw new HttpsError('not-found', 'Chapter not found.')
  const chapter = chapterSnap.data() as any

  const isAdmin = req.auth.token.admin === true
  const isAuthor = book.authorUid === uid
  // Position in the book = index in chapterMeta (the source of truth for order),
  // so deleting a middle chapter never requires renumbering chapter docs.
  const meta: Array<{ id: string }> = book.chapterMeta || []
  const order = meta.findIndex((m) => m.id === chapterId)
  const chaptersCount = book.chaptersCount || 0

  // Non-authors can never read unpublished (draft) chapters — those sit beyond
  // the published prefix [0, chaptersCount). order === -1 means the chapter is
  // not in the published meta at all.
  if (!isAuthor && !isAdmin && (order < 0 || order >= chaptersCount)) {
    throw new HttpsError('permission-denied', 'Chapter not available.')
  }

  if (!isAuthor && !isAdmin) {
    const isFreeOrUnmonetized = book.isFree === true || book.isMonetized !== true
    const isPreview = order === 0
    let owns = false
    if (!isFreeOrUnmonetized && !isPreview) {
      const userSnap = await db.collection('users').doc(uid).get()
      const u = (userSnap.data() as any) || {}
      const owned = new Set<string>([
        ...(u.ownedBookIds || []),
        ...(u.purchasedBookIds || []),
      ])
      owns = owned.has(bookId)
    }
    if (!isFreeOrUnmonetized && !isPreview && !owns) {
      throw new HttpsError('permission-denied', 'Purchase required to read this chapter.')
    }
  }

  logger.info('getChapterContent', { uid, bookId, chapterId, order })
  return {
    title: String(chapter.title ?? ''),
    content: String(chapter.content ?? ''),
  }
})
