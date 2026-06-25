#!/usr/bin/env node
/*
 * Backfill the per-chapter `published` flag on every book's chapterMeta.
 *
 * Background: chapter visibility used to be a "published prefix" — chapters at
 * positions [0, chaptersCount) were published. We moved to a per-chapter flag
 * (chapterMeta[i].published) so any chapter can be unpublished, not just the
 * last. This script translates the prefix into explicit flags one-to-one:
 *   chapterMeta[i].published = i < chaptersCount
 * chaptersCount is left unchanged (it now means "count of published chapters",
 * which equals the old prefix length here).
 *
 * Run from apps/api:
 *   node scripts/backfill-chapter-published.cjs            # apply
 *   node scripts/backfill-chapter-published.cjs --dry-run  # report only
 *
 * Idempotent: a book whose chapterMeta entries already all carry a boolean
 * `published` flag is skipped. Run this BEFORE deploying the code that reads the
 * flag; the code keeps a prefix fallback so the order isn't load-bearing, but a
 * clean backfill lets the fallback be removed later.
 */
const path = require('node:path');
const admin = require('firebase-admin');

const API_DIR = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const sa = require(path.join(API_DIR, 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('books').get();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const batchLimit = 400;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snap.docs) {
    scanned++;
    const book = doc.data();
    const meta = Array.isArray(book.chapterMeta) ? book.chapterMeta : [];
    if (meta.length === 0) {
      skipped++;
      continue;
    }
    // Already fully flagged → nothing to do.
    const allFlagged = meta.every(m => typeof m?.published === 'boolean');
    if (allFlagged) {
      skipped++;
      continue;
    }
    const chaptersCount = Number(book.chaptersCount) || 0;
    const newMeta = meta.map((m, i) => ({
      ...m,
      // Preserve an explicit existing flag; otherwise derive from the prefix.
      published:
        typeof m?.published === 'boolean' ? m.published : i < chaptersCount,
    }));
    const newCount = newMeta.filter(m => m.published === true).length;

    if (DRY_RUN) {
      updated++;
      if (newCount !== chaptersCount) {
        console.log(
          `[dry] ${doc.id}: chaptersCount ${chaptersCount} -> ${newCount} (meta ${meta.length})`,
        );
      }
      continue;
    }

    batch.update(doc.ref, { chapterMeta: newMeta, chaptersCount: newCount });
    pending++;
    updated++;
    if (pending >= batchLimit) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (!DRY_RUN && pending > 0) await batch.commit();

  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}done: scanned=${scanned} updated=${updated} skipped=${skipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
