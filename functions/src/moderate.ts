import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
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

// ---- Books / chapters ----
//
// Chapters live inside the book doc as an array per the existing schema
// (`chapters: [{ title, content, ... }]`). We re-moderate on every
// update because chapter text can change after publish. To avoid
// unbounded cost, we only check the *diff*: chapters whose content
// is new or changed since the previous version.

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
    const beforeChapters: Array<{ content?: string }> = before?.chapters ?? []
    const afterChapters: Array<{ content?: string }> = after.chapters ?? []
    const changedTexts: string[] = []
    afterChapters.forEach((ch, i) => {
      const newText = ch?.content ?? ''
      const oldText = beforeChapters[i]?.content ?? ''
      if (newText && newText !== oldText) changedTexts.push(newText)
    })
    // Also scan title/synopsis on create/update.
    const title = after.title as string | undefined
    const synopsis = after.synopsis as string | undefined
    if (title && title !== before?.title) changedTexts.push(title)
    if (synopsis && synopsis !== before?.synopsis) changedTexts.push(synopsis)
    if (changedTexts.length === 0) return
    // One request per changed text. For very long chapter content the
    // API truncates at its own limit; that is acceptable here.
    for (const text of changedTexts) {
      const verdict = await moderateText(text, key)
      if (!verdict.flagged) continue
      // Delete the offending book entirely — single chapters can't be
      // surgically removed without rewriting the chapters array.
      await event.data?.after.ref.delete()
      await logFlag(
        'Book',
        event.params.bookId,
        author,
        verdict.topCategory ?? 'unknown',
        verdict.score
      )
      logger.info('moderated book removed', {
        id: event.params.bookId,
        category: verdict.topCategory,
        score: verdict.score,
      })
      return
    }
  }
)
