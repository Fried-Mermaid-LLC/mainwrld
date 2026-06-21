import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// MainWRLD UGC moderation
//
// Apple App Review Guideline 1.2 requires apps with user-generated
// content to provide a way to filter objectionable material plus a
// mechanism to act on reports within 24h. The reports queue + block
// flow already exist client-side; this layer adds *automated*
// filtering so we don't depend on human triage for every comment.
//
// Approach: post-moderation. Content is published immediately, the
// trigger fires asynchronously, and flagged content is deleted with
// a record written to the `reports` collection for admin review.
// This trades a brief window of visibility for a much better UX than
// pre-moderation. Apple has accepted this pattern repeatedly.
//
// Backend: OpenAI Moderation API (free, no quota meaningful for an
// app of this scale). Set the key once before deploy:
//
//   firebase functions:secrets:set OPENAI_API_KEY
//
// If the secret is unset, the function logs a warning and skips
// moderation — better than failing closed because that would prevent
// any UGC from being published.

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

type ModerationCategoryScores = Record<string, number>
type ModerationResponse = {
  results?: Array<{
    flagged: boolean
    categories: Record<string, boolean>
    category_scores: ModerationCategoryScores
  }>
}

const moderateText = async (
  text: string,
  apiKey: string
): Promise<{ flagged: boolean; topCategory?: string; score?: number }> => {
  // Empty / whitespace-only never triggers moderation.
  if (!text || !text.trim()) return { flagged: false }
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  })
  if (!res.ok) {
    logger.warn('moderation api non-2xx', { status: res.status })
    return { flagged: false }
  }
  const data = (await res.json()) as ModerationResponse
  const r = data.results?.[0]
  if (!r) return { flagged: false }
  if (!r.flagged) return { flagged: false }
  // Pick the highest-scoring violating category for the audit record.
  const top = Object.entries(r.category_scores).sort(([, a], [, b]) => b - a)[0]
  return {
    flagged: true,
    topCategory: top?.[0],
    score: top?.[1],
  }
}

const logFlag = async (
  kind: 'Comment' | 'Book',
  targetId: string,
  authorUsername: string | undefined,
  reason: string,
  score: number | undefined
) => {
  const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await getFirestore().collection('reports').add({
    id,
    type: kind,
    targetId,
    reportedBy: 'system',
    reason: `auto-moderation: ${reason}${score ? ` (${score.toFixed(3)})` : ''}`,
    authorUsername: authorUsername ?? null,
    timestamp: new Date().toISOString(),
    status: 'resolved',
    autoModerated: true,
    createdAt: FieldValue.serverTimestamp(),
  })
}

// ---- Comments ----

export const moderateCommentOnCreate = onDocumentCreated(
  {
    region: 'us-central1',
    document: 'comments/{commentId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    if (!key) {
      logger.warn('OPENAI_API_KEY unset — skipping comment moderation')
      return
    }
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const text = String(data?.text ?? '')
    const author = data?.authorUsername as string | undefined
    const verdict = await moderateText(text, key)
    if (!verdict.flagged) return
    await snap.ref.delete()
    await logFlag('Comment', event.params.commentId, author, verdict.topCategory ?? 'unknown', verdict.score)
    logger.info('moderated comment removed', {
      id: event.params.commentId,
      category: verdict.topCategory,
      score: verdict.score,
    })
  }
)

// ---- Books: title / synopsis (+ legacy inline chapters) ----
//
// Since schema 2, chapter bodies move to the books/{id}/chapters subcollection
// (see moderateChapterOnWrite below). This trigger moderates the metadata that
// still lives on the book doc — title and synopsis — AND, during the transition,
// any legacy inline `chapters[]` content written by old clients that haven't
// migrated yet. The inline check is a no-op for schema-2 books (no array), and
// can be removed once all old clients are gone. A violation deletes the whole
// book (and its chapter subcollection) via recursiveDelete.

export const moderateBookOnWrite = onDocumentUpdated(
  {
    region: 'us-central1',
    document: 'books/{bookId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    if (!key) {
      logger.warn('OPENAI_API_KEY unset — skipping book moderation')
      return
    }
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!after) return
    const author = after.authorUsername as string | undefined
    const changedTexts: string[] = []
    const title = after.title as string | undefined
    const synopsis = after.synopsis as string | undefined
    if (title && title !== before?.title) changedTexts.push(title)
    if (synopsis && synopsis !== before?.synopsis) changedTexts.push(synopsis)
    // Transitional: moderate changed legacy inline chapter bodies too.
    const beforeChapters: Array<{ content?: string }> = before?.chapters ?? []
    const afterChapters: Array<{ content?: string }> = after.chapters ?? []
    afterChapters.forEach((ch, i) => {
      const newText = ch?.content ?? ''
      const oldText = beforeChapters[i]?.content ?? ''
      if (newText && newText !== oldText) changedTexts.push(newText)
    })
    if (changedTexts.length === 0) return
    for (const text of changedTexts) {
      const verdict = await moderateText(text, key)
      if (!verdict.flagged) continue
      // Cascade-delete the book and its chapter subcollection.
      await getFirestore().recursiveDelete(event.data!.after.ref)
      await logFlag(
        'Book',
        event.params.bookId,
        author,
        verdict.topCategory ?? 'unknown',
        verdict.score
      )
      logger.info('moderated book removed (metadata)', {
        id: event.params.bookId,
        category: verdict.topCategory,
        score: verdict.score,
      })
      return
    }
  }
)

// ---- Chapters (schema 2 subcollection) ----
//
// Chapter bodies now live in books/{bookId}/chapters/{chapterId}. We moderate on
// every write where the content changed (create or edit). A violation deletes the
// whole parent book (and all its chapters) — keeping the previous take-down
// semantics. authorUsername is denormalized onto the chapter doc so we can log
// the flag without re-reading the parent.

export const moderateChapterOnWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'books/{bookId}/chapters/{chapterId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    if (!key) {
      logger.warn('OPENAI_API_KEY unset — skipping chapter moderation')
      return
    }
    const after = event.data?.after.data()
    if (!after) return // deletion — nothing to moderate
    const before = event.data?.before.data()
    const newText = String(after.content ?? '')
    const oldText = String(before?.content ?? '')
    // Also catch a changed chapter title.
    const texts: string[] = []
    if (newText && newText !== oldText) texts.push(newText)
    if (after.title && after.title !== before?.title) texts.push(String(after.title))
    if (texts.length === 0) return

    const author = after.authorUsername as string | undefined
    const bookId = event.params.bookId
    for (const text of texts) {
      const verdict = await moderateText(text, key)
      if (!verdict.flagged) continue
      // Cascade-delete the parent book and all its chapters.
      const bookRef = getFirestore().collection('books').doc(bookId)
      await getFirestore().recursiveDelete(bookRef)
      await logFlag(
        'Book',
        bookId,
        author,
        verdict.topCategory ?? 'unknown',
        verdict.score
      )
      logger.info('moderated book removed (chapter)', {
        id: bookId,
        chapterId: event.params.chapterId,
        category: verdict.topCategory,
        score: verdict.score,
      })
      return
    }
  }
)
