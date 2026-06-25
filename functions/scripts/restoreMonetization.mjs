// One-off (test data): restore a book to a clean monetized state and clear the
// permanent-demonetization lock that an unpublish-while-monetized stamped on it
// (see demonetizePatch in books.service.ts). Lets the book sell again.
//
// Run from functions/ with Admin credentials:
//   GOOGLE_APPLICATION_CREDENTIALS=../apps/api/service-account.json \
//     BOOK_ID=<id> PRICE=9.99 node scripts/restoreMonetization.mjs
//   DRY_RUN=1 ... node scripts/restoreMonetization.mjs   # preview only

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const BOOK_ID = process.env.BOOK_ID
const PRICE = Number(process.env.PRICE ?? '9.99')

if (!BOOK_ID) {
  console.error('[restoreMonetization] BOOK_ID env is required')
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

async function main() {
  const ref = db.collection('books').doc(BOOK_ID)
  const snap = await ref.get()
  if (!snap.exists) {
    console.error(`[restoreMonetization] book ${BOOK_ID} not found`)
    process.exit(1)
  }
  const d = snap.data()
  console.log(`[restoreMonetization] book: ${d.title || '(untitled)'} (${BOOK_ID})`)
  console.log('[restoreMonetization] before:', {
    isMonetized: d.isMonetized,
    isFree: d.isFree,
    price: d.price,
    monetizationStatus: d.monetizationStatus,
    permanentlyDemonetized: d.permanentlyDemonetized,
    wasMonetizedBefore: d.wasMonetizedBefore,
    monetizationAttempts: d.monetizationAttempts,
  })

  const patch = {
    isMonetized: true,
    isFree: false,
    price: PRICE,
    monetizationStatus: 'monetized',
    permanentlyDemonetized: false,
    wasMonetizedBefore: false,
    monetizationAttempts: 0,
  }
  console.log('[restoreMonetization] after:', patch)

  if (DRY_RUN) {
    console.log('[restoreMonetization] DRY RUN — no write')
    return
  }
  await ref.update(patch)
  console.log('[restoreMonetization] updated ✓')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[restoreMonetization] FAILED', err)
    process.exit(1)
  })
