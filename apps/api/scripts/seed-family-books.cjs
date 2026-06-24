#!/usr/bin/env node
/*
 * Seed 6 family-friendly public-domain books (multi-chapter) as @mainwrld.
 * Chapters are pre-parsed to the reader's HTML format in books-chapters.json
 * (see scratchpad/extract2.cjs). Covers via Replicate google/nano-banana-pro.
 *
 * Run from apps/api:  node scripts/seed-family-books.cjs
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

function loadReplicateKey() {
  if (process.env.REPLICATE_API_KEY) return process.env.REPLICATE_API_KEY.trim();
  const txt = fs.readFileSync(path.join(API_DIR, '..', 'app', '.env.local'), 'utf8');
  const m = txt.match(/^\s*REPLICATE_API_KEY\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error('REPLICATE_API_KEY not found in app/.env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const REPLICATE_KEY = loadReplicateKey();

const sa = require(path.join(API_DIR, 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(sa), storageBucket: STORAGE_BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();

const chaptersByKey = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(SCRATCH, 'books-chapters.json'), 'utf8'))
    .map((b) => [b.key, b.chapters]),
);

// title/author/year/genres/hashtags/tagline/coverColor/coverPrompt per book.
const META = {
  alice: {
    title: "Alice's Adventures in Wonderland", authorName: 'Lewis Carroll', year: 1865,
    coverColor: '#1f6fb2', genres: ['Fantasy', 'Classic', 'Children'],
    hashtags: ['#classic', '#fantasy', '#fairytale', '#publicdomain'],
    tagline: 'Chasing a waistcoated White Rabbit down a hole, Alice tumbles into a nonsensical world of growing and shrinking, a hookah-smoking Caterpillar, a grinning Cheshire Cat, a Mad Tea-Party and a temperamental Queen of Hearts. Lewis Carroll’s beloved 1865 fantasy.',
    coverPrompt: 'Whimsical vintage children’s book cover, portrait orientation. A young girl in a blue dress falling through a dreamlike rabbit-hole among floating pocket watches, teacups, playing cards and a waistcoated white rabbit, soft storybook illustration, warm golden and blue palette, fine detail. Elegant title text "ALICE’S ADVENTURES IN WONDERLAND" at the top and "LEWIS CARROLL" at the bottom, clean legible typography.',
  },
  'looking-glass': {
    title: 'Through the Looking-Glass', authorName: 'Lewis Carroll', year: 1871,
    coverColor: '#6a4a99', genres: ['Fantasy', 'Classic', 'Children'],
    hashtags: ['#classic', '#fantasy', '#fairytale', '#publicdomain'],
    tagline: 'Alice steps through a mirror into a back-to-front world laid out like a giant chessboard, meeting Tweedledum and Tweedledee, Humpty Dumpty, the White Knight and the Red Queen on her journey to become a queen. Lewis Carroll’s 1871 sequel to Wonderland.',
    coverPrompt: 'Whimsical vintage children’s book cover, portrait orientation. A young girl stepping through an ornate silver mirror into a surreal landscape shaped like a giant chessboard, mirrored reflections, chess pieces come to life, dreamy twilight palette of violet and silver, storybook illustration, fine detail. Elegant title text "THROUGH THE LOOKING-GLASS" at the top and "LEWIS CARROLL" at the bottom, clean legible typography.',
  },
  'happy-prince': {
    title: 'The Happy Prince and Other Tales', authorName: 'Oscar Wilde', year: 1888,
    coverColor: '#c2962f', genres: ['Fairy Tale', 'Classic', 'Children'],
    hashtags: ['#classic', '#fairytale', '#wilde', '#publicdomain'],
    tagline: 'A gilded statue and a little swallow give away all they have in the title story, joined by the nightingale, the selfish giant, the devoted friend and a very vain rocket. Five tender, bittersweet fairy tales by Oscar Wilde (1888).',
    coverPrompt: 'Tender vintage fairy-tale book cover, portrait orientation. A tall golden statue of a prince on a column overlooking a snowy old city at dusk, a small swallow perched at its feet, gold leaf glints, soft melancholic storybook illustration, warm gold and deep blue palette, fine detail. Elegant title text "THE HAPPY PRINCE AND OTHER TALES" at the top and "OSCAR WILDE" at the bottom, clean legible typography.',
  },
  'christmas-carol': {
    title: 'A Christmas Carol', authorName: 'Charles Dickens', year: 1843,
    coverColor: '#1f6b3b', genres: ['Classic', 'Holiday', 'Fantasy'],
    hashtags: ['#classic', '#christmas', '#dickens', '#publicdomain'],
    tagline: 'On Christmas Eve the miser Ebenezer Scrooge is visited by the ghost of his old partner Marley and by the Spirits of Christmas Past, Present and Yet to Come — and given one last chance to change his heart. Charles Dickens’s timeless 1843 ghost story.',
    coverPrompt: 'Atmospheric vintage book cover, portrait orientation. A snowy Victorian London street at night, warm glowing windows, an old miser in a nightcap holding a candle, a faint translucent ghost in chains hovering, falling snow, festive yet eerie mood, deep green and gold palette, fine engraving-style illustration. Elegant title text "A CHRISTMAS CAROL" at the top and "CHARLES DICKENS" at the bottom, clean legible typography.',
  },
  'gift-of-the-magi': {
    title: 'The Gift of the Magi', authorName: 'O. Henry', year: 1905,
    coverColor: '#9c2b3a', genres: ['Classic', 'Romance', 'Short Story'],
    hashtags: ['#classic', '#romance', '#ohenry', '#publicdomain'],
    tagline: 'With only a dollar and eighty-seven cents to spend, a young wife and husband each secretly sacrifice their dearest possession to buy the other a Christmas gift. O. Henry’s perfect little tale of love and irony (1905).',
    coverPrompt: 'Warm vintage book cover, portrait orientation. A cozy 1900s apartment at Christmas, a pocket watch and a set of tortoiseshell hair combs on a table, soft lamplight, a hint of long flowing hair, tender nostalgic mood, warm crimson and gold palette, fine illustration. Elegant title text "THE GIFT OF THE MAGI" at the top and "O. HENRY" at the bottom, clean legible typography.',
  },
  sherlock: {
    title: 'The Adventures of Sherlock Holmes', authorName: 'Arthur Conan Doyle', year: 1892,
    coverColor: '#2c3e50', genres: ['Mystery', 'Classic', 'Detective'],
    hashtags: ['#classic', '#mystery', '#detective', '#publicdomain'],
    tagline: 'Twelve of the world’s most famous detective stories — from “A Scandal in Bohemia” to “The Speckled Band” — in which Sherlock Holmes and Dr. Watson unravel the seemingly impossible from their rooms at 221B Baker Street. Arthur Conan Doyle (1892).',
    coverPrompt: 'Classic vintage mystery book cover, portrait orientation. The silhouette of a detective in a deerstalker hat smoking a curved pipe, foggy gas-lit Victorian London street behind, a magnifying glass and swirling mist, moody noir atmosphere, deep teal-grey and amber palette, fine illustration. Elegant title text "THE ADVENTURES OF SHERLOCK HOLMES" at the top and "ARTHUR CONAN DOYLE" at the bottom, clean legible typography.',
  },
};

async function generateCover(meta) {
  const res = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: meta.coverPrompt,
        aspect_ratio: '2:3',
        resolution: '2K',
        output_format: 'jpg',
        safety_filter_level: 'block_only_high',
      },
    }),
  });
  if (!res.ok) throw new Error(`Replicate create ${res.status}: ${await res.text()}`);
  let pred = await res.json();
  const getUrl = pred.urls && pred.urls.get;
  let tries = 0;
  while (['starting', 'processing'].includes(pred.status) && tries < 90) {
    await new Promise((r) => setTimeout(r, 2000));
    pred = await (await fetch(getUrl, { headers: { Authorization: `Bearer ${REPLICATE_KEY}` } })).json();
    tries++;
  }
  if (pred.status !== 'succeeded') throw new Error(`Replicate ${pred.status}: ${JSON.stringify(pred.error)}`);
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  const img = await fetch(out);
  if (!img.ok) throw new Error(`cover download ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

async function uploadCover(bookId, buffer) {
  const token = randomUUID();
  const filePath = `book-covers/${AUTHOR_UID}/${bookId}/${randomUUID()}.jpg`;
  await bucket.file(filePath).save(buffer, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(filePath)}?alt=media&token=${token}`;
  return { url, path: filePath };
}

async function alreadySeeded(title) {
  const snap = await db.collection('books')
    .where('authorUid', '==', AUTHOR_UID).where('title', '==', title).limit(1).get();
  return !snap.empty;
}

async function seedBook(key) {
  const meta = META[key];
  const chapters = chaptersByKey[key];
  if (!chapters || !chapters.length) throw new Error(`no chapters for ${key}`);
  if (await alreadySeeded(meta.title)) {
    console.log(`  ⏭  skip "${meta.title}" — already exists`);
    return;
  }

  const bookRef = db.collection('books').doc();
  const bookId = bookRef.id;
  const now = new Date().toISOString();

  console.log(`  🎨 cover for "${meta.title}" (${chapters.length} ch)...`);
  const buf = await generateCover(meta);
  console.log(`     ${(buf.length / 1024).toFixed(0)} KB; uploading...`);
  const cover = await uploadCover(bookId, buf);

  const batch = db.batch();
  const chapterMeta = [];
  chapters.forEach((ch, i) => {
    const cRef = bookRef.collection('chapters').doc();
    chapterMeta.push({ id: cRef.id, title: ch.title });
    batch.set(cRef, {
      id: cRef.id,
      title: ch.title,
      content: ch.html,
      order: i,
      authorUsername: AUTHOR_USERNAME,
      isDraft: false,
    });
  });

  batch.set(bookRef, {
    id: bookId,
    title: meta.title,
    authorUid: AUTHOR_UID,
    authorUsername: AUTHOR_USERNAME,
    authorDisplayName: AUTHOR_DISPLAY_NAME,
    coverColor: meta.coverColor,
    coverImage: cover.url,
    coverPath: cover.path,
    tagline: meta.tagline,
    genres: meta.genres,
    hashtags: meta.hashtags,
    likes: new Array(chapters.length).fill(0),
    commentsCount: 0,
    publishedDate: now,
    isCompleted: true,
    wasCompleted: true,
    isMature: false,
    chaptersCount: chapters.length,
    chapterMeta,
    schemaVersion: 2,
    isDraft: false,
    price: 0,
    isFree: true,
    isMonetized: false,
    commentsEnabled: true,
    monetizationStatus: 'none',
    source: 'Project Gutenberg',
    license: 'public-domain',
    originalPublicationYear: meta.year,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  console.log(`  ✅ "${meta.title}"  book=${bookId}  chapters=${chapters.length}`);
}

(async () => {
  console.log(`Seeding ${Object.keys(META).length} family books as @${AUTHOR_USERNAME}\n`);
  for (const key of Object.keys(META)) {
    try { await seedBook(key); }
    catch (e) { console.error(`  ❌ ${key}: ${e.message}`); }
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
