// One-off: backdate a book's `publishedDate` (stored as a YYYY-MM-DD string,
// matching `new Date().toISOString().split('T')[0]` in the app). Used to satisfy
// the "published for at least N days" monetization gate.
//
// Run from functions/ with Admin credentials:
//   GOOGLE_APPLICATION_CREDENTIALS=../apps/api/service-account.json \
//     BOOK_ID=<id> DAYS_AGO=21 node scripts/setPublishedDate.mjs
//   DRY_RUN=1 ... node scripts/setPublishedDate.mjs   # preview only

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const BOOK_ID = process.env.BOOK_ID
const DAYS_AGO = Number(process.env.DAYS_AGO ?? '21')

if (!BOOK_ID) {
  console.error('[setPublishedDate] BOOK_ID env is required')
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

async function main() {
  const ref = db.collection('books').doc(BOOK_ID)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`[setPublishedDate] book ${BOOK_ID} not found`)
    process.exit(1)
  }
  const data = snap.data()

  const d = new Date()
  d.setUTCDate(d.getUTCDate() - DAYS_AGO)
  const nextDate = d.toISOString().split('T')[0]

  console.log(`[setPublishedDate] book: ${data.title || '(untitled)'} (${BOOK_ID})`)
  console.log(`[setPublishedDate] current publishedDate: ${data.publishedDate ?? '(none)'}`)
  console.log(`[setPublishedDate] new publishedDate: ${nextDate} (${DAYS_AGO} days ago)`)

  if (DRY_RUN) {
    console.log('[setPublishedDate] DRY RUN — no write')
    return
  }
  await ref.update({ publishedDate: nextDate })
  console.log('[setPublishedDate] updated ✓')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[setPublishedDate] FAILED', err)
    process.exit(1)
  })
