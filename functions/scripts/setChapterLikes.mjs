// One-off: set per-chapter likes for a single book. Chapter likes live in the
// book doc's `likes` array (indexed by chapter position); see
// minLikesPerPublishedChapter in the app. Sets every slot to LIKES.
//
// Run from functions/ with Admin credentials:
//   GOOGLE_APPLICATION_CREDENTIALS=../apps/api/service-account.json \
//     BOOK_ID=<id> LIKES=100 node scripts/setChapterLikes.mjs
//   DRY_RUN=1 ... node scripts/setChapterLikes.mjs   # preview only

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const BOOK_ID = process.env.BOOK_ID
const LIKES = Number(process.env.LIKES ?? '100')

if (!BOOK_ID) {
  console.error('[setChapterLikes] BOOK_ID env is required')
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

async function main() {
  const ref = db.collection('books').doc(BOOK_ID)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`[setChapterLikes] book ${BOOK_ID} not found`)
    process.exit(1)
  }
  const data = snap.data()
  const metaLen = Array.isArray(data.chapterMeta) ? data.chapterMeta.length : 0
  const count = data.chaptersCount || 0
  const len = Math.max(metaLen, count)
  const currentLikes = Array.isArray(data.likes) ? data.likes : [data.likes ?? 0]

  console.log(`[setChapterLikes] book: ${data.title || '(untitled)'} (${BOOK_ID})`)
  console.log(`[setChapterLikes] chapterMeta=${metaLen} chaptersCount=${count} → ${len} slot(s)`)
  console.log(`[setChapterLikes] current likes: ${JSON.stringify(currentLikes)}`)

  if (len === 0) {
    console.error('[setChapterLikes] book has no chapters — nothing to do')
    process.exit(1)
  }

  const nextLikes = Array.from({ length: len }, () => LIKES)
  console.log(`[setChapterLikes] new likes: ${JSON.stringify(nextLikes)}`)

  if (DRY_RUN) {
    console.log('[setChapterLikes] DRY RUN — no write')
    return
  }
  await ref.update({ likes: nextLikes })
  console.log('[setChapterLikes] updated ✓')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[setChapterLikes] FAILED', err)
    process.exit(1)
  })
