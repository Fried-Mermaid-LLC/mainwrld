import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { containsProfanity } from './profanity.js'

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
// Two layers: (1) a curated profanity filter (obscenity, ./profanity.js) that
// always runs and (2) the OpenAI classifier for hate/harassment/sexual/violent
// content, which runs when OPENAI_API_KEY is set. If the key is unset, only the
// profanity layer applies (we never fail closed and block all UGC). The
// profanity layer is applied to identity/metadata/social text (usernames,
// display names, comments, chat, book titles/synopses, chapter titles) but NOT
// to chapter body prose, where swearing in creative fiction is legitimate and
// only the OpenAI layer applies.

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

type ModerationCategoryScores = Record<string, number>
type ModerationResponse = {
  results?: Array<{
    flagged: boolean
    categories: Record<string, boolean>
    category_scores: ModerationCategoryScores
  }>
}

// OpenAI moderation categories that are NEVER allowed, even in a work the
// author flagged as Mature. Mature fiction may contain sexual/violent themes,
// but child sexual content, illegal content, hate, harassment, and self-harm
// promotion are always rejected. (Kept in sync with
// apps/api/src/modules/moderation/moderation.service.ts — functions cannot
// import from apps/api.)
const ALWAYS_BLOCKED = new Set<string>([
  'sexual/minors',
  'illicit',
  'illicit/violent',
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'self-harm',
  'self-harm/intent',
  'self-harm/instructions',
])

const moderateText = async (
  text: string,
  apiKey: string,
  mature = false
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
  const active = Object.entries(r.categories)
    .filter(([, on]) => on)
    .map(([cat]) => cat)
  // Mature works: only always-blocked categories are violations (sexual/violent
  // themes are permitted). Non-mature works: any flagged category is a violation
  // — the author can flag the work Mature to allow mature themes.
  const violating = mature
    ? active.filter((cat) => ALWAYS_BLOCKED.has(cat))
    : active
  if (violating.length === 0) return { flagged: false }
  // Pick the highest-scoring violating category for the audit record.
  const top = violating
    .map((cat) => [cat, r.category_scores[cat] ?? 0] as const)
    .sort(([, a], [, b]) => b - a)[0]
  return {
    flagged: true,
    topCategory: top?.[0],
    score: top?.[1],
  }
}

// Combined verdict: the profanity layer (optional, on by default) plus the
// OpenAI layer. Set checkProfanity=false for chapter body prose so legitimate
// swearing in fiction is not removed (OpenAI still screens it).
const screen = async (
  text: string,
  apiKey: string,
  checkProfanity = true,
  mature = false
): Promise<{ flagged: boolean; topCategory?: string; score?: number }> => {
  if (checkProfanity && containsProfanity(text))
    return { flagged: true, topCategory: 'profanity' }
  if (!apiKey) return { flagged: false }
  return moderateText(text, apiKey, mature)
}

