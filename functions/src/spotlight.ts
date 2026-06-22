import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

// Star of the Week selection (X04). The single writer of appConfig/spotlight is
// this scheduled function — the client only reads it. Selection is deterministic
// (no Math.random) so the same data + same week yields the same pick, and a
// chosenIds round-robin gives week-to-week variety. Drafts are filtered in
// memory because an inequality query (where('isDraft','!=',true)) would EXCLUDE
// published books that simply omit the field.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Deterministic lifetime score: total chapter likes + favoritesTotal. `likes`
// may be a number[] (current) or number (legacy); handle both.
const scoreBook = (b: FirebaseFirestore.DocumentData): number => {
  const likes = Array.isArray(b.likes)
    ? b.likes.reduce((s: number, n: number) => s + (Number(n) || 0), 0)
    : Number(b.likes) || 0
  const favs = Number(b.favoritesTotal) || 0
  return likes + favs
}

const pickSpotlight = async () => {
  const db = getFirestore()
  const booksSnap = await db.collection('books').get()
  const candidates = booksSnap.docs
    .map(d => ({ id: (d.data().id as string) || d.id, data: d.data() }))
    .filter(c => !!c.id && c.data.isDraft !== true)
    .map(c => ({ ...c, score: scoreBook(c.data) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const da = new Date(a.data.publishedDate || 0).getTime()
      const dbb = new Date(b.data.publishedDate || 0).getTime()
      if (dbb !== da) return dbb - da
      return a.id < b.id ? -1 : 1 // final deterministic tie-break
    })
  if (candidates.length === 0) return

  const ref = db.doc('appConfig/spotlight')
  const cur = (await ref.get()).data() || {}
  const candidateIds = new Set(candidates.map(c => c.id))
  let chosenIds: string[] = Array.isArray(cur.chosenIds)
    ? cur.chosenIds.filter((id: string) => candidateIds.has(id))
    : []
  // Pick the highest-scoring book not yet featured this cycle; reset the cycle
  // once all candidates have been featured.
  let pick = candidates.find(c => !chosenIds.includes(c.id))
  if (!pick) {
    chosenIds = []
    pick = candidates[0]
  }

  await ref.set(
    {
      spotlightBookId: pick.id,
      weekEpoch: Math.floor(Date.now() / WEEK_MS),
      chosenIds: [...chosenIds, pick.id],
      score: pick.score,
      source: 'scheduled-fn',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  logger.info('spotlight rotated', { bookId: pick.id, score: pick.score })
}

export const rotateSpotlight = onSchedule(
  {
    schedule: 'every monday 09:00',
    timeZone: 'America/New_York',
    region: 'us-central1',
  },
  async () => {
    await pickSpotlight()
  }
)

// One-time bootstrap (onSchedule doesn't fire until the next Monday): an
// admin-gated callable that runs the same selection so the doc can be seeded
// right after deploy.
export const rotateSpotlightNow = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth?.token.admin)
      throw new HttpsError('permission-denied', 'Admin only')
    await pickSpotlight()
    return { ok: true }
  }
)
