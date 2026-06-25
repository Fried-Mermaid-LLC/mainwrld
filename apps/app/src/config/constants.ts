export const ACCENT_COLOR = '#eb6871';

// Public share links (F09). The canonical, outside-the-app URL for a book is
// `${SHARE_BASE}/book/<id>`. SHARE_BASE is the single source of truth shared by
// web + iOS; the `/book/**` Hosting rewrite routes it to the `ogBook` Cloud
// Function (per-book OG tags for link unfurling + a redirect into the SPA).
// The custom domain mainwrld.com is live on Firebase Hosting (the `web.app`
// origin still resolves, so old links keep working). To open shared links
// directly in the iOS app, the AASA `applinks` host must include mainwrld.com.
export const SHARE_BASE = 'https://mainwrld.com';
export const buildBookShareUrl = (id: string) => `${SHARE_BASE}/book/${id}`;

export const WORLD_RADIUS = 50;
// Library cap (F07). Free accounts can keep up to FREE_LIBRARY_SIZE saved books;
// premium members have an unlimited library. Enforced client-side in
// useReading.handleSaveToLibrary, and reflected in the LibraryView header.
export const FREE_LIBRARY_SIZE = 35;
// Resolve a user's library cap — Infinity (uncapped) for premium members.
export const libraryLimitFor = (isPremium?: boolean): number =>
  isPremium ? Infinity : FREE_LIBRARY_SIZE;
// Shown when a free reader tries to save a book past FREE_LIBRARY_SIZE (F07).
export const LIBRARY_FULL_TOAST = 'Your library is full. Upgrade to premium for unlimited books, or remove some to add more.';

// First-launch onboarding (F10). The welcome popup links to this tutorial book
// from the MainWRLD account. Leave empty until the real book id is known — an
// empty id hides the "Open tutorial book" CTA (the popup still shows).
export const TUTORIAL_BOOK_ID = '25ea6ba3-9430-4852-9d68-e31121671b5f';
export const MIN_WORD_COUNT = 150;
export const MAX_DAILY_EARNED_POINTS = 25;
export const COMMENT_LIKES_THRESHOLD = 50;
// Max comment length. Also enforced server-side via MaxLength(500) on the
// comments DTOs so a crafted client can't bypass it.
export const MAX_COMMENT_LENGTH = 500;
export const CHAPTER_LIKES_THRESHOLD = 10;
export const MAX_DAILY_CHAPTERS = 7;
export const MAX_WORD_COUNT = 11000;
// Messaging caps (F08). MAX_MESSAGE_LENGTH is also enforced server-side in
// firestore.rules (text.size() <= 500) so a crafted client can't bypass it.
// MAX_MESSAGES_PER_CONVERSATION_PER_DAY is counted per SENDER per conversation
// per rolling 24h on the client, and backstopped server-side by the
// enforceChatRateLimit Cloud Function.
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_MESSAGES_PER_CONVERSATION_PER_DAY = 25;
// Age gates (X09). MIN_SIGNUP_AGE: COPPA hard floor for account creation.
// MATURE_AUTO_ON_AGE: at/above this age the "Show mature content" toggle
// DEFAULTS to ON (>=17, matching the App Store 17+ rating); below it the
// toggle defaults OFF. The toggle itself is available to all signed-in users
// and a user's explicit choice always overrides this default.
export const MIN_SIGNUP_AGE = 13;
export const MATURE_AUTO_ON_AGE = 17;
export const GENRE_LIST = ['Mystery', 'Sci-Fi', 'Romance', 'Horror', 'Dystopian', 'Fantasy', 'Action', 'Drama', 'Western', 'Fiction', 'Non-Fiction', 'Thriller', 'FanFic', 'Poetry', 'Religious', 'Erotica', 'LGBTQ+', 'Self-Help', 'Sports'];

// ---- Monetization pricing (F01) ----
// A book may only be priced in tiers its PUBLISHED chapter count unlocks:
//   5–7 ch → $9.99 only; 8–11 → +$14.99; 12–19 → +$19.99;
//   20–24 → +$24.99; 25+ → all five up to $29.99.
// allowedPriceTiers is the single source of truth, re-validated server-side
// in submitMonetizationRequest / reviewMonetization (those duplicate the
// table because functions/ cannot import from src/).
export const PRICE_TIERS = [9.99, 14.99, 19.99, 24.99, 29.99] as const;
export function allowedPriceTiers(chaptersCount: number): number[] {
  if (chaptersCount >= 25) return PRICE_TIERS.slice(0, 5);
  if (chaptersCount >= 20) return PRICE_TIERS.slice(0, 4);
  if (chaptersCount >= 12) return PRICE_TIERS.slice(0, 3);
  if (chaptersCount >= 8) return PRICE_TIERS.slice(0, 2);
  if (chaptersCount >= 5) return PRICE_TIERS.slice(0, 1);
  return [];
}

