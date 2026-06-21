#!/usr/bin/env node
// One-off data migration to schema 2 (MainWRLD).
//
// Moves chapter bodies out of each books/{id} document into the
// books/{id}/chapters/{chapterId} subcollection, uploads inlined base64 covers
// to Firebase Storage, and stamps the book with `chapterMeta` + `schemaVersion: 2`.
//
// IMPORTANT: this pass does NOT delete the legacy `chapters` / `content` fields.
// Old clients still read them during the transition. Run the separate cleanup
// pass (cleanupLegacy=true) only AFTER the new client is fully rolled out.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate.mjs --dry-run
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate.mjs --limit=2          # migrate only first 2 books
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate.mjs                     # full run
//   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
//     node scripts/migrate.mjs --cleanup-legacy    # drop chapters/content (final)
//
// Requires firebase-admin (already a dep in functions/). Run from repo root:
//   node --experimental-vm-modules scripts/migrate.mjs   (Node 18+ has fetch/crypto)

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const CLEANUP_LEGACY = args.includes('--cleanup-legacy')
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith('--limit='))
  return a ? parseInt(a.split('=')[1], 10) : Infinity
})()

// Resolve the Storage bucket: explicit env wins, else read it from .env.local
// (the same VITE_FIREBASE_STORAGE_BUCKET the web app uses).
const resolveBucket = () => {
  if (process.env.FIREBASE_STORAGE_BUCKET) return process.env.FIREBASE_STORAGE_BUCKET
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const m = /^VITE_FIREBASE_STORAGE_BUCKET=(.+)$/m.exec(env)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch {
    /* no .env.local — fall through */
  }
  return undefined
}

const storageBucket = resolveBucket()
initializeApp({ credential: applicationDefault(), storageBucket })
const db = getFirestore()
const bucket = getStorage().bucket()

const log = (...a) => console.log('[migrate]', ...a)

// Decode a data:image/...;base64,xxxx URL into { buffer, contentType }.
const decodeDataUrl = (dataUrl) => {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) return null
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') }
}

// Upload a cover buffer and return a Firebase-style download URL + storage path.
const uploadCover = async (authorUid, bookId, dataUrl) => {
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return null
  const token = randomUUID()
  const path = `book-covers/${authorUid}/${bookId}/${randomUUID()}.jpg`
  const file = bucket.file(path)
  await file.save(decoded.buffer, {
    metadata: {
      contentType: decoded.contentType || 'image/jpeg',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  })
  const url = `https://firebasestorage.googleapis.com/v0/b/${
    bucket.name
  }/o/${encodeURIComponent(path)}?alt=media&token=${token}`
  return { url, path }
}

const migrateBook = async (docSnap) => {
  const book = docSnap.data()
  const bookId = docSnap.id
  const authorUid = book.authorUid || 'unknown'
  const authorUsername = book.authorUsername || book.author?.username || ''

  if (CLEANUP_LEGACY) {
    if (book.schemaVersion !== 2) {
      log(`skip cleanup (not schema 2): ${bookId}`)
      return 'skipped'
    }
    if (book.chapters === undefined && book.content === undefined) return 'skipped'
    log(`cleanup legacy fields: ${bookId}`)
    if (!DRY_RUN) {
      await docSnap.ref.update({
        chapters: FieldValue.delete(),
        content: FieldValue.delete(),
      })
    }
    return 'cleaned'
  }

  if (book.schemaVersion === 2) return 'skipped'

  const inline = Array.isArray(book.chapters) ? book.chapters : []
  const chapterMeta = []
  const batch = db.batch()

  inline.forEach((ch, i) => {
    const id = randomUUID()
    const title = ch?.title || `Chapter ${i + 1}`
    chapterMeta.push({ id, title })
    batch.set(docSnap.ref.collection('chapters').doc(id), {
      content: ch?.content || '',
      order: i,
      title,
      authorUsername,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  // Cover: only migrate inlined base64; leave existing URLs alone.
  let coverUpdate = {}
  if (typeof book.coverImage === 'string' && book.coverImage.startsWith('data:')) {
    if (DRY_RUN) {
      coverUpdate = { coverImage: '<uploaded>', coverPath: '<path>' }
    } else {
      const up = await uploadCover(authorUid, bookId, book.coverImage)
      if (up) coverUpdate = { coverImage: up.url, coverPath: up.path }
    }
  }

  const update = {
    chapterMeta,
    chaptersCount: Math.min(book.chaptersCount || 0, chapterMeta.length),
    schemaVersion: 2,
    ...coverUpdate,
  }

  log(
    `migrate ${bookId}: ${inline.length} chapters` +
      (coverUpdate.coverPath ? ' + cover' : '')
  )
  if (!DRY_RUN) {
    batch.update(docSnap.ref, update)
    await batch.commit()
  }
  return 'migrated'
}

const main = async () => {
  log(
    `mode=${
      CLEANUP_LEGACY ? 'cleanup-legacy' : 'migrate'
    } dryRun=${DRY_RUN} limit=${LIMIT}`
  )
  const snap = await db.collection('books').get()
  const counts = { migrated: 0, cleaned: 0, skipped: 0, errors: 0 }
  let processed = 0
  for (const doc of snap.docs) {
    if (processed >= LIMIT) break
    processed++
    try {
      const r = await migrateBook(doc)
      counts[r] = (counts[r] || 0) + 1
    } catch (err) {
      counts.errors++
      console.error('[migrate] FAILED', doc.id, err)
    }
  }
  log('done', counts)
  process.exit(counts.errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
