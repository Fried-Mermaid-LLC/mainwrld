// One-time backfill: copy the legacy `isExplicit` book flag into the new
// `isMature` field (isExplicit was renamed to isMature). Reads already fall
// back to `isMature ?? isExplicit`, so the app works without this; running it
// physically stamps `isMature` so the fallback can eventually be dropped.
//
// Idempotent: only touches book docs that don't already have a boolean
// `isMature`. Safe to re-run. Batched at 400 writes per commit.
//
// Run from the functions/ directory with Admin credentials:
//   # using a service-account key:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json node scripts/backfillMatureFlag.mjs
//   # or with gcloud Application Default Credentials:
//   gcloud auth application-default login && node scripts/backfillMatureFlag.mjs
//
// Preview without writing:
//   DRY_RUN=1 node scripts/backfillMatureFlag.mjs

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const BATCH_LIMIT = 400

initializeApp({ credential: applicationDefault() })
const db = getFirestore()

async function main() {
  console.log(`[backfillMatureFlag] starting${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`)
  const snap = await db.collection('books').get()
  console.log(`[backfillMatureFlag] scanned ${snap.size} book(s)`)

  let updated = 0
  let skipped = 0
  let batch = db.batch()
  let pending = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    // Already migrated (has a boolean isMature) → leave untouched.
    if (typeof data.isMature === 'boolean') {
      skipped++
      continue
    }
    const nextValue = !!data.isExplicit
    updated++
    if (DRY_RUN) continue

    batch.update(doc.ref, { isMature: nextValue })
    pending++
    if (pending >= BATCH_LIMIT) {
      await batch.commit()
      batch = db.batch()
      pending = 0
    }
  }

  if (!DRY_RUN && pending > 0) await batch.commit()

  console.log(
    `[backfillMatureFlag] done — ${updated} book(s) ${DRY_RUN ? 'would be updated' : 'updated'}, ${skipped} already had isMature`
  )
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[backfillMatureFlag] FAILED', err)
    process.exit(1)
  })