// Platform fee on the cash (Stripe) rail. The seller's connected account
// receives (1 - PLATFORM_FEE_RATE); MainWRLD keeps PLATFORM_FEE_RATE as the
// Stripe application_fee. Mirrored in functions/src/stripeConnect.ts.
export const PLATFORM_FEE_RATE = 0.3;

// How many real points 1 USD of book price converts to on the in-app
// points purchase rail (mirrors CartView's historic POINTS_PER_DOLLAR).
export const POINTS_PER_DOLLAR = 100;

// Terminal block: a book that was ever successfully monetized (then
// un-monetized / unpublished / taken down) can never be monetized again.
// `permanentlyDemonetized` is stamped server-side by the onBookMonetized
// trigger; `wasMonetizedBefore` is the legacy flag set by the demonetize
// handlers. A DENIED request does NOT set either (denial ≠ permanence).
export function canMonetize(book: {
  permanentlyDemonetized?: boolean;
  wasMonetizedBefore?: boolean;
}): boolean {
  return !book.permanentlyDemonetized && !book.wasMonetizedBefore;
}

// Lowest-likes-per-published-chapter, derived from the real per-chapter
// `likes` array on the book doc (NOT the never-set mock `minLikesPerChapter`
// field). Published chapters are identified by their per-chapter `published`
// flag (likes stay indexed by absolute order); legacy docs without flags fall
// back to the old published-prefix rule (position < chaptersCount). An
// empty/short likes array treats missing chapters as 0 likes → blocked.
export function minLikesPerPublishedChapter(book: {
  likes?: number[] | number;
  chaptersCount?: number;
  chapterMeta?: { published?: boolean }[];
}): number {
  const meta = book.chapterMeta || [];
  const count = book.chaptersCount || 0;
  const hasFlags = meta.some(m => typeof m.published === 'boolean');
  const arr = Array.isArray(book.likes)
    ? book.likes
    : [typeof book.likes === 'number' ? book.likes : 0];
  const published: number[] = [];
  const len = Math.max(meta.length, count);
  for (let i = 0; i < len; i++) {
    const isPub = hasFlags ? meta[i]?.published === true : i < count;
    if (isPub) published.push(arr[i] || 0);
  }
  return published.length ? Math.min(...published) : 0;
}

// Profanity/objectionable-content moderation is handled ENTIRELY server-side by
// the OpenAI Moderation API (functions/src/moderate.ts) — comments, books,
// chapters, chat messages, and signup username/display name. There is no longer
// a hard-coded client-side word list (it over-blocked innocent words and only
// caught a fixed list). Note: the OpenAI classifier flags hate/harassment/
// sexual/violent content, not mere profanity.

export const SKIN_TONE_COLORS: Record<string, string> = {
  A1: '#FDDCC4', A2: '#F2C4A0', A3: '#D9A87C', A4: '#C68E5B', A5: '#A0714A', A5_5: '#9B6B45', A6: '#7A5539', A7: '#4A3228',
  B1: '#FDDCC4', B2: '#F2C4A0', B3: '#D9A87C', B4: '#C68E5B', B5: '#A0714A', B5_5: '#9B6B45', B6: '#7A5539', B7: '#4A3228',
};

export default {
  ACCENT_COLOR,
  WORLD_RADIUS,
  FREE_LIBRARY_SIZE,
  libraryLimitFor,
  MIN_WORD_COUNT,
  MAX_DAILY_EARNED_POINTS,
  COMMENT_LIKES_THRESHOLD,
  MAX_COMMENT_LENGTH,
  CHAPTER_LIKES_THRESHOLD,
  MAX_DAILY_CHAPTERS,
  MAX_WORD_COUNT,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES_PER_CONVERSATION_PER_DAY,
  MIN_SIGNUP_AGE,
  MATURE_AUTO_ON_AGE,
  GENRE_LIST,
  PRICE_TIERS,
  allowedPriceTiers,
  PLATFORM_FEE_RATE,
  POINTS_PER_DOLLAR,
  canMonetize,
  minLikesPerPublishedChapter,
  SKIN_TONE_COLORS,
};