const logFlag = async (
  kind: 'Comment' | 'Book' | 'Chat',
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
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const text = String(data?.text ?? '')
    const author = data?.authorUsername as string | undefined
    const verdict = await screen(text, key)
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

// ---- Books: title / synopsis ----
//
// Chapter bodies live in the books/{id}/chapters subcollection (see
// moderateChapterOnWrite below). This trigger only moderates the metadata that
// still lives on the book doc — title and synopsis. This is a BACKSTOP: the API
// already rejects flagged writes pre-publish (books.service.screenMetadata). A
// violation here does NOT delete the book — it reverts it to a draft so it
// leaves discovery while the author's work is preserved. Mature-aware so a work
// flagged Mature isn't unpublished for permitted sexual/violent themes.

export const moderateBookOnWrite = onDocumentUpdated(
  {
    region: 'us-central1',
    document: 'books/{bookId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    const before = event.data?.before.data()
    const after = event.data?.after.data()
    if (!after) return
    const author = after.authorUsername as string | undefined
    const mature = (after.isMature ?? after.isExplicit) === true
    const changedTexts: string[] = []
    const title = after.title as string | undefined
    const synopsis = after.synopsis as string | undefined
    if (title && title !== before?.title) changedTexts.push(title)
    if (synopsis && synopsis !== before?.synopsis) changedTexts.push(synopsis)
    if (changedTexts.length === 0) return
    for (const text of changedTexts) {
      // Title + synopsis are public-facing metadata → profanity layer applies.
      const verdict = await screen(text, key, true, mature)
      if (!verdict.flagged) continue
      // Unpublish (revert to draft) instead of deleting — setting isDraft does
      // not change title/synopsis, so the re-trigger returns early (no loop).
      if (after.isDraft !== true)
        await event.data!.after.ref.update({ isDraft: true })
      await logFlag(
        'Book',
        event.params.bookId,
        author,
        verdict.topCategory ?? 'unknown',
        verdict.score
      )
      logger.info('moderated book unpublished (metadata)', {
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
// every write where the content changed (create or edit). This is a BACKSTOP:
// the API already rejects flagged chapter writes pre-publish
// (chapters.service.commitWrite → assertClean). A violation here does NOT delete
// the book — it reverts the parent to a draft so it leaves discovery while the
// work is preserved. Mature-aware (reads the parent book's mature flag) so a
// Mature work isn't unpublished for permitted sexual/violent themes.

export const moderateChapterOnWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'books/{bookId}/chapters/{chapterId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    const after = event.data?.after.data()
    if (!after) return // deletion — nothing to moderate
    const before = event.data?.before.data()
    const newText = String(after.content ?? '')
    const oldText = String(before?.content ?? '')
    // Body prose: OpenAI only (no profanity layer — swearing in fiction is OK).
    // Chapter title: public-facing metadata → profanity layer applies.
    const texts: Array<{ text: string; checkProfanity: boolean }> = []
    if (newText && newText !== oldText)
      texts.push({ text: newText, checkProfanity: false })
    if (after.title && after.title !== before?.title)
      texts.push({ text: String(after.title), checkProfanity: true })
    if (texts.length === 0) return

    const author = after.authorUsername as string | undefined
    const bookId = event.params.bookId
    // Mature flag lives on the parent book, not the chapter doc.
    const bookRef = getFirestore().collection('books').doc(bookId)
    const bookData = (await bookRef.get()).data() ?? {}
    const mature = (bookData.isMature ?? bookData.isExplicit) === true
    for (const { text, checkProfanity } of texts) {
      const verdict = await screen(text, key, checkProfanity, mature)
      if (!verdict.flagged) continue
      // Unpublish the parent book (revert to draft) instead of deleting it.
      if (bookData.isDraft !== true) await bookRef.update({ isDraft: true })
      await logFlag(
        'Book',
        bookId,
        author,
        verdict.topCategory ?? 'unknown',
        verdict.score
      )
      logger.info('moderated book unpublished (chapter)', {
        id: bookId,
        chapterId: event.params.chapterId,
        category: verdict.topCategory,
        score: verdict.score,
      })
      return
    }
  }
)

// ---- Chat messages ----
//
// The client no longer pre-filters chat with a word list (X08); moderation is
// fully OpenAI-driven here. Post-moderation: a flagged message is deleted right
// after the write, mirroring comment moderation. (Revise-not-delete UX is F08's
// concern.)

export const moderateChatMessageOnCreate = onDocumentCreated(
  {
    region: 'us-central1',
    document: 'chatMessages/{messageId}',
    secrets: [OPENAI_API_KEY],
  },
  async (event) => {
    const key = OPENAI_API_KEY.value()
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const text = String(data?.text ?? '')
    const author = data?.from as string | undefined
    const verdict = await screen(text, key)
    if (!verdict.flagged) return
    await snap.ref.delete()
    await logFlag('Chat', event.params.messageId, author, verdict.topCategory ?? 'unknown', verdict.score)
    logger.info('moderated chat message removed', {
      id: event.params.messageId,
      category: verdict.topCategory,
      score: verdict.score,
    })
  }
)

// ---- Signup username / display name ----
//
// The client calls this synchronously BEFORE creating the account and rejects a
// flagged name (instead of tearing down a created account on a false positive).
// Unauthenticated by design (the user has no account yet). The profanity layer
// always runs; OpenAI runs additionally when the key is set.

export const moderateUsername = onCall(
  { region: 'us-central1', secrets: [OPENAI_API_KEY] },
  async (req) => {
    const key = OPENAI_API_KEY.value()
    const username = String((req.data as any)?.username ?? '')
    const displayName = String((req.data as any)?.displayName ?? '')
    const combined = `${username} ${displayName}`.trim()
    const verdict = await screen(combined, key)
    return { flagged: verdict.flagged, category: verdict.topCategory ?? null }
  }
)
