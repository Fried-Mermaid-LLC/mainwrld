/**
 * One-time backfill (F08): set `senderIsPremium` on every existing chatMessages
 * doc that lacks it. Firestore `== false` does NOT match docs missing the field,
 * so without this the pruneExpiredMessages function would retain all pre-F08
 * messages forever. We stamp the sender's CURRENT premium status (best available
 * proxy for the point-in-time snapshot on legacy docs); default false.
 *
 * Run once:  node scripts/backfill-senderIsPremium.cjs
 */
const admin = require('firebase-admin')
const serviceAccount = require('../service-account.json')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

async function main() {
  // username -> isPremium
  const usersSnap = await db.collection('users').get()
  const premiumByUsername = new Map()
  for (const d of usersSnap.docs) {
    const u = d.data()
    if (u.username) premiumByUsername.set(u.username, u.isPremium === true)
  }
  console.log(`loaded ${premiumByUsername.size} users`)

  const msgsSnap = await db.collection('chatMessages').get()
  console.log(`scanning ${msgsSnap.size} chatMessages`)

  let updated = 0
  let skipped = 0
  let batch = db.batch()
  let inBatch = 0

  for (const doc of msgsSnap.docs) {
    const data = doc.data()
    if (typeof data.senderIsPremium === 'boolean') {
      skipped++
      continue
    }
    const isPremium = premiumByUsername.get(data.from) === true
    batch.update(doc.ref, { senderIsPremium: isPremium })
    inBatch++
    updated++
    if (inBatch === 500) {
      await batch.commit()
      batch = db.batch()
      inBatch = 0
    }
  }
  if (inBatch > 0) await batch.commit()

  console.log(`done: updated=${updated} alreadySet=${skipped}`)
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
