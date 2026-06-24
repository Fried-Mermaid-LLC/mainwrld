import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'

// Public, UNauthenticated book preview endpoint (F09).
//
// Firestore rules forbid signed-out reads of any book, and link-preview
// crawlers (iMessage, WhatsApp, Slack, Discord, Twitter, Facebook) don't
// execute the SPA's JS — so a shared `/book/<id>` link needs a server endpoint
// that (1) reads the book with Admin privileges, (2) returns ONLY an
// allow-listed set of public fields, and (3) renders per-book Open Graph tags.
//
// Wired via a Hosting rewrite `{ "source": "/book/**", "function": "ogBook" }`
// placed BEFORE the `**` → /index.html catch-all. Two delivery shapes off the
// same function:
//   • HTML (default) — crawler-facing OG tags + a redirect that bootstraps real
//     humans into the SPA at `/?book=<id>`.
//   • JSON (`?format=json` or Accept: application/json) — consumed by
//     PublicBookLandingPage so the SPA renders the preview without auth.
//
// Draft / missing / unshareable books return a generic "unavailable" response
// that never leaks the title.

// Canonical public origin (live custom domain on Firebase Hosting). Used for
// the per-book og:url and the fallback share image, so unfurled previews match
// the mainwrld.com link that's actually shared (see SHARE_BASE in the SPA).
const SITE = 'https://mainwrld.com'
const FALLBACK_IMAGE = `${SITE}/logo.png`

interface PublicBookPreview {
  id: string
  title: string
  authorDisplayName: string
  authorUsername: string
  coverColor: string
  coverImage?: string
  tagline: string
  genres: string[]
  hashtags: string[]
  chaptersCount: number
  totalLikes: number
  isMature: boolean
  isCompleted: boolean
  publishedDate: string
}

// Minimal HTML-attribute/text escaper so a title/tagline can't break out of the
// meta tags or inject markup.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Pull the book id from `/book/<id>` (the Hosting rewrite keeps the original
// path) or an explicit `?id=` / `?book=` query.
function extractBookId(req: { path?: string; query: any }): string | null {
  const fromPath = (req.path || '').match(/\/book\/([A-Za-z0-9_-]+)/)
  if (fromPath) return fromPath[1]
  const q = req.query?.id ?? req.query?.book
  return typeof q === 'string' && /^[A-Za-z0-9_-]+$/.test(q) ? q : null
}

function wantsJson(req: { query: any; headers: any }): boolean {
  if (req.query?.format === 'json') return true
  const accept = String(req.headers?.accept || '')
  return accept.includes('application/json')
}

// Read the book by doc id first (books created through the app key the doc by
// its `id` field), falling back to a `where('id','==',id)` query so any legacy/
// seeded doc whose key differs from its id field still resolves.
async function loadBook(id: string): Promise<Record<string, any> | null> {
  const db = getFirestore()
  const direct = await db.collection('books').doc(id).get()
  if (direct.exists) return direct.data() as Record<string, any>
  const q = await db
    .collection('books')
    .where('id', '==', id)
    .limit(1)
    .get()
  if (!q.empty) return q.docs[0].data() as Record<string, any>
  return null
}

function toPreview(id: string, b: Record<string, any>): PublicBookPreview {
  const likes = Array.isArray(b.likes)
    ? b.likes.reduce((a: number, n: number) => a + (Number(n) || 0), 0)
    : Number(b.likes) || 0
  return {
    id,
    title: b.title || 'Untitled',
    authorDisplayName: b.authorDisplayName || b.author?.displayName || 'Unknown',
    authorUsername: b.authorUsername || b.author?.username || 'unknown',
    coverColor: b.coverColor || '#eb6871',
    coverImage: typeof b.coverImage === 'string' ? b.coverImage : undefined,
    tagline: b.tagline || '',
    genres: Array.isArray(b.genres) ? b.genres : [],
    hashtags: Array.isArray(b.hashtags) ? b.hashtags : [],
    chaptersCount: Number(b.chaptersCount) || 0,
    totalLikes: likes,
    // Backward-compat: legacy docs store `isExplicit`, new docs `isMature`.
    isMature: !!(b.isMature ?? b.isExplicit),
    isCompleted: !!b.isCompleted,
    publishedDate: b.publishedDate || '',
  }
}

// Crawler-facing HTML: per-book OG/Twitter tags + a redirect that sends real
// humans into the SPA. Bots stop at the <meta> tags; humans run the script and
// land on `/?book=<id>`, which resolveInitialView turns into the public view.
function previewHtml(p: PublicBookPreview): string {
  const url = `${SITE}/book/${p.id}`
  const image = p.coverImage || FALLBACK_IMAGE
  const title = `${p.title} — by ${p.authorDisplayName}`
  const description = p.tagline || `Read "${p.title}" on MainWRLD.`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta property="og:type" content="book">
<meta property="og:site_name" content="MainWRLD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<script>location.replace('/?book=' + ${JSON.stringify(p.id)});</script>
</head>
<body>
<p>Opening "${esc(p.title)}" on MainWRLD… <a href="/?book=${esc(p.id)}">Continue</a></p>
</body>
</html>`
}

// Generic, no-leak "unavailable" HTML for draft/missing/unshareable books.
function unavailableHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MainWRLD</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="MainWRLD">
<meta property="og:title" content="MainWRLD">
<meta property="og:description" content="Read and write stories on MainWRLD.">
<meta property="og:image" content="${FALLBACK_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<script>location.replace('/');</script>
</head>
<body><p>This book isn’t available. <a href="/">Go to MainWRLD</a></p></body>
</html>`
}

export const ogBook = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    const id = extractBookId(req)
    const json = wantsJson(req)

    // Short edge cache: previews change rarely and crawlers re-fetch.
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600')

    if (!id) {
      if (json) {
        res.status(400).json({ error: 'missing id' })
      } else {
        res.status(400).type('html').send(unavailableHtml())
      }
      return
    }

    let book: Record<string, any> | null = null
    try {
      book = await loadBook(id)
    } catch {
      book = null
    }

    // Not public: missing, unpublished draft, or explicitly opted out of
    // sharing (isShareable === false). Never reveal the title.
    const isPublic =
      !!book && book.isDraft !== true && book.isShareable !== false
    if (!isPublic) {
      if (json) {
        res.status(404).json({ error: 'unavailable' })
      } else {
        res.status(404).type('html').send(unavailableHtml())
      }
      return
    }

    const preview = toPreview(id, book as Record<string, any>)
    if (json) {
      res.status(200).json(preview)
    } else {
      res.status(200).type('html').send(previewHtml(preview))
    }
  }
)
