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

  // Admin take-down is terminal: a taken-down book is never readable by anyone
  // but the author/admin (it is demonetized, so the paywall below would
  // otherwise treat it as "free" and serve it to existing library holders).
  if (book.takenDown === true && !isAuthor && !isAdmin) {
    throw new HttpsError('permission-denied', 'This book is no longer available.')
  }

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
      // Paid access keys ONLY off purchasedBookIds — the permanent entitlement
      // granted exclusively by the Stripe webhook / purchaseBooksWithPoints
      // (Admin SDK) and locked client-unwritable in firestore.rules. We do NOT
      // trust ownedBookIds here: that array is library membership and is
      // client-writable (save-to-library), so honouring it would let anyone
      // read a paid book for free by adding it to their library. Library
      // holders from BEFORE monetization are grandfathered into purchasedBookIds
      // server-side by the API's MonetizationEffectsService.onApproved (the
      // approve endpoint), so they keep access.
      owns = (u.purchasedBookIds || []).includes(bookId)
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
