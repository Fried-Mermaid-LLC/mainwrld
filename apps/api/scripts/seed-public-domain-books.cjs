#!/usr/bin/env node
/*
 * Seed a few short, unambiguously public-domain works as books published by the
 * MainWRLD house account. Covers are generated with Replicate's
 * `google/nano-banana-pro` model, uploaded to Firebase Storage (same path/URL
 * shape as BooksService.uploadCover), then a book doc + a single chapter doc
 * are written to Firestore via the Admin SDK.
 *
 * Run from apps/api:  node scripts/seed-public-domain-books.cjs
 *
 * Env:
 *   REPLICATE_API_KEY  — read from ../app/.env.local (or process.env)
 *   service-account.json must sit in apps/api/ (it does).
 *
 * Idempotent: skips any book whose title already exists for this author.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');

const API_DIR = path.join(__dirname, '..');
const SCRATCH = process.env.SEED_CONTENT_DIR ||
  '/private/tmp/claude-501/-Volumes-SSD-projects-mainwlrd/8b1aedae-cc23-446d-b4c8-577a1a7b557e/scratchpad';

const AUTHOR_UID = 'f5XIEbBTVuU4lmcsUL8Dw9coJKE2';
const AUTHOR_USERNAME = 'mainwrld';
const AUTHOR_DISPLAY_NAME = 'MainWRLD';
const STORAGE_BUCKET = 'mainwrld-f7acf.firebasestorage.app';
const REPLICATE_MODEL = 'google/nano-banana-pro';

// ---- Replicate key (prefer env, else parse apps/app/.env.local) -------------
function loadReplicateKey() {
  if (process.env.REPLICATE_API_KEY) return process.env.REPLICATE_API_KEY.trim();
  const envPath = path.join(API_DIR, '..', 'app', '.env.local');
  const txt = fs.readFileSync(envPath, 'utf8');
  const m = txt.match(/^\s*REPLICATE_API_KEY\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error('REPLICATE_API_KEY not found in app/.env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const REPLICATE_KEY = loadReplicateKey();

// ---- Firebase admin ---------------------------------------------------------
const sa = require(path.join(API_DIR, 'service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(sa),
  storageBucket: STORAGE_BUCKET,
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---- Book definitions -------------------------------------------------------
const content = JSON.parse(
  fs.readFileSync(path.join(SCRATCH, 'books-content.json'), 'utf8'),
);
const contentByKey = Object.fromEntries(content.map((c) => [c.key, c.content]));

// Strip Gutenberg's `_italic_` emphasis underscores; these texts contain no
// legitimate underscores.
const clean = (s) => s.replace(/_/g, '');

const BOOKS = [
  {
    key: 'tell-tale-heart',
    title: 'The Tell-Tale Heart',
    authorName: 'Edgar Allan Poe',
    year: 1843,
    coverColor: '#5a1620',
    genres: ['Horror', 'Classic', 'Short Story'],
    hashtags: ['#classic', '#horror', '#poe', '#publicdomain'],
    tagline:
      'A nervous narrator insists on his sanity even as he confesses to a murder driven by an old man’s pale, filmy eye — and is undone by a sound only he can hear. Edgar Allan Poe’s tightest study of guilt and madness (1843).',
    coverPrompt:
      'Vintage gothic horror book cover, portrait orientation. A single wide, pale, glassy human eye glowing in deep darkness, faint candlelight, old wooden floorboards, oppressive shadows, muted crimson and black palette, fine engraving texture. Elegant serif title text "THE TELL-TALE HEART" near the top and "EDGAR ALLAN POE" near the bottom, clean legible typography, aged paper feel. No people faces other than the eye.',
  },
  {
    key: 'cask-of-amontillado',
    title: 'The Cask of Amontillado',
    authorName: 'Edgar Allan Poe',
    year: 1846,
    coverColor: '#3a2417',
    genres: ['Horror', 'Classic', 'Short Story'],
    hashtags: ['#classic', '#horror', '#poe', '#publicdomain'],
    tagline:
      'Lured into the damp catacombs beneath a carnival by the promise of a rare wine, Fortunato follows Montresor toward a revenge half a century in the keeping. A masterpiece of dread and irony from Edgar Allan Poe (1846).',
    coverPrompt:
      'Vintage gothic book cover, portrait orientation. Dim torch-lit stone catacombs, a damp brick wall partly built up, cobwebbed wine bottles and a single cask in nitre-crusted vaults, cold amber torchlight against deep shadow, muted browns and umber, fine engraving texture, aged paper. Elegant serif title text "THE CASK OF AMONTILLADO" at the top and "EDGAR ALLAN POE" at the bottom, clean legible typography.',
  },
  {
    key: 'yellow-wallpaper',
    title: 'The Yellow Wallpaper',
    authorName: 'Charlotte Perkins Gilman',
    year: 1892,
    coverColor: '#b89a2e',
    genres: ['Gothic', 'Classic', 'Short Story'],
    hashtags: ['#classic', '#gothic', '#feminist', '#publicdomain'],
    tagline:
      'Confined to an upstairs nursery for a “rest cure,” a woman pours her forbidden thoughts into a secret journal and grows obsessed with the room’s sickly yellow wallpaper — and the figure she begins to see creeping behind its pattern. Charlotte Perkins Gilman’s landmark story (1892).',
    coverPrompt:
      'Unsettling vintage book cover, portrait orientation. Faded sickly yellow Victorian wallpaper with a sprawling, oppressive floral pattern, one corner peeling, a faint shadowy female figure suggested creeping behind the pattern, dim light, eerie atmosphere, muted ochre and mustard palette, aged paper texture. Elegant serif title text "THE YELLOW WALLPAPER" at the top and "CHARLOTTE PERKINS GILMAN" at the bottom, clean legible typography.',
  },
];

// ---- Replicate: generate a cover, return a Buffer ---------------------------
async function generateCover(book) {
  const body = {
    input: {
      prompt: book.coverPrompt,
      aspect_ratio: '2:3',
      resolution: '2K',
      output_format: 'jpg',
      safety_filter_level: 'block_only_high',
    },
  };
  const res = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REPLICATE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Replicate create failed ${res.status}: ${await res.text()}`);
  }
  let pred = await res.json();

  // With `Prefer: wait` it usually returns terminal; poll otherwise.
  const getUrl = pred.urls && pred.urls.get;
  let tries = 0;
  while (['starting', 'processing'].includes(pred.status) && tries < 60) {
    await new Promise((r) => setTimeout(r, 2000));
    const p = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${REPLICATE_KEY}` },
    });
    pred = await p.json();
    tries++;
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`Replicate prediction ${pred.status}: ${JSON.stringify(pred.error)}`);
  }
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!out) throw new Error('Replicate returned no output URL');
  const img = await fetch(out);
  if (!img.ok) throw new Error(`Cover download failed ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

// ---- Upload cover to Storage (mirrors BooksService.uploadCover) -------------
async function uploadCover(bookId, buffer) {
  const token = randomUUID();
  const filePath = `book-covers/${AUTHOR_UID}/${bookId}/${randomUUID()}.jpg`;
  await bucket.file(filePath).save(buffer, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  return { url, path: filePath };
}

// ---- Main -------------------------------------------------------------------
async function alreadySeeded(title) {
  const snap = await db
    .collection('books')
    .where('authorUid', '==', AUTHOR_UID)
    .where('title', '==', title)
    .limit(1)
    .get();
  return !snap.empty;
}

async function seedBook(book) {
  const text = clean(contentByKey[book.key]);
  if (!text) throw new Error(`No content for ${book.key}`);

  if (await alreadySeeded(book.title)) {
    console.log(`  ⏭  skip "${book.title}" — already exists`);
    return;
  }

  const bookRef = db.collection('books').doc();
  const bookId = bookRef.id;
  const chapterRef = bookRef.collection('chapters').doc();
  const chapterId = chapterRef.id;
  const now = new Date().toISOString();

  console.log(`  🎨 generating cover for "${book.title}"...`);
  const coverBuf = await generateCover(book);
  console.log(`     cover ${(coverBuf.length / 1024).toFixed(0)} KB; uploading...`);
  const cover = await uploadCover(bookId, coverBuf);

  const chapterDoc = {
    id: chapterId,
    title: book.title,
    content: text,
    order: 0,
    authorUsername: AUTHOR_USERNAME,
    isDraft: false,
  };

  const bookDoc = {
    id: bookId,
    title: book.title,
    authorUid: AUTHOR_UID,
    authorUsername: AUTHOR_USERNAME,
    authorDisplayName: AUTHOR_DISPLAY_NAME,
    coverColor: book.coverColor,
    coverImage: cover.url,
    coverPath: cover.path,
    tagline: book.tagline,
    genres: book.genres,
    hashtags: book.hashtags,
    likes: [0],
    commentsCount: 0,
    publishedDate: now,
    isCompleted: true,
    wasCompleted: true,
    isMature: false,
    chaptersCount: 1,
    chapterMeta: [{ id: chapterId, title: book.title }],
    schemaVersion: 2,
    isDraft: false,
    price: 0,
    isFree: true,
    isMonetized: false,
    commentsEnabled: true,
    monetizationStatus: 'none',
    // Public-domain provenance (not in the Book type; kept for legal hygiene).
    source: 'Project Gutenberg',
    license: 'public-domain',
    originalPublicationYear: book.year,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.set(chapterRef, chapterDoc);
  batch.set(bookRef, bookDoc);
  await batch.commit();
  console.log(`  ✅ published "${book.title}"  book=${bookId} chapter=${chapterId}`);
}

(async () => {
  console.log(`Seeding ${BOOKS.length} public-domain books as @${AUTHOR_USERNAME}\n`);
  for (const book of BOOKS) {
    try {
      await seedBook(book);
    } catch (e) {
      console.error(`  ❌ failed "${book.title}": ${e.message}`);
    }
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
