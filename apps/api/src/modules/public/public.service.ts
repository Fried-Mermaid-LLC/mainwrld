import { Inject, Injectable } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { PublicBookPreview } from '@mainwrld/types';
import {
  COLLECTIONS,
  FIRESTORE,
} from '../../infra/firebase/firebase.constants';

const SITE = 'https://mainwrld.com';
const FALLBACK_IMAGE = `${SITE}/logo.png`;

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Public, UNauthenticated book preview (F09). Reads with Admin privileges and
// returns ONLY an allow-listed set of fields. Ported from functions/publicBook.
@Injectable()
export class PublicService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  // Read by doc id first; fall back to where('id','==') for legacy/seeded docs.
  async loadBook(id: string): Promise<Record<string, unknown> | null> {
    const direct = await this.db.collection(COLLECTIONS.books).doc(id).get();
    if (direct.exists) return direct.data() as Record<string, unknown>;
    const q = await this.db
      .collection(COLLECTIONS.books)
      .where('id', '==', id)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0].data() as Record<string, unknown>);
  }

  // Public = exists, not a draft, not opted out of sharing.
  isPublic(book: Record<string, unknown> | null): boolean {
    return !!book && book.isDraft !== true && book.isShareable !== false;
  }

  toPreview(id: string, b: Record<string, unknown>): PublicBookPreview {
    const author = b.author as { displayName?: string; username?: string } | undefined;
    const likes = Array.isArray(b.likes)
      ? (b.likes as number[]).reduce((a, n) => a + (Number(n) || 0), 0)
      : Number(b.likes) || 0;
    return {
      id,
      title: (b.title as string) || 'Untitled',
      authorDisplayName:
        (b.authorDisplayName as string) || author?.displayName || 'Unknown',
      authorUsername:
        (b.authorUsername as string) || author?.username || 'unknown',
      coverColor: (b.coverColor as string) || '#eb6871',
      coverImage: typeof b.coverImage === 'string' ? b.coverImage : undefined,
      tagline: (b.tagline as string) || '',
      genres: Array.isArray(b.genres) ? (b.genres as string[]) : [],
      hashtags: Array.isArray(b.hashtags) ? (b.hashtags as string[]) : [],
      chaptersCount: Number(b.chaptersCount) || 0,
      totalLikes: likes,
      // Backward-compat: legacy docs store `isExplicit`, new docs `isMature`.
      isMature: !!(b.isMature ?? b.isExplicit),
      isCompleted: !!b.isCompleted,
      publishedDate: (b.publishedDate as string) || '',
    };
  }

  // Crawler-facing OG/Twitter HTML + a redirect that bootstraps humans into the SPA.
  previewHtml(p: PublicBookPreview): string {
    const url = `${SITE}/book/${p.id}`;
    const image = p.coverImage || FALLBACK_IMAGE;
    const title = `${p.title} — by ${p.authorDisplayName}`;
    const description = p.tagline || `Read "${p.title}" on MainWRLD.`;
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
</html>`;
  }

  unavailableHtml(): string {
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
</html>`;
  }
}